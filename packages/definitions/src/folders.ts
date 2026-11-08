// Data folders the package ships beside dist/. This file stays at the top of
// src/: compiled, it sits in dist/, and in a bundle every file is the bundle,
// which has the same folders copied beside it, so "../schemas" holds for both.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The document schemas shipped in ../schemas. */
export const schemasFolder: string = join(dirname(fileURLToPath(import.meta.url)), "../schemas");
