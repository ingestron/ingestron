// What a pack, or one of its methods, does with each intent path and value
// (specification section 11.5), and the paths and values a pack leaves uncovered.
import { intentPaths } from "./vocabulary.js";

/**
 * A platform feature's release status, as the vendor's page says, and when it was checked.
 * @example { level: "preview", label: "Beta", checked: "2026-11-09", source: "https://docs.example.com/feature" }
 * @public
 */
export interface FeatureStatus {
  /** Generally available, or in preview. */
  level: "ga" | "preview";
  /** For a preview: the label the vendor's page gives it. */
  label?: "Public Preview" | "Beta" | "Private Preview";
  /** The date the status was checked, `YYYY-MM-DD`. */
  checked: string;
  /** The page that gives the status. */
  source: string;
}

/**
 * A layer duty (specification section 11.7): what the tables of a layer whose `does` lists
 * it have done to them.
 * @public
 */
export type LayerDuty = "check" | "cleanse" | "deduplicate" | "quarantine";

/**
 * What a pack does with one intent path or value: `used` (and how, with the feature's
 * release status, and for a quality or cleansing path the layer duty it needs),
 * `not-yet` (and why), `elsewhere` (another step or pack does it, and how) or
 * `not-applicable` (it means nothing on the platform, and why).
 * @example { use: "used", does: "The view leaves out failing rows.", onlyWhere: "check" }
 * @public
 */
export type IntentUse =
  | {
      use: "used";
      does: string;
      status?: FeatureStatus;
      /**
       * Applied only in a layer whose `does` lists this duty; in any other layer the value
       * is `NOT_APPLIED`. Read for the quality and cleansing paths only.
       */
      onlyWhere?: LayerDuty;
      /**
       * For `cleanse.timezone` only: the zones the pack cannot convert from or to, each with its
       * reason, such as `{ "Antarctica/Troll": "Windows has no zone for Antarctica/Troll." }`. A
       * conversion from or to one is `NOT_APPLIED`, and the column stays in its `from` zone.
       */
      zonesNotApplied?: Readonly<Record<string, string>>;
    }
  | { use: "not-yet" | "elsewhere" | "not-applicable"; reason: string };

/**
 * What declares intent coverage: a pack, or a method for what differs on it from its pack.
 * Keys are an intent path (`history`) or a path and a value (`history=full`).
 * @public
 */
export interface IntentCoverage {
  /** The entries, by intent path or by path and value. */
  intent?: Record<string, IntentUse>;
}

/**
 * The entry for an intent path and value: `path=value`, then `path`, then each path above
 * it, nearest first; undefined when none covers it.
 * @example intentUseOf(pack, "history", "full")
 * @public
 */
export function intentUseOf(
  pack: IntentCoverage,
  path: string,
  value?: string,
): IntentUse | undefined {
  const declared = pack.intent ?? {};
  const own = value === undefined ? undefined : declared[`${path}=${value}`];
  if (own) return own;
  const parts = path.split(".");
  for (let end = parts.length; end > 0; end -= 1) {
    const entry = declared[parts.slice(0, end).join(".")];
    if (entry) return entry;
  }
  return undefined;
}

/**
 * A path and value as coverage keys it, `path=value`, or the path alone when the value is
 * any text or not one the path lists: the feature a `NOT_APPLIED` warning is about.
 */
export function coverageKey(path: string, value?: string): string {
  const listed = intentPaths[path] ?? [];
  return value !== undefined && listed.includes(value) ? `${path}=${value}` : path;
}

/**
 * Each intent path and value the pack does not cover, as `path=value`, or as the path when
 * any text is a value; empty when the pack covers them all. For packs' own tests.
 * @example expect(intentCoverageGaps(pack)).toEqual([])
 * @public
 */
export function intentCoverageGaps(pack: IntentCoverage): string[] {
  return Object.entries(intentPaths).flatMap(([path, values]) => {
    if (values.includes("*")) return intentUseOf(pack, path) ? [] : [path];
    return values
      .filter((value) => !intentUseOf(pack, path, value))
      .map((value) => `${path}=${value}`);
  });
}
