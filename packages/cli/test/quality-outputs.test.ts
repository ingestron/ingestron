// What a project with checks, cleansing and quarantine shows, one route per engine: plan's
// warnings (spec/cli/outputs.md, section 1), the passport's quality section
// (spec/cli/passport.md, section 5) and compare's facts for each table.
import { nodeFiles } from "@ingestron/config";
import { compareEnvironments, generatedOutputs } from "@ingestron/core";
import { tableFacts } from "@ingestron/core/internal";
import { loadDefinitions } from "@ingestron/definitions";
import { packs } from "@ingestron/core";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { qualityProject, type Engine } from "./quality-projects.js";

const engines: Engine[] = ["databricks", "duckdb", "synapse", "landing"];

/** What `ingestron <args>` prints in the folder, and its exit code. */
function ingestron(folder: string, ...args: string[]): { code: number; output: string } {
  let output = "";
  const code = run([...args, "--definitions", ".", "--out", "build"], {
    cwd: folder,
    write: (text) => (output += text),
  });
  return { code, output };
}

/** The product's passport in dev, as plan writes it. */
function passport(folder: string): string {
  const products = generatedOutputs(nodeFiles(folder)).outputs.find(
    (output) => output.name === "products",
  );
  return products!.files["dev/crm.md"]!;
}

/** One section of a passport, from its heading to the next. */
function section(page: string, heading: string): string {
  const start = page.indexOf(`## ${heading}\n`);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

describe.each(engines)("a medallion project on %s", (engine) => {
  it("plans with errors, then warnings, then what is not applied on this platform", () => {
    const { code, output } = ingestron(qualityProject(engine), "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).toMatchSnapshot();
  });

  it("says in its passport what each check does, where results are, and what is cleansed", () => {
    expect(section(passport(qualityProject(engine)), "Quality")).toMatchSnapshot();
  });

  it("compares each table's cleansing, time zone, duties and quarantine", () => {
    const result = loadDefinitions(qualityProject(engine), {
      packs: [...packs],
      environment: "dev",
      environmentsTogether: true,
    });
    const facts = Object.fromEntries(
      result.model!.tables.map((table) => {
        const all = tableFacts(table);
        const shown = Object.entries(all).filter(([key]) =>
          /^(cleanse|timezone|does|quarantine)/.test(key),
        );
        return [table.name, Object.fromEntries(shown)];
      }),
    );
    expect(facts).toMatchSnapshot();
  });
});

describe("accepted warnings", () => {
  const accepting = (files: Record<string, string>) => {
    files["platform.yaml"] +=
      "accept:\n  - code: NOT_APPLIED\n    about: { table: customers_clean, feature: fail }\n    reason: CI runs checks.sql after each landing and pages the on-call team.\n";
  };

  it("leaves them out of plan's warnings, and counts them in one line", () => {
    const { code, output } = ingestron(qualityProject("synapse", accepting), "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).not.toContain("The fail action isn't applied");
    expect(output).toContain("\n1 accepted warning (platform.yaml)\n");
    const order = ["NOT_APPLIED", "1 accepted warning", "synapse → build/synapse"].map((text) =>
      output.indexOf(text),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("does not change what the passport says is not enforced", () => {
    const line = (folder: string) =>
      passport(folder)
        .split("\n")
        .find((text) => text.startsWith("- `recent`:"));
    const accepted = line(qualityProject("synapse", accepting));
    expect(accepted).toContain(
      "Not enforced: a view can't stop a load; checks.sql checks this rule and raises an error when it runs.",
    );
    expect(accepted).toBe(line(qualityProject("synapse")));
  });

  /** An entry for Synapse's notices, which are at a file; Data Factory's has none. */
  const atFiles = (files: Record<string, string>) => {
    files["platform.yaml"] +=
      'accept:\n  - code: PACK_NOTICE\n    about: { file: "transforms/**" }\n    reason: The pattern is checked in Databricks.\n';
  };

  it("accepts a pack's notice, which only building the files reports", () => {
    const pattern = (files: Record<string, string>) => {
      // A count over all rows with a pattern, which serverless T-SQL cannot count.
      const rule =
        "{ name: status, logicalType: string, quality: [{ type: library, metric: invalidValues, arguments: { pattern: '^[A-Z]+$' }, mustBeLessThan: 10 }] }";
      files["contracts/orders.yaml"] = files["contracts/orders.yaml"]!.replace(
        "{ name: status, logicalType: string }",
        () => rule,
      );
    };
    const shown = ingestron(qualityProject("synapse", pattern), "plan", "--no-diff");
    expect(shown.output).toContain(
      "synapse: warnings\ntransforms/orders_clean.yaml:1:1  warning  PACK_NOTICE",
    );
    const { code, output } = ingestron(
      qualityProject("synapse", (files) => (pattern(files), atFiles(files))),
      "plan",
      "--no-diff",
    );
    expect(code, output).toBe(0);
    expect(output).not.toContain("synapse: warnings");
    expect(output).not.toContain("ACCEPT_UNUSED");
    // Data Factory's notice is at no file, so the entry does not accept it.
    expect(output).toContain("adf: warnings\n(project)  warning  PACK_NOTICE");
    expect(output).toContain("\n1 accepted warning (platform.yaml)\n");
  });

  it("says an entry for a pack's notice is unused when no notice matches it", () => {
    const { code, output } = ingestron(qualityProject("synapse", atFiles), "plan", "--no-diff");
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^dev, prod: warnings\nplatform\.yaml:13:5 {2}warning {2}ACCEPT_UNUSED\n {2}The accept entry for PACK_NOTICE \(file "transforms\/\*\*"\) matches no warning in this run\.$/m,
    );
    expect(output).not.toContain("accepted warning");
  });
});

describe("compare", () => {
  it("shows a table's cleansing and time zone where environments differ", () => {
    const folder = qualityProject("databricks", (files) => {
      files["project.yaml"] = files["project.yaml"]!.replace(
        "  storage: abfss://landing@crmdev.dfs.core.windows.net\n",
        "  storage: abfss://landing@crmdev.dfs.core.windows.net\n  zone: Europe/London\n  case: lower\n",
      ).replace(
        "      storage: abfss://landing@crmprod.dfs.core.windows.net\n",
        "      storage: abfss://landing@crmprod.dfs.core.windows.net\n      zone: UTC\n      case: upper\n",
      );
      files["connections/crm.yaml"] = files["connections/crm.yaml"]!.replace(
        "timezone: Europe/London",
        "timezone: ${values.zone}",
      );
      files["transforms/customers_clean.yaml"] = files["transforms/customers_clean.yaml"]!.replace(
        "email: { case: lower }",
        'email: { case: "${values.case}" }',
      );
    });
    expect(compareEnvironments(nodeFiles(folder), "dev", "prod")).toMatchSnapshot();
  });
});
