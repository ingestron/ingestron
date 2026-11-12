// The source request's fixture project, spec/cli/conformance/sources/request/, read into memory.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import { sourceRecipes } from "../src/index.js";

const conformance = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources");

/** The fixture project's folder. */
export const folder = join(conformance, "request");

/** The fixture catalog, as an installed recipes folder. */
export const catalog = join(conformance, "recipes");

/** Every file of a fixture project, by its path relative to the project's folder. */
function projectFiles(root: string, dir = root): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return Object.entries(projectFiles(root, path));
      return [[relative(root, path).split("\\").join("/"), readFileSync(path, "utf8")]];
    }),
  );
}

/** The fixture project in `root` with some files replaced, added or (given null) removed. */
export function projectIn(root: string, changes: Record<string, string | null> = {}): FileSource {
  const files: Record<string, string> = { ...projectFiles(root) };
  for (const [path, text] of Object.entries(changes))
    if (text === null) delete files[path];
    else files[path] = text;
  return memoryFiles(files);
}

/** The request's fixture project with some files replaced, added or (given null) removed. */
export const project = (changes: Record<string, string | null> = {}): FileSource =>
  projectIn(folder, changes);

/** A file of the fixture folder. */
export const expected = (name: string): string => readFileSync(join(folder, name), "utf8");

/** The project's recipes over the fixture catalog, as an installed folder would give them. */
export const recipesOf = (files: FileSource) => sourceRecipes(files, catalog);
