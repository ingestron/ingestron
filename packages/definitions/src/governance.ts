// Governance rules in the standard (specification section 8.1): what each data
// product must say, and how the columns it publishes are classified and shared.
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import { byCodePoint } from "./merge.js";
import { kinds, type ContractDoc, type GovernanceDoc } from "./documents.js";
import type { ResolvedProduct } from "./model.js";

type ContractDocument = DefinitionDocument<ContractDoc>;
type Fact = NonNullable<NonNullable<GovernanceDoc["products"]>["require"]>[number];

const facts: Record<Fact, { has: (product: ResolvedProduct) => boolean; needs: string }> = {
  owner: { has: (p) => p.owners.length > 0, needs: "an owner: a team member with role owner" },
  purpose: { has: (p) => Boolean(p.purpose), needs: "a purpose: description.purpose" },
  support: { has: (p) => p.support.length > 0, needs: "a support channel" },
  domain: { has: (p) => Boolean(p.domain), needs: "a domain" },
};

/** Checks each product, and each contract a product publishes, against the standard's governance. */
export function checkGovernance(context: Context, products: ResolvedProduct[]): void {
  const rules = context.standard.value.governance;
  if (!rules) return;
  for (const product of products) checkProduct(context, product, rules.products?.require ?? []);
  const publishers = new Map<string, string>();
  for (const product of products)
    for (const output of product.outputs)
      if (!publishers.has(output.contract)) publishers.set(output.contract, product.id);
  for (const [id, product] of [...publishers].sort(([a], [b]) => byCodePoint(a, b))) {
    const document = context.project.get(kinds.contract, id);
    if (document) checkContract(context, document, product, rules);
  }
}

function checkProduct(context: Context, product: ResolvedProduct, required: Fact[]): void {
  const document = [
    ...context.project.all(kinds.product),
    ...context.project.all(kinds.productV1),
  ].find((item) => item.file === product.file && item.value.id === product.id);
  for (const fact of required.filter((item) => !facts[item].has(product)))
    context.reporter.error(
      "PRODUCT_INCOMPLETE",
      `The data product "${product.id}" needs ${facts[fact].needs}; the standard requires it.`,
      document && { document, pointer: "/id" },
    );
}

/** Each column's classification, then who may use the contract when a column is sensitive. */
function checkContract(
  context: Context,
  document: ContractDocument,
  product: string,
  rules: GovernanceDoc,
): void {
  let sensitive: string | undefined;
  (document.value.schema ?? []).forEach((entry, i) =>
    (entry.properties ?? []).forEach((column, j) => {
      const pointer = `/schema/${i}/properties/${j}`;
      checkColumn(
        context,
        document,
        { name: column.name, pointer, product },
        column.classification,
        rules,
      );
      const isSensitive =
        column.classification !== undefined &&
        (rules.classification?.sensitive ?? []).includes(column.classification);
      if (isSensitive && sensitive === undefined) sensitive = `${pointer}/classification`;
    }),
  );
  if (sensitive !== undefined) checkRoles(context, document, sensitive, rules);
}

function checkColumn(
  context: Context,
  document: ContractDocument,
  column: { name: string; pointer: string; product: string },
  classification: string | undefined,
  rules: GovernanceDoc,
): void {
  const contract = document.value.id;
  if (classification === undefined) {
    if (rules.classification?.columns === "required")
      context.reporter.error(
        "COLUMN_UNCLASSIFIED",
        `Column "${column.name}" of the contract "${contract}" has no classification; "${column.product}" publishes it, and the standard requires one.`,
        { document, pointer: `${column.pointer}/name` },
      );
    return;
  }
  const values = rules.classification?.values;
  if (!values || values.includes(classification)) return;
  const pointer = `${column.pointer}/classification`;
  context.reporter.error(
    "CLASSIFICATION_UNKNOWN",
    `Column "${column.name}" of the contract "${contract}" is classified "${classification}", which the standard does not list.`,
    { document, pointer },
    `Use one of: ${values.join(", ")}.`,
    values.map((value) => ({
      title: `Change to "${value}"`,
      edits: [{ file: document.file, pointer, set: value }],
    })),
  );
}

/** A sensitive contract names its roles, each with the fields the standard requires. */
function checkRoles(
  context: Context,
  document: ContractDocument,
  sensitive: string,
  rules: GovernanceDoc,
): void {
  const contract = document.value.id;
  const roles = document.value.roles ?? [];
  if (roles.length === 0) {
    context.reporter.error(
      "SENSITIVE_ACCESS",
      `The contract "${contract}" has sensitive columns but does not say who may use them.`,
      { document, pointer: sensitive },
      "Add roles: each group that may read it, with its purpose and approver.",
    );
    return;
  }
  const required = rules.access?.sensitive?.require ?? [];
  roles.forEach((role, k) => {
    const missing = required.filter((field) => !role[field]);
    if (missing.length > 0)
      context.reporter.error(
        "SENSITIVE_ACCESS",
        `The role "${role.role}" of the sensitive contract "${contract}" needs ${missing.join(" and ")}.`,
        { document, pointer: `/roles/${k}` },
      );
  });
}
