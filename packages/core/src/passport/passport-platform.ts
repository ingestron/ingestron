// What the passport reads from the model about engines and the platform's switches
// (spec/cli/passport.md, sections 3, 4 and "Access"): it reads, and never judges again.
import type { Capability, ResolvedModel } from "@ingestron/definitions";

const engineNames: Record<string, string> = {
  databricks: "Databricks",
  synapse: "Synapse serverless SQL",
  duckdb: "DuckDB",
};

/** An engine as the passport names it: its words, else its pack's id. */
export function engineName(pack: string): string {
  return engineNames[pack] ?? pack;
}

/**
 * True when the platform turns the capability on for the pack: for `databricks`, as the
 * model's `platform.manage` has it (its section, else the top of the Platform); for any other
 * pack, in its own section. The same rule as the definitions' `isOn`; the request reads it too.
 */
export function capabilityOn(model: ResolvedModel, id: Capability["id"], pack: string): boolean {
  if (pack === "databricks") return model.platform.manage[id] === true;
  const manage = model.platform.sections[pack]?.manage;
  return typeof manage === "object" && manage !== null && Reflect.get(manage, id) === true;
}
