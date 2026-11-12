// Data folders the package ships beside dist/. This file stays at the top of
// src/: compiled, it sits in dist/, and in a bundle every file is the bundle,
// which has the same folders copied beside it, so "../project-templates" holds
// for both.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The starters' folder: `project-templates/` beside `dist/`, in the repository and installed.
 * @public
 */
export const templatesFolder: string = join(
  dirname(fileURLToPath(import.meta.url)),
  "../project-templates",
);

/**
 * The `kits/` folder beside `dist/`, where a release bundled into one file copies the
 * `@ingestron/standards` package's kits, since the bundle cannot resolve that package.
 * @internal
 */
export const bundledKitsFolder: string = join(dirname(fileURLToPath(import.meta.url)), "../kits");

/**
 * The `source-recipes/` folder beside `dist/`, where a release bundled into one file copies the
 * `@ingestron/standards` package's `recipes` folder, since the bundle cannot resolve that
 * package. It is not `recipes/`: the bundle already keeps the ADF pack's project recipes there.
 * @internal
 */
export const bundledRecipesFolder: string = join(
  dirname(fileURLToPath(import.meta.url)),
  "../source-recipes",
);
