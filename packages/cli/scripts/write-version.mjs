// Writes src/manifest-version.ts from package.json's version, so the CLI knows its own version
// without reading a file next to it: in a bundle, that file is the bundle's package.json, not
// the CLI's. `pnpm build` runs it first; test/version.test.ts checks the two agree.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const text = `// Written by scripts/write-version.mjs from package.json when the CLI is built. Do not edit.

/** The version in this package's package.json, such as 2.3.0. */
export const manifestVersion = ${JSON.stringify(version)};
`;
const file = join(root, "src/manifest-version.ts");
let old = "";
try {
  old = readFileSync(file, "utf8");
} catch {
  // Not written yet.
}
if (old !== text) writeFileSync(file, text);
