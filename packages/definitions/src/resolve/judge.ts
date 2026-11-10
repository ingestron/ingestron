// Judging a table's intent (specification section 11.5): `NOT_APPLIED` where its judging
// pack does not apply a value, `PREVIEW_FEATURE` where it applies one through a feature in
// preview that the standard does not allow, and the model's `previewFeatures`.
import type { Fix } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { PreviewFeature, ResolvedTable } from "../pack/index.js";
import { coverageKey } from "../intent/index.js";
import type { IntentPlaces } from "./complete.js";
import { judgementsOf, type Judgement } from "./judgements.js";

/**
 * Reports each value of the table's intent its judging pack does not apply (`NOT_APPLIED`)
 * and, with the standard's `features: ga`, each it applies through a preview feature
 * (`PREVIEW_FEATURE`), at the place each value was written. A path already reported as
 * not applied, where a setting kept its value (section 11.4), is not judged again.
 */
export function judgeIntent(context: Context, table: ResolvedTable, places: IntentPlaces): void {
  for (const judgement of judgementsOf(context, table))
    if (!places.unapplied.includes(judgement.path))
      reportJudgement(context, judgement, places.sources[judgement.path]);
}

/**
 * Reports one judgement at the place its value was written: `NOT_APPLIED`, or with the
 * standard's `features: ga` `PREVIEW_FEATURE`. Project-level values report through it too.
 */
export function reportJudgement(
  context: Context,
  judgement: Judgement,
  at: Source | undefined,
): void {
  const { outcome } = judgement;
  if (outcome.kind === "not-applied") {
    const message = `${described(judgement)} isn't applied on ${judgement.pack}: ${outcome.reason}`;
    const feature = judgement.feature ?? coverageKey(judgement.path, judgement.value);
    context.reporter.warning("NOT_APPLIED", message, at, judgement.hint, undefined, { feature });
  } else if (context.standard.value.features === "ga") reportPreview(context, judgement, at);
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

/** A value as messages write it: what the judgement calls it, else `<path>: <value>`. */
function described(judgement: Judgement): string {
  return judgement.what ?? `${judgement.path}: ${judgement.text}`;
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
