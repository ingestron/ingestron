// The CLI's own version. It is a constant written from package.json at build time, not read
// from "../package.json": in a bundle that carries the CLI, such as the VS Code extension, that
// file is the bundle's own.
import { manifestVersion } from "./manifest-version.js";

/** The version of this command line, such as 2.3.0. */
export function cliVersion(): string {
  return manifestVersion;
}
