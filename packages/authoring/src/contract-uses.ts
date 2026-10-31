// What each of the project's packs does with a contract field, in words.
import { contractUseOf, type ContractUse, type PackInfo } from "@ingestron/definitions";
import { resolved, type Project } from "./project.js";
import { standardPacks } from "./smart.js";

const statuses = {
  used: "Used",
  "not-yet": "Not yet",
  elsewhere: "Elsewhere",
  documentation: "Documentation only",
};

/** What each of the project's packs does with a contract field, with the environment's switches. */
export function contractUses(
  project: Project,
  path: string,
  environment: string | undefined,
): { pack: string; status: string; text: string }[] {
  const manage = resolved(project, environment).model?.platform.manage as
    Record<string, boolean> | undefined;
  return standardPacks(project).flatMap((pack) => {
    const use = contractUseOf(pack, path);
    if (!use) return [];
    if (use.use === "used" && use.needs) return [needing(pack, use, manage?.[use.needs])];
    const text =
      use.use === "used"
        ? use.does
        : use.use === "documentation"
          ? "Never changes what is generated."
          : use.reason;
    return [{ pack: pack.id, status: statuses[use.use], text }];
  });
}

/** A use that needs a capability: used when the platform turns it on, otherwise how to. */
function needing(
  pack: PackInfo,
  use: Extract<ContractUse, { use: "used" }>,
  on: boolean | undefined,
): { pack: string; status: string; text: string } {
  if (on) return { pack: pack.id, status: "Used", text: use.does };
  const capability = pack.capabilities?.find((item) => item.id === use.needs);
  const needs = capability?.needs.length ? ` It needs: ${capability.needs.join("; ")}.` : "";
  return {
    pack: pack.id,
    status: on === false ? "Off" : "Used when on",
    text: `${use.does} Turn on \`manage.${use.needs}\` in the platform.${needs}`,
  };
}
