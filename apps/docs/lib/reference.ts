// Reference data read from the packages at build time, so pages match the code.
import {
  documentReference,
  methodReference,
  referenceKinds,
  type Connector,
  type FieldInfo,
  type Pack,
} from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";

/** The packs the CLI provides, in the order a standard usually lists them. */
export const packs: Pack[] = [databricks, adf];

/** Each pack's reference page. */
export function packPages(): { pack: string; url: string }[] {
  return packs.map((pack) => ({ pack: pack.id, url: `/docs/reference/packs/${pack.id}` }));
}

/** A method's settings, described once for the docs and the editor. */
export function settingRows(pack: string, method: string): FieldInfo[] {
  const found = packs.find((candidate) => candidate.id === pack);
  if (!found?.methods[method]) throw new Error(`No method "${method}" in pack "${pack}".`);
  return methodReference(found, method);
}

/** A connector as one pack describes it. */
export interface ConnectorEntry {
  pack: string;
  connector: Connector;
  /** The connectivity the connector's method supports; empty means any. */
  connectivity: string[];
}

/** Every connector any pack reads, once each, sorted. */
export function connectorIds(): string[] {
  const ids = packs.flatMap((pack) => pack.connectors?.map((item) => item.id) ?? []);
  return [...new Set(ids)].sort();
}

/** How each pack reads one connector, in pack order. */
export function connectorEntries(id: string): ConnectorEntry[] {
  return packs.flatMap((pack) =>
    (pack.connectors ?? [])
      .filter((connector) => connector.id === id)
      .map((connector) => ({
        pack: pack.id,
        connector,
        connectivity: pack.methods[connector.method]?.connectivity ?? [],
      })),
  );
}

/** Every field of a document kind, at every depth. */
export function documentFields(kind: keyof typeof referenceKinds): FieldInfo[] {
  return documentReference(kind);
}

/** The field's path as written, with `*` for any name or list item. */
export function fieldPath(field: FieldInfo): string {
  return field.path.join(".");
}

/** The part of a field's docs link after `#`, for its row's id. */
export function anchorId(field: FieldInfo): string {
  return field.docs.split("#")[1] ?? "";
}

/** A value as definitions write it: YAML flow style, not JSON. */
export function shown(value: unknown): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return `[${value.map(shown).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => `${key}: ${shown(item)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return String(value);
}
