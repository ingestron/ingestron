// The intent block of a table's hover: each intent path the table resolves and where it came from.
import { intentPaths, type ResolvedTable } from "@ingestron/definitions";
import { shown } from "./hover.js";
import { intentFrom } from "./origin-text.js";

/** Each intent path the table resolves, its value and where it came from, in the vocabulary's order. */
export function intentText(table: ResolvedTable): string | undefined {
  const listed = Object.keys(intentPaths);
  const paths = Object.keys(table.intentOrigins).sort((a, b) => rank(listed, a) - rank(listed, b));
  const rows = paths.flatMap((path) => {
    const value = intentValue(table.intent, path);
    const origin = table.intentOrigins[path];
    if (value === undefined || !origin) return [];
    return [`- \`${path}\`: \`${shown(value)}\`, from ${intentFrom(origin, table)}`];
  });
  return rows.length > 0 ? `**Intent**\n\n${rows.join("\n")}` : undefined;
}

const rank = (listed: string[], path: string) => {
  const at = listed.indexOf(path);
  return at < 0 ? listed.length : at;
};

/** The value at an intent path such as `load.deletes.mode`. */
function intentValue(intent: object, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      intent,
    );
}
