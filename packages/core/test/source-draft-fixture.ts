// The drafting fixture project (spec/cli/conformance/sources/drafts/), shared by its tests.
import { resolve } from "node:path";
import { projectIn } from "./source-request-fixture.js";

/** The fixture project's folder. */
export const folder = resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/drafts");

/** The fixture project with some files replaced, added or (given null) removed. */
export const project = (changes: Record<string, string | null> = {}) => projectIn(folder, changes);

/** The host values every case uses: no environment variables, the dev environment. */
export const host = { envvars: {}, environment: "dev" };
/** A metadata column as the draft's ODCS property: no sourceType, precision or scale. */
export interface Column {
  name: string;
  sourceType?: string;
  logicalType: string;
  logicalTypeOptions?: Record<string, unknown>;
  required: boolean;
  primaryKeyPosition?: number;
  properties?: Column[];
  items?: Column;
}
export function propertyOf(column: Column): Record<string, unknown> {
  const { precision, scale, ...options } = column.logicalTypeOptions ?? {};
  void precision;
  void scale;
  return {
    name: column.name,
    logicalType: column.logicalType,
    ...(Object.keys(options).length > 0 && { logicalTypeOptions: options }),
    required: column.required,
    ...(column.primaryKeyPosition !== undefined && {
      primaryKey: true,
      primaryKeyPosition: column.primaryKeyPosition,
    }),
    ...(column.properties && { properties: column.properties.map(propertyOf) }),
    ...(column.items && { items: propertyOf(column.items) }),
  };
}

/** Names that need care in YAML: indicators, comments, numbers, and the words read as other values. */
export const awkward = [
  "@x",
  "%x",
  "`x",
  "#x",
  "123",
  "true",
  "1abc",
  "yes",
  "No",
  "ON",
  "off",
  "y",
  "N",
  "null",
  "- x",
  "a: b",
];

/** The sales flow with orders naming its draft, and without the table that has no entry. */
export const flowWithContract = `apiVersion: ingestron.io/v1
kind: Flow
id: sales
source: erp
layer: silver
tables:
  orders: { object: "\${values.erp_db}.dbo.Orders", contract: erp.orders }
  invoices: { object: "\${values.erp_db}.dbo.Invoices", contract: invoices }
`;
