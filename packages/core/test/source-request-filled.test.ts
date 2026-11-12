// The source request's placeholders: the day a table was captured, {object} where the text is
// shown once, and an input's default (spec/cli/sources.md, sections 1 and 4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileSource } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { sourceRequestFor } from "../src/internal.js";
import { expected, folder, project, recipesOf } from "./source-request-fixture.js";

describe("sourceRequestFor: what is filled in", () => {
  const request = (files: FileSource, environment: string | undefined, connection?: string) =>
    sourceRequestFor(files, environment, {
      envvars: {},
      recipes: recipesOf(files),
      ...(connection !== undefined && { connection }),
    });

  it("gives the day a table was captured, and no day when `at` does not start with one", () => {
    const landing = readFileSync(join(folder, "sources/landing.yaml"), "utf8");
    const text = (at: string) =>
      request(
        project({ "sources/landing.yaml": landing.replace("at: 2026-11-11T09:30:00Z", at) }),
        "dev",
        "landing",
      ).text;
    expect(text("at: 2026-11-11T09:30:00Z")).toContain(
      "- `shipments`: sample, captured 2026-11-11\n",
    );
    expect(text("at: 2026-11-11")).toContain("- `shipments`: sample, captured 2026-11-11\n");
    for (const at of ["yesterday", '"11/11/2026"', '"Thu Nov 11 2026"', '"2026-1-1x"'])
      expect(text(`at: ${at}`), at).toContain("- `shipments`: sample\n");
  });

  it("lists {object} under Fill in before use when the text outside the list holds it", () => {
    const own = readFileSync(join(folder, "../recipes/salesforce.yaml"), "utf8").replace(
      "how: With curl or Postman, using a bearer token for the org.",
      'how: "Save each response as sources/{connection}/{object}.json."',
    );
    const { text } = request(project({ "recipes/salesforce.yaml": own }), "dev", "crm");
    // The items fill {object} for each table; the sentence after them is shown once, so it keeps it.
    expect(text).toContain("saved as `sources/crm/Account.json`\n- ");
    expect(text).toContain("Save each response as sources/crm/{object}.json.");
    expect(text).toContain(
      "Fill in before use:\n\n- `{instanceUrl}`: The org's base URL, such as https://example.my.salesforce.com\n- `{object}`: a table to describe, as a flow's object names it; do this once for each table\n",
    );
  });

  /** The fixture's Salesforce recipe, with `edits` made to its text, as the project's own. */
  const salesforce = (...edits: [string, string][]) => {
    let own = readFileSync(join(folder, "../recipes/salesforce.yaml"), "utf8");
    for (const [from, to] of edits) {
      if (!own.includes(from)) throw new Error(`"${from}" is not in the recipe.`);
      own = own.replace(from, to);
    }
    return own;
  };
  const withVersion = salesforce(
    ["inputs:\n", 'inputs:\n  version: { description: "The API version", default: "62.0" }\n'],
    ["/v62.0/", "/v{version}/"],
  );

  it("uses an input's default when the connection gives no value, and the value when it does", () => {
    const own = project({ "recipes/salesforce.yaml": withVersion });
    const { text } = request(own, "dev", "crm");
    expect(text).toContain("- `{instanceUrl}/services/data/v62.0/sobjects/Account/describe`");
    expect(text).not.toContain("{version}");
    const given = project({
      "recipes/salesforce.yaml": withVersion,
      "connections/crm.yaml": `${expected("connections/crm.yaml")}metadata: { from: salesforce, with: { version: "63.0" } }\n`,
    });
    const again = request(given, "dev", "crm").text;
    expect(again).toContain("/services/data/v63.0/sobjects/Account/describe`");
    expect(again).not.toContain("v62.0");
  });

  it("falls back to the default for a value that holds an unset reference", () => {
    const given = project({
      "recipes/salesforce.yaml": withVersion,
      "connections/crm.yaml": `${expected("connections/crm.yaml")}metadata: { from: salesforce, with: { version: "\${envvar:NO_SUCH_VERSION}" } }\n`,
    });
    const { text } = request(given, "dev", "crm");
    expect(text).toContain("/services/data/v62.0/sobjects/Account/describe`");
  });

  it("fills {object} in an input's default for each table, and keeps it where the text is shown once", () => {
    const own = salesforce(
      [
        "inputs:\n",
        'inputs:\n  target: { description: "The name to call", default: "{object}-v1" }\n',
      ],
      ["/sobjects/{object}/describe", "/sobjects/{target}/describe"],
      ["how: With curl or Postman, using a bearer token for the org.", "how: Call {target}."],
    );
    const { text } = request(project({ "recipes/salesforce.yaml": own }), "dev", "crm");
    expect(text).toContain("/sobjects/Account-v1/describe`, saved as `sources/crm/Account.json`");
    expect(text).toContain(
      "/sobjects/Opportunity-v1/describe`, saved as `sources/crm/Opportunity.json`",
    );
    // The sentence is shown once, so it keeps {object}, which is then listed to fill in.
    expect(text).toContain("Call {object}-v1.");
    expect(text).toContain("- `{object}`: a table to describe");
    expect(text).not.toContain("{target}");
  });

  it("does not list {object} when only the list holds it", () => {
    expect(request(project(), "dev", "crm").text).not.toContain("- `{object}`");
  });
});
