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
