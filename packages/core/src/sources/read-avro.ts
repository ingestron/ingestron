// The Avro reader (spec/cli/sources.md, section 2.4): a schema whose top-level type is `record`,
// one table named by the import's object, else the record's name.
import { avroOutcome } from "./avro-columns.js";
import { isRecord, jsonOf } from "./records.js";
import { readRegistryResponse, registryResponse } from "./read-registry.js";
import type { Outcome, Reader, ReaderInput } from "./result.js";

/** Reads the file's record, or a registry response's schema, as a table. */
function read(input: ReaderInput): Outcome {
  const parsed = jsonOf(input);
  if (parsed !== undefined && "refused" in parsed) return parsed;
  const response = registryResponse(input);
  if (response !== undefined) return readRegistryResponse(input, response);
  return avroOutcome(input.file, parsed?.value, input.object);
}

/** True for a record schema or a schema registry response. */
function accepts(input: ReaderInput): boolean {
  if (registryResponse(input) !== undefined) return true;
  const parsed = jsonOf(input);
  return (
    parsed !== undefined &&
    !("refused" in parsed) &&
    isRecord(parsed.value) &&
    parsed.value.type === "record"
  );
}

/** The Avro reader. */
export const avroReader: Reader = { accepts, read };
