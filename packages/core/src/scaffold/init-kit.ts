// A new project from a kit (spec/cli/projects.md, "Kits"): the kit's files, its README as
// STANDARD.md; with a route, the kit's top-level files over the route's composition.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isMap, isScalar, parseDocument, type Pair, type YAMLMap } from "yaml";
import type { Kit } from "../kits/index.js";
import { mergedGitignore, type Content } from "./scaffold.js";
import type { Template } from "./templates.js";

/** Never copied from a kit: its own description, and anything generated. */
const skipped = new Set(["kit.yaml", "build", ".generated.json", ".git", ".ingestron"]);

/**
 * The kit as a template: its name `<id>@<version>`, its folder, title and summary. It asks
 * nothing.
 * @internal
 */
export function kitTemplate(kit: Kit): Template {
  return {
    name: `${kit.id}@${kit.version}`,
    folder: kit.folder,
    title: kit.title,
    summary: kit.summary,
    questions: [],
  };
}

/**
 * The kit's files, path → content: every file but `kit.yaml`, `README.md` as `STANDARD.md`
 * and `gitignore` as `.gitignore`. Throws on a symbolic link.
 * @internal
 */
export function kitFiles(kit: Kit): Record<string, Content> {
  const files: Record<string, Content> = {};
  for (const path of filesUnder(kit, kit.folder))
    files[projectPath(path)] = readFileSync(join(kit.folder, path));
  return files;
}

function projectPath(path: string): string {
  if (path === "README.md") return "STANDARD.md";
  return path === "gitignore" || path.endsWith("/gitignore")
    ? path.replace(/gitignore$/, ".gitignore")
    : path;
}

function filesUnder(kit: Kit, folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    if (skipped.has(entry)) return [];
    const path = join(folder, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      throw new Error(
        `The kit ${kit.id}@${kit.version} has a symbolic link: ${relative(kit.folder, path)}. A kit may only hold regular files.`,
      );
    if (stat.isDirectory()) return filesUnder(kit, path);
    return stat.isFile() ? [relative(kit.folder, path)] : [];
  });
}

/** The files the kit and the composition both have, merged key by key; the kit's win. */
const merged = new Set(["project.yaml", "platform.yaml"]);

/**
 * The route's composed files under the kit's (spec/cli/projects.md, "Kits"): the kit's files at
 * the top of its folder replace the composition's, except that project.yaml and platform.yaml
 * gain the composition's keys the kit lacks, and .gitignore its lines. The kit's files in
 * sub-folders, its example connection, flows, contracts and transforms, are not written.
 * @internal
 */
export function withKit(
  composed: Record<string, Content>,
  kit: Record<string, Content>,
): Record<string, Content> {
  const files = { ...composed };
  for (const [path, content] of Object.entries(kit)) {
    if (path.includes("/")) continue;
    const route = files[path];
    files[path] = content;
    if (route === undefined) continue;
    if (merged.has(path)) files[path] = filled(String(content), String(route));
    else if (path === ".gitignore") files[path] = mergedGitignore(String(content), String(route));
  }
  return files;
}

/** The kit's YAML with the composition's keys it lacks; written as the kit writes YAML. */
function filled(kit: string, route: string): string {
  const document = parseDocument(kit);
  const added = parseDocument(route).contents;
  if (!isMap(document.contents) || !isMap(added)) return kit;
  fill(document.contents, added);
  return document.toString({ lineWidth: 0 });
}

/** Adds each key of `added` that `base` lacks, at any depth, with its comment. */
function fill(base: YAMLMap, added: YAMLMap): void {
  for (const pair of added.items) {
    const own = base.items.find((item) => keyText(item.key) === keyText(pair.key));
    if (!own) {
      // An empty mapping is written `{}`; one that gains keys is written as a block.
      base.flow = false;
      base.items.push((pair as Pair).clone());
    } else if (isMap(own.value) && isMap(pair.value)) fill(own.value, pair.value);
  }
}

function keyText(key: unknown): unknown {
  return isScalar(key) ? key.value : key;
}
