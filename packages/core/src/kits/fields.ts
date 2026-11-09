// The fields of kit.yaml, each checked with the message that says what to change.
import { list, text, type Data } from "./files.js";
import { isRange } from "./range.js";
import { compareVersions, versionForms, versionProblem } from "./version.js";

const idPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\/[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const packPattern = /^[a-z][a-z0-9-]*@\d+$/;

/** Whether a text is `<platform>/<name>` in lower-case words. */
export const isId = (id: string): boolean => idPattern.test(id);

/**
 * The `packs` of kit.yaml: pack ids with a major version.
 * @internal
 */
export function packsOf(data: Data): string[] {
  const packs = list(data, "packs", "pack ids, such as [duckdb@2]");
  if (packs.length === 0)
    throw new Error('kit.yaml: "packs" is empty. List the packs the kit uses, such as [duckdb@2].');
  const bad = packs.find((pack) => !packPattern.test(pack));
  if (bad !== undefined)
    throw new Error(
      `kit.yaml: pack "${bad}" is not <id>@<major>. Write it as ${bad.split("@")[0] || "duckdb"}@2.`,
    );
  return packs;
}

/**
 * The `requires.ingestron` text of kit.yaml.
 * @internal
 */
export function rangeOf(data: Data): string {
  const requires = data.requires;
  if (typeof requires !== "object" || requires === null || Array.isArray(requires))
    throw new Error(
      'kit.yaml: "requires" must be a mapping with ingestron in it, such as requires: { ingestron: ">=2.4.0" }.',
    );
  const unknown = Object.keys(requires).find((key) => key !== "ingestron");
  if (unknown)
    throw new Error(
      `kit.yaml: unknown key "requires.${unknown}". Only "ingestron" is allowed there.`,
    );
  const range = (requires as Data).ingestron;
  if (range === undefined || range === null)
    throw new Error('kit.yaml: "requires.ingestron" is missing. Add it, such as ">=2.4.0".');
  if (typeof range !== "string") throw new Error('kit.yaml: "requires.ingestron" must be text.');
  return range;
}

/**
 * Throws unless the range is one of the three forms.
 * @internal
 */
export function checkRange(range: string): void {
  if (!isRange(range))
    throw new Error(
      `kit.yaml: requires.ingestron "${range}" is not a version range. Use >=X.Y.Z, ^X.Y.Z or ~X.Y.Z, such as ">=2.4.0".`,
    );
}

/**
 * The `id` of kit.yaml; its platform is the first pack.
 * @internal
 */
export function idOf(data: Data, packs: string[]): string {
  const id = text(data, "id");
  if (!isId(id))
    throw new Error(
      `kit.yaml: id "${id}" is not <platform>/<name>. Use lower-case words joined by "-", such as "duckdb/local-medallion".`,
    );
  const [platform] = id.split("/");
  if (platform !== packs[0]!.split("@")[0])
    throw new Error(
      `kit.yaml: id "${id}" starts with "${platform}", but the first pack is "${packs[0]}". Start the id with the first pack's name, or put that pack first.`,
    );
  return id;
}

/**
 * The `version` of kit.yaml: a real date, maybe with -preview.
 * @internal
 */
export function versionOf(data: Data): string {
  const version = text(data, "version");
  const problem = versionProblem(version);
  if (problem === "format")
    throw new Error(`kit.yaml: version "${version}" is not a date. ${versionForms}`);
  if (problem === "date")
    throw new Error(
      `kit.yaml: version "${version}" is not a real date. Check the month and the day.`,
    );
  return version;
}

/**
 * The `features` of kit.yaml, which must match the version's suffix.
 * @internal
 */
export function featuresOf(data: Data, version: string): "ga" | "preview" {
  const features = data.features;
  if (features !== "ga" && features !== "preview")
    throw new Error('kit.yaml: features must be "ga" or "preview".');
  const preview = version.endsWith("-preview");
  if (features === "ga" && preview)
    throw new Error(
      `kit.yaml: features is "ga", but version "${version}" ends in -preview. Set features: preview, or drop the suffix from the version.`,
    );
  if (features === "preview" && !preview)
    throw new Error(
      `kit.yaml: features is "preview", but version "${version}" does not end in -preview. Add the suffix to the version, or set features: ga.`,
    );
  return features;
}

/**
 * The `replaces` of kit.yaml: null, or an earlier version.
 * @internal
 */
export function replacesOf(data: Data, version: string): string | null {
  const replaces = data.replaces;
  if (replaces === undefined || replaces === null) return null;
  if (typeof replaces !== "string" || versionProblem(replaces) !== undefined)
    throw new Error(
      `kit.yaml: replaces "${String(replaces)}" is not a version. Use null, or the previous version, such as 2026-10-01.`,
    );
  if (compareVersions(replaces, version) >= 0)
    throw new Error(`kit.yaml: replaces "${replaces}" must be earlier than version "${version}".`);
  return replaces;
}
