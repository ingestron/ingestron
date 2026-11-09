// ingestron request and environment variables: unset ones do not stop it, and its
// "Values to provide" says where each is used and set, never its value (spec/cli/request.md).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { platformRequest } from "@ingestron/core";
import {
  cleanUp,
  folderValue,
  ingestron,
  section,
  withVariables,
  workspace,
} from "./request-fixtures.js";

cleanUp();

describe("ingestron request with environment variables", () => {
  it("lists each variable after the title, where it is used and where it is set, and exits 0", () => {
    const { code, output } = ingestron(withVariables(), "request", "--env", "dev");
    expect(code).toBe(0);
    expect(output).toMatch(/^# Platform request: shop \(dev\)\n\n## Values to provide\n/);
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "These values come from environment variables. The pipeline that deploys the files supplies each one for each environment, under the names given; on your own computer, `.env.dev` (kept out of Git) is read only by a pack that reads them when generating, such as DuckDB.",
    );
    expect(values).toContain(
      "- `INGT_REQ_LANDING`, used for `values.landing` in `project.yaml`: not set yet.",
    );
    expect(values).toContain(
      "- `INGT_REQ_FOLDER`, used for `settings.path` in `connections/shop.yaml`: set in `.env.dev`.",
    );
    expect(values).not.toContain(folderValue);
  });

  it("says a variable set where Ingestron runs is set there, without its value", () => {
    process.env.INGT_REQ_LANDING = "/Volumes/synthetic/landing";
    const { output } = ingestron(withVariables(), "request", "--env", "dev");
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "- `INGT_REQ_LANDING`, used for `values.landing` in `project.yaml`: set in the environment Ingestron runs in.",
    );
    expect(values).not.toContain("/Volumes/synthetic/landing");
    expect(values).not.toContain("Until a variable is set");
  });

  it("shows an unset value elsewhere as its reference, and says so", () => {
    const { output } = ingestron(withVariables(), "request", "--env", "dev");
    expect(section(output, "Values to provide")).toContain(
      "Until a variable is set, this request shows it as `${envvar:NAME}`",
    );
    expect(output).toContain(`\`\${envvar:INGT_REQ_LANDING}/${folderValue}\``);
  });

  it("still gives the short note, and exits 1, when the definitions have a real error", () => {
    const folder = withVariables();
    writeFileSync(
      join(folder, "flows/orders.yaml"),
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\nsource: shop\n" +
        "tables:\n  orders: { object: orders, contract: shop.missing }\n",
    );
    const { code, output } = ingestron(folder, "request", "--env", "dev");
    expect(code).toBe(1);
    expect(output).toBe(
      "# Platform request (dev)\n\nThe definitions have problems; fix them first.\n",
    );
  });

  it("has no such section when the definitions read no environment variable", () => {
    const { code, output } = ingestron(workspace(), "request", "--env", "dev");
    expect(code).toBe(0);
    expect(output).not.toContain("Values to provide");
    expect(output).not.toContain("envvar");
  });

  it("gives the editor's command the same text", () => {
    const folder = withVariables();
    const { output } = ingestron(folder, "request", "--env", "dev");
    expect(platformRequest(nodeFiles(folder), "dev")).toBe(output);
  });
});
