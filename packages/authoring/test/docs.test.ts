// The documentation links the editor shows.
import { describe, expect, it } from "vitest";
import { codeDocs, docsLinks, docsUrl } from "../src/docs.js";

describe("docs links", () => {
  it("link a problem code to its entry on the errors page", () => {
    expect(codeDocs("BAD_SETTING")).toBe("/docs/reference/errors#BAD_SETTING");
    expect(codeDocs("BROKEN_LINK")).toBe("/docs/reference/errors#BROKEN_LINK");
    expect(codeDocs("TEMPLATE")).toBeUndefined();
  });

  it("list every link the editor can show: fields, settings and codes", () => {
    const links = docsLinks();
    expect(links).toContain("/docs/reference/documents#flow-tables-item-object");
    expect(links).toContain("/docs/reference/packs/adf#adf-copy-mode");
    expect(links).toContain("/docs/reference/errors#SCHEMA");
    expect(new Set(links).size).toBe(links.length);
  });

  it("joins a link to the site's address", () => {
    expect(docsUrl("https://docs.example.com/", "/docs/reference/errors#SCHEMA")).toBe(
      "https://docs.example.com/docs/reference/errors#SCHEMA",
    );
  });
});
