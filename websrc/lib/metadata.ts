import "server-only";
import type { EntityFieldCategory } from "./types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MetadataItem {
  id: number;
  name: string;
}

/** Describes a single field on a SuperOffice entity DTO, discovered from FieldProperties. */
export interface EntityFieldInfo {
  /** Exact field name as returned by FieldProperties (PascalCase, e.g. "Name", "OrgNr", "Business") */
  name: string;
  fieldType: EntityFieldCategory;
  /** For service-object fields: the CRM service type name, e.g. "Business", "Category", "Country" */
  serviceTypeName?: string;
  /** Max length from FieldLength (string fields only) */
  maxLength?: number;
  /** True when FieldRight.Mask includes UIHintMandatory */
  mandatory: boolean;
}

export interface ListDefinition {
  id: number;
  name: string;
  listType: string;
}

export interface CachedMetadata {
  countries: Array<{ id: number; englishName: string; twoLetterISOCountry: string }>;
  businesses: MetadataItem[];
  categories: MetadataItem[];
  projectTypes: MetadataItem[];
  projectStatuses: MetadataItem[];
  saleTypes: MetadataItem[];
  sources: MetadataItem[];
  tasks: MetadataItem[];
  /** Associate ID of the authenticated user — used for required associate_id/group_idx columns */
  associateId: number;
  /** Primary group ID of the authenticated user */
  groupId: number;
  /** First available Prob list ID — used as default probability_idx on sale inserts */
  defaultProbabilityId: number;
  /** Dynamic list items keyed by list ID — populated for mdolist field rules */
  listItems: Map<number, MetadataItem[]>;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

const METADATA_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CATALOG_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const ENTITY_FIELDS_TTL_MS = 60 * 60 * 1000; // 1 hour (entity schemas rarely change)

const metadataCache = new Map<string, CachedMetadata>();
const catalogCache = new Map<string, { lists: ListDefinition[]; fetchedAt: number }>();
const entityFieldsCache = new Map<string, { fields: Record<string, EntityFieldInfo[]>; fetchedAt: number }>();

/** Maps builtin entity type names to their SuperOffice REST API entity endpoints */
const ENTITY_DEFAULT_ENDPOINTS: Record<string, string> = {
  company:  "Contact",
  contact:  "Person",
  followUp: "Appointment",
  project:  "Project",
  sale:     "Sale"
};

/** Field names that are system-managed and should not be offered as template suggestions */
const SKIP_ENTITY_FIELD_NAMES = new Set([
  "Deleted", "Source", "ActiveErpLinks", "GroupId",
  "DbiAgentId", "DbiLastSyncronized", "DbiKey", "DbiLastModified",
  "ActiveInterests", "ActiveStatusMonitorId", "UpdatedDate", "CreatedDate",
  "RegisteredDate", "Registered", "Updated", "FullName"
]);

// ---------------------------------------------------------------------------
// Shared fetch headers
// ---------------------------------------------------------------------------

function apiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Accept-Language": "en"
  };
}

// ---------------------------------------------------------------------------
// List catalog
// ---------------------------------------------------------------------------

/** Fetches the full list catalog (GET /v1/List) and caches it per tenant. */
export async function getListCatalog(
  webApiUrl: string,
  accessToken: string
): Promise<ListDefinition[]> {
  const cached = catalogCache.get(webApiUrl);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return cached.lists;
  }

  const res = await fetch(`${webApiUrl}v1/List`, { headers: apiHeaders(accessToken) });
  if (!res.ok) return [];

  const data = (await res.json()) as Array<Record<string, unknown>>;
  const lists: ListDefinition[] = data
    .filter((l) => !l["Deleted"])
    .map((l) => ({
      id: Number(l["Id"]),
      name: String(l["Name"] ?? ""),
      listType: String(l["ListType"] ?? "")
    }));

  catalogCache.set(webApiUrl, { lists, fetchedAt: Date.now() });
  return lists;
}

// ---------------------------------------------------------------------------
// Entity field discovery
// ---------------------------------------------------------------------------

/** Maps a SuperOffice FieldType string to a field category, or null to skip. */
function parseSoFieldType(fieldTypeStr: string): { fieldType: EntityFieldCategory; serviceTypeName?: string } | null {
  if (!fieldTypeStr) return null;
  if (fieldTypeStr === "System.String") return { fieldType: "string" };
  if (
    fieldTypeStr === "System.Int32" || fieldTypeStr === "System.Int16" ||
    fieldTypeStr === "System.Int64" || fieldTypeStr === "System.Byte" ||
    fieldTypeStr === "System.Boolean" || fieldTypeStr === "System.Single" ||
    fieldTypeStr === "System.Double"
  ) return { fieldType: "integer" };
  if (fieldTypeStr.startsWith("SuperOffice.CRM.Services.") && !fieldTypeStr.endsWith("[]")) {
    return { fieldType: "service-object", serviceTypeName: fieldTypeStr.slice("SuperOffice.CRM.Services.".length) };
  }
  return null; // DateTime, empty string, array types → skip
}

/**
 * Calls GET /v1/{Entity}/default for each builtin entity type and parses the
 * FieldProperties object to discover available fields with their types.
 * Field names are used exactly as returned by the API (PascalCase — no conversion).
 * Results are cached per tenant for 1 hour.
 */
export async function getEntityFields(
  webApiUrl: string,
  accessToken: string
): Promise<Record<string, EntityFieldInfo[]>> {
  const cached = entityFieldsCache.get(webApiUrl);
  if (cached && Date.now() - cached.fetchedAt < ENTITY_FIELDS_TTL_MS) {
    return cached.fields;
  }

  const headers = apiHeaders(accessToken);

  const entries = await Promise.all(
    Object.entries(ENTITY_DEFAULT_ENDPOINTS).map(async ([entityType, endpoint]) => {
      try {
        const res = await fetch(`${webApiUrl}v1/${endpoint}/default`, { headers });
        if (!res.ok) return [entityType, []] as [string, EntityFieldInfo[]];

        const data = (await res.json()) as Record<string, unknown>;
        const fieldProperties = data["FieldProperties"] as Record<string, Record<string, unknown>> | undefined;
        if (!fieldProperties) return [entityType, []] as [string, EntityFieldInfo[]];

        const fields: EntityFieldInfo[] = [];
        for (const [fieldName, prop] of Object.entries(fieldProperties)) {
          // Skip dot-notation nested keys (e.g. Address.City, UserDefinedFields.*)
          if (fieldName.includes(".")) continue;
          // Skip primary/foreign key columns
          if (fieldName.endsWith("Id")) continue;
          // Skip known system/audit fields
          if (SKIP_ENTITY_FIELD_NAMES.has(fieldName)) continue;
          // Skip fields the current user cannot write
          const mask = String((prop["FieldRight"] as Record<string, unknown>)?.["Mask"] ?? "");
          if (!mask.includes("Update")) continue;

          const fieldTypeStr = String(prop["FieldType"] ?? "");
          const parsed = parseSoFieldType(fieldTypeStr);
          if (!parsed) continue; // DateTime, empty, array types → not offered

          fields.push({
            name: fieldName,
            fieldType: parsed.fieldType,
            serviceTypeName: parsed.serviceTypeName,
            maxLength: Number(prop["FieldLength"]) || undefined,
            mandatory: mask.includes("UIHintMandatory")
          });
        }

        return [entityType, fields] as [string, EntityFieldInfo[]];
      } catch {
        return [entityType, []] as [string, EntityFieldInfo[]];
      }
    })
  );

  const fields = Object.fromEntries(entries);
  entityFieldsCache.set(webApiUrl, { fields, fetchedAt: Date.now() });
  return fields;
}

// ---------------------------------------------------------------------------
// List item fetchers
// ---------------------------------------------------------------------------

/** Fetch items for a built-in list by numeric list ID via GET /v1/List/{id}/Items */
async function fetchBuiltinListItems(
  webApiUrl: string,
  accessToken: string,
  listId: number
): Promise<MetadataItem[]> {
  const res = await fetch(`${webApiUrl}v1/List/${listId}/Items`, {
    headers: apiHeaders(accessToken)
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data
    .filter((item) => !item["Deleted"])
    .map((item) => ({ id: Number(item["Id"]), name: String(item["Name"] ?? "") }));
}

/** Fetch items for a user-defined list by numeric list ID via GET /v1/MDOList/udlist{id} */
async function fetchUdListItems(
  webApiUrl: string,
  accessToken: string,
  listId: number
): Promise<MetadataItem[]> {
  const res = await fetch(`${webApiUrl}v1/MDOList/udlist${listId}`, {
    headers: apiHeaders(accessToken)
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data
    .filter((item) => !item["Deleted"])
    .map((item) => ({ id: Number(item["Id"]), name: String(item["Name"] ?? "") }));
}

/**
 * Fetch country items from GET /v1/List/{id}/Items.
 * Countries have a distinct response shape with CountryId and TwoLetterISOCountry.
 */
async function fetchCountryItems(
  webApiUrl: string,
  accessToken: string,
  listId: number
): Promise<CachedMetadata["countries"]> {
  const res = await fetch(`${webApiUrl}v1/List/${listId}/Items`, {
    headers: apiHeaders(accessToken)
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data
    .filter((item) => !item["Deleted"])
    .map((item) => ({
      id: Number(item["CountryId"]),
      englishName: String(item["EnglishName"] ?? item["Name"] ?? ""),
      twoLetterISOCountry: String(item["TwoLetterISOCountry"] ?? "")
    }));
}

/** Find a list in the catalog by ListType (case-insensitive). */
function findByType(catalog: ListDefinition[], listType: string): ListDefinition | undefined {
  return catalog.find((l) => l.listType.toLowerCase() === listType.toLowerCase());
}

// ---------------------------------------------------------------------------
// Main metadata fetch
// ---------------------------------------------------------------------------

export async function getMetadata(webApiUrl: string, accessToken: string): Promise<CachedMetadata> {
  const cached = metadataCache.get(webApiUrl);
  if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) {
    return cached;
  }

  const catalog = await getListCatalog(webApiUrl, accessToken);

  // Resolve list IDs for the 8 known system lists from the catalog
  const bizList      = findByType(catalog, "business");
  const catList      = findByType(catalog, "category");
  const countryList  = findByType(catalog, "country");
  const projTypeList = findByType(catalog, "projecttype");
  const projStatList = findByType(catalog, "projectstatus");
  const saleTypeList = findByType(catalog, "saletype");
  const sourceList   = findByType(catalog, "source");
  const taskList     = findByType(catalog, "task");
  const probList     = findByType(catalog, "prob");

  const headers = apiHeaders(accessToken);

  const [principalRes, businesses, categories, countries, projectTypes, projectStatuses, saleTypes, sources, tasks, probs] =
    await Promise.all([
      fetch(`${webApiUrl}v1/User/currentPrincipal`, { headers }),
      bizList      ? fetchBuiltinListItems(webApiUrl, accessToken, bizList.id)       : Promise.resolve<MetadataItem[]>([]),
      catList      ? fetchBuiltinListItems(webApiUrl, accessToken, catList.id)       : Promise.resolve<MetadataItem[]>([]),
      countryList  ? fetchCountryItems(webApiUrl, accessToken, countryList.id)       : Promise.resolve<CachedMetadata["countries"]>([]),
      projTypeList ? fetchBuiltinListItems(webApiUrl, accessToken, projTypeList.id)  : Promise.resolve<MetadataItem[]>([]),
      projStatList ? fetchBuiltinListItems(webApiUrl, accessToken, projStatList.id)  : Promise.resolve<MetadataItem[]>([]),
      saleTypeList ? fetchBuiltinListItems(webApiUrl, accessToken, saleTypeList.id)  : Promise.resolve<MetadataItem[]>([]),
      sourceList   ? fetchBuiltinListItems(webApiUrl, accessToken, sourceList.id)    : Promise.resolve<MetadataItem[]>([]),
      taskList     ? fetchBuiltinListItems(webApiUrl, accessToken, taskList.id)      : Promise.resolve<MetadataItem[]>([]),
      probList     ? fetchBuiltinListItems(webApiUrl, accessToken, probList.id)      : Promise.resolve<MetadataItem[]>([])
    ]);

  const principal = principalRes.ok
    ? ((await principalRes.json()) as Record<string, unknown>)
    : {};
  const associateId = Number(principal["AssociateId"] ?? 0);
  const groupId = Number(principal["GroupId"] ?? 0);
  const defaultProbabilityId = Number(probs[0]?.id ?? 1);

  const metadata: CachedMetadata = {
    countries,
    businesses,
    categories,
    projectTypes,
    projectStatuses,
    saleTypes,
    sources,
    tasks,
    associateId,
    groupId,
    defaultProbabilityId,
    listItems: new Map(),
    fetchedAt: Date.now()
  };

  metadataCache.set(webApiUrl, metadata);
  return metadata;
}

// ---------------------------------------------------------------------------
// MDO list item prefetch — called before job execution for mdolist field rules
// ---------------------------------------------------------------------------

/**
 * Prefetches items for all MDO list IDs referenced by mdolist field rules.
 * Adds results to the tenant's cached metadata.listItems map.
 * Safe to call concurrently — skips IDs already present in the map.
 */
export async function prefetchMdoListItems(
  webApiUrl: string,
  accessToken: string,
  listRules: Array<{ listId: number; listType: string }>
): Promise<void> {
  const cached = metadataCache.get(webApiUrl);
  if (!cached) return;

  // Deduplicate and skip already-cached IDs
  const seen = new Set<number>();
  const toFetch = listRules.filter(({ listId }) => {
    if (cached.listItems.has(listId) || seen.has(listId)) return false;
    seen.add(listId);
    return true;
  });
  if (!toFetch.length) return;

  await Promise.all(
    toFetch.map(async ({ listId, listType }) => {
      const items =
        listType === "udlist"
          ? await fetchUdListItems(webApiUrl, accessToken, listId)
          : await fetchBuiltinListItems(webApiUrl, accessToken, listId);
      cached.listItems.set(listId, items);
    })
  );
}
