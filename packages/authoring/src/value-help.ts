// Values to suggest for a field without a fixed list of allowed values: its
// default and example, true or false, the pack's smart defaults for a
// standard's naming, layers, types and quality, the project's connectors and
// layers, a connection's settings, and for a mapping or list a block of its
// fields or a new line that asks for them.
import { packs } from "@ingestron/cli";
import type { FieldInfo } from "@ingestron/definitions";
import { stringify } from "yaml";
import type { Suggestion } from "./completion.js";
import type { Place } from "./context.js";
import type { Project } from "./project.js";
import { packIds, packLists } from "./pack-lists.js";
import { standardPacks } from "./smart.js";

/** The suggestions for `field`'s value at `place`, the likely one first. */
export function valueHelp(project: Project, place: Place, field: FieldInfo): Suggestion[] {
  if (place.part === "item") return itemValues(project, place, field);
  const own = projectValues(project, place, field);
  if (own.length > 0) return own;
  const fallback = field.default ?? packDefault(project, place);
  if (/mapping|list/.test(field.type))
    return place.inFlow ? flowValues(field, fallback) : blockValues(field, fallback);
  if (field.type === "true or false") return booleans(field);
  return [
    ...(fallback !== undefined ? [scalar(fallback, "default", field, true)] : []),
    ...(field.example !== undefined && field.example !== fallback
      ? [scalar(field.example, "example", field, false)]
      : []),
  ];
}

/** A standard's or platform's naming, layers, types and quality: the first pack's defaults. */
function packDefault(project: Project, place: Place): unknown {
  if (place.path.length !== 1 || !["Standard", "Platform"].includes(place.kind ?? "")) return;
  const [pack] = standardPacks(project);
  const defaults = pack?.defaults as Record<string, unknown> | undefined;
  return defaults?.[place.path[0]!];
}

/** A new item of a list of plain values: the packs not yet listed, or the default's items. */
function itemValues(project: Project, place: Place, field: FieldInfo): Suggestion[] {
  const written = new Set(listAt(place).map(String));
  const choices =
    place.kind === "Standard" && place.path.join(".") === "packs"
      ? packIds()
      : [field.default ?? packDefault(project, place)]
          .flat()
          .filter((value) => value != null && isScalar(value))
          .map(String);
  return choices
    .filter((choice) => !written.has(choice))
    .map((label) => ({ label, kind: "value" as const }));
}

function listAt(place: Place): unknown[] {
  const value = place.path.reduce<unknown>(
    (node, key) =>
      node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
    place.data,
  );
  return Array.isArray(value) ? value : [];
}

/** Inside { } or [ ]: the default in flow style, or an empty mapping or list to fill. */
function flowValues(field: FieldInfo, fallback: unknown): Suggestion[] {
  const list = field.type.includes("list");
  const filled =
    fallback !== undefined &&
    (typeof fallback !== "object" || Object.keys(fallback ?? {}).length > 0)
      ? [
          scalar(
            fallback,
            field.default !== undefined ? "default" : "the pack's default",
            field,
            true,
          ),
        ]
      : [];
  const empty: Suggestion = {
    label: list ? "[ ]" : "{ }",
    kind: "value",
    detail: list ? "a list" : "a mapping",
    snippet: list ? "[$0]" : "{ $0 }",
    retrigger: true,
  };
  return [...filled, empty];
}

/** Values the project itself gives: connector ids, layer names, a connection's settings. */
function projectValues(project: Project, place: Place, field: FieldInfo): Suggestion[] {
  const key = place.path.join(".");
  if (place.kind === "Connection" && key === "connector") return connectorIds(project);
  if (place.kind === "Standard" && key === "packs") return packLists();
  if (place.path.at(-1) === "layer" && !field.values)
    return layersOf(project, place).map((label) => ({ label, kind: "value" as const }));
  if (place.kind === "Connection" && key === "settings") return connectionSettings(place);
  return [];
}

/** Each connector the standard's packs read, once. */
function connectorIds(project: Project): Suggestion[] {
  const connectors = standardPacks(project).flatMap((pack) => pack.connectors ?? []);
  const seen = new Set<string>();
  return connectors
    .filter((connector) => !seen.has(connector.id) && Boolean(seen.add(connector.id)))
    .map((connector) => ({
      label: connector.id,
      kind: "value" as const,
      detail: connector.title,
      documentation: connector.generates,
      docs: `/docs/connectors/${connector.id}`,
    }));
}

function layersOf(project: Project, place: Place): string[] {
  const written = place.kind === "Standard" ? (place.data.layers as unknown) : undefined;
  if (Array.isArray(written)) return written.map(String);
  return standardPacks(project)[0]?.defaults.layers ?? [];
}

/** The settings the connection's connector needs, one block per pack that reads it. */
function connectionSettings(place: Place): Suggestion[] {
  const found = packs.flatMap((pack) =>
    (pack.connectors ?? [])
      .filter((item) => item.id === place.data.connector)
      .map((connector) => ({ pack, connector })),
  );
  if (found.length === 0) return [newLine("settings")];
  return found.map(({ pack, connector }, at) => {
    // A secret is written as a reference to its name; any other setting is a tab stop.
    const required = connector.settings.filter((setting) => !setting.optional);
    const lines = required.map((setting, index) =>
      setting.secret
        ? escape(`  ${setting.name}: \${secret:${setting.name}}`)
        : `  ${escape(setting.name)}: $${index + 1}`,
    );
    const connectivity = pack.methods[connector.method]?.connectivity?.join(", ");
    return {
      label: required.map((setting) => setting.name).join(", "),
      kind: "value" as const,
      detail: `${pack.id} ${connector.method}${connectivity ? ` (${connectivity})` : ""}`,
      documentation: connector.settings
        .map((item) => `${item.name}: ${item.description}`)
        .join("\n"),
      snippet: `\n${lines.join("\n")}`,
      ...(at === 0 && { preselect: true }),
    };
  });
}

/** A mapping or list: its default as a block, or a new line that asks for its fields. */
function blockValues(field: FieldInfo, fallback: unknown): Suggestion[] {
  const empty =
    fallback === undefined ||
    (typeof fallback === "object" && fallback !== null && Object.keys(fallback).length === 0);
  const list = field.type.includes("list");
  return [...(empty ? [] : [block(fallback, field)]), newLine(field.name, list)];
}

function block(value: unknown, field: FieldInfo): Suggestion {
  const scalars = Array.isArray(value) && value.every(isScalar);
  const text = scalars
    ? stringify(value, { flowCollectionPadding: false, collectionStyle: "flow" }).trimEnd()
    : `\n${stringify(value, { lineWidth: 0 }).trimEnd().replace(/^/gm, "  ")}`;
  return {
    label: scalars ? text : summary(value),
    kind: "value",
    detail: field.default !== undefined ? "default" : "the pack's default",
    documentation: field.description ?? "",
    snippet: escape(text),
    preselect: true,
    ...(field.docs && { docs: field.docs }),
  };
}

/** `catalog, schema, table, …` for a mapping. */
function summary(value: unknown): string {
  const keys = Object.keys(value as object);
  return keys.length > 4 ? `${keys.slice(0, 4).join(", ")}, …` : keys.join(", ");
}

/** A new indented line, with suggestions for what goes there. */
function newLine(name: string, item = false): Suggestion {
  return {
    label: item ? `new ${name} item` : `${name} fields`,
    kind: "value",
    detail: "on the next line",
    snippet: item ? "\n  - $0" : "\n  $0",
    retrigger: true,
  };
}

function booleans(field: FieldInfo): Suggestion[] {
  return [true, false].map((value) => ({
    label: String(value),
    kind: "value" as const,
    ...(field.default === value && { detail: "default", preselect: true }),
  }));
}

function scalar(value: unknown, why: string, field: FieldInfo, preselect: boolean): Suggestion {
  const text = isScalar(value)
    ? stringify(value).trimEnd()
    : stringify(value, { collectionStyle: "flow" }).trimEnd();
  return {
    label: text,
    kind: "value",
    detail: why,
    ...(preselect && { preselect: true }),
    ...(field.docs && { docs: field.docs }),
  };
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

/** Text a snippet inserts as it is: `$`, `}` and `\` escaped. */
function escape(text: string): string {
  return text.replace(/[$}\\]/g, "\\$&");
}
