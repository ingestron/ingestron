// Drafting contracts: an ODCS draft for a flow table from its entry in the connection's source
// metadata (spec/cli/sources.md, section 5). Nothing is written here; the CLI writes the files and
// the editor's quick fix uses the same function.
import { formatDiagnostics, type FileSource } from "@ingestron/config";
import {
  resolveDefinitions,
  type SourceColumnDoc,
  type SourceTable,
  type SourceTableDoc,
} from "@ingestron/definitions";
import type { ProjectOptions } from "../generation/index.js";
import { packs } from "../packs/index.js";
import { resolving } from "../request/index.js";
import { stoppingErrors } from "./request.js";
import { yamlText, yamlValue } from "./yaml-value.js";

/**
 * One drafted contract and where it goes.
 * @public
 */
export interface ContractDraft {
  /** The flow table, as `<flow>.<table>`. */
  table: string;
  /** Where the draft goes, relative to the project: `contracts/<connection>.<table>.yaml`. */
  path: string;
  /** The draft's contract id, `<connection>.<table>`, which the table names with `contract`. */
  id: string;
  /** The draft's YAML text. */
  text: string;
}

/**
 * Which tables to draft, and for which environment.
 * @public
 */
export interface DraftContractsOptions extends ProjectOptions {
  /** The flow tables to draft, each as `<flow>.<table>`, in the order given. */
  tables?: string[];
  /**
   * Draft every table that needs a contract, names none and has a metadata entry, and name each
   * one that has no entry. Used when `tables` is not given.
   */
  needed?: boolean;
  /** The environment to resolve for; by default no particular environment, as `plan` does. */
  environment?: string;
}

/**
 * Drafts a contract for each flow table named, or with `needed` for every table that needs one,
 * from its entry in the source metadata. A table that cannot be drafted is a problem and the
 * others are still drafted; errors the metadata does not settle stop the drafting, and are the
 * problems. Nothing is written, and an existing file is for the caller to skip.
 * @example
 * const { drafts, problems } = draftContracts(nodeFiles("."), { tables: ["sales.orders"] });
 * @public
 */
export function draftContracts(
  files: FileSource,
  options: DraftContractsOptions = {},
): { drafts: ContractDraft[]; problems: string[] } {
  const { diagnostics, sourceTables = [] } = resolveDefinitions(files, {
    ...resolving,
    sourceTables: true,
    packs: [...(options.packs ?? packs)],
    envvars: options.envvars ?? process.env,
    environment: options.environment,
  });
  const errors = stoppingErrors(diagnostics);
  if (errors.length > 0)
    return { drafts: [], problems: errors.map((error) => formatDiagnostics([error])) };
  const asked =
    options.tables !== undefined
      ? options.tables.map((name) => named(name, sourceTables))
      : options.needed
        ? sourceTables.filter(needsDraft).map(needed)
        : [];
  return {
    drafts: asked.filter((item) => typeof item !== "string"),
    problems: asked.filter((item) => typeof item === "string"),
  };
}

/** The table's name as the caller gives it: the flow's id and the table's key. */
const nameOf = (table: SourceTable): string => `${table.flow}.${table.table}`;

/** A table that needs a contract and names none. */
const needsDraft = (table: SourceTable): boolean =>
  table.needs !== undefined && table.contract === undefined;

/** The metadata `connection` names no entry for. */
const noEntry = (table: SourceTable): string =>
  `has no entry in the source metadata of "${table.connection}"; import it first (ingestron source request says how).`;

/** The draft of a table that needs a contract, or the problem when it has no entry. */
function needed(table: SourceTable): ContractDraft | string {
  if (table.entry === undefined) return `"${nameOf(table)}" needs a contract but ${noEntry(table)}`;
  return draftOf(table, table.entry);
}

/** The draft of a table the caller named, or why it cannot be drafted. */
function named(name: string, tables: readonly SourceTable[]): ContractDraft | string {
  const table = tables.find((item) => nameOf(item) === name);
  if (table === undefined)
    return `"${name}" is not a flow table. Flow tables: ${tables.map(nameOf).join(", ") || "none"}.`;
  if (table.contract !== undefined)
    return `"${name}" already names the contract "${table.contract}".`;
  if (table.entry === undefined) return `"${name}" ${noEntry(table)}`;
  return draftOf(table, table.entry);
}

function draftOf(table: SourceTable, entry: SourceTableDoc): ContractDraft {
  const id = `${table.connection}.${table.table}`;
  return {
    table: nameOf(table),
    path: `contracts/${id}.yaml`,
    id,
    text: draftText(table, entry, id),
  };
}

/** Tables from a sample or an assistant have no key: it was not read from the source. */
const hasKey = (entry: SourceTableDoc): boolean =>
  entry.captured.from !== "sample" && entry.captured.from !== "assistant";

/** The text with its line breaks written as `\n` and `\r`, so that it stays on a comment's line. */
const oneLine = (text: string): string =>
  text.replace(/[\r\n\u2028\u2029]/g, (found) =>
    found === "\n" ? "\\n" : found === "\r" ? "\\r" : `\\u${found.charCodeAt(0).toString(16)}`,
  );

/** The draft: the comment, then the contract's keys in order, ending with a line break. */
function draftText(table: SourceTable, entry: SourceTableDoc, id: string): string {
  const keyed = hasKey(entry);
  const { from, at } = entry.captured;
  const lines = [
    `# Drafted from "${oneLine(entry.object)}"${table.file === undefined ? "" : ` in ${oneLine(table.file)}`} (${from}, captured ${at.slice(0, 10)}).`,
    keyed
      ? "# Review the types, required columns and key, then add descriptions, classifications and checks."
      : "# Review the types and required columns, then add the key, descriptions, classifications and checks.",
    "apiVersion: v3.1.0",
    "kind: DataContract",
    `id: ${yamlText(id, "block")}`,
    "version: 0.1.0",
    "status: draft",
    "schema:",
    `  - name: ${yamlText(table.table, "block")}`,
    "    logicalType: object",
    ...listLines("    properties:", entry.columns, "      ", keyed),
  ];
  return `${lines.join("\n")}\n`;
}

/** `key:` and the columns as its list, or `key: []` for none. */
function listLines(
  key: string,
  columns: readonly SourceColumnDoc[],
  indent: string,
  keyed: boolean,
): string[] {
  if (columns.length === 0) return [`${key} []`];
  return [key, ...columns.flatMap((column) => listItem(column, indent, keyed))];
}

/** A column as an item of a list at `indent`, in block style. */
function listItem(column: SourceColumnDoc, indent: string, keyed: boolean): string[] {
  const [first = "", ...rest] = blockLines(column, `${indent}  `, keyed);
  return [`${indent}- ${first.slice(indent.length + 2)}`, ...rest];
}

/**
 * The column's options that ODCS 3.1 has a field for. A decimal's `precision` and `scale` are
 * not among them, so a contract that had them would fail its schema (`SCHEMA`), and are left out;
 * the comparison reads an option only when both sides give it.
 */
function optionsOf(column: SourceColumnDoc): Record<string, unknown> | undefined {
  if (column.logicalTypeOptions === undefined) return undefined;
  const kept = Object.entries(column.logicalTypeOptions).filter(
    ([name]) => name !== "precision" && name !== "scale",
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** A column's keys at `indent`, in the order a draft gives them, then its nested columns. */
function blockLines(column: SourceColumnDoc, indent: string, keyed: boolean): string[] {
  const key = keyed && column.primaryKeyPosition !== undefined;
  const options = optionsOf(column);
  const fields: [string, string][] = [
    ["name", yamlText(column.name, "block")],
    ["logicalType", yamlText(column.logicalType, "block")],
    ...(options === undefined
      ? []
      : ([["logicalTypeOptions", yamlValue(options, "block")]] as [string, string][])),
    ["required", String(column.required)],
    ...(key
      ? ([
          ["primaryKey", "true"],
          ["primaryKeyPosition", String(column.primaryKeyPosition)],
        ] as [string, string][])
      : []),
  ];
  const lines = fields.map(([name, value]) => `${indent}${name}: ${value}`);
  if (column.properties !== undefined)
    lines.push(...listLines(`${indent}properties:`, column.properties, `${indent}  `, keyed));
  if (column.items !== undefined)
    lines.push(`${indent}items:`, ...blockLines(column.items, `${indent}  `, keyed));
  return lines;
}
