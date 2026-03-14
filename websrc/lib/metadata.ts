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
    fetchedAt: Date.now()
  };

  metadataCache.set(webApiUrl, metadata);
  return metadata;
}
