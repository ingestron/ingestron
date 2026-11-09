// `ingestron standard list` and the standard command's arguments (spec/cli/kits.md,
// "Commands"). The catalogue is a file:// repository made in the test, or one that is not
// there: no network.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogue, ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

const unreachable = "Could not reach the catalogue; showing the kits installed with ingestron.\n";
const installedLines = [
  "databricks/lakehouse-streaming@2026-11-10  Streaming lakehouse on Databricks  (ga)\n",
  "duckdb/local-medallion@2026-11-10  Local medallion on DuckDB  (ga)\n",
].join("");

describe("standard list", () => {
  it("lists the installed kits, then the newer ones in a file:// catalogue", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-11-10" },
      { id: "duckdb/local-medallion", version: "2026-12-01" },
      { id: "duckdb/shop", version: "2026-10-01" },
    ]);
    const { code, output } = ingestron(temp(), "standard", "list");
    expect(code, output).toBe(0);
    expect(output).toBe(
      `${installedLines}duckdb/local-medallion@2026-12-01  (online)\nduckdb/shop@2026-10-01  (online)\n`,
    );
    const databricks = ingestron(temp(), "standard", "list", "--platform", "databricks");
    expect(databricks.output).toBe(
      "databricks/lakehouse-streaming@2026-11-10  Streaming lakehouse on Databricks  (ga)\n",
    );
  });

  it("lists the installed kits when the catalogue cannot be reached", () => {
    const { code, output } = ingestron(temp(), "standard", "list");
    expect(code).toBe(0);
    expect(output).toBe(`${unreachable}${installedLines}`);
  });

  it("reads the catalogue outside the user's folder, unless its URL is a relative path", () => {
    const cwd = temp();
    // A folder git refuses to work in: a git command run here fails.
    writeFileSync(join(cwd, ".git"), "gitdir: /no/such/repository\n");
    const url = catalogue([{ id: "duckdb/shop", version: "2026-10-01" }]);
    process.env.INGESTRON_STANDARDS_REPOSITORY = url;
    expect(ingestron(cwd, "standard", "list").output).toContain("duckdb/shop@2026-10-01  (online)");
    const beside = temp();
    execFileSync("git", ["clone", "--quiet", "--bare", url, join(beside, "standards.git")]);
    process.env.INGESTRON_STANDARDS_REPOSITORY = "standards.git";
    expect(ingestron(beside, "standard", "list").output).toContain(
      "duckdb/shop@2026-10-01  (online)",
    );
  });
});

describe("standard arguments", () => {
  it.each([
    [["standard"], "standard needs install <kit> or list."],
    [["standard", "frob"], 'Unknown command "standard frob".'],
    [["standard", "install"], "standard install needs a kit, such as duckdb/local-medallion."],
    [["standard", "list", "extra"], 'Unknown command "standard list extra".'],
    [["standard", "install", "a", "b"], 'Unknown command "standard install a b".'],
  ])("%j is a usage mistake", (args, mistake) => {
    const { code, output } = ingestron(temp(), ...args);
    expect(code).toBe(2);
    expect(output.startsWith(`${mistake}\n\nUsage: ingestron`)).toBe(true);
  });
});
