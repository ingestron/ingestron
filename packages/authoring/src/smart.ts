// Smart defaults: a table for each contract no table uses yet, and the likely
// choice first for `contract` and `uses`. Each comes from what the project
// already holds; nothing is invented. Skeletons for new files are in
// ./skeletons.ts.
import { packs } from "@ingestron/cli";
import type { Method } from "@ingestron/definitions";
import type { Suggestion } from "./completion.js";
import { documentOf, flowFacts, idsOf, type Place } from "./context.js";
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";

/** The packs the project's standard names, as the CLI provides them. */
export function standardPacks(project: Project): typeof packs {
  const data = documentOf(project, "Standard") as { packs?: string[] } | undefined;
  const ids = (data?.packs ?? []).map((item) => item.split("@")[0]);
  return packs.filter((pack) => ids.includes(pack.id));
}

/** Contracts that no table or transform names yet. */
export function unusedContracts(project: Project): string[] {
  const used = new Set(
    occurrences(project)
      .filter((item) => !item.definition && item.symbol.startsWith("doc:DataContract:"))
      .map((item) => item.symbol.slice("doc:DataContract:".length)),
  );
  return idsOf(project, "DataContract").filter((id) => !used.has(id));
}

/** The object a contract describes: its first schema name, else the end of its id. */
export function objectOf(project: Project, contract: string): string {
  const data = documentOf(project, "DataContract", contract) as
    { schema?: { name?: string }[] } | undefined;
  return data?.schema?.[0]?.name ?? contract.split(".").at(-1)!;
}

/** Under a flow's `tables`: one table for each unused contract, the source's first. */
export function newTables(project: Project, place: Place): Suggestion[] {
  const { source } = flowFacts(project, place);
  const contracts = unusedContracts(project);
  const own = contracts.filter((id) => id.startsWith(`${source}.`));
  return [...own, ...contracts.filter((id) => !own.includes(id))].map((contract) => {
    const name = objectOf(project, contract);
    return {
      label: name,
      kind: "value",
      detail: contract,
      snippet: `${name}: { object: ${name}, contract: ${contract} }`,
    };
  });
}

/** The suggestion with this label first and preselected. */
export function preferred(items: Suggestion[], label: string | undefined): Suggestion[] {
  const chosen = items.find((item) => item.label === label);
  if (!chosen) return items;
  return [{ ...chosen, preselect: true }, ...items.filter((item) => item !== chosen)];
}

/** For a flow's ingest: the methods that can read its source first, the others with why not. */
export function rankMethods(
  project: Project,
  place: Place,
  items: Suggestion[],
  method: (name: string) => Method | undefined,
): Suggestion[] {
  const facts = flowFacts(project, place);
  if (!facts.connector) return items;
  const ranked = items.map((item) => ({ item, why: whyNot(method(item.label), facts) }));
  const can = ranked
    .filter(({ why }) => !why)
    .map(({ item }, index) => ({ ...item, preselect: index === 0 }));
  const cannot = ranked.filter(({ why }) => why).map(({ item, why }) => ({ ...item, detail: why }));
  return [...can, ...cannot];
}

type Facts = { connector?: string; connectivity?: string };

function whyNot(
  method: Method | undefined,
  { connector, connectivity }: Facts,
): string | undefined {
  if (method?.connectors && !method.connectors.includes(connector ?? ""))
    return `cannot read ${connector} sources`;
  if (method?.connectivity && connectivity && !method.connectivity.includes(connectivity))
    return `cannot reach ${connectivity} sources`;
  return undefined;
}

/** Contract quality rules that Ingestron checks on each row, ready to fill in. */
const rowRules: Suggestion[] = [
  ["Not null", "{ metric: nullValues, mustBe: 0 }", "No row may be null."],
  [
    "Allowed values",
    "{ metric: invalidValues, arguments: { validValues: [${1:a}, ${2:b}] }, mustBe: 0 }",
    "Every row is one of the values, or null.",
  ],
  [
    "Matches a pattern",
    '{ metric: invalidValues, arguments: { pattern: "${1:[a-z]+}" }, mustBe: 0 }',
    "Every row matches the regular expression, or is null.",
  ],
  [
    "No missing values",
    '{ metric: missingValues, arguments: { missingValues: [null, ""] }, mustBe: 0 }',
    "No row is null or one of the values counted as missing.",
  ],
].map(([label, snippet, documentation]) => ({
  label: label!,
  kind: "value" as const,
  snippet: snippet!,
  documentation: `${documentation} Checked on each row.`,
}));

/** A contract column's quality list, where rules are written. */
function inColumnQuality(place: Place): boolean {
  const [schema, , properties, , quality] = place.path;
  const column = schema === "schema" && properties === "properties" && quality === "quality";
  return place.kind === "DataContract" && column && place.path.length === 5;
}

/** Ready-made items for the list at the place: quality rules under a contract column. */
export function itemSnippets(place: Place): Suggestion[] {
  return inColumnQuality(place) ? rowRules : [];
}

/** The fields that make up a quality rule come before the rule's metadata. */
const ruleFields = ["metric", "mustBe", "arguments", "type", "unit", "name", "description"];

/** Fields in the order a person writes them: for a quality rule, what it checks first. */
export function firstFields<T extends { name: string }>(place: Place, fields: T[]): T[] {
  if (!inColumnQuality(place)) return fields;
  const rank = (field: T) => {
    const index = ruleFields.indexOf(field.name);
    return index < 0 ? ruleFields.length : index;
  };
  return [...fields].sort((a, b) => rank(a) - rank(b));
}
