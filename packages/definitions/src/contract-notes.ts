// Ingestron's notes on the ODCS contract fields: what the third-party schema
// leaves out, and what Ingestron does with the fields it reads. Matched by
// field path; the schema file itself stays as published.

/** One field's note: a description where ODCS has none, a sentence to add, meanings, an example. */
export interface ContractNote {
  description?: string;
  /** Added after the ODCS description: what Ingestron does with the field. */
  ingestron?: string;
  meanings?: Record<string, string>;
  example?: unknown;
}

const column = "schema.*.properties.*";

/** The contract fields Ingestron reads; these need value meanings and examples. */
export const contractReads = [
  "apiVersion",
  "kind",
  "id",
  "version",
  "status",
  "schema.*.name",
  "schema.*.description",
  `${column}.name`,
  `${column}.logicalType`,
  `${column}.physicalType`,
  `${column}.required`,
  `${column}.primaryKey`,
  `${column}.primaryKeyPosition`,
  `${column}.physicalName`,
  `${column}.description`,
];

/** Notes by field path, `*` for any item. */
export const contractNotes: Record<string, ContractNote> = {
  apiVersion: {
    meanings: {
      "v3.1.0": "The current ODCS version.",
      "v3.0.2": "An earlier ODCS 3 version.",
      "v3.0.1": "An earlier ODCS 3 version.",
      "v3.0.0": "An earlier ODCS 3 version.",
      "v2.2.2": "An ODCS 2 version.",
      "v2.2.1": "An ODCS 2 version.",
      "v2.2.0": "An ODCS 2 version.",
    },
  },
  id: { example: "shop.orders", ingestron: "Flows and transforms name the contract by it." },
  version: { example: "1.0.0" },
  "schema.*.name": {
    example: "orders",
    ingestron: "A table uses the object named like the table, or the only one.",
  },
  "schema.*.description": {
    example: "One row per order.",
    ingestron: "It becomes the table's comment.",
  },
  [`${column}.name`]: { example: "total" },
  [`${column}.physicalName`]: {
    example: "tot_amt",
    ingestron: "The column's name at the source, when it differs; the table keeps `name`.",
  },
  [`${column}.logicalType`]: {
    meanings: {
      string: "Text.",
      date: "A calendar date.",
      timestamp: "A date and time.",
      time: "A time of day.",
      number: "A decimal number; give its precision with physicalType or the standard's types.",
      integer: "A whole number.",
      object: "A structure of named fields.",
      array: "A list of values.",
      boolean: "True or false.",
    },
    ingestron:
      "The standard's `types` turn it into the platform's type when there is no physicalType.",
  },
  [`${column}.physicalType`]: {
    example: "DECIMAL(18,2)",
    ingestron: "Used as the column's type on the platform as written.",
  },
  [`${column}.required`]: {
    ingestron:
      "A required column gets a not-null check, with the standard's `quality.required` action.",
  },
  [`${column}.primaryKey`]: {
    ingestron: "Primary key columns are the keys for `upsert` and `history`.",
  },
  [`${column}.description`]: {
    example: "Order total in NZD, including GST.",
  },
  price: { description: "What the data product costs: amount, currency and unit." },
  [`${column}.logicalTypeOptions`]: {
    description: "Limits for the logical type, such as maxLength, pattern or minimum.",
  },
  [`${column}.items.logicalTypeOptions`]: {
    description: "Limits for the array's elements, such as maxItems.",
  },
  "schema.*.quality.*.implementation": {
    description: "The check as the engine runs it: text or a mapping.",
  },
  [`${column}.quality.*.implementation`]: {
    description: "The check as the engine runs it: text or a mapping.",
  },
  "schema.*.relationships.*.from": { description: "The columns the relationship starts from." },
  "schema.*.relationships.*.to": { description: "The columns it refers to." },
  "schema.*.quality.*.method": { description: "How the check is done, such as reconciliation." },
  [`${column}.quality.*.method`]: {
    description: "How the check is done, such as reconciliation.",
  },
};
