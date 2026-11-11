// Version ranges in kit.yaml: three forms only, `>=X.Y.Z`, `^X.Y.Z` and `~X.Y.Z`.
// Not the whole of semver: no `||`, no spaces, no `x` ranges, no pre-release.

const rangePattern = /^(>=|\^|~)(\d+)\.(\d+)\.(\d+)$/;

type Triple = [number, number, number];

function versionOf(text: string): Triple | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(a: Triple, b: Triple): number {
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index]! - b[index]!;
  return 0;
}

/**
 * Whether the text is one of the three range forms.
 * @internal
 */
export function isRange(text: string): boolean {
  return rangePattern.test(text);
}

/**
 * Whether a version meets a range. A pre-release suffix is ignored: `2.5.0-beta.1` is read as
 * `2.5.0`. A text that is not a version, or a range that is not one of the three forms, is
 * never met.
 * @internal
 */
export function satisfies(version: string, range: string): boolean {
  const match = rangePattern.exec(range);
  const have = versionOf(version);
  if (!match || !have) return false;
  const [, operator, major, minor, patch] = match;
  const low: Triple = [Number(major), Number(minor), Number(patch)];
  if (compare(have, low) < 0) return false;
  if (operator === ">=") return true;
  let below: Triple;
  if (operator === "~") below = [low[0], low[1] + 1, 0];
  else if (low[0] > 0) below = [low[0] + 1, 0, 0];
  else if (low[1] > 0) below = [0, low[1] + 1, 0];
  else below = [0, 0, low[2] + 1];
  return compare(have, below) < 0;
}
