// The source request's placeholders that cannot be filled (spec/cli/sources.md, sections 1 and 4).
import type { FileSource } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { sourceRequestFor } from "../src/internal.js";
import { expected, project, recipesOf } from "./source-request-fixture.js";

const request = (files: FileSource, connection?: string) =>
  sourceRequestFor(files, "dev", {
    envvars: {},
    recipes: recipesOf(files),
    ...(connection !== undefined && { connection }),
  });

describe("sourceRequestFor: placeholders left to fill in", () => {
  it("keeps {object} in the block, the save line and the import for a connection with no flow tables", () => {
    const files = project({
      "connections/support.yaml":
        "apiVersion: ingestron.io/v1\nkind: Connection\nid: support\nconnector: salesforce\nconnectivity: public\nsettings:\n  uc_connection: support_connection\n",
    });
    const { text, resolved } = request(files, "support");
    expect(resolved).toBe(true);
    expect(text).toContain(
      [
        "Call this URL:",
        "```text\n{instanceUrl}/services/data/v62.0/sobjects/{object}/describe\n```",
        "With curl or Postman, using a bearer token for the org.",
        "Fill in before use:",
        "- `{instanceUrl}`: The org's base URL, such as https://example.my.salesforce.com\n- `{object}`: a table to describe, as a flow's object names it; do this once for each table",
        "Save the response as `sources/support/{object}.json`.",
        "### If that cannot be done",
      ].join("\n\n"),
    );
    expect(text).toContain(
      "```sh\ningestron source import support sources/support/{object}.json --env dev\n```",
    );
  });

  it("treats an input whose value holds an unset reference as not given", () => {
    const files = project({
      "connections/erp.yaml": expected("connections/erp.yaml").replace(
        "${values.erp_db}",
        "${envvar:ERP_DATABASE}",
      ),
      "recipes/sqlserver.yaml": expected("recipes/sqlserver.yaml").replace(
        "Someone who can query the catalog views of the source database",
        "Someone who can query {database}",
      ),
    });
    const { text, resolved } = request(files, "erp");
    expect(resolved).toBe(true);
    expect(text).toContain("- Who: Someone who can query {database}\n");
    expect(text).toContain(
      "Fill in before use:\n\n- `{database}`: The database whose tables are loaded, such as ERP\n\nSave the result",
    );
    expect(text).not.toContain("ERP_DATABASE");
  });
});
