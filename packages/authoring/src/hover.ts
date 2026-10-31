// Hover answers "why is this value what it is?": for a table, every step's
// method and each setting's value with the layer that set it; for a setting
// under `with`, that one value and where it was set; for any described field
// its meaning, values, default, example, usual place and documentation.
import { type Origin, type ResolvedTable, type Step } from "@ingestron/definitions";
import { kindOf, placeAt, type Place } from "./context.js";
import { referenceAround, referenceValue } from "./references.js";
import { explainField, methodText, type HoverOptions } from "./explain.js";
import { methodAt, methodInfo } from "./methods.js";
import { resolved, type Project } from "./project.js";
import { schemaFor, schemasAt } from "./schema.js";
import { spotAt, type Spot } from "./yaml.js";

const actions = ["ingest", "transform", "store"] as const;

/** Markdown for the hover at `offset` in `text`, the open text of `file`, or undefined. */
export function hoverAt(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
  options: HoverOptions = {},
): string | undefined {
  const reference = referenceAround(text, offset);
  const resolvedTo = reference && referenceValue(project, reference, environment);
  const rest = explainAt(project, file, text, offset, environment, options);
  return resolvedTo ? [resolvedTo, rest].filter(Boolean).join("\n\n") : rest;
}

function explainAt(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
  options: HoverOptions,
): string | undefined {
  const spot = safeSpot(text, offset);
  if (!spot) return undefined;
  const tableName = tableAt(text, spot);
  if (tableName) return explainTable(project, file, tableName, environment);
  const place = placeAt(file, text, offset);
  const method = methodAt(project, place, spot, environment);
  const info = method && methodInfo(project, method, environment);
  if (info) return methodText(info, options);
  return explainSpot(project, file, text, place, spot, environment, options);
}

/** A setting's value and where it was set, the field, and a naming pattern's names. */
function explainSpot(
  project: Project,
  file: string,
  text: string,
  place: Place,
  spot: Spot,
  environment: string | undefined,
  options: HoverOptions,
): string | undefined {
  const setting = settingAt(spot);
  const key = spot.part === "key";
  const parts = [
    setting && explainSetting(project, file, setting, environment),
    explainField(project, place, spot, environment, options) ??
      (key ? describe(file, text, spot) : undefined),
    key && spot.segments[0] === "naming" && namesIn(project, spot.segments[1], environment),
  ];
  return parts.filter(Boolean).join("\n\n") || undefined;
}

/** The names a naming pattern gives in the environment, such as every catalog. */
function namesIn(
  project: Project,
  key: string | undefined,
  environment: string | undefined,
): string | undefined {
  const model = resolved(project, environment).model;
  if (!model || !key) return undefined;
  const all =
    key === "pipeline" || key === "job"
      ? [model.names[key]]
      : model.tables.map((table) => table.fullName[key as "catalog" | "schema" | "table"]);
  const names = [...new Set(all.filter(Boolean))];
  if (names.length === 0) return undefined;
  const shownNames = names.slice(0, 5).map((name) => `\`${name}\``);
  const more = names.length > 5 ? ` and ${names.length - 5} more` : "";
  return `In ${model.project.environment}: ${shownNames.join(", ")}${more}.`;
}

function safeSpot(text: string, offset: number): Spot | undefined {
  try {
    return spotAt(text, offset);
  } catch {
    return undefined;
  }
}

/** A flow table's key or a transform's id names a table. */
function tableAt(text: string, spot: Spot): string | undefined {
  const kind = kindOf(text);
  if (
    kind === "Flow" &&
    spot.part === "key" &&
    spot.segments.length === 2 &&
    spot.segments[0] === "tables"
  )
    return spot.text;
  if (kind === "Transform" && spot.part === "value" && spot.pointer === "/id") return spot.text;
  return undefined;
}

/** A key directly under a step's `with`: the action, the table (if written on one) and the setting. */
function settingAt(spot: Spot): { action: string; table?: string; key: string } | undefined {
  const { segments } = spot;
  if (spot.part !== "key" || segments.at(-2) !== "with") return undefined;
  const onTable = segments[0] === "tables" && segments.length === 5;
  const action = onTable ? segments[2] : segments[0];
  if (!actions.includes(action as (typeof actions)[number])) return undefined;
  return { action: action!, ...(onTable && { table: segments[1] }), key: segments.at(-1)! };
}

function resolvedTables(
  project: Project,
  file: string,
  environment: string | undefined,
): ResolvedTable[] | undefined {
  const { model } = resolved(project, environment);
  return model?.tables.filter((table) => table.origin.file === file);
}

const unresolved = "The project has problems; fix them to see how this table resolves.";

function explainTable(
  project: Project,
  file: string,
  name: string,
  environment: string | undefined,
): string {
  const table = resolvedTables(project, file, environment)?.find((item) => item.name === name);
  if (!table) return unresolved;
  const { catalog, schema, table: tableName } = table.fullName;
  const steps = actions.flatMap((action) => {
    const step = table[action];
    return step ? [stepText(action, step, table)] : [];
  });
  return [`**\`${name}\`** → \`${catalog}\`.\`${schema}\`.\`${tableName}\``, ...steps].join("\n\n");
}

/** A step's method, then the settings something chose, then the pack's defaults on one line. */
function stepText(action: string, step: Step, table: ResolvedTable): string {
  const entries = Object.entries(step.settings);
  const isDefault = ([key]: [string, unknown]) => step.origins[key]?.layer === "pack";
  const rows = entries
    .filter((entry) => !isDefault(entry))
    .map(
      ([key, value]) => `| \`${key}\` | \`${shown(value)}\` | ${from(step.origins[key], table)} |`,
    );
  const chosen =
    rows.length > 0
      ? `\n\n| Setting | Value | From |\n| --- | --- | --- |\n${rows.join("\n")}`
      : "";
  const defaults = entries.filter(isDefault).map(([key, value]) => `\`${key}: ${shown(value)}\``);
  const rest = defaults.length > 0 ? `\n\nPack defaults: ${defaults.join(", ")}` : "";
  return `**${action}**: \`${step.method}\` (${step.pack})${chosen}${rest}`;
}

function explainSetting(
  project: Project,
  file: string,
  setting: { action: string; table?: string; key: string },
  environment: string | undefined,
): string | undefined {
  const tables = resolvedTables(project, file, environment);
  if (!tables) return unresolved;
  const table = setting.table ? tables.find((item) => item.name === setting.table) : tables[0];
  const step = table?.[setting.action as (typeof actions)[number]];
  if (!table || !step || !(setting.key in step.settings)) return undefined;
  const value = shown(step.settings[setting.key]);
  return `\`${setting.key}\` for \`${table.name}\`: \`${value}\`, set by ${from(step.origins[setting.key], table)}.`;
}

/** Which layer set a value, in words, with where it was written. */
function from(origin: Origin | undefined, table: ResolvedTable): string {
  if (!origin) return "";
  const where = origin.file ? ` (${origin.file}:${origin.line})` : "";
  const layer = {
    pack: "pack default",
    standard: "standard",
    platform: "platform",
    rule: "standard rule",
    definition: table.origin.kind === "Flow" ? "the flow" : "the transform",
    table: "this table",
    fixed: "standard, fixed",
  }[origin.layer];
  return `${layer}${where}`;
}

/** A value as definitions write it: YAML flow style. */
export function shown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map(shown).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${key}: ${shown(item)}`)
      .join(", ")} }`;
  return String(value);
}

function describe(file: string, text: string, spot: Spot | undefined): string | undefined {
  const schema = schemaFor(file, kindOf(text));
  if (!schema || !spot) return undefined;
  return schemasAt(schema, spot.segments).find((item) => item.description)?.description;
}
