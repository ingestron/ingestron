// The OpenAPI reader (spec/cli/sources.md, section 2.4): each object schema of `components.schemas`
// (`definitions` in Swagger 2.0) is a table named by its key.
import { describesProperties, tableColumns } from "./schema-columns.js";
import { documentOf, isRecord } from "./records.js";
import type { Outcome, Reader, ReaderInput, SourceTableRead } from "./result.js";

/** The schemas of the document: `components.schemas`, or `definitions` in Swagger 2.0. */
function schemasOf(document: Record<string, unknown>): unknown {
  if (typeof document.openapi === "string") {
    const components = isRecord(document.components) ? document.components : {};
    return components.schemas;
  }
  return document.definitions;
}

function isOpenApi(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) && (typeof value.openapi === "string" || typeof value.swagger === "string")
  );
}

/** Reads each object schema as a table. */
function read(input: ReaderInput): Outcome {
  const parsed = documentOf(input);
  if (parsed !== undefined && "refused" in parsed) return parsed;
  if (parsed === undefined || !isOpenApi(parsed.value))
    return {
      refused: [
        `${input.file} is not an OpenAPI document: it has no top-level openapi or swagger.`,
      ],
    };
  const schemas = schemasOf(parsed.value);
  const tables: SourceTableRead[] = isRecord(schemas)
    ? Object.entries(schemas).flatMap(([object, schema]) =>
        describesProperties(schema)
          ? [{ object, columns: tableColumns(schema, parsed.value) }]
          : [],
      )
    : [];
  if (tables.length === 0) return { refused: [`${input.file} describes no object schemas.`] };
  return { tables, notes: [] };
}

/** True for a JSON or YAML document with `openapi` or `swagger`. */
function accepts(input: ReaderInput): boolean {
  const parsed = documentOf(input);
  return parsed !== undefined && !("refused" in parsed) && isOpenApi(parsed.value);
}

/** The OpenAPI reader. */
export const openApiReader: Reader = { accepts, read };
