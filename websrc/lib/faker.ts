import "server-only";

import {
  Faker,
  cs_CZ,
  da,
  de,
  en,
  en_GB,
  es,
  fi,
  fr,
  it,
  ja,
  ko,
  nb_NO,
  nl,
  pl,
  pt_BR,
  ru,
  sv,
  uk,
  zh_CN
} from "@faker-js/faker";
import type { LocaleDefinition } from "@faker-js/faker";
import type { LocaleCode } from "./types";

// Map user-facing locale codes (as typed in templates/jobs) to @faker-js/faker locale modules.
const LOCALE_MAP: Record<string, LocaleDefinition> = {
  cz: cs_CZ,
  en,
  en_GB,
  gb: en_GB,
  de,
  es,
  fi,
  fr,
  nl,
  da,
  it,
  ja,
  ko,
  nb: nb_NO,
  nb_NO,
  no: nb_NO,
  pl,
  pt_BR,
  pt: pt_BR,
  ru,
  sv,
  uk,
  zh_CN,
  zh: zh_CN
};

// Cache instances by locale key — avoids re-creating on every row/call.
const cache = new Map<string, Faker>();

export function buildFaker(locale: LocaleCode): Faker {
  const cached = cache.get(locale);
  if (cached) return cached;
  const primary = LOCALE_MAP[locale];
  const instance = new Faker({ locale: primary ? [primary, en] : [en] });
  cache.set(locale, instance);
  return instance;
}

/**
 * Builds the combined locale pool for an entity phase by merging job-level
 * locales and the entity's own fallback list, then filtering to locales that
 * are recognised by the faker LOCALE_MAP. The caller picks randomly from this
 * pool per row, mirroring the C# console app behaviour of varying locale per
 * company created.
 *
 *   buildLocalePool(["nb"], ["en"])       → ["nb", "en"]
 *   buildLocalePool(["nb"], ["en", "nb"]) → ["nb", "en"]
 *   buildLocalePool([], ["en", "nb"])     → ["en", "nb"]
 *   buildLocalePool(["xx"], [])           → ["en"]  (xx not recognised)
 */
export function buildLocalePool(
  jobLocales: LocaleCode[],
  entityFallbacks: LocaleCode[]
): LocaleCode[] {
  const seen = new Set<LocaleCode>();
  const pool: LocaleCode[] = [];
  for (const loc of [...jobLocales, ...entityFallbacks]) {
    if (!seen.has(loc) && loc in LOCALE_MAP) {
      seen.add(loc);
      pool.push(loc);
    }
  }
  return pool.length ? pool : ["en"];
}

/** Namespaces that don't produce plain string/number output suitable for CRM fields. */
const FAKER_SKIP_NAMESPACES = new Set(["_randomizer", "helpers", "date", "rawDefinitions"]);

let _fakerPathsCache: string[] | null = null;

/**
 * Introspects the faker instance and returns all callable paths in "namespace.method" format.
 * Results are memoised — the list is static for a given faker version.
 */
export function getFakerPaths(): string[] {
  if (_fakerPathsCache) return _fakerPathsCache;

  const instance = buildFaker("en");
  const paths: string[] = [];

  for (const [namespace, mod] of Object.entries(instance)) {
    if (FAKER_SKIP_NAMESPACES.has(namespace)) continue;
    if (!mod || typeof mod !== "object") continue;
    for (const [method, fn] of Object.entries(mod as Record<string, unknown>)) {
      if (typeof fn === "function") {
        paths.push(`${namespace}.${method}`);
      }
    }
  }

  _fakerPathsCache = paths.sort();
  return _fakerPathsCache;
}

export function runFakerPath(fakerInstance: Faker, path: string): unknown {
  const parts = path.split(".");
  if (parts.length !== 2) {
    throw new Error(`Faker path must be "namespace.method", got: "${path}"`);
  }
  const [namespace, method] = parts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (fakerInstance as any)[namespace];
  if (target && typeof target[method] === "function") {
    return target[method]();
  }
  throw new Error(`Unsupported faker path: ${path}`);
}
