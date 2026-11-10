// One row filter for each table (specification section 8.2): on Databricks a query fails when
// more than one distinct row filter applies to a table for its user, so a second one is an error.
import type { Context } from "../context/index.js";
import type { JudgedTable } from "./access-judge.js";

/**
 * `FILTER_MULTIPLE` for each set of two or more filters a pack applies to one table, at the
 * second filter's declaration, once for every table that has that set.
 */
export function checkFilterCount(context: Context, kept: JudgedTable[]): void {
  const sets = new Map<string, { filters: string[]; tables: string[] }>();
  for (const { table, filters } of kept) {
    const names = filters.map((filter) => filter.name);
    if (names.length < 2) continue;
    const key = JSON.stringify(names);
    const found = sets.get(key) ?? { filters: names, tables: [] };
    found.tables.push(table.name);
    sets.set(key, found);
  }
  for (const { filters, tables } of sets.values()) {
    const named = tables.length === 1 ? `table "${tables[0]}"` : `tables ${quoted(tables)}`;
    context.reporter.error(
      "FILTER_MULTIPLE",
      `The filters ${listed(filters)} apply to ${named}; a table may have one row filter.`,
      { document: context.standard, pointer: `/governance/filters/${filters[1]}` },
      "Combine their conditions in one filter function, or narrow their matches so each table has one.",
    );
  }
}

function quoted(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

/** `"a" and "b"`, `"a", "b" and "c"`. */
function listed(names: string[]): string {
  const all = names.map((name) => `"${name}"`);
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}
