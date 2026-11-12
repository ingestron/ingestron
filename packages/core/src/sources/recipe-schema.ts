// The schema of a source recipe, for editors. readSourceRecipe checks the same rules and more.
import { columnsFields, logicalTypes, readerNames } from "./recipe.js";

const text = { type: "string" };

/**
 * A recipe's schema, for editors; `readSourceRecipe` checks the same rules and more.
 * @public
 */
export const sourceRecipeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Ingestron source recipe",
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "kind", "ask", "read", "sources"],
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]*$",
      description:
        "Lower-case letters, digits and '-', starting with a letter; the file's name without .yaml.",
    },
    title: { ...text, description: "The source's name." },
    kind: {
      enum: ["catalog", "document", "sample"],
      description:
        "catalog: a query or API call on the source's catalog; document: a call that downloads a document the source publishes; sample: a file of what the source sends.",
    },
    inputs: {
      type: "object",
      propertyNames: {
        pattern: "^[a-z][a-zA-Z0-9_]*$",
        not: { enum: ["connection", "object", "schemas"] },
      },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["description"],
        properties: { description: { ...text, description: "What to write for the input." } },
      },
      description:
        "Each input's name and description. A connection gives the values in metadata.with.",
    },
    ask: {
      type: "object",
      additionalProperties: false,
      required: ["who", "access", "save"],
      properties: {
        who: { ...text, description: "Who should do it." },
        access: { ...text, description: "The permission it needs." },
        run: {
          ...text,
          description:
            "A query. A catalog or document recipe has run or call; a sample recipe neither.",
        },
        call: { ...text, description: "A URL to call." },
        save: {
          type: "string",
          pattern: "^sources/",
          description: "Where to save the result, starting sources/.",
        },
        how: { ...text, description: "How to save it, such as with curl or Postman." },
      },
    },
    read: {
      enum: [...readerNames],
      description: "The reader that reads the result.",
    },
    names: {
      type: "object",
      additionalProperties: false,
      required: ["parts", "caseSensitive"],
      properties: {
        parts: { type: "integer", minimum: 1, maximum: 4 },
        caseSensitive: { type: "boolean" },
      },
      description: "How the source names a table.",
    },
    types: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["match", "logicalType"],
        properties: {
          match: {
            ...text,
            description: "A regular expression, applied without case to the source's type.",
          },
          logicalType: { enum: [...logicalTypes] },
          options: {
            type: "object",
            additionalProperties: { type: ["string", "number"] },
            description:
              "The logical type's options; $1, $2 and so on are capture groups of match.",
          },
        },
      },
      description: "The source's types, as rules tried in order.",
    },
    rows: {
      ...text,
      description:
        "With columns and sample: the path of keys, joined with '.', to the records of a JSON result.",
    },
    fields: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        columnsFields.map((field) => [
          field,
          {
            ...text,
            description: "The result's field; '!' reads a true-or-false field the other way round.",
          },
        ]),
      ),
      description: "With columns: the result's field that holds each field of the columns file.",
    },
    key: {
      type: "array",
      items: text,
      description: "With columns: the columns that form each table's primary key, in order.",
    },
    objects: {
      enum: ["sets", "types"],
      description:
        "With odata: sets (the default) names a table after its entity set; types after its entity type.",
    },
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "read"],
        properties: {
          url: { type: "string", pattern: "^https://" },
          read: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "The date it was read, YYYY-MM-DD.",
          },
        },
      },
      description:
        "The vendor documentation the recipe comes from, each with the date it was read.",
    },
  },
};
