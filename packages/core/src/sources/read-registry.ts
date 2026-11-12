// A schema registry's response (spec/cli/sources.md, section 2.4): a JSON mapping whose `schema`
// is text, read by its `schemaType` as Avro or as JSON Schema. The readers `avro` and
// `json-schema` both accept it.
import { avroOutcome } from "./avro-columns.js";
import { isRecord, jsonOf } from "./records.js";
import type { Outcome, ReaderInput, Refused } from "./result.js";
import { schemaOutcome } from "./schema-columns.js";
import { extensionOf } from "./text.js";

/** The response's mapping, when the file is one; undefined for any other file. */
export function registryResponse(input: ReaderInput): Record<string, unknown> | undefined {
  const parsed = jsonOf(input);
  if (parsed === undefined || "refused" in parsed) return undefined;
  const { value } = parsed;
  const keyed = isRecord(value) && ["subject", "id", "version"].some((key) => key in value);
  return keyed && typeof value.schema === "string" ? value : undefined;
}

/** The table's name when the import gives none: the file's name without its last extension. */
function fileName(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1);
  return name.slice(0, name.length - extensionOf(file).length);
}

/** The refusal for a `schemaType` that is not read, or undefined for one that is. */
function unread(file: string, type: unknown): Refused | undefined {
  if (type === "PROTOBUF")
    return {
      refused: [
        "Protobuf schemas are not read yet; save the topic's columns as a columns file instead.",
      ],
    };
  return type === "AVRO" || type === "JSON"
    ? undefined
    : {
        refused: [
          `${file} is a schema registry response of a type Ingestron does not read; it reads AVRO and JSON.`,
        ],
      };
}

/** Reads the response's `schema` by its `schemaType`. */
export function readRegistryResponse(
  input: ReaderInput,
  response: Record<string, unknown>,
): Outcome {
  const type = response.schemaType ?? "AVRO";
  const refused = unread(input.file, type);
  if (refused !== undefined) return refused;
  let schema: unknown;
  try {
    schema = JSON.parse(response.schema as string);
  } catch {
    return { refused: [`${input.file} holds a schema that is not valid JSON.`] };
  }
  if (type === "AVRO") return avroOutcome(input.file, schema, input.object);
  const title = isRecord(schema) ? schema.title : undefined;
  const named = typeof title === "string" && title !== "" ? title : fileName(input.file);
  return isRecord(schema)
    ? schemaOutcome(input.file, input.object ?? named, schema)
    : { refused: [`${input.file} describes no properties.`] };
}
