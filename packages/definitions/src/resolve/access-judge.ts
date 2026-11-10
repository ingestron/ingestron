// Judging each table's access by the step that keeps it (specification section 8.2): the
// keeping pack's coverage of each role, mask and filter, then whether the platform turns
// its capability on for that pack. One warning per declaring line, naming the tables.
import type { Context } from "../context/index.js";
import { isOn } from "../context/index.js";
import { contractEntryAt, layerObject } from "../contracts/index.js";
import type { Source } from "../diagnostics/index.js";
import { kinds } from "../documents/index.js";
import { intentUseOf } from "../intent/index.js";
import type { Capability, ColumnMask, ResolvedTable, RowFilter } from "../pack/index.js";
import { isGrantable } from "./access.js";
import { reportFindings, type Finding } from "./access-findings.js";
import { stepsOf, type JudgingStep } from "./judgements.js";
import { judgeOf } from "./judging-step.js";

/** What a table's keeping pack does with an item: nothing to say, not applied, off or applied. */
type State = "silent" | "off" | "applied" | { reason: string };

/** A table, the step that keeps it, and the masks and filters that step applies. */
export interface JudgedTable {
  table: ResolvedTable;
  keeper: JudgingStep;
  masks: ColumnMask[];
  filters: RowFilter[];
}

/**
 * Judges the access of each table whose keeping step is known: `NOT_APPLIED` and
 * `CAPABILITY_OFF` at each declaring line, `ROLE_ACCESS` where a role would be granted.
 * With exact grants, a table without access whose grants are applied is given access with
 * no grants and `exact`, so its direct grants are taken away too.
 * Returns each judged table with what its pack applies, for the checks of the pack's policies.
 */
export function judgeAccess(context: Context, tables: ResolvedTable[]): JudgedTable[] {
  const findings: Finding[] = [];
  const judged = tables.flatMap((table) => {
    const keeper = table.endsAtFiles ? undefined : keeperOf(context, table);
    return keeper ? [judgeTable(context, table, keeper, findings)] : [];
  });
  reportFindings(context, findings);
  return judged;
}

function keeperOf(context: Context, table: ResolvedTable): JudgingStep | undefined {
  return judgeOf("history", stepsOf(context, table), { endsAtFiles: false });
}

function judgeTable(
  context: Context,
  table: ResolvedTable,
  keeper: JudgingStep,
  findings: Finding[],
): JudgedTable {
  const judge = (path: string, value: string, capability: Capability["id"]) =>
    stateOf(context, keeper, path, value, capability);
  const found = (item: Omit<Finding, "table" | "pack">) =>
    findings.push({ ...item, table: table.name, pack: keeper.pack });
  const grants = judge("access.grants", "read", "grants");
  if (grants === "applied") reachExact(context, table);
  judgeRoles(context, table, { grants, judge, found });
  if (table.access?.exact && grants === "applied") {
    const at = { document: context.standard, pointer: "/governance/access/grants" };
    const exact = judge("access.exact", "true", "grants");
    note(found, exact, {
      at,
      what: "The exact grant mode",
      feature: "exact",
      capability: "grants",
    });
  }
  const masks = (table.access?.masks ?? []).filter((mask) => {
    const state = judge("access.masks", maskValue(mask), "masks");
    const at = classificationAt(table, mask.column);
    const what = `The "${maskName(mask)}" mask on "${mask.column}"`;
    note(found, state, { at, what, feature: "masks", capability: "masks", column: mask.column });
    return state === "applied";
  });
  const filters = (table.access?.filters ?? []).filter((filter) => {
    const state = judge("access.filters", "true", "filters");
    const at = { document: context.standard, pointer: `/governance/filters/${filter.name}` };
    const what = `The filter "${filter.name}"`;
    note(found, state, { at, what, feature: "filters", capability: "filters" });
    return state === "applied";
  });
  return { table, keeper, masks, filters };
}

/**
 * With exact grants, a table whose grants are applied has access even with no role, no
 * mask and no filter: its direct grants are taken away too.
 */
function reachExact(context: Context, table: ResolvedTable): void {
  if (table.access || context.standard.value.governance?.access?.grants !== "exact") return;
  table.access = { grants: [], exact: true, masks: [], filters: [] };
}

interface RoleJudging {
  grants: State;
  judge: (path: string, value: string, capability: Capability["id"]) => State;
  found: (item: Omit<Finding, "table" | "pack">) => void;
}

/** Each role the table grants: the contract's, unless its layer turns them off, then the layer's. */
function judgeRoles(context: Context, table: ResolvedTable, judging: RoleJudging): void {
  const layer = layerObject(context, table.layer);
  const document = context.project.get(kinds.contract, table.contract.id);
  if (document && layer?.layer.access?.contract !== false)
    table.contract.roles.forEach(({ role, access }, index) => {
      const at = { document, pointer: `/roles/${index}` };
      if (judging.grants !== "applied" || isGrantable(access)) judgeRole(judging, at, role, access);
      else roleAccess(context, at, { role, access, contract: table.contract.id });
    });
  if (!layer) return;
  (layer.layer.access?.roles ?? []).forEach(({ role, access }, index) => {
    const pointer = `/layers/${layer.index}/access/roles/${index}`;
    judgeRole(judging, { document: context.standard, pointer }, role, access);
  });
}

function judgeRole(judging: RoleJudging, at: Source, role: string, access?: string): void {
  const what = `Access for the role "${role}"`;
  note(judging.found, judging.grants, { at, what, feature: "grants", capability: "grants" });
  if (judging.grants !== "applied" || access !== "write") return;
  const write = judging.judge("access.grants", "write", "grants");
  note(judging.found, write, {
    at: { ...at, pointer: `${at.pointer}/access` },
    what: `Write access for the role "${role}"`,
    feature: "write",
    capability: "grants",
  });
}

/** `ROLE_ACCESS` at a role that would be granted, whose access is neither read nor write. */
function roleAccess(
  context: Context,
  at: Source,
  { role, access, contract }: { role: string; access?: string; contract: string },
): void {
  context.reporter.error(
    "ROLE_ACCESS",
    `The role "${role}" of contract "${contract}" has access "${access}"; it must be read or write.`,
    { ...at, pointer: `${at.pointer}/access` },
    "Write read, or write for read and write. Leave it out to read.",
  );
}

/** Records what is not applied, or off; nothing for an item applied or not judged. */
function note(
  found: (item: Omit<Finding, "table" | "pack">) => void,
  state: State,
  item: Omit<Finding, "table" | "pack" | "code" | "reason">,
): void {
  if (state === "off") found({ ...item, code: "CAPABILITY_OFF" });
  else if (typeof state === "object") found({ ...item, code: "NOT_APPLIED", reason: state.reason });
}

/**
 * The keeping step's entry for the path and value, its method's first, then its pack's: not
 * applied, or used and then off or applied as the platform turns the capability on for the
 * pack; an `elsewhere` entry, or none, has nothing to say.
 */
function stateOf(
  context: Context,
  keeper: JudgingStep,
  path: string,
  value: string,
  capability: Capability["id"],
): State {
  const pack = context.packs.find((candidate) => candidate.id === keeper.pack);
  const use = intentUseOf(keeper.method, path, value) ?? (pack && intentUseOf(pack, path, value));
  if (use === undefined || use.use === "elsewhere") return "silent";
  if (use.use !== "used") return { reason: use.reason };
  return isOn(context, capability, keeper.pack) ? "applied" : "off";
}

/** A mask's value as coverage names it: the built-in's name, or `function`. */
export function maskValue(mask: ColumnMask): string {
  return typeof mask.mask === "string" ? mask.mask : "function";
}

/** A mask's name as messages write it: the built-in's, or the function's as written. */
export function maskName(mask: ColumnMask): string {
  return typeof mask.mask === "string" ? mask.mask : mask.mask.function;
}

/** The column's `classification` in its contract. */
function classificationAt(table: ResolvedTable, column: string): Source | undefined {
  const entry = contractEntryAt(table.contract);
  const index = table.contract.columns.findIndex((item) => item.name === column);
  return entry && { ...entry, pointer: `${entry.pointer}/properties/${index}/classification` };
}
