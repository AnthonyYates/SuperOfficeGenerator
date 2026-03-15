import "server-only";

import {
  Faker,
  en,
  nb_NO,
  de,
  fr,
  es,
  nl,
  sv,
  da,
  fi,
  it,
  pl,
  pt_BR,
  ru,
  zh_CN,
  ja,
  ko
} from "@faker-js/faker";
import type { LocaleDefinition } from "@faker-js/faker";
import type { LocaleCode } from "./types";

// Map user-facing locale codes (as typed in templates/jobs) to @faker-js/faker locale modules.
const LOCALE_MAP: Record<string, LocaleDefinition> = {
  en,
  nb: nb_NO,
  nb_NO,
  no: nb_NO,
  de,
  fr,
  es,
  nl,
  sv,
  da,
  fi,
  it,
  pl,
  pt_BR,
  pt: pt_BR,
  ru,
  zh_CN,
  zh: zh_CN,
  ja,
  ko
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
 * Returns the best locale for an entity given job-level preferences and the
 * entity's own fallback list. Picks the first job locale that appears in the
 * entity fallbacks, falling back to the first entity fallback if none match.
 *
 *   resolveLocale(["nb"], ["en", "nb"])  → "nb"   (job wants nb, entity supports it)
 *   resolveLocale(["nb"], ["en"])        → "en"   (job wants nb, entity only has en)
 *   resolveLocale([], ["en", "nb"])      → "en"   (no job preference → first entity fallback)
 */
export function resolveLocale(
  jobLocales: LocaleCode[],
  entityFallbacks: LocaleCode[]
): LocaleCode {
  for (const loc of jobLocales) {
    if (entityFallbacks.includes(loc)) return loc;
  }
  return entityFallbacks[0] ?? "en";
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
