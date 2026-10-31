// Runs every example and compares its output with the "Expected output"
// block in the example's README, so the documented output cannot go stale.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const examplesFolder = join(import.meta.dirname, "../examples");
let failures = 0;

const names = existsSync(examplesFolder) ? readdirSync(examplesFolder).sort() : [];
if (names.length === 0) {
  console.log(`✗ no examples in ${examplesFolder}`);
  failures += 1;
}
for (const name of names) {
  const folder = join(examplesFolder, name);
  const expected = expectedOutput(readFileSync(join(folder, "README.md"), "utf8"));
  const actual = execFileSync("npx", ["tsx", join(folder, "run.ts")], {
    encoding: "utf8",
  }).trimEnd();
  if (expected === undefined) {
    console.log(`✗ ${name}: README has no "## Expected output" text block`);
    failures += 1;
  } else if (actual !== expected) {
    console.log(
      `✗ ${name}: output differs from README\n--- expected\n${expected}\n--- actual\n${actual}`,
    );
    failures += 1;
  } else {
    console.log(`✓ ${name}`);
  }
}

process.exit(failures === 0 ? 0 : 1);

function expectedOutput(readme: string): string | undefined {
  const match = /## Expected output\s+```text\n([\s\S]*?)\n```/.exec(readme);
  return match?.[1]?.trimEnd();
}
