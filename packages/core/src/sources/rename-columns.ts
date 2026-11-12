// A recipe's `columnNames` (spec/cli/sources.md, section 1 and the start of section 2), applied in
// one place to the tables any reader read.
import type { SourceRecipe } from "./recipe.js";
import type { Refused, SourceTableRead } from "./result.js";

/** The new name: `to`, with each `$n` the nth capture group; the name when `match` does not match. */
function renamed(name: string, rule: { match: string; to: string }): string {
  const found = new RegExp(rule.match, "i").exec(name);
  if (found === null) return name;
  const to = rule.to.replace(/\$(\d+)/g, (_, group: string) => found[Number(group)] ?? "");
  return to === "" ? name : to;
}

/**
 * The tables with each column renamed by the recipe's `columnNames`, once and only at the top of
 * a table; the tables as they are when the recipe gives none. A table in which two columns get the
 * same name is refused.
 */
export function renameColumns(
  tables: SourceTableRead[],
  recipe: SourceRecipe | undefined,
  file: string,
): SourceTableRead[] | Refused {
  const rule = recipe?.columnNames;
  if (recipe === undefined || rule === undefined) return tables;
  const result: SourceTableRead[] = [];
  for (const table of tables) {
    const seen = new Set<string>();
    const columns = table.columns.map((column) => ({
      ...column,
      name: renamed(column.name, rule),
    }));
    for (const { name } of columns) {
      if (seen.has(name))
        return {
          refused: [
            `${file}: the recipe "${recipe.id}" gives two columns of the table "${table.object}" the name "${name}".`,
          ],
        };
      seen.add(name);
    }
    result.push({ ...table, columns });
  }
  return result;
}
