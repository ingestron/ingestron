// Finding kits: the ones installed with Ingestron, and the names the commands accept.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { isId } from "./fields.js";
import type { Kit } from "./kit.js";
import { readKit } from "./read.js";
import { compareVersions, versionProblem } from "./version.js";

/**
 * The `kits` folder of the `@ingestron/standards` package, or undefined when the package is not
 * installed.
 * @internal
 */
export function standardsKitsFolder(): string | undefined {
  try {
    const manifest = createRequire(import.meta.url).resolve("@ingestron/standards/package.json");
    return join(dirname(manifest), "kits");
  } catch {
    return undefined;
  }
}

function folders(parent: string): string[] {
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Every kit below `root`, which holds `<platform>/<name>/<version>/` folders, sorted by id and
 * then version (a preview before its general version). `root` defaults to the `kits` folder of
 * `@ingestron/standards`. There are none when the root, or that package, is not there. A kit
 * that breaks a rule of kit.yaml throws the error `readKit` gives.
 * @public
 */
export function installedKits(root?: string): Kit[] {
  root ??= standardsKitsFolder();
  if (root === undefined || !existsSync(root)) return [];
  const kits: Kit[] = [];
  for (const platform of folders(root))
    for (const name of folders(join(root, platform)))
      for (const version of folders(join(root, platform, name)))
        kits.push(readKit(join(root, platform, name, version), root));
  return kits.sort((a, b) => a.id.localeCompare(b.id) || compareVersions(a.version, b.version));
}

const forms = "A kit is named <id>, <id>@<version> or <git-url>#<path>@<tag>.";

function gitSpec(spec: string, hash: number): { url: string; path: string; tag: string } {
  const url = spec.slice(0, hash);
  const rest = spec.slice(hash + 1);
  const at = rest.indexOf("@");
  if (url === "")
    throw new Error(`The kit "${spec}" needs a git URL before the "#": <git-url>#<path>@<tag>.`);
  if (at < 0 || at === rest.length - 1)
    throw new Error(`The kit "${spec}" needs a tag after the folder: <git-url>#<path>@<tag>.`);
  if (at === 0)
    throw new Error(
      `The kit "${spec}" needs the kit's folder before the tag: <git-url>#<path>@<tag>.`,
    );
  return { url, path: rest.slice(0, at), tag: rest.slice(at + 1) };
}

/**
 * Reads what a command is given to name a kit: `<id>@<version>`, `<id>` alone (the newest
 * installed version), or `<git-url>#<path>@<tag>`. The path ends at the first `@` after the
 * `#`, so a tag may itself contain `@`. Throws an Error that shows the forms.
 * @public
 */
export function parseKitSpec(
  spec: string,
): { id: string; version?: string } | { url: string; path: string; tag: string } {
  if (spec.trim() === "")
    throw new Error(
      `A kit is named <id>, <id>@<version> or <git-url>#<path>@<tag>, such as "duckdb/local-medallion@2026-11-01". Nothing was given.`,
    );
  const hash = spec.indexOf("#");
  if (hash >= 0) return gitSpec(spec, hash);
  const at = spec.indexOf("@");
  const id = at < 0 ? spec : spec.slice(0, at);
  if (!isId(id))
    throw new Error(
      `The kit "${id}" is not <platform>/<name>, such as "duckdb/local-medallion". ${forms}`,
    );
  if (at < 0) return { id };
  const version = spec.slice(at + 1);
  if (versionProblem(version) !== undefined)
    throw new Error(
      `The version "${version}" in "${spec}" is not a date. Use YYYY-MM-DD, or YYYY-MM-DD-preview.`,
    );
  return { id, version };
}
