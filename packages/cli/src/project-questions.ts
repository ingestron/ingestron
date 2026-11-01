// Recipe answers become ordinary project values, using the existing loader syntax.
import { parse, stringify } from "yaml";
import type { Content } from "./scaffold.js";
import type { Question } from "./templates.js";
interface Flow {
  ingest?: { with?: Record<string, unknown> };
  tables: Record<string, { object: string }>;
}
/** Parameterise selected recipe files; non-string source defaults remain explicit YAML. */
export function projectQuestions(
  files: Record<string, Content>,
  connectionFile: string,
  flowFiles: string[],
  method: string,
): Question[] {
  const questions: Question[] = [];
  const project = parse(String(files["project.yaml"])) as { values?: Record<string, string> };
  const ask = asker(questions, project);
  const connection = parse(String(files[connectionFile])) as { settings: Record<string, unknown> };
  for (const key of Object.keys(connection.settings))
    ask(
      connection.settings,
      key,
      `source_${key}`,
      `Source ${key}${String(connection.settings[key]).startsWith("${secret:") ? " (Key Vault secret reference)" : ""}`,
    );
  files[connectionFile] = stringify(connection);
  for (const file of flowFiles) {
    const flow = parse(String(files[file])) as Flow;
    for (const [name, table] of Object.entries(flow.tables))
      ask(table, "object", `${name}_object`, `Source object for ${name}`);
    const settings = flow.ingest?.with ?? {};
    ask(settings, "query", "source_query", "Native source query");
    const options = settings.source_options as Record<string, unknown> | undefined;
    for (const key of Object.keys(options ?? {}))
      ask(options!, key, `option_${key}`, `Source option ${key}`);
    files[file] = stringify(flow);
  }
  infrastructureQuestions(files, method, ask);
  return questions;
}
function infrastructureQuestions(
  files: Record<string, Content>,
  method: string,
  ask: (
    object: Record<string, unknown>,
    key: string,
    name: string,
    label: string,
    follows?: Question["follows"],
  ) => void,
): void {
  if (!files["platform.yaml"]) return;
  const platform = parse(String(files["platform.yaml"])) as {
    settings?: Record<string, Record<string, unknown>>;
  };
  const settings = platform.settings?.[method] ?? {};
  for (const key of ["landing", "key_vault", "integration_runtime"])
    ask(settings, key, key, `Platform ${key}`);
  // A route's destination beside the landing storage: its own question, following the landing answer.
  const synapse = platform.settings?.["synapse-view"];
  if (synapse)
    ask(
      synapse,
      "data_source_location",
      "synapse_data_source_location",
      "Synapse data source location",
      { from: "landing" },
    );
  const duckdb = platform.settings?.["duckdb-table"];
  if (duckdb)
    ask(duckdb, "published", "duckdb_published", "DuckDB published folder", {
      from: "landing",
      fileSystem: "published",
    });
  files["platform.yaml"] = stringify(platform);
}

type Ask = (
  object: Record<string, unknown>,
  key: string,
  name: string,
  label: string,
  follows?: Question["follows"],
) => void;

/** Asks for a string setting: a question with its current value as the default, and a value in its place. */
function asker(questions: Question[], project: { values?: Record<string, string> }): Ask {
  return (
    object: Record<string, unknown>,
    key: string,
    name: string,
    label: string,
    follows?: Question["follows"],
  ) => {
    const value = object[key];
    if (typeof value !== "string") return;
    const reference = /^\$\{values\.([\w]+)\}$/.exec(value);
    const fallback = reference ? (project.values?.[reference[1]!] ?? value) : value;
    questions.push({ value: name, ask: label, default: fallback, ...(follows && { follows }) });
    object[key] = `\${values.${name}}`;
  };
}
