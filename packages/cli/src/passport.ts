// Data product passports (spec/cli/passport.md): a plain page per product and
// an index, generated from the same model as the pipelines.
import type { GovernanceDoc, ResolvedModel, ResolvedProduct } from "@ingestron/definitions";
import { lineage } from "./passport-lineage.js";
import { access, columns, freshness, provides, quality, table } from "./passport-sections.js";

/** `README.md` and `<product id>.md` per product; none without products. */
export function passports(model: ResolvedModel): Record<string, string> {
  if (model.products.length === 0) return {};
  return Object.fromEntries([
    ["README.md", index(model)],
    ...model.products.map((product) => [`${product.id}.md`, page(model, product)]),
  ]);
}

function index(model: ResolvedModel): string {
  const rows = model.products.map((product) => [
    `[${product.name ?? product.id}](${product.id}.md)`,
    product.owners.map((owner) => owner.name ?? owner.username).join(", "),
    product.status ?? "",
    firstSentence(product.purpose),
  ]);
  const title = `# Data products in ${model.project.environment}`;
  return `${title}\n\n${table(["Product", "Owners", "Status", "Purpose"], rows)}\n`;
}

function capital(text: string): string {
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

function firstSentence(text: string | undefined): string {
  return text?.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? text ?? "";
}

function page(model: ResolvedModel, product: ResolvedProduct): string {
  return `${[
    summary(product),
    team(product),
    provides(model, product),
    columns(model, product),
    quality(model, product),
    freshness(model, product),
    access(model, product),
    `## Lineage\n\n${lineage(model, product)}`,
    governance(model),
  ].join("\n\n")}\n`;
}

function summary(product: ResolvedProduct): string {
  const retired = product.status?.toLowerCase() === "retired";
  const banner = retired
    ? "> **Retired:** this product is no longer published."
    : product.deprecated
      ? "> **Deprecated:** this product will be retired; plan to move off it."
      : undefined;
  const facts = (["domain", "type", "version", "status"] as const)
    .filter((key) => product[key] !== undefined)
    .map((key) => `- ${key[0]!.toUpperCase()}${key.slice(1)}: ${product[key]}`);
  return [
    `# ${product.name ?? product.id}`,
    banner,
    product.purpose,
    product.usage && `**How to use it:** ${product.usage}`,
    product.limitations && `**Limitations:** ${product.limitations}`,
    facts.length > 0 ? facts.join("\n") : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

function team(product: ResolvedProduct): string {
  const person = (member: { username: string; name?: string }) =>
    member.name ? `${member.name} (${member.username})` : member.username;
  const owners =
    product.owners.length > 0
      ? product.owners.map((owner) => `- Owner: ${person(owner)}`)
      : ["- No owner is named."];
  const others = product.team
    .filter((member) => member.role?.toLowerCase() !== "owner")
    .map((member) => `- ${capital(member.role ?? "team")}: ${person(member)}`);
  const support = product.support.map(
    (item) => `- Ask: ${item.channel}${item.tool ? ` (${item.tool})` : ""}, ${item.url}`,
  );
  return ["## Owners and support", [...owners, ...others, ...support].join("\n")].join("\n\n");
}

function governance(model: ResolvedModel): string {
  const rules = model.standard.governance;
  if (!rules) return "## Governance\n\nThe standard sets no governance rules.";
  const lines = [...productRules(rules), ...classificationRules(rules)];
  const intro = "This product meets every governance rule of the standard:";
  return `## Governance\n\n${intro}\n\n${lines.length > 0 ? lines.join("\n") : "- (none set)"}`;
}

function productRules(rules: GovernanceDoc): string[] {
  return (rules.products?.require ?? []).map(
    (fact) => `- Names ${fact === "owner" ? "an owner" : `its ${fact}`}.`,
  );
}

function classificationRules(rules: GovernanceDoc): string[] {
  const classes = rules.classification ?? {};
  const fields = rules.access?.sensitive?.require ?? [];
  const each = fields.length > 0 ? `, each role with ${fields.join(" and ")}` : "";
  const sensitive = classes.sensitive ?? [];
  return [
    ...(classes.columns === "required" ? ["- Every published column is classified."] : []),
    ...(classes.values ? [`- Classifications are one of: ${classes.values.join(", ")}.`] : []),
    ...(sensitive.length > 0
      ? [
          `- Columns classified ${sensitive.join(" or ")} are sensitive: their contract says who may use them${each}.`,
        ]
      : []),
  ];
}
