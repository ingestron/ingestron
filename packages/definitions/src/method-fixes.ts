// Fixes for an ingest method that cannot read the source: another method of
// the standard's packs that can, for this flow or in the standard
// (specification section 4).
import type { Fix } from "@ingestron/config";
import { canServe, type Choice, type Facts, type Named } from "./choose.js";
import type { Context } from "./context.js";
import type { PackInfo } from "./pack.js";

/** The problems these fixes solve. */
export type ReadCode = "CONNECTOR_NOT_SUPPORTED" | "CONNECTIVITY_NOT_SUPPORTED";

/** For each method that can read the source: one fix for the flow, one for the standard. */
export function methodFixes(
  context: Context,
  choice: Choice,
  facts: Facts,
  named: Named,
  code: ReadCode,
): Fix[] {
  const flow = (id: string) => ({ file: named.owner.file, pointer: "/ingest/uses", set: id });
  const own = readers(context.pack, facts)
    .filter((id) => id !== choice.id)
    .flatMap((id) => [
      { title: `Use "${id}" for this flow`, edits: [flow(id)] },
      standardFix(context, choice, facts, id, code),
    ]);
  const others = context.available
    .filter((pack) => !context.packs.some((own) => own.id === pack.id))
    .flatMap((pack) =>
      readers(pack, facts).map((id) => ({
        title: `Add the "${pack.id}" pack and use "${id}" for this flow`,
        edits: [
          { file: context.standard.file, pointer: "/packs/-", set: `${pack.id}@${pack.version}` },
          flow(id),
        ],
      })),
    );
  return [...own, ...others];
}

/** The pack's ingest methods that can read the source. */
function readers(pack: PackInfo, facts: Facts): string[] {
  return Object.entries(pack.methods)
    .filter(([, method]) => method.action === "ingest" && canServe(method, facts))
    .map(([id]) => id);
}

/** Changes the rule that chose the method, or adds one after the others. */
function standardFix(
  context: Context,
  choice: Choice,
  facts: Facts,
  id: string,
  code: ReadCode,
): Fix {
  const rule =
    choice.origin && /\/when\/\d+\/use$/.test(choice.origin.pointer) ? choice.origin : undefined;
  if (rule)
    return {
      title: `Use "${id}" in the standard's rule`,
      edits: [{ file: rule.document.file, pointer: rule.pointer, set: id }],
    };
  const key = code === "CONNECTIVITY_NOT_SUPPORTED" ? "connectivity" : "connector";
  return {
    title: `Use "${id}" for every ${facts[key]} source`,
    edits: [
      {
        file: context.standard.file,
        pointer: "/ingest/when/-",
        set: { [key]: facts[key], use: id },
      },
    ],
  };
}
