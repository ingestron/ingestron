// Completion of a column's name from a flow table's source metadata and its contract: in a check's
// SQL, in the table's `sequence`, `load.cursor`, `deduplicate.order_by` and `cleanse.columns`, and
// in a contract's properties. A name is inserted as the text around it reads it: backticked in SQL
// where it needs it, a plain or double-quoted scalar in YAML. The label stays the bare name.
import type { SourceColumnDoc, SourceTable } from "@ingestron/definitions";
import { documentOf, writtenKeys, type Place } from "../navigation/index.js";
import type { Project } from "../project/index.js";
import { inQuote, sqlName, yamlName, type Quote } from "./column-text.js";
import { sourceTablesAt } from "./source-tables.js";
import type { Suggestion } from "./suggestion.js";
import { quoteAt, valueStart } from "./typed-text.js";

/** The check's text before the cursor, with the table's key, when a check's SQL is being typed. */
function checkAt(
  place: Place,
): { table: string; typed: string; tight: boolean; quote: Quote } | undefined {
  if (place.kind !== "Flow" || place.inFlow) return undefined;
  const line = place.before.slice(place.before.lastIndexOf("\n") + 1);
  const check = /^\s*(?:-\s+)?check:(\s*)(.*)$/.exec(line);
  const table = /^tables\/([^/]+)\/expectations(?:\/\d+)?(?:\/check)?$/.exec(place.path.join("/"));
  if (!check || !table) return undefined;
  const written = check[2] ?? "";
  const typed = written.replace(/^"/, "");
  return {
    table: table[1]!,
    typed,
    tight: check[1] === "" && typed === "",
    quote: written.startsWith('"') ? '"' : "",
  };
}

/**
 * The columns of the table at the cursor while a check's SQL is being typed: `[]` where a column
 * cannot go (inside a quoted text) or the table has no metadata entry, undefined elsewhere. A
 * column is inserted as the SQL reads it (backticked where it needs it) and as the YAML around it
 * reads it.
 */
export function checkColumns(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const check = checkAt(place);
  if (!check) return undefined;
  const { text, open } = openText(check.typed);
  if (text) return [];
  const entry = tableOf(project, place, check.table, environment)?.entry;
  // Inside a backtick already typed, a name goes in as it is, doubled, with the closing one.
  const after = open ? check.typed.slice(check.typed.lastIndexOf("`") + 1) : "";
  const replaceFrom = open ? place.before.length - after.length : undefined;
  return (entry?.columns ?? []).map((item) => {
    const base = column(item);
    const sql = open ? `${item.name.replaceAll("`", "``")}\`` : sqlName(item.name);
    // A YAML plain scalar cannot start with a backtick: open the quoted one it needs instead.
    const opens = check.quote === "" && check.typed === "" && sql.startsWith("`") ? '"' : "";
    const text = `${check.tight ? " " : ""}${opens}${inQuote(sql, opens || check.quote)}`;
    return {
      ...base,
      ...(text !== item.name && { insertText: text }),
      ...(replaceFrom !== undefined && { replaceFrom }),
    };
  });
}

/**
 * Whether the SQL typed so far ends inside a text in single quotes (`text`) or a name in backticks
 * (`open`): a quote inside the other kind does not count, so a backticked name that holds `'`
 * leaves the rest of the check open to columns.
 */
function openText(sql: string): { text: boolean; open: boolean } {
  let inside = "";
  for (const mark of sql)
    if (inside === "") inside = mark === "'" || mark === "`" ? mark : "";
    else if (mark === inside) inside = "";
  return { text: inside === "'", open: inside === "`" };
}

/** The flow table at `key` in the flow being edited, as the resolved project lists it. */
function tableOf(
  project: Project,
  place: Place,
  key: string,
  environment: string | undefined,
): SourceTable | undefined {
  const flow = place.data.id;
  return sourceTablesAt(project, place, environment).find(
    (item) => item.flow === flow && item.table === key,
  );
}

/** A column as a suggestion, with the type the source gives it (else the logical type). */
function column({ name, sourceType, logicalType }: SourceColumnDoc): Suggestion {
  return { label: name, kind: "reference", detail: sourceType ?? logicalType };
}

/** A name written as a YAML scalar at the place, inside the quote being typed or plain. */
function inYaml(item: Suggestion, place: Place): Suggestion {
  const quote = quoteAt(place);
  const text = quote ? inQuote(item.label, quote) : yamlName(item.label, place.inFlow);
  return text === item.label ? item : { ...item, insertText: text };
}

/**
 * The columns a flow table's `sequence`, `load.cursor`, `deduplicate.order_by` and
 * `cleanse.columns` name: those of its metadata entry, then, when it names a contract, the
 * contract's top-level properties that the entry has not (compared as section 12.6 does). Undefined when it has neither.
 */
export function tableColumns(
  project: Project,
  place: Place,
  key: string,
  environment: string | undefined,
  skip: ReadonlySet<string> = new Set(),
): Suggestion[] | undefined {
  const table = tableOf(project, place, key, environment);
  const listed = (table?.entry?.columns ?? []).map(column);
  // As the comparison with the contract does (specification section 12.6): case counts unless
  // the metadata says names do not differ by case.
  const same = (label: string) =>
    table?.names?.caseSensitive === false ? label.toLowerCase() : label;
  const seen = new Set(listed.map(({ label }) => same(label)));
  const own = table?.contract ? contractProperties(project, table.contract) : [];
  const found = [
    ...listed,
    ...own.filter(({ label }) => !seen.has(same(label)) && seen.add(same(label))),
  ]
    .filter(({ label }) => !skip.has(label))
    .map((item) => inYaml(item, place));
  return found.length === 0 ? undefined : found;
}

/** The names of the properties directly under the schema items of the contract with this id. */
function contractProperties(project: Project, id: string): Suggestion[] {
  const schema = documentOf(project, "DataContract", id)?.schema;
  if (!Array.isArray(schema)) return [];
  return schema.flatMap((item: unknown) => {
    const properties = (item as { properties?: unknown } | null)?.properties;
    return (Array.isArray(properties) ? properties : []).flatMap((property: unknown) => {
      const { name, logicalType } = (property ?? {}) as { name?: unknown; logicalType?: unknown };
      return typeof name === "string"
        ? [
            {
              label: name,
              kind: "reference" as const,
              ...(typeof logicalType === "string" && { detail: logicalType }),
            },
          ]
        : [];
    });
  });
}

/** A new key under a flow table's `cleanse.columns`: its columns, those not written yet. */
export function cleanseColumnKeys(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const table = /^tables\/([^/]+)\/cleanse\/columns$/.exec(place.path.join("/"))?.[1];
  if (place.kind !== "Flow" || place.part !== "key" || table === undefined) return undefined;
  const replaceFrom = valueStart(place);
  return tableColumns(project, place, table, environment, writtenKeys(place))?.map((item) => ({
    ...item,
    replaceFrom,
  }));
}

/**
 * The name of a property in a contract, from the metadata entries of the flow tables that use
 * the contract; a nested property takes the columns of the column its parents name.
 */
export function contractColumns(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] | undefined {
  const where = /^schema\/(\d+)((?:\/properties\/\d+)*)\/properties(?:\/\d+)?\/name$/.exec(
    place.path.join("/"),
  );
  if (!where) return undefined;
  const parents = namesAbove(
    place,
    Number(where[1]),
    (where[2] ?? "").split("/properties/").slice(1),
  );
  const id = place.data.id;
  const tables = sourceTablesAt(project, place, environment).filter(
    (item) => item.contract === id && item.entry,
  );
  const seen = new Set<string>();
  const found = tables
    .flatMap((item) => columnsBelow(item.entry!.columns, parents))
    .filter(({ name }) => !seen.has(name) && Boolean(seen.add(name)));
  return found.length === 0 ? undefined : found.map((item) => inYaml(column(item), place));
}

/** The names, from the schema item down, of the properties that hold the one being typed. */
function namesAbove(place: Place, schema: number, indexes: string[]): string[] {
  const names: string[] = [];
  let node: unknown = (place.data.schema as unknown[] | undefined)?.[schema];
  for (const index of indexes) {
    node = (node as { properties?: unknown[] } | undefined)?.properties?.[Number(index)];
    names.push(String((node as { name?: unknown } | undefined)?.name));
  }
  return names;
}

/** The columns inside the column that `parents` name, one inside the other. */
function columnsBelow(columns: SourceColumnDoc[], parents: string[]): SourceColumnDoc[] {
  let level = columns;
  for (const name of parents) level = level.find((item) => item.name === name)?.properties ?? [];
  return level;
}
