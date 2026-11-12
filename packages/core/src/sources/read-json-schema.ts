// The JSON Schema reader (spec/cli/sources.md, section 2.4): one table, named by the import's
// object, else the schema's title, else the file's name.
import { isRecord, jsonOf } from "./records.js";
import { readRegistryResponse, registryResponse } from "./read-registry.js";
import type { Outcome, Reader, ReaderInput } from "./result.js";
import { schemaOutcome } from "./schema-columns.js";
import { extensionOf } from "./text.js";

/** Reads the file's schema, or a registry response's schema, as a table. */
function read(input: ReaderInput): Outcome {
  const parsed = jsonOf(input);
  if (parsed !== undefined && "refused" in parsed) return parsed;
  const response = registryResponse(input);
  if (response !== undefined) return readRegistryResponse(input, response);
  if (parsed === undefined || !isRecord(parsed.value) || typeof parsed.value.$schema !== "string")
    return { refused: [`${input.file} is not a JSON Schema: it has no top-level $schema.`] };
  const { title } = parsed.value;
  const name = input.file.slice(input.file.lastIndexOf("/") + 1);
  const object =
    input.object ??
    (typeof title === "string" && title !== ""
      ? title
      : name.slice(0, name.length - extensionOf(input.file).length));
  return schemaOutcome(input.file, object, parsed.value);
}

/** True for a JSON Schema with `$schema`, or a registry response of type JSON. */
function accepts(input: ReaderInput): boolean {
  const response = registryResponse(input);
  if (response !== undefined) return response.schemaType === "JSON";
  const parsed = jsonOf(input);
  return (
    parsed !== undefined &&
    !("refused" in parsed) &&
    isRecord(parsed.value) &&
    typeof parsed.value.$schema === "string"
  );
}

/** The JSON Schema reader. */
export const jsonSchemaReader: Reader = { accepts, read };
