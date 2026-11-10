// What each pack does with each ODCS contract field, and a warning where a
// contract writes a field that the pack keeping a table that uses it does not use
// yet (specification section 6).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import { kinds } from "../documents/index.js";
import { isRecord } from "../internal/index.js";
import { isOn, warnOff } from "../context/index.js";
import type { ContractUse, PackInfo } from "../pack/index.js";

const documentation = { use: "documentation" } as const;
const object = "schema.*";
const column = "schema.*.properties.*";

/** Contract-level fields for people only. */
const aboutContract = [
  "version",
  "status",
  "name",
  "tenant",
  "tags",
  "servers",
  "dataProduct",
  "description",
  "domain",
  "support",
  "price",
  "team",
  "roles",
  "slaDefaultElement",
  "slaProperties",
  "authoritativeDefinitions",
  "customProperties",
  "contractCreatedTs",
];
const aboutObject = [
  "id",
  "businessName",
  "dataGranularityDescription",
  "authoritativeDefinitions",
  "customProperties",
];
const aboutColumn = [
  "id",
  "businessName",
  "authoritativeDefinitions",
  "customProperties",
  "examples",
  "criticalDataElement",
  "transformSourceObjects",
  "transformLogic",
  "transformDescription",
];

const identity = {
  use: "used",
  does: "Identifies the contract; flows and transforms name it by its id.",
} as const;

/**
 * What every pack does alike: the fields that identify the contract, and
 * those that describe it for people and never affect what is generated.
 * @public
 */
export const contractCommon: Record<string, ContractUse> = {
  apiVersion: identity,
  kind: identity,
  id: identity,
  ...contractDocumentationOnly(),
};

function contractDocumentationOnly(): Record<string, ContractUse> {
  const paths = [
    ...aboutContract,
    ...aboutObject.map((key) => `${object}.${key}`),
    ...aboutColumn.map((key) => `${column}.${key}`),
  ];
  return Object.fromEntries(paths.map((path) => [path, documentation]));
}

/**
 * The pack's declaration for a field path: its own, else the nearest above that covers it.
 * @public
 */
export function contractUseOf(pack: PackInfo, path: string): ContractUse | undefined {
  const declared = pack.contract ?? {};
  if (declared[path]) return declared[path];
  const parts = path.split(".");
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const above = declared[parts.slice(0, end).join(".")];
    if (above) return above.use === "used" && !above.whole ? undefined : above;
  }
  return undefined;
}

/** A table that uses a contract: its name, the contract's id and the pack that keeps the table. */
export interface ContractUser {
  table: string;
  contract: string;
  /** The pack of its store step, else of an ingest step that produces it or ends it at files. */
  pack: string | undefined;
}

/**
 * Judges each field of the contracts the tables use: `CAPABILITY_OFF` where every pack that
 * uses it needs a capability that is off, and `NOT_APPLIED`, for each table, where the pack
 * that keeps the table has yet to use it (specification section 6).
 */
export function checkContractFields(context: Context, users: ContractUser[]): void {
  for (const document of context.project.all(kinds.contract)) {
    const readers = users
      .filter((user) => user.contract === document.id)
      .map((user) => ({ ...user, entry: String(entryIndex(document, user.table)) }));
    if (readers.length === 0) continue;
    walkContract(context, document, document.value, [], readers);
  }
}

type Reader = ContractUser & { entry: string };

/** The index of the schema entry named like the table, else of the only entry; -1 when none. */
function entryIndex(document: DefinitionDocument, table: string): number {
  const value = document.value as { schema?: { name?: unknown }[] };
  const entries = Array.isArray(value.schema) ? value.schema : [];
  const named = entries.findIndex((entry) => isRecord(entry) && entry.name === table);
  return named >= 0 ? named : entries.length === 1 ? 0 : -1;
}

function walkContract(
  context: Context,
  document: DefinitionDocument,
  value: unknown,
  pointer: string[],
  readers: Reader[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkContract(context, document, item, [...pointer, String(index)], readers),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const at = [...pointer, key];
    const path = at.map((part) => (/^\d+$/.test(part) ? "*" : part)).join(".");
    const reported =
      offCapability(context, document, at, path, usesOf(context, path), readers) ||
      notYet(context, document, at, path, value, readers);
    if (!reported) walkContract(context, document, child, at, readers);
  }
}

/** What each of the standard's packs declares for the path, by that path itself. */
function usesOf(context: Context, path: string): { pack: string; use: ContractUse }[] {
  return context.packs.flatMap((pack) => {
    const use = pack.contract?.[path];
    return use ? [{ pack: pack.id, use }] : [];
  });
}

/** Warns when every pack that uses the field needs a capability the platform has not turned on. */
function offCapability(
  context: Context,
  document: DefinitionDocument,
  at: string[],
  path: string,
  uses: { pack: string; use: ContractUse }[],
  readers: Reader[],
): boolean {
  const used = uses.flatMap(({ use }) => (use.use === "used" ? [use] : []));
  const needed = used.map((use) => use.needs).find((id) => id && !isOn(context, id as never));
  if (
    used.length === 0 ||
    !needed ||
    used.some((use) => !use.needs || isOn(context, use.needs as never))
  )
    return false;
  warnOff(
    context,
    needed as never,
    `${at.at(-1)} in contract "${document.id}" is not applied`,
    document,
    `/${at.join("/")}`,
    // About a table only when one table reads the field (specification section 1.2).
    onlyOne(readersOf(at, readers)),
  );
  return true;
}

/** The name of the only reader, when there is exactly one. */
function onlyOne(readers: Reader[]): string | undefined {
  return readers.length === 1 ? readers[0]?.table : undefined;
}

/** The tables that read the field: every table for the contract's own, those using the entry for a schema entry's. */
function readersOf(at: string[], readers: Reader[]): Reader[] {
  return readers.filter((reader) => at[0] !== "schema" || at.length < 2 || at[1] === reader.entry);
}

/**
 * `NOT_APPLIED` for each table that reads the field (every table for the contract's own
 * fields; those using the entry for a schema entry's) whose keeping pack declares it
 * `not-yet`; true when it warned for any.
 */
function notYet(
  context: Context,
  document: DefinitionDocument,
  at: string[],
  path: string,
  parent: Record<string, unknown>,
  readers: Reader[],
): boolean {
  const reading = readersOf(at, readers);
  const owner = typeof parent.name === "string" ? ` of "${parent.name}"` : "";
  let warned = false;
  for (const reader of reading) {
    const use = context.packs.find((pack) => pack.id === reader.pack)?.contract?.[path];
    if (use?.use !== "not-yet") continue;
    warned = true;
    context.reporter.warning(
      "NOT_APPLIED",
      `${at.at(-1)}${owner} in contract "${document.id}" isn't applied on ${reader.pack}: ${use.reason}`,
      { document, pointer: `/${at.join("/")}` },
      undefined,
      undefined,
      { table: reader.table, feature: path },
      { reason: use.reason },
    );
  }
  return warned;
}
