// How each engine applies checks, in the passport's words (spec/cli/passport.md, section 5).
import type { Expectation, ResolvedTable, TableCheck } from "@ingestron/definitions";

/** How an engine applies checks, for the passport's words. */
export interface Engine {
  /** When its checks run, and where their results appear. */
  intro(table: ResolvedTable, keeps: Keeps): string;
  /** Who counts the checks and when, after "Counted only by", for a table in a raw layer. */
  counter: string;
  /** Where the results appear, after "Results: "; undefined when the engine says nothing. */
  results?(table: ResolvedTable, keeps: Keeps): string;
  /** What happens to a row that fails a check with each action, after "a row that fails". */
  row: Record<Expectation["action"], string>;
  /** When a table check is counted. */
  counted: string;
  /** Where the rows a `drop` check leaves out are kept, after "kept in". */
  quarantine(fullName: string): string;
  /** What a table check that fails does, with each action, after "if it fails, ". */
  table: Record<TableCheck["action"], string>;
}

/** What the table keeps besides its rows, where its engine applies it. */
export interface Keeps {
  /** The quarantine table's full name. */
  quarantine?: string;
  /** Whether the table keeps its checks' results. */
  results: boolean;
}

/** Where Databricks' results appear. */
const databricksResults = (keeps: Keeps): string =>
  keeps.results
    ? "the pipeline's event log, published as a table"
    : "the pipeline's update details in Databricks";

/** Where DuckDB's results appear. */
const duckdbResults = (table: ResolvedTable, keeps: Keeps): string =>
  `the run prints each check's failing rows (in Azure, in the job's log)${keeps.results ? `, and keeps them in \`${table.fullName.schema}._ingestron_checks\` in the run's database (in Azure, only for that run)` : ""}`;

/** The engines the passport has words for, by pack id. */
export const engines: Record<string, Engine> = {
  databricks: {
    intro: (_table, keeps) =>
      `Checked by Databricks on each pipeline update. Results: ${databricksResults(keeps)}.`,
    counter: "Databricks on each pipeline update",
    results: (_table, keeps) => databricksResults(keeps),
    row: {
      warn: "is kept, and counted",
      drop: "is left out of the table",
      fail: "stops the update",
    },
    counted: "after each refresh",
    quarantine: (fullName) => `\`${fullName}\``,
    table: { warn: "the run goes on", fail: "the refresh job fails" },
  },
  duckdb: {
    intro: (table, keeps) =>
      `Checked by DuckDB each time \`run.sql\` runs. Results: ${duckdbResults(table, keeps)}.`,
    counter: "DuckDB each time `run.sql` runs",
    results: duckdbResults,
    row: {
      warn: "is kept, and counted",
      drop: "is left out of the table",
      fail: "stops the run, and nothing is published",
    },
    counted: "after the table is built, in the same run",
    quarantine: (fullName) => `\`${fullName}\` in the run's database (in Azure, only for that run)`,
    table: { warn: "the run goes on", fail: "the run stops, and nothing is published" },
  },
  synapse: {
    intro: () =>
      "Checked by Synapse serverless SQL: the view leaves out the rows a `drop` check fails each time it is queried, and `checks.sql` counts every check when it runs. Results: what `checks.sql` returns; nothing keeps them.",
    counter: "`checks.sql` when it runs",
    results: () => "what `checks.sql` returns; nothing keeps them",
    row: {
      warn: "stays in the view, and `checks.sql` counts it",
      drop: "is left out of the view, and `checks.sql` counts it",
      fail: "makes `checks.sql` raise an error",
    },
    counted: "by `checks.sql`, over the rows the view keeps",
    quarantine: (fullName) => `\`${fullName}\``,
    table: { warn: "`checks.sql` returns the count", fail: "`checks.sql` raises an error" },
  },
};

/** An engine the passport has no words of its own for: its pack's id. */
export function otherEngine(pack: string): Engine {
  return {
    intro: () => `Checked by ${pack} when it builds the table.`,
    counter: `${pack} when it builds the table`,
    row: { warn: "is kept, and counted", drop: "is left out of the table", fail: "stops the load" },
    counted: "after the table is built",
    quarantine: (fullName) => `\`${fullName}\``,
    table: { warn: "the run goes on", fail: "the run fails" },
  };
}

/**
 * The sentence for a table in a raw layer, on any engine: its checks only count, so it never
 * says that rows are left out.
 */
export function rawIntro(engine: Engine, table: ResolvedTable, keeps: Keeps): string {
  const results = engine.results?.(table, keeps);
  return `Counted only by ${engine.counter}: \`${table.layer}\` keeps raw rows, so no check leaves a row out.${results === undefined ? "" : ` Results: ${results}.`}`;
}
