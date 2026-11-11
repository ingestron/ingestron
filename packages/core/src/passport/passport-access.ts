// The passport's section 7, "Who may use it" (spec/cli/passport.md, "Access"): per table, each
// role granted on it, the grant mode, each masked column and each row filter, and on which
// engine each is enforced or why it is not. Read from the model's access, the judgement its
// steps recorded and the platform's switches; never judged again.
import type {
  AccessGrant,
  Capability,
  NotApplied,
  ResolvedModel,
  ResolvedProduct,
  ResolvedTable,
} from "@ingestron/definitions";
import { filterLine, maskLine, type Verdict } from "./passport-access-items.js";
import { keeperOf } from "./passport-not-applied.js";
import { capabilityOn, engineName } from "./passport-platform.js";
import { titleOf } from "./passport-quality.js";
import { notBuilt, notBuiltLines, outputTables, table } from "./passport-sections.js";

/** An engine that applies a table's access: its pack, and what its step does not apply. */
interface Judge {
  pack: string;
  notApplied: readonly NotApplied[];
}

/** The words for a capability that is off: `the platform has <words> off`. */
const switchWords: Partial<Record<Capability["id"], string>> = {
  grants: "grants",
  masks: "column masks",
  filters: "row filters",
};

/** What finds columns by their tags, so is not enforced while tags are off (section 7.1). */
const tagFinds: Partial<Record<Capability["id"], string>> = {
  masks: "masks",
  filters: "row filters",
};

/** What exact grants keep, per pack; any other pack's reference says. */
const kept: Record<string, string> = {
  databricks:
    "except the owner's, the run_as principal's and the unmasked principals'; grants on its schema or catalog stay",
  synapse:
    "except ownership and grants made WITH GRANT OPTION; grants on its schema or database stay",
};

/** Section 7: per output, each table's access; the old sentence when nothing is declared. */
export function access(model: ResolvedModel, product: ResolvedProduct): string {
  const outputs = outputTables(model, product);
  const declared = outputs.some(({ tables }) =>
    tables.some((built) => built.access || built.contract.roles.length > 0),
  );
  if (!declared) {
    const unbuilt = notBuiltLines(model, product);
    const none = unbuilt.length < product.outputs.length ? ["The contracts name no roles."] : [];
    return `## Who may use it\n\n${[...none, ...unbuilt].join("\n\n")}`;
  }
  const parts = outputs.map(({ output, tables }) =>
    tables.length === 0
      ? `### ${output.name}\n\n${notBuilt}`
      : [`### ${output.name}`, ...tables.map((built) => tableAccess(model, built))].join("\n\n"),
  );
  return ["## Who may use it", ...parts].join("\n\n");
}

function tableAccess(model: ResolvedModel, built: ResolvedTable): string {
  const title = `#### ${titleOf(built)}`;
  const granted = built.access;
  if (!granted) {
    const atFiles = built.endsAtFiles && !built.serve;
    const none = atFiles
      ? "Nothing is granted: the table ends at the landed files."
      : "No role is granted on this table.";
    return `${title}\n\n${none}`;
  }
  const judges = judgesOf(built);
  const verdicts = (feature: string, capability: Capability["id"], column?: string) =>
    judges.map((judge) => verdictOf(model, judge, { feature, capability, column }));
  const roles =
    granted.grants.length > 0
      ? rolesTable(model, built, granted.grants, verdicts)
      : "No role is granted on this table.";
  const masks = granted.masks.map((mask) =>
    maskLine(mask, verdicts("masks", "masks", mask.column)),
  );
  const filters = granted.filters.map((filter) =>
    filterLine(filter, verdicts("filters", "filters")),
  );
  return [
    title,
    roles,
    ...(granted.grants.length > 0 || granted.exact
      ? [modeLine(granted.exact, verdicts, judges.map((judge) => judge.pack))]
      : []),
    ...(masks.length > 0 ? [`Masked columns:\n\n${masks.join("\n")}`] : []),
    ...(filters.length > 0 ? [`Row filters:\n\n${filters.join("\n")}`] : []),
  ].join("\n\n");
}

/** The engine that keeps the table, then one of another pack that serves it (section 8.2). */
function judgesOf(built: ResolvedTable): Judge[] {
  const keeping = built.endsAtFiles ? undefined : keeperOf(built);
  const judges: Judge[] = keeping ? [{ pack: keeping, notApplied: built.notApplied ?? [] }] : [];
  const serve = built.serve;
  if (serve && serve.pack !== keeping)
    judges.push({ pack: serve.pack, notApplied: serve.notApplied ?? [] });
  return judges;
}

/** Not applied by the engine's step, with its reason; else off on the platform; else enforced. */
function verdictOf(
  model: ResolvedModel,
  judge: Judge,
  item: { feature: string; capability: Capability["id"]; column?: string | undefined },
): Verdict {
  const engine = engineName(judge.pack);
  const found = judge.notApplied.find(
    (entry) =>
      entry.feature === item.feature && (item.column === undefined || entry.column === item.column),
  );
  if (found) return { engine, reason: found.reason.trim().replace(/\.$/, "") };
  if (!capabilityOn(model, item.capability, judge.pack))
    return { engine, reason: `the platform has ${switchWords[item.capability]} off` };
  const tagged = tagFinds[item.capability];
  if (tagged !== undefined && !capabilityOn(model, "tags", judge.pack))
    return { engine, reason: `the platform has tags off, and ${tagged} find columns by their tags` };
  return { engine };
}

type Verdicts = (feature: string, capability: Capability["id"]) => Verdict[];

function rolesTable(
  model: ResolvedModel,
  built: ResolvedTable,
  grants: readonly AccessGrant[],
  verdicts: Verdicts,
): string {
  const header = [
    "Role",
    `Principal in ${model.project.environment}`,
    "Access",
    "Purpose",
    "Approvers",
    "Granted",
  ];
  const rows = grants.map((grant) => {
    const declared =
      grant.from === "contract"
        ? built.contract.roles.find((role) => role.role === grant.role)
        : undefined;
    const write = grant.privileges.includes("write");
    return [
      grant.role,
      grant.principal,
      write ? "write" : "read",
      declared?.description ?? "",
      declared?.firstLevelApprovers ?? "",
      grantedCell(verdicts, write),
    ];
  });
  return table(header, rows);
}

/** Per engine: granted, read only with write not enforced, or not enforced, and why. */
function grantedCell(verdicts: Verdicts, write: boolean): string {
  const writes = verdicts("write", "grants");
  return verdicts("grants", "grants")
    .map((grant, index) => {
      if (grant.reason !== undefined) return `Not enforced on ${grant.engine}: ${grant.reason}.`;
      const reason = write ? writes[index]?.reason : undefined;
      return reason === undefined
        ? `Granted on ${grant.engine}.`
        : `Read granted on ${grant.engine}, write not enforced: ${reason}.`;
    })
    .join(" ");
}

/**
 * The grant mode; exact grants per engine, with what the engine keeps, sharing the grants'
 * reason where they are not enforced.
 */
function modeLine(exact: boolean, verdicts: Verdicts, packs: readonly string[]): string {
  if (!exact) return "Grant mode: additive: access given in other ways stays.";
  const exacts = verdicts("exact", "grants");
  const engines = verdicts("grants", "grants").map((grant, index) => {
    const reason = grant.reason ?? exacts[index]?.reason;
    if (reason !== undefined) return `Not enforced on ${grant.engine}: ${reason}.`;
    const keeps = kept[packs[index] ?? ""] ?? "except what its pack's reference says it keeps";
    return `On ${grant.engine}, any other access granted directly on the table is taken away, ${keeps}.`;
  });
  return ["Grant mode: exact.", ...engines].join(" ");
}
