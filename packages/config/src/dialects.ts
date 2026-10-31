// Picks the JSON Schema version (dialect) a kind's schema declares with
// `$schema`, so that published schemas such as ODCS (2019-09) load unchanged.

import { Ajv, type Options } from "ajv/dist/ajv.js";
import { Ajv2019 } from "ajv/dist/2019.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { JsonSchema } from "./kinds.js";

/** The JSON Schema versions a kind's schema may declare. */
export type Dialect = "draft-07" | "2019-09" | "2020-12";

/** Used when a schema has no `$schema`. */
export const defaultDialect: Dialect = "2020-12";

const dialectsByUri: Record<string, Dialect> = {
  "json-schema.org/draft-07/schema": "draft-07",
  "json-schema.org/draft/2019-09/schema": "2019-09",
  "json-schema.org/draft/2020-12/schema": "2020-12",
};

/** The supported versions, for messages. */
export const supportedDialects = Object.values(dialectsByUri).join(", ");

/**
 * The dialect `schema` declares, `defaultDialect` when it declares none, or
 * undefined for a version this package does not support. `http`/`https` and
 * a trailing `#` are ignored.
 */
export function dialectOf(schema: JsonSchema): Dialect | undefined {
  if (typeof schema === "boolean" || schema.$schema === undefined) return defaultDialect;
  if (typeof schema.$schema !== "string") return undefined;
  const uri = schema.$schema.replace(/^https?:\/\//, "").replace(/#$/, "");
  return dialectsByUri[uri];
}

/** A validator for one dialect. */
export function createAjv(dialect: Dialect, options: Options): Ajv {
  if (dialect === "draft-07") return new Ajv(options);
  if (dialect === "2019-09") return new Ajv2019(options);
  return new Ajv2020(options);
}
