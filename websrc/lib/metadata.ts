import "server-only";

import { createListAgent } from "./superoffice-client";

export interface MetadataItem {
  id: number;
  value: string;
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
  fetchedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Module-level cache keyed by webApiUrl (one entry per tenant)
const metadataCache = new Map<string, CachedMetadata>();

export async function getMetadata(webApiUrl: string, accessToken: string): Promise<CachedMetadata> {
  const cached = metadataCache.get(webApiUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const agent = createListAgent(webApiUrl, accessToken);

  const [principalRes, probRes] = await Promise.all([
    fetch(`${webApiUrl}v1/User/currentPrincipal`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    }),
    fetch(`${webApiUrl}v1/MDOList/prob?flat=true`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    })
  ]);
  const principal = principalRes.ok
    ? ((await principalRes.json()) as Record<string, unknown>)
    : {};
  const probList = probRes.ok
    ? ((await probRes.json()) as Array<Record<string, unknown>>)
    : [];
  const associateId = Number(principal["AssociateId"] ?? 0);
  const groupId = Number(principal["GroupId"] ?? 0);
  const defaultProbabilityId = Number(probList[0]?.["Id"] ?? probList[0]?.["id"] ?? 1);

  const [countries, businesses, categories, projectTypes, projectStatuses, saleTypes, sources, tasks] =
    await Promise.all([
      agent.getCountriesAsync(),
      agent.getBusinessesAsync(),
      agent.getCategoriesAsync(),
      agent.getProjectTypesAsync(),
      agent.getProjectStatusesAsync(),
      agent.getAllSaleTypeAsync(),
      agent.getSourcesAsync(),
      agent.getTasksAsync()
    ]);

  const metadata: CachedMetadata = {
    countries: countries.map((c) => ({
      id: c.countryId ?? 0,
      englishName: c.englishName ?? "",
      twoLetterISOCountry: c.twoLetterISOCountry ?? ""
    })),
    businesses: businesses.map((b) => ({ id: b.id ?? 0, value: b.value ?? "" })),
    categories: categories.map((c) => ({ id: c.id ?? 0, value: c.value ?? "" })),
    projectTypes: projectTypes.map((t) => ({ id: t.id ?? 0, value: t.value ?? "" })),
    projectStatuses: projectStatuses.map((s) => ({ id: s.id ?? 0, value: s.value ?? "" })),
    saleTypes: saleTypes.map((t) => ({ id: t.id ?? 0, value: t.value ?? "" })),
    sources: sources.map((s) => ({ id: s.id ?? 0, value: s.value ?? "" })),
    tasks: tasks.map((t) => ({ id: t.id ?? 0, value: t.value ?? "" })),
    associateId,
    groupId,
    defaultProbabilityId,
    fetchedAt: Date.now()
  };

  metadataCache.set(webApiUrl, metadata);
  return metadata;
}
