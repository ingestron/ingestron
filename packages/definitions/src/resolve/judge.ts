// Judging a table's intent (specification section 11.5): `NOT_APPLIED` where its judging
// pack does not apply a value, `PREVIEW_FEATURE` where it applies one through a feature in
// preview that the standard does not allow, and the model's `previewFeatures`.
import type { Fix } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { PreviewFeature, ResolvedTable } from "../pack/index.js";
import { judgementsOf, type Judgement } from "./judgements.js";

/**
 * Reports each value of the table's intent its judging pack does not apply (`NOT_APPLIED`)
 * and, with the standard's `features: ga`, each it applies through a preview feature
 * (`PREVIEW_FEATURE`), at the place each value was written.
 */
export function judgeIntent(
  context: Context,
  table: ResolvedTable,
  sources: Record<string, Source>,
): void {
  for (const judgement of judgementsOf(context, table)) {
    const at = sources[judgement.path];
    const { outcome } = judgement;
    if (outcome.kind === "not-applied") {
      const message = `${described(judgement)} isn't applied on ${judgement.pack}: ${outcome.reason}`;
      context.reporter.warning("NOT_APPLIED", message, at);
    } else if (context.standard.value.features === "ga") reportPreview(context, judgement, at);
  }
}

function reportPreview(context: Context, judgement: Judgement, at: Source | undefined): void {
  if (judgement.outcome.kind !== "preview") return;
  const { label, checked } = judgement.outcome.status;
  const fix: Fix = {
    title: "Allow preview features",
    edits: [{ file: context.standard.file, pointer: "/features", set: "preview" }],
  };
  context.reporter.warning(
    "PREVIEW_FEATURE",
    `${described(judgement)} is ${label ?? "in preview"} on ${judgement.pack} (checked ${checked}); this standard uses only generally available features.`,
    at,
    undefined,
    [fix],
  );
}

/** A value as messages write it: `<path>: <value>`. */
function described(judgement: Judgement): string {
  return `${judgement.path}: ${judgement.text}`;
}

/**
 * Each value the tables use through a feature in preview, in the order of the tables, then
 * of `intentPaths`, whatever the standard's `features` says.
 */
export function previewFeaturesOf(context: Context, tables: ResolvedTable[]): PreviewFeature[] {
  return tables.flatMap((table) =>
    judgementsOf(context, table).flatMap(({ path, value, pack, outcome }) =>
      outcome.kind === "preview"
        ? [
            {
              table: table.name,
              path,
              ...(value !== undefined && { value }),
              pack,
              status: outcome.status,
            },
          ]
        : [],
    ),
  );
}
