// Completion that knows the project: values, tables and ids by reference,
// methods for `uses`, allowed values, fields from the schema, and the
// settings of the method a table resolves to.
import { packs } from "@ingestron/cli";
import { kinds, referenceKinds, type FieldInfo, type Method } from "@ingestron/definitions";
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";
import { inlineCompletions, patternNames } from "./inline.js";
import { schemaFor, schemasAt } from "./schema.js";
import { skeletons } from "./skeletons.js";
import { firstFields, itemSnippets, newTables, preferred, rankMethods } from "./smart.js";
import { methodsFor } from "./method-suggestions.js";
import { flowFacts, placeAt, writtenKeys, type Place } from "./context.js";
import { fieldAt, fieldsIn } from "./fields.js";
import { markFixed } from "./fixed.js";
import type { Suggestion } from "./suggestion.js";
import { inputCompletions } from "./inputs.js";
import { valueHelp } from "./value-help.js";

export type { Suggestion } from "./suggestion.js";

/** Suggestions for the cursor at `offset` in `text`, the open text of `file`. */
export function completionsAt(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): Suggestion[] {
  const before = text.slice(0, offset);
  const inputs = inputCompletions(project, file, before);
  if (inputs) return inputs;
  const inline = inlineCompletions(project, before, file);
  if (inline) return inline;
  if (!/\.ya?ml$/.test(file)) return [];
  if (/^\s*\w*$/.test(text)) return skeletons(project, file);
  const place = placeAt(file, text, offset);
  if (place.path[0] === "naming" && /\{\{\s*\w*$/.test(before)) return patternNames();
  return place.part === "key"
    ? newKeys(project, place, environment)
    : values(project, place, environment);
}

/** Keys for a new line; a mapping holds each key once, so the keys already written are left out. */
function newKeys(project: Project, place: Place, environment: string | undefined): Suggestion[] {
  const written = writtenKeys(place);
  return keyCompletions(project, place, environment).filter((item) => !written.has(item.label));
}

/** Values, or for a new list item of mappings its fields; straight after `key:` with its space. */
function values(project: Project, place: Place, environment: string | undefined): Suggestion[] {
  const found = valueCompletions(project, place, environment);
  const items =
    place.part === "item" && found.length === 0 ? newItem(project, place, environment) : found;
  // Inside [ ], an item of mappings is a { } to fill; its keys follow once it is there.
  if (place.part === "item" && place.inFlow && items.some((item) => item.kind === "field"))
    return [
      ...items.filter((item) => item.snippet?.startsWith("{")),
      { label: "{ }", kind: "value", detail: "a new item", snippet: "{ $0 }", retrigger: true },
    ];
  if (place.part === "item" && /-$/.test(place.before)) return items.map(afterDash);
  if (!place.tight) return items;
  // Straight after `key:` a value brings its space; a block starts on the next line anyway.
  return items.map((item) => {
    if (!item.snippet) return { ...item, insertText: ` ${item.insertText ?? item.label}` };
    return item.snippet.startsWith("\n") ? item : { ...item, snippet: ` ${item.snippet}` };
  });
}

/** Straight after `-`, a suggestion brings the space and is inserted after the dash. */
function afterDash(item: Suggestion): Suggestion {
  const spaced = item.snippet ? { snippet: ` ${item.snippet}` } : { insertText: ` ${item.label}` };
  return { ...item, ...spaced, afterDash: true };
}

/** A new item in a list of mappings: ready-made items first, then the item's fields. */
function newItem(project: Project, place: Place, environment: string | undefined): Suggestion[] {
  const fields = fieldsIn(project, place, [...place.path, "0"], environment) ?? [];
  return [...itemSnippets(place), ...firstFields(place, fields).map(fieldSuggestion)];
}

/** The distinct names of the project's symbols with `prefix`, such as every value name. */
export function names(project: Project, prefix: string, kind: Suggestion["kind"]): Suggestion[] {
  const found = occurrences(project).filter(
    (item) => item.definition && item.symbol.startsWith(prefix),
  );
  return [...new Set(found.map((item) => item.symbol.slice(prefix.length)))]
    .sort()
    .map((label) => ({ label, kind }));
}

function valueCompletions(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] {
  const { kind, path } = place;
  const link = Object.values(kinds)
    .filter((item) => item.kind === kind)
    .flatMap((item) => Object.entries(item.links ?? {}))
    .find(([pointer]) => matches(pointer.split("/").slice(1), path));
  if (link) return linkCompletions(project, place, link[1]);
  if (kind === "Transform" && path[0] === "inputs") return names(project, "table:", "reference");
  if (path.at(-1) === "uses") {
    const methods = methodsFor(project, path[path.length - 2] ?? "", kind === "Flow");
    return kind === "Flow" && path.at(-2) === "ingest"
      ? rankMethods(project, place, methods, methodNamed)
      : methods;
  }
  return describedValues(project, place, environment);
}

/** The field's allowed values with their meanings; for others' schemas, their values and examples. */
function describedValues(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] {
  const { kind, path } = place;
  const field = fieldAt(project, place, path, environment);
  if (field?.values) return markFixed(project, place, environment, allowedValues(field));
  const ours = kind !== undefined && kind in referenceKinds && kind !== "DataContract";
  if (ours) return helpFor(project, place, field);
  const listed = schemaValues(place);
  return listed.length > 0 ? listed : helpFor(project, place, field);
}

/** Value help for a field's value, or for a new item of a list of plain values. */
function helpFor(project: Project, place: Place, field: FieldInfo | undefined): Suggestion[] {
  return field ? valueHelp(project, place, field) : [];
}

/** A field's allowed values, each with its meaning. */
function allowedValues(field: FieldInfo): Suggestion[] {
  return (field.values ?? []).map(({ value, description }) => ({
    label: String(value),
    kind: "value" as const,
    docs: field.docs,
    ...(description && { documentation: description }),
  }));
}

/** Others' schemas, such as ODCS for contracts: their allowed values and examples. */
function schemaValues(place: Place): Suggestion[] {
  const schema = schemaFor(place.file, place.kind);
  const values = schema
    ? schemasAt(schema, place.path).flatMap((item) => [
        ...(item.enum ?? []),
        ...(item.examples ?? []),
      ])
    : [];
  const plain = values.filter((value) => typeof value !== "object");
  return [...new Set(plain.map(String))].sort().map((label) => ({ label, kind: "value" as const }));
}

/** Ids of the target kind; for a flow table's contract, `<source>.<object>` first. */
function linkCompletions(project: Project, place: Place, target: string) {
  const items = names(project, `doc:${target}:`, "reference");
  const [group, table] = place.path;
  if (target !== "DataContract" || group !== "tables") return items;
  const tables = place.data.tables as Record<string, { object?: string } | null> | undefined;
  const object = tables?.[table ?? ""]?.object ?? table;
  return preferred(items, `${flowFacts(project, place).source}.${object}`);
}

function matches(pattern: string[], path: string[]): boolean {
  return (
    pattern.length === path.length &&
    pattern.every((part, index) => part === "*" || part === path[index])
  );
}

function keyCompletions(
  project: Project,
  place: Place,
  environment: string | undefined,
): Suggestion[] {
  const { path } = place;
  if (path.length === 1 && path[0] === "tables" && place.kind === "Flow")
    return newTables(project, place);
  const described = fieldsIn(project, place, path, environment);
  if (described) return described.map(fieldSuggestion);
  const schema = schemaFor(place.file, place.kind);
  if (!schema) return [];
  const fields = schemasAt(schema, path).flatMap((item) => Object.entries(item.properties ?? {}));
  const seen = new Set<string>();
  return fields
    .filter(([name]) => !seen.has(name) && seen.add(name))
    .map(([label, field]) => ({
      label,
      kind: "field",
      ...(field.description && { documentation: field.description }),
    }));
}

/** A described field as a key to complete, with its default. */
function fieldSuggestion(field: FieldInfo): Suggestion {
  const shown = typeof field.default === "string" ? field.default : JSON.stringify(field.default);
  return {
    label: field.name,
    kind: field.placement ? "setting" : "field",
    docs: field.docs,
    ...(field.default !== undefined && { detail: `default: ${shown}` }),
    ...(field.description && { documentation: field.description }),
  };
}

function methodNamed(name: string): Method | undefined {
  return packs.map((pack) => pack.methods[name]).find((method) => method !== undefined);
}
