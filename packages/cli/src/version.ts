// The CLI's own version, from its package.json: one folder up from src/, dist/ and, in the
// released bundle, dist/main.js.
import { readFileSync } from "node:fs";

/** The version of this command line, such as 2.3.0. */
export function cliVersion(): string {
  const manifest = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}
