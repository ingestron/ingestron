// The readers of source files, by the name a recipe gives them (spec/cli/sources.md, section 2).
// Every reader there is. The readers of section 2.4 are tried in the order of `documentReaders`.
import { avroReader } from "./read-avro.js";
import { columnsReader } from "./read-columns.js";
import { jsonSchemaReader } from "./read-json-schema.js";
import { odataReader } from "./read-odata.js";
import { odcsReader } from "./read-odcs.js";
import { openApiReader } from "./read-openapi.js";
import { salesforceReader } from "./read-salesforce.js";
import { sampleReader } from "./read-sample.js";
import type { SourceReaderName } from "./recipe.js";
import type { Reader } from "./result.js";

/** Every reader there is, by name. */
export const readers: Record<SourceReaderName, Reader> = {
  columns: columnsReader,
  sample: sampleReader,
  odcs: odcsReader,
  odata: odataReader,
  openapi: openApiReader,
  "json-schema": jsonSchemaReader,
  avro: avroReader,
  "salesforce-describe": salesforceReader,
};

/** The readers of documents a source publishes, in the order section 2.5 tries them. */
export const documentReaders: readonly SourceReaderName[] = [
  "odata",
  "openapi",
  "json-schema",
  "avro",
  "salesforce-describe",
];
