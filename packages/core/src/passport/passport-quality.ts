// The passport's section 5 (spec/cli/passport.md): each check in words, with the engine
// that applies it, when it runs and where its results appear; what is not enforced, and
// why; and what is cleansed.
import {
  fullNameText,
  type Expectation,
  type ResolvedModel,
  type ResolvedProduct,
  type ResolvedTable,
  type TableCheck,
} from "@ingestron/definitions";
import { cleansingLines } from "./passport-cleansing.js";
import { engines, otherEngine, rawIntro, type Engine, type Keeps } from "./passport-engines.js";
import {
  isResults,
  keeperOf,
  notApplied,
  relevant,
  zonesNotApplied,
} from "./passport-not-applied.js";
import { code, notBuilt, outputTables } from "./passport-sections.js";
import { ruleWords, tableCheckWords } from "./passport-words.js";

/** Section 5: per output, each table that builds it, its checks and its cleansing. */
export function quality(model: ResolvedModel, product: ResolvedProduct): string {
  const parts = outputTables(model, product).map(({ output, tables }) =>
    tables.length === 0
      ? `### ${output.name}\n\n${notBuilt}`
      : [`### ${output.name}`, ...tables.map((built) => tableQuality(model, built))].join("\n\n"),
  );
  return ["## Quality", ...parts].join("\n\n");
}

function tableQuality(model: ResolvedModel, table: ResolvedTable): string {
  const unapplied = relevant(table, notApplied(table));
  const keeps = keepsOf(model, table, unapplied);
  const checks = checkLines(table, unapplied, keeps);
  const cleansing = cleansingLines(table, unapplied, zonesNotApplied(table));
  const runs = checks.some((line) => line.runs);
  return [
    `#### ${titleOf(table)}`,
    ...(checks.length === 0 ? [] : [introOf(table, keeps, runs)]),
    checks.length > 0 ? checks.map((line) => line.text).join("\n") : "No quality rules.",
    `Cleansing:\n\n${cleansing.join("\n")}`,
  ].join("\n\n");
}

/** The table by its full name, or where its files land when it ends at them. */
function titleOf(table: ResolvedTable): string {
  if (!table.endsAtFiles) return `\`${fullNameText(table.fullName)}\``;
  const location = table.ingest?.output?.location;
  return location ? `Landed files at \`${location}\`` : "Landed files";
}

/**
 * Whether the table keeps a quarantine and results where its engine applies them. Databricks
 * keeps results for the whole pipeline, in its event log, when the standard or any table it
 * keeps asks for them.
 */
function keepsOf(
  model: ResolvedModel,
  table: ResolvedTable,
  unapplied: Map<string, string>,
): Keeps {
  const pipeline =
    keeperOf(table) === "databricks" &&
    (model.qualityResults ||
      model.tables.some(
        (other) => keeperOf(other) === "databricks" && other.quality?.results === true,
      ));
  const results =
    (pipeline || table.quality?.results === true) && ![...unapplied.keys()].some(isResults);
  const quarantine =
    table.quarantine && !unapplied.has("quarantine")
      ? fullNameText(table.quarantine.fullName)
      : undefined;
  return { results, ...(quarantine !== undefined && { quarantine }) };
}

function engineOf(table: ResolvedTable): Engine {
  const pack = keeperOf(table) ?? "";
  return engines[pack] ?? otherEngine(pack);
}

/** The engine, when its checks run and where results appear; else that none of them runs. */
function introOf(table: ResolvedTable, keeps: Keeps, runs: boolean): string {
  if (table.endsAtFiles) return "Nothing checks these rows: the table ends at the landed files.";
  if (!runs) return "None of these checks runs here.";
  const engine = engineOf(table);
  return table.does === "raw" ? rawIntro(engine, table, keeps) : engine.intro(table, keeps);
}

/** A line of the list, and whether it is a check that runs. */
interface Line {
  text: string;
  runs: boolean;
}

/** Each row check, each table check, rules nothing checks, then what the engine does not keep. */
function checkLines(table: ResolvedTable, unapplied: Map<string, string>, keeps: Keeps): Line[] {
  const engine = engineOf(table);
  const notEnforced = (text: string): Line => ({ text, runs: false });
  const rows = table.expectations.map((item): Line => {
    const words = item.rule ? ruleWords(item.rule) : code(item.check);
    const why = rowNotApplied(table, item, unapplied);
    if (why !== undefined)
      return notEnforced(`- \`${item.name}\`: ${words}. Not enforced: ${why}.`);
    return {
      text: `- \`${item.name}\`: ${words}; ${rowEffect(table, item, engine, keeps)}.`,
      runs: true,
    };
  });
  const counts = table.contract.tableChecks.map((item) =>
    tableCheckLine(table, item, engine, tableCheckNotApplied(item, unapplied)),
  );
  const kept = [...unapplied]
    .filter(([feature]) => feature === "quarantine" || isResults(feature))
    .map(([feature, why]) =>
      notEnforced(
        `- ${feature === "quarantine" ? "Keeping the rows a `drop` check leaves out" : "Keeping the checks' results"}. Not enforced: ${why}.`,
      ),
    );
  const unchecked = table.contract.unchecked.map((item) =>
    notEnforced(
      `- \`${item.name}\`: ${item.description ? `${oneLine(item.description)} ` : ""}${item.notEnforced ? "Not enforced" : "Not checked"}: ${item.reason}.`,
    ),
  );
  return [...rows, ...counts, ...unchecked, ...kept];
}

/** One table check: what it counts, when, and what a failure does; or why it is not enforced. */
function tableCheckLine(
  table: ResolvedTable,
  item: TableCheck,
  engine: Engine,
  why: string | undefined,
): Line {
  const words = tableCheckWords(item);
  if (why !== undefined)
    return { text: `- \`${item.name}\`: ${words}. Not enforced: ${why}.`, runs: false };
  const effect =
    table.does === "raw"
      ? `counted only: ${table.layer} keeps raw rows`
      : `if it fails, ${engine.table[item.action]}`;
  return {
    text: `- \`${item.name}\`: ${words}, counted ${engine.counted}; ${effect}.`,
    runs: true,
  };
}

/**
 * Why a table check is not enforced: table checks are not applied, else, for one that counts
 * values against a pattern, the pattern rule kind is not.
 */
function tableCheckNotApplied(
  item: TableCheck,
  unapplied: Map<string, string>,
): string | undefined {
  const pattern = item.metric === "invalidValues" && typeof item.arguments.pattern === "string";
  return unapplied.get("table-checks") ?? (pattern ? unapplied.get("pattern") : undefined);
}

/** Why a row check is not enforced: its rule kind, else its action, is not applied. */
function rowNotApplied(
  table: ResolvedTable,
  item: Expectation,
  unapplied: Map<string, string>,
): string | undefined {
  const byKind = item.rule ? unapplied.get(item.rule.kind) : undefined;
  if (byKind !== undefined) return byKind;
  if (table.endsAtFiles)
    return (
      unapplied.get("expectations") ?? "the table ends at the landed files, and nothing checks them"
    );
  return unapplied.get(item.action);
}

function rowEffect(table: ResolvedTable, item: Expectation, engine: Engine, keeps: Keeps): string {
  if (table.does === "raw") return `counted only: ${table.layer} keeps raw rows`;
  const effect = `a row that fails ${engine.row[item.action]}`;
  return item.action === "drop" && keeps.quarantine
    ? `${effect}, and kept in ${engine.quarantine(keeps.quarantine)}`
    : effect;
}

/** Text on one line, as in a list item. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
