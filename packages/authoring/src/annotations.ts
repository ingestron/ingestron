// What a line resolves to, shown beside it: a variable's value, a table's full
// name with the methods that build it, and the files generated from it.
import { resolveProject, type DefinitionDocument } from "@ingestron/config";
import { kinds, NO_STORE, type ChosenBy, type ResolvedTable } from "@ingestron/definitions";
import { targetOf } from "./target.js";
import { generatedFiles, generatedForTable } from "./preview.js";
import { resolved, type Project } from "./project.js";
import { resolveText } from "./references.js";
import { allSpots, positionAt, rangeOf } from "./yaml.js";

/** A note at the end of a line, with more on hover. */
export interface Annotation {
  line: number;
  label: string;
  tooltip?: string;
  /** The tooltip's language when it is a file's code, such as `sql`, to show it as code. */
  language?: string;
}

/** The methods that build a line's table, how they were chosen, and its generated files. */
export interface GeneratedLens {
  line: number;
  /** Such as `files → streaming-table`. */
  methods: string;
  /** How each method was chosen, one line per step. */
  chosen: string;
  files: string[];
}

/** Values of `${…}` references and each table's name and methods, for the environment. */
export function annotationsIn(
  project: Project,
  file: string,
  text: string,
  environment: string | undefined,
): Annotation[] {
  return [
    ...variables(project, file, text, environment),
    ...tablesIn(project, file, text, environment).map(({ line, table }) => ({
      line,
      label: `→ ${targetOf(table)}`,
      tooltip: chosenText(table),
    })),
  ];
}

/** For each table in a flow, transform or contract, the files generated for it. */
export function generatedLenses(
  project: Project,
  file: string,
  text: string,
  environment: string | undefined,
): GeneratedLens[] {
  const found = tablesIn(project, file, text, environment);
  if (found.length === 0) return [];
  const files = generatedFiles(project, environment);
  if (!Array.isArray(files)) return [];
  return found.map(({ line, table }) => ({
    line,
    methods: methodsOf(table).join(" → "),
    chosen: chosenText(table),
    files: generatedForTable(files, table.name, table.fullName.table, table.fullName.schema).map(
      (item) => item.path,
    ),
  }));
}

const hidden = /\$\{(secret|envvar):/;
const loads = new WeakMap<Project, Map<string, DefinitionDocument[]>>();

function variables(
  project: Project,
  file: string,
  text: string,
  environment: string | undefined,
): Annotation[] {
  if (!text.includes("${")) return [];
  const document = documentsOf(project, environment).find((item) => item.file === file);
  return allSpots(text)
    .filter((spot) => spot.part === "value" && spot.text.includes("${") && !hidden.test(spot.text))
    .flatMap((spot) => {
      // The loaded document when the project loads; otherwise project.yaml's values alone.
      const value = document
        ? valueAt(document.value, spot.segments)
        : resolveText(project, spot.text, environment);
      if (value === undefined || value === spot.text) return [];
      const shown = typeof value === "string" ? value : JSON.stringify(value);
      // One line beside the value; the tooltip keeps the lines.
      const flat = shown.replace(/\s+/g, " ").trim();
      const label = `= ${flat.length > 80 ? `${flat.slice(0, 79)}…` : flat}`;
      const language = /\$\{file:\s*[^}#]*\.(\w+)/.exec(spot.text)?.[1];
      return [
        {
          line: positionAt(text, spot.range[0]).line,
          label,
          tooltip: shown,
          ...(language && { language: language === "py" ? "python" : language }),
        },
      ];
    });
}

/** The project's documents with `${…}` resolved, once per project snapshot and environment. */
export function documentsOf(
  project: Project,
  environment: string | undefined,
): DefinitionDocument[] {
  let byEnvironment = loads.get(project);
  if (!byEnvironment) loads.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  let documents = byEnvironment.get(key);
  if (!documents) {
    const loaded = resolveProject(project.files, {
      kinds: Object.values(kinds),
      ...(environment && { environment }),
      envvars: {},
    });
    documents = loaded.ok ? [...loaded.project.documents] : [];
    byEnvironment.set(key, documents);
  }
  return documents;
}

function valueAt(value: unknown, segments: string[]): unknown {
  return segments.reduce<unknown>(
    (node, segment) =>
      node !== null && typeof node === "object"
        ? (node as Record<string, unknown>)[segment]
        : undefined,
    value,
  );
}

/** The model's tables written in this file, each at the line that names it. */
function tablesIn(
  project: Project,
  file: string,
  text: string,
  environment: string | undefined,
): { line: number; table: ResolvedTable }[] {
  const model = resolved(project, environment).model;
  if (!model) return [];
  const lineOf = (pointer: string, part: "key" | "value" = "key") => {
    const range = rangeOf(text, pointer, part);
    return range && positionAt(text, range[0]).line;
  };
  const id = /^id:\s*(\S+)/m.exec(text)?.[1];
  return model.tables.flatMap((table) => {
    let line: number | undefined;
    if (table.origin.file === file)
      line = table.origin.kind === "Flow" ? lineOf(`/tables/${table.name}`) : lineOf("/id");
    else if (/^kind:\s*DataContract/m.test(text) && table.contract.id === id)
      line = contractLine(text, table.name, lineOf);
    return line === undefined ? [] : [{ line, table }];
  });
}

/** The line of the contract object named like the table, else of the first object. */
function contractLine(
  text: string,
  name: string,
  lineOf: (pointer: string, part?: "key" | "value") => number | undefined,
): number | undefined {
  const names = allSpots(text).filter(
    (spot) => spot.part === "value" && /^\/schema\/\d+\/name$/.test(spot.pointer),
  );
  const own = names.find((spot) => spot.text === name) ?? names[0];
  return own && lineOf(own.pointer, "value");
}

function methodsOf(table: ResolvedTable): string[] {
  return [table.ingest, table.transform, table.store, table.serve].flatMap((step) =>
    step ? [step.method] : [],
  );
}

const choosers: Record<ChosenBy["by"], string> = {
  definition: "written in the definition",
  "standard-rule": "chosen by the standard's rule",
  "standard-default": "chosen by the standard's default",
  "pack-rule": "chosen by the pack's rule",
  "pack-default": "chosen by the pack's default",
  "runs-on": "chosen because the environment runs on",
};

/** How each step's method was chosen, one line per step. */
export function chosenText(table: ResolvedTable): string {
  const steps = {
    ingest: table.ingest,
    transform: table.transform,
    store: table.store,
    serve: table.serve,
  };
  const lines = Object.entries(steps).flatMap(([action, step]) =>
    step ? [`${action}: ${step.method}, ${chooser(step.chosenBy)}`] : [],
  );
  if (table.endsAtFiles)
    lines.push(`store: ${NO_STORE}, ends at the landed files, ${chooser(table.endsAtFiles)}`);
  return lines.join("\n");
}

/** What chose a method, with the rule's facts and where it is written. */
function chooser({ by, when, file, line, pack, replaced }: ChosenBy): string {
  const facts = when
    ? ` when ${Object.entries(when)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(", ")}`
    : "";
  const where = file ? ` (${file}${line ? `:${line}` : ""})` : "";
  const instead = replaced ? `, in place of ${replaced}` : "";
  const runsOn = by === "runs-on" && pack ? ` ${pack}${instead}` : "";
  return `${choosers[by]}${runsOn}${facts}${where}`;
}
