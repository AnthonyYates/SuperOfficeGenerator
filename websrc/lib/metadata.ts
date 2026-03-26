import "server-only";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MetadataItem {
  id: number;
  name: string;
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

const metadataCache = new Map<string, CachedMetadata>();
const catalogCache = new Map<string, { lists: ListDefinition[]; fetchedAt: number }>();

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
