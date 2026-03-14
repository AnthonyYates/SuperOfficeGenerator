import { faker as baseFaker } from "@faker-js/faker";
import type { LocaleCode } from "./types";

// faker v10+ removed runtime locale switching via string keys.
// We return the default faker instance; locale-aware generation can be
// extended later by importing specific locale modules as needed.
export function buildFaker(_locale: LocaleCode) {
  return baseFaker;
}

export function runFakerPath(fakerInstance: typeof baseFaker, path: string) {
  const [namespace, method] = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = (fakerInstance as any)[namespace];
  if (target && typeof target[method] === "function") {
    return target[method]();
  }
  throw new Error(`Unsupported faker path: ${path}`);
}
