// The source request when something stops it (spec/cli/sources.md, section 4, "Resolving").
import { describe, expect, it } from "vitest";
import { sourceRequestFor } from "../src/internal.js";
import { expected, project, recipesOf } from "./source-request-fixture.js";

describe("sourceRequestFor: problems", () => {
  const problems = (text: string, lines: string[]) =>
    expect(text).toBe(
      `# Source request (dev)\n\nThe definitions have problems; fix them first:\n\n\`\`\`text\n${lines.join("\n")}\n\`\`\`\n`,
    );

  it("shows a recipe that breaks a rule, even one no connection uses", () => {
    const files = project({ "recipes/unused.yaml": "id: other\n" });
    const result = sourceRequestFor(files, "dev", { envvars: {} });
    expect(result.resolved).toBe(false);
    expect(result.text).toMatch(/```text\nrecipes\/unused\.yaml: .+\n```\n$/);
  });

  it("shows a recipe that does not exist and an input the recipe does not take", () => {
    const files = project({
      "connections/crm.yaml": expected("connections/crm.yaml").concat(
        "metadata: { from: salesforce-api }\n",
      ),
      "connections/erp.yaml": expected("connections/erp.yaml").replace(
        "    database:",
        "    server: erp.example.com\n    database:",
      ),
    });
    const result = sourceRequestFor(files, "dev", { envvars: {}, recipes: recipesOf(files) });
    expect(result.resolved).toBe(false);
    problems(result.text, [
      'The connection "crm" names the recipe "salesforce-api", which does not exist. Recipes: files-mapped, lookups, odata, salesforce, sample, sqlserver.',
      'The recipe "sqlserver" takes no input "server". Its inputs: database.',
    ]);
  });

  it("writes an unknown connection after the definitions' errors", () => {
    const files = project({
      "flows/erp.yaml": null,
      "flows/crm.yaml": null,
      "flows/landing.yaml": null,
    });
    const { text } = sourceRequestFor(files, "dev", {
      envvars: {},
      recipes: recipesOf(files),
      connection: "nope",
    });
    problems(text, [
      "(project)  error  PACK_CHECK",
      "  there is nothing to generate: add a flow or a transform.",
      '"nope" is not a connection of the project. Connections: crm, erp, landing.',
    ]);
  });

  it("shows only the loading errors when the project cannot be loaded", () => {
    const files = project({ "flows/landing.yaml": "kind: Flow\n" });
    const { text, resolved } = sourceRequestFor(files, "dev", {
      envvars: {},
      recipes: recipesOf(files),
      connection: "nope",
    });
    expect(resolved).toBe(false);
    expect(text).toMatch(/```text\nflows\/landing\.yaml:\d+:\d+  error  /);
    expect(text).not.toContain('"nope"');
  });

  it("is stopped by an error the metadata does not settle", () => {
    const files = project({
      "flows/crm.yaml": expected("flows/crm.yaml").replace(
        "accounts: { object: Account }",
        "accounts: { object: Account, contract: missing }",
      ),
    });
    const { text, resolved } = sourceRequestFor(files, "dev", {
      envvars: {},
      recipes: recipesOf(files),
    });
    expect(resolved).toBe(false);
    expect(text).toContain("error  BROKEN_LINK");
    // The tables without columns, which the request settles, are not listed.
    expect(text).not.toContain("TABLE_NO_COLUMNS");
  });
});
