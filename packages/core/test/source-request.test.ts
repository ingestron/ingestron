// The source request: the conformance cases in spec/cli/conformance/sources/request/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileSource } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { packs, sourceRecipes, sourceRequest } from "../src/index.js";
import { sourceRequestFor } from "../src/internal.js";
import { expected, folder, project, recipesOf } from "./source-request-fixture.js";

interface RequestCase {
  name: string;
  environment?: string;
  connection?: string;
  /** Project files replaced by files of the fixture folder. */
  replace?: Record<string, string>;
  expected: string;
  resolved: boolean;
}

const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8")) as {
  requests: RequestCase[];
};

describe("sourceRequestFor: the conformance cases", () => {
  for (const item of cases.requests) {
    it(item.name, () => {
      const replaced = Object.entries(item.replace ?? {}).map(([path, from]) => [
        path,
        expected(from),
      ]);
      const files = project(Object.fromEntries(replaced));
      const result = sourceRequestFor(files, item.environment, {
        envvars: {},
        recipes: recipesOf(files),
        ...(item.connection !== undefined && { connection: item.connection }),
      });
      expect(result.text).toBe(expected(item.expected));
      expect(result.resolved).toBe(item.resolved);
    });
  }

  it("reads the project's own recipes when none are given", () => {
    const result = sourceRequestFor(project(), "dev", { envvars: {} });
    expect(result.text).toBe(expected("request.dev.md"));
  });

  it("sourceRequest gives the same text", () => {
    const files = project();
    expect(sourceRequest(files, "dev", { envvars: {}, recipes: recipesOf(files) })).toBe(
      expected("request.dev.md"),
    );
  });
});

describe("sourceRequestFor: recipes", () => {
  const request = (files: FileSource, environment: string | undefined, connection?: string) =>
    sourceRequestFor(files, environment, {
      envvars: {},
      recipes: recipesOf(files),
      ...(connection !== undefined && { connection }),
    });

  it("names an installed recipe without its file", () => {
    const files = project({
      "recipes/sqlserver.yaml": null,
      "recipes/salesforce.yaml": null,
      "recipes/sample.yaml": null,
    });
    const { text } = request(files, "dev");
    expect(text).toContain("- Recipe: SQL Server (`sqlserver`)\n");
    expect(text).toContain("- Recipe: Salesforce (`salesforce`)\n");
    expect(text).not.toContain("from `recipes/");
  });

  it("asks a connection with no recipe for the alternatives, and its columns file", () => {
    const files = project({ "recipes/salesforce.yaml": null });
    const { text } = sourceRequestFor(files, "dev", {
      envvars: {},
      recipes: sourceRecipes(files, join(folder, "no-such-folder")),
    });
    expect(text).toContain(
      "## crm\n\nNo recipe describes this source. Send one of these:\n\n- A sample of each table,",
    );
    expect(text).not.toContain("## crm\n\n### If that cannot be done");
    expect(text).toContain(
      "ingestron source import crm sources/crm.columns.csv --env dev\ningestron source import erp sources/erp.catalog.csv --env dev\n",
    );
  });

  it("asks a sample recipe's connection for each table's sample, with no sample among the alternatives", () => {
    const files = project({ "sources/landing.yaml": null, "project.yaml": withoutLanding() });
    const { text, resolved } = request(files, "dev", "landing");
    expect(resolved).toBe(true);
    expect(text).toContain(
      [
        "## landing",
        "- Who: Someone who can export a small sample from the source\n- Access: Read access to the data\n- Recipe: A sample of what the source sends (`sample`, from `recipes/sample.yaml`)",
        "Save a sample of each table:",
        "- `sources/landing/shipments.csv`\n- `sources/landing/returns.csv`",
        "Export a few rows, with a header, as CSV, JSON, JSON Lines or Parquet.",
        "### If that cannot be done",
        "- A data contract (ODCS) for the tables, from the source's team, saved as `sources/landing.odcs.yaml`.",
      ].join("\n\n"),
    );
    expect(text).toContain(
      "ingestron source import landing sources/landing/shipments.csv --env dev\ningestron source import landing sources/landing/returns.csv --env dev\n",
    );
  });

  it("asks for nothing when every connection is covered", () => {
    const { text } = request(project(), "dev", "landing");
    expect(text).toContain("## landing\n\nEvery table its flows read is in sources/landing.yaml:");
    expect(text).not.toContain("## Importing");
  });

  it("keeps {schemas} for a named connection no flow reads", () => {
    const files = project({
      "connections/archive.yaml":
        "apiVersion: ingestron.io/v1\nkind: Connection\nid: archive\nconnector: sqlserver\nconnectivity: workspace\nsettings:\n  uc_connection: archive_connection\n",
    });
    const { text, resolved } = request(files, "dev", "archive");
    expect(resolved).toBe(true);
    expect(text).toContain("WHERE c.TABLE_SCHEMA IN ({schemas})\n```");
    // The query holds no {database}, so only {schemas} is to be filled in.
    expect(text).toContain("Fill in before use:\n\n- `{schemas}`: the schemas to describe,");
    expect(text).not.toContain("{database}");
    expect(text).not.toContain("  - `sources/archive/");
  });

  it("fills placeholders in who and access, and lists those left in the order they appear", () => {
    const files = project({
      "connections/archive.yaml":
        "apiVersion: ingestron.io/v1\nkind: Connection\nid: archive\nconnector: sqlserver\nconnectivity: workspace\nsettings:\n  uc_connection: archive_connection\n",
      "recipes/sqlserver.yaml": expected("recipes/sqlserver.yaml").replace(
        "Someone who can query the catalog views of the source database",
        "Someone who can query {database} for {connection}",
      ),
    });
    expect(request(files, "dev", "erp").text).toContain(
      "- Who: Someone who can query ERP_DEV for erp\n",
    );
    expect(request(files, "dev", "archive").text).toContain(
      "Fill in before use:\n\n- `{database}`: The database whose tables are loaded, such as ERP\n- `{schemas}`: the schemas",
    );
  });

  it("says when no flow reads from a connection", () => {
    const files = project({
      "flows/erp.yaml": null,
      "flows/crm.yaml": null,
      "flows/landing.yaml": null,
    });
    // The pack's own check wants something to generate; the request does not.
    const quiet = packs.map((pack) => ({ ...pack, check: () => [] }));
    expect(sourceRequestFor(files, "dev", { envvars: {}, packs: quiet }).text).toBe(
      [
        "# Source request: retail (dev)",
        "Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.",
        "No flow reads from a connection, so there is nothing to ask for.\n",
      ].join("\n\n"),
    );
  });

  it("without an environment, resolves for the first one project.yaml declares, names it and leaves --env out", () => {
    const { text, resolved } = request(project(), undefined);
    expect(resolved).toBe(true);
    expect(text).toContain("# Source request: retail (dev)\n");
    expect(text).toContain("ingestron source import erp sources/erp.catalog.csv\n");
    expect(text).not.toContain("--env");
  });

  it("without an environment, resolves for none when project.yaml declares none, named default", () => {
    const declared = expected("project.yaml");
    const environments = declared.slice(
      declared.indexOf("environments:"),
      declared.indexOf("imports:"),
    );
    const files = project({
      "project.yaml": declared.replace(
        environments,
        "values:\n  erp_db: ERP\n  erp_sales: sales\n",
      ),
    });
    const { text, resolved } = request(files, undefined);
    expect(resolved).toBe(true);
    expect(text).toContain("# Source request: retail (default)\n");
    expect(text).toContain("ingestron source import erp sources/erp.catalog.csv\n");
  });
});

/** The fixture's project.yaml importing no source metadata. */
function withoutLanding(): string {
  return expected("project.yaml").replace("  - sources/landing.yaml\n", "");
}
