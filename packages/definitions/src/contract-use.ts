// What each pack does with each ODCS contract field, and a warning where a
// contract writes a field that no pack of the standard uses yet
// (specification section 6).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import { kinds } from "./documents.js";
import { isRecord } from "./merge.js";
import { isOn, warnOff } from "./capabilities.js";
import type { ContractUse, PackInfo } from "./pack.js";

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

/** The pack's declaration for a field path: its own, else the nearest above that covers it. */
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

/** Warns at each field a used contract writes that the standard's packs do not use yet. */
export function checkContractFields(context: Context, contracts: Set<string>): void {
  for (const document of context.project.all(kinds.contract)) {
    if (!contracts.has(document.id)) continue;
    walkContract(context, document, document.value, []);
  }
}

function walkContract(
  context: Context,
  document: DefinitionDocument,
  value: unknown,
  pointer: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkContract(context, document, item, [...pointer, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const at = [...pointer, key];
    const path = at.map((part) => (/^\d+$/.test(part) ? "*" : part)).join(".");
    if (!warnUnused(context, document, at, path, value)) walkContract(context, document, child, at);
  }
}

/** Warns when every pack that uses the field needs a capability the platform has not turned on. */
function offCapability(
  context: Context,
  document: DefinitionDocument,
  at: string[],
  path: string,
  uses: { pack: string; use: ContractUse }[],
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
  );
  return true;
}

/** Warns when no pack uses the path and some pack has yet to; true when it warned. */
function warnUnused(
  context: Context,
  document: DefinitionDocument,
  at: string[],
  path: string,
  parent: Record<string, unknown>,
): boolean {
  const uses = context.packs.flatMap((pack) => {
    const use = pack.contract?.[path];
    return use ? [{ pack: pack.id, use }] : [];
  });
  if (offCapability(context, document, at, path, uses)) return true;
  // Another pack may handle it ("elsewhere"); only a field no pack uses, and some pack has yet to, warns.
  const notYet = uses.filter(({ use }) => use.use === "not-yet");
  if (notYet.length === 0 || uses.some(({ use }) => use.use === "used")) return false;
  const owner = typeof parent.name === "string" ? ` of "${parent.name}"` : "";
  context.reporter.warning(
    "CONTRACT_FIELD_UNUSED",
    `${at.at(-1)}${owner} in contract "${document.id}" is not used yet, so it changes nothing.`,
    { document, pointer: `/${at.join("/")}` },
    notYet.map(({ pack, use }) => `${pack}: ${(use as { reason: string }).reason}`).join("\n"),
  );
  return true;
}
