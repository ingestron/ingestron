// What the conformance runners share: the lines an output must have.
import { expect } from "vitest";

/** The lines expected, in order, with any others between them. */
export function checkLines(output: string, lines: string[]): void {
  const found = output.split("\n");
  let at = 0;
  for (const line of lines) {
    const index = found.indexOf(line, at);
    expect(index, `"${line}" after line ${at} of:\n${output}`).toBeGreaterThanOrEqual(0);
    at = index + 1;
  }
}

/** The lines expected one directly after another, in order, somewhere in the output. */
export function checkBlock(output: string, lines: string[]): void {
  const found = output.split("\n");
  const starts = found.flatMap((line, index) => (line === lines[0] ? [index] : []));
  const whole = starts.some((start) =>
    lines.every((line, offset) => found[start + offset] === line),
  );
  expect(whole, `${JSON.stringify(lines)} as consecutive lines of:\n${output}`).toBe(true);
}
