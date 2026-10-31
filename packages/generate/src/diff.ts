// A small unified line diff, so a plan can show what an update changes.
// It finds the longest common subsequence of lines, which is simple and exact
// but needs memory for every pair of lines, hence the size limit.

/** Pairs of lines above which only a summary is shown (about 16 MB of memory). */
const maxComparisons = 4_000_000;
/** Unchanged lines shown around each change. */
const context = 2;

interface Line {
  mark: " " | "-" | "+";
  text: string;
  /** Where this line is (or would be) in the old and new text, counting from 0. */
  oldAt: number;
  newAt: number;
}

/**
 * The changes from `before` to `after` in unified diff form, without file
 * headers. Empty when the texts are equal.
 * @example
 * lineDiff("a\nb\n", "a\nc\n"); // "@@ -1,2 +1,2 @@\n a\n-b\n+c"
 */
export function lineDiff(before: string, after: string): string {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  if (oldLines.length * newLines.length > maxComparisons) {
    return `(${oldLines.length} → ${newLines.length} lines; too large to compare line by line)`;
  }
  const lines = compare(oldLines, newLines);
  return hunks(lines)
    .map((range) => formatHunk(lines.slice(range[0], range[1] + 1)))
    .join("\n");
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Walks the common-subsequence table from the start, marking each line. */
function compare(oldLines: string[], newLines: string[]): Line[] {
  const table = commonLengths(oldLines, newLines);
  const lines: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const mark = nextMark(oldLines, newLines, table, i, j);
    const text = (mark === "+" ? newLines[j] : oldLines[i]) ?? "";
    lines.push({ mark, text, oldAt: i, newAt: j });
    if (mark !== "+") i += 1;
    if (mark !== "-") j += 1;
  }
  return lines;
}

/** Keep a common line; otherwise drop the old line when that keeps more in common. */
function nextMark(
  oldLines: string[],
  newLines: string[],
  table: Uint32Array,
  i: number,
  j: number,
): Line["mark"] {
  const oldLeft = i < oldLines.length;
  const newLeft = j < newLines.length;
  if (oldLeft && newLeft && oldLines[i] === newLines[j]) return " ";
  if (!newLeft) return "-";
  if (!oldLeft) return "+";
  const width = newLines.length + 1;
  const withoutOld = table[(i + 1) * width + j] ?? 0;
  const withoutNew = table[i * width + j + 1] ?? 0;
  return withoutOld >= withoutNew ? "-" : "+";
}

/** table[i][j] = length of the longest common subsequence of oldLines[i..] and newLines[j..]. */
function commonLengths(oldLines: string[], newLines: string[]): Uint32Array {
  const width = newLines.length + 1;
  const table = new Uint32Array((oldLines.length + 1) * width);
  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        oldLines[i] === newLines[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  return table;
}

/** Index ranges [first, last] of lines to show: changes plus context, merged when close. */
function hunks(lines: Line[]): [number, number][] {
  const ranges: [number, number][] = [];
  lines.forEach((line, index) => {
    if (line.mark === " ") return;
    const first = Math.max(0, index - context);
    const last = Math.min(lines.length - 1, index + context);
    const previous = ranges.at(-1);
    if (previous && first <= previous[1] + 1) previous[1] = last;
    else ranges.push([first, last]);
  });
  return ranges;
}

function formatHunk(lines: Line[]): string {
  const oldCount = lines.filter((line) => line.mark !== "+").length;
  const newCount = lines.filter((line) => line.mark !== "-").length;
  // Unified diffs count lines from 1, except that an empty side names the line before.
  const oldStart = (lines[0]?.oldAt ?? 0) + (oldCount > 0 ? 1 : 0);
  const newStart = (lines[0]?.newAt ?? 0) + (newCount > 0 ? 1 : 0);
  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
  return [header, ...lines.map((line) => `${line.mark}${line.text}`)].join("\n");
}
