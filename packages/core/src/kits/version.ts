// Kit versions: a date, with -preview for a kit that uses preview features.

const versionPattern = /^(\d{4})-(\d{2})-(\d{2})(-preview)?$/;

/**
 * What to say a version looks like.
 * @internal
 */
export const versionForms = "Use YYYY-MM-DD, or YYYY-MM-DD-preview for a preview kit.";

/**
 * Why a text is not a kit version, or undefined when it is one.
 * @internal
 */
export function versionProblem(version: string): "format" | "date" | undefined {
  const match = versionPattern.exec(version);
  if (!match) return "format";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? undefined : "date";
}

/**
 * Orders kit versions: by date, and on the same date the preview first.
 * @internal
 */
export function compareVersions(a: string, b: string): number {
  const order = (version: string): string =>
    version.endsWith("-preview") ? `${version.slice(0, -8)}.0` : `${version}.1`;
  const [left, right] = [order(a), order(b)];
  return left < right ? -1 : left > right ? 1 : 0;
}
