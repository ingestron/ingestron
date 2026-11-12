// The readers of source files, by the name a recipe gives them (spec/cli/sources.md, section 2).
// A reader that is not listed here is not available yet. The readers of section 2.4 are tried in
// the order of `documentReaders`.
import { columnsReader } from "./read-columns.js";
import { odcsReader } from "./read-odcs.js";
import { sampleReader } from "./read-sample.js";
import type { SourceReaderName } from "./recipe.js";
import type { Reader } from "./result.js";

/** Every reader there is, by name. */
export const readers: Partial<Record<SourceReaderName, Reader>> = {
  columns: columnsReader,
  sample: sampleReader,
  odcs: odcsReader,
};

/** The readers of documents a source publishes, in the order section 2.5 tries them. */
export const documentReaders: readonly SourceReaderName[] = [
  "odata",
  "openapi",
  "json-schema",
  "avro",
  "salesforce-describe",
];
