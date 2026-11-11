// What the request says of the platform's capabilities: those switched on, and those the
// definitions use while they are off (spec/cli/request.md, "Switched on").
import type { AnyDiagnostic } from "@ingestron/config";
import type { Capability, Pack, ResolvedModel } from "@ingestron/definitions";

/** Each pack's capabilities, with the pack that declares them, in the packs' order. */
export function packCapabilities(available: readonly Pack[]): PackCapability[] {
  return available.flatMap((pack) =>
    (pack.capabilities ?? []).map((capability) => ({ pack: pack.id, capability })),
  );
}

/** A pack's capability, with the pack that declares it. */
export interface PackCapability {
  pack: string;
  capability: Capability;
}

/**
 * The name the Platform gives the capability's switch: `manage.<id>` for `databricks`, whose
 * `manage` may be written at the top, and `<pack>.manage.<id>` for any other pack.
 */
function switchName({ pack, capability }: PackCapability): string {
  return pack === "databricks" ? `manage.${capability.id}` : `${pack}.manage.${capability.id}`;
}

/** True when the platform turns the capability on for its pack (specification section 7.1). */
function isOn(model: ResolvedModel, { pack, capability }: PackCapability): boolean {
  if (pack === "databricks") return model.platform.manage[capability.id] === true;
  const manage = model.platform.sections[pack]?.manage;
  return (
    typeof manage === "object" &&
    manage !== null &&
    (manage as Record<string, unknown>)[capability.id] === true
  );
}

/** Capabilities that are on, for the packs that run a step of a table of the environment. */
export function switchedOn(
  model: ResolvedModel,
  capabilities: PackCapability[],
): string | undefined {
  const used = new Set(
    model.tables.flatMap((table) =>
      [table.ingest, table.transform, table.store, table.serve].flatMap((step) =>
        step ? [step.pack] : [],
      ),
    ),
  );
  const on = capabilities.filter((item) => used.has(item.pack) && isOn(model, item));
  if (on.length === 0) return undefined;
  const sections = on.map(
    (item) =>
      `### ${item.capability.title} (\`${switchName(item)}\`)\n\n${item.capability.does}\n\n${item.capability.needs.map((need) => `- ${need}`).join("\n")}`,
  );
  return `## Switched on\n\n${sections.join("\n\n")}`;
}

/** Features the definitions use while the platform has them off, from the CAPABILITY_OFF warnings. */
export function switchedOff(
  diagnostics: AnyDiagnostic[],
  capabilities: PackCapability[],
): string | undefined {
  const lines = diagnostics
    .filter((diagnostic) => diagnostic.code === "CAPABILITY_OFF")
    .flatMap((diagnostic) => {
      // The fix turns the capability on: in the pack's own section, or for databricks at the
      // top of the Platform or in its section.
      const fix = diagnostic.fixes?.[0];
      const title = fix?.title ?? "";
      const candidates = capabilities.filter(
        (item) => title === `Turn on manage.${item.capability.id}`,
      );
      const section = fix?.edits[0]?.pointer.split("/")[1];
      const found =
        candidates.find((item) => item.pack === section && item.pack !== "databricks") ??
        candidates.find((item) => item.pack === "databricks") ??
        candidates[0];
      const what = diagnostic.message.split(":")[0];
      return found ? [`- ${found.capability.title} (\`${switchName(found)}\`): ${what}`] : [];
    });
  if (lines.length === 0) return undefined;
  return `## Used by the definitions, but switched off\n\n${[...new Set(lines)].join("\n")}`;
}
