// The passport's sections about what a product provides (spec/cli/passport.md,
// sections 3 to 7): its tables, columns, quality, freshness and access.
import {
  fullNameText,
  type Column,
  type Contract,
  type ResolvedModel,
  type ResolvedProduct,
  type ResolvedTable,
} from "@ingestron/definitions";

/** Text for a Markdown table cell: one line, with `|` escaped. */
export function cell(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

/** Inline code that stays whole when the text has backticks of its own. */
export function code(text: string): string {
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
}

/** A Markdown table from a header and rows of cells. */
export function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;
  return [line(header), `| ${header.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

const homes: Record<string, string> = {
  databricks: "Databricks",
  synapse: "Synapse serverless SQL",
  duckdb: "DuckDB",
};

/** Where a table's data lives after its last step. */
function home(built: ResolvedTable): string {
  if (built.endsAtFiles)
    return `Landed files at ${built.ingest?.output?.location ?? "the landing storage"}`;
  const last = built.serve ?? built.store ?? built.transform ?? built.ingest;
  return last ? (homes[last.pack] ?? last.pack) : "";
}

/** Each output with its table in this environment, as pairs of the output and its tables. */
export function outputTables(
  model: ResolvedModel,
  product: ResolvedProduct,
): { output: ResolvedProduct["outputs"][number]; tables: ResolvedTable[] }[] {
  return product.outputs.map((output) => ({
    output,
    tables: output.tables
      .map((name) => model.tables.find((item) => item.name === name))
      .filter((item): item is ResolvedTable => item !== undefined),
  }));
}

/** The sentence for an output with no table in this environment. */
export const notBuilt = "Not built in this environment.";

/** One line per output with no table here, for sections that list by contract or diagram. */
export function notBuiltLines(model: ResolvedModel, product: ResolvedProduct): string[] {
  return outputTables(model, product)
    .filter(({ tables }) => tables.length === 0)
    .map(({ output }) => `- \`${output.name}\`: ${notBuilt}`);
}

/** Section 3: each output's table in this environment and where it lives. */
export function provides(model: ResolvedModel, product: ResolvedProduct): string {
  const rows = outputTables(model, product).flatMap(({ output, tables }) =>
    tables.length === 0
      ? [[output.name, output.description ?? "", notBuilt, ""]]
      : tables.map((built) => [
          output.name,
          output.description ?? "",
          `\`${fullNameText(built.fullName)}\``,
          home(built),
        ]),
  );
  const environment = model.project.environment;
  return `## What it provides in ${environment}\n\n${table(["Output", "What it is", `Table in ${environment}`, "Where it lives"], rows)}`;
}

/** Whether Databricks tags this table's classified columns: it stores the table and tags are on. */
function taggedInUnityCatalog(model: ResolvedModel, built: ResolvedTable | undefined): boolean {
  return model.platform.manage.tags && built?.store?.pack === "databricks";
}

/** The contract's logical type, so landed and contract columns read alike; else the physical one. */
function typeName(column: Column): string {
  return column.logicalType ?? column.type ?? "";
}

/** Section 4: each output's columns, with sensitive ones marked. */
export function columns(model: ResolvedModel, product: ResolvedProduct): string {
  const sensitive = model.standard.governance?.classification?.sensitive ?? [];
  const parts = outputTables(model, product).map(({ output, tables }) => {
    const contract = tables[0]?.contract;
    const tagged = taggedInUnityCatalog(model, tables[0]) ? ", tagged in Unity Catalog" : "";
    if (!contract) return `### ${output.name}\n\n${notBuilt}`;
    const landed = landedColumns(tables[0]!).map((column) => [
      column.name,
      column.description ?? "",
      typeName(column),
      column.nullable ? "" : "yes",
      "",
      "",
    ]);
    const rows = contract.columns.map((column) => {
      const kind = column.classification;
      const marked = kind && sensitive.includes(kind) ? `${kind} (sensitive)` : kind;
      return [
        column.name,
        column.description ?? "",
        typeName(column),
        column.nullable ? "" : "yes",
        contract.primaryKey.includes(column.name) ? "yes" : "",
        marked ? `${marked}${tagged}` : "",
      ];
    });
    const header = ["Column", "Description", "Type", "Required", "Key", "Classification"];
    return `### ${output.name}\n\n${table(header, [...rows, ...landed])}`;
  });
  return ["## Columns", ...parts].join("\n\n");
}

/** Section 6: the contracts' promises and the refresh schedule. */
export function freshness(model: ResolvedModel, product: ResolvedProduct): string {
  const promises = new Set(
    contracts(model, product).flatMap((contract) =>
      contract.sla.map(
        ({ property, value, unit }) => `- ${property}: ${value}${unit ? ` ${unit}` : ""}`,
      ),
    ),
  );
  const schedule = model.platform.schedule;
  const refresh = schedule
    ? `- Refreshed on the schedule \`${schedule.cron}\` (${schedule.timezone})${schedule.paused ? ", paused" : ""}.`
    : "- Refreshed when its pipelines run.";
  return ["## Freshness", [...promises, refresh].join("\n")].join("\n\n");
}

/** Section 7: who may use the data, as the contracts declare. */
export function access(model: ResolvedModel, product: ResolvedProduct): string {
  const rows = contracts(model, product).flatMap((contract) =>
    contract.roles.map((role) => [
      role.role,
      role.access ?? "",
      role.description ?? "",
      role.firstLevelApprovers ?? "",
    ]),
  );
  const unbuilt = notBuiltLines(model, product);
  const note = "As declared in the contracts; Ingestron does not grant access.";
  const body =
    rows.length > 0
      ? [table(["Role", "Access", "Purpose", "Approvers"], rows), ...unbuilt, note]
      : [
          ...(unbuilt.length < product.outputs.length ? ["The contracts name no roles."] : []),
          ...unbuilt,
        ];
  return `## Who may use it\n\n${body.join("\n\n")}`;
}

/** The contract of each output built here, once each. */
function contracts(model: ResolvedModel, product: ResolvedProduct): Contract[] {
  const found = outputTables(model, product).flatMap(({ tables }) => tables.map((t) => t.contract));
  return found.filter((item, index) => found.findIndex((other) => other.id === item.id) === index);
}

/** Columns the table's landed files add beyond the contract; a transform's table has none. */
function landedColumns(built: ResolvedTable): Column[] {
  return built.transform ? [] : (built.ingest?.output?.columns ?? []);
}
