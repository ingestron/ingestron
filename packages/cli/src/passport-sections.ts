// The passport's sections about what a product provides (spec/cli/passport.md,
// sections 3 to 7): its tables, columns, quality, freshness and access.
import {
  fullNameText,
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
export function outputTables(model: ResolvedModel, product: ResolvedProduct) {
  return product.outputs.map((output) => ({
    output,
    tables: output.tables
      .map((name) => model.tables.find((item) => item.name === name))
      .filter((item): item is ResolvedTable => item !== undefined),
  }));
}

/** Section 3: each output's table in this environment and where it lives. */
export function provides(model: ResolvedModel, product: ResolvedProduct): string {
  const rows = outputTables(model, product).flatMap(({ output, tables }) =>
    tables.length === 0
      ? [[output.name, output.description ?? "", "Not built in this environment.", ""]]
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

/** Section 4: each output's columns, with sensitive ones marked. */
export function columns(model: ResolvedModel, product: ResolvedProduct): string {
  const sensitive = model.standard.governance?.classification?.sensitive ?? [];
  const tagged =
    model.standard.packs.includes("databricks@1") && model.platform.manage.tags
      ? ", tagged in Unity Catalog"
      : "";
  const parts = outputTables(model, product).map(({ output, tables }) => {
    const contract = tables[0]?.contract;
    if (!contract) return `### ${output.name}\n\nNot built in this environment.`;
    const rows = contract.columns.map((column) => {
      const kind = column.classification;
      const marked = kind && sensitive.includes(kind) ? `${kind} (sensitive)` : kind;
      return [
        column.name,
        column.description ?? "",
        column.type ?? column.logicalType ?? "",
        column.nullable ? "" : "yes",
        contract.primaryKey.includes(column.name) ? "yes" : "",
        marked ? `${marked}${tagged}` : "",
      ];
    });
    const header = ["Column", "Description", "Type", "Required", "Key", "Classification"];
    return `### ${output.name}\n\n${table(header, rows)}`;
  });
  return ["## Columns", ...parts].join("\n\n");
}

/** Section 5: each check and when it runs, or why it does not. */
export function quality(model: ResolvedModel, product: ResolvedProduct): string {
  const checksOn = model.platform.manage.checks;
  const parts = outputTables(model, product).flatMap(({ output, tables }) =>
    tables.map((built) => {
      if (built.endsAtFiles)
        return `### ${output.name}\n\nNot checked: the data stays as the landed files.`;
      const rows = built.expectations.map(
        (item) =>
          `- \`${item.name}\`: ${code(item.check)}, checked on every load; rows that fail: ${item.action}.`,
      );
      const after = checksOn
        ? "checked after each refresh"
        : "not checked: checks are off on this platform";
      const counts = built.contract.tableChecks.map((item) => `- \`${item.name}\`: ${after}.`);
      const lines = [...rows, ...counts];
      return `### ${output.name}\n\n${lines.length > 0 ? lines.join("\n") : "No quality rules."}`;
    }),
  );
  return ["## Quality", ...parts].join("\n\n");
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
    : "- Refreshed when the pipeline runs; no schedule is set.";
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
  if (rows.length === 0) return "## Who may use it\n\nThe contracts name no roles.";
  const note = "As declared in the contracts; Ingestron does not grant access.";
  return `## Who may use it\n\n${table(["Role", "Access", "Purpose", "Approvers"], rows)}\n\n${note}`;
}

/** The contract of each output built here, once each. */
function contracts(model: ResolvedModel, product: ResolvedProduct): Contract[] {
  const found = outputTables(model, product).flatMap(({ tables }) => tables.map((t) => t.contract));
  return found.filter((item, index) => found.findIndex((other) => other.id === item.id) === index);
}
