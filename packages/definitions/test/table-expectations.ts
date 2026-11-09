// How a conformance case's expected table is compared with a resolved one.
import { expect } from "vitest";

/**
 * The table holds every value the case expects, and nothing where the case writes
 * `null`, such as a step or a setting the table must not have.
 */
export function matchTable(table: unknown, wanted: Record<string, unknown>): void {
  for (const path of nullPaths(wanted))
    expect(valueAtPath(table, path), path.join(".")).toBeUndefined();
  expect(table).toMatchObject(withoutNulls(wanted) as Record<string, unknown>);
}

/** The key paths of a case's expectation whose value is `null`. */
function nullPaths(wanted: unknown, path: string[] = []): string[][] {
  if (wanted === null) return [path];
  if (typeof wanted !== "object" || Array.isArray(wanted)) return [];
  return Object.entries(wanted).flatMap(([key, child]) => nullPaths(child, [...path, key]));
}

/** The expectation without its `null` keys, which `nullPaths` checks. */
function withoutNulls(wanted: unknown): unknown {
  if (typeof wanted !== "object" || wanted === null || Array.isArray(wanted)) return wanted;
  const kept = Object.entries(wanted).filter(([, child]) => child !== null);
  return Object.fromEntries(kept.map(([key, child]) => [key, withoutNulls(child)]));
}

function valueAtPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current !== null && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}
