// Edit distance, for "did you mean" and for fixes that offer a near name.

/** The candidates at most two edits from `text`, and fewer than its length, nearest first. */
export function nearNames(text: string, candidates: readonly string[]): string[] {
  return candidates
    .map((name) => ({ name, edits: distance(name, text) }))
    .filter(({ edits }) => edits <= 2 && edits < text.length)
    .sort((a, b) => a.edits - b.edits)
    .map(({ name }) => name);
}

/** Edit distance (insert, delete, replace). */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length]!;
}
