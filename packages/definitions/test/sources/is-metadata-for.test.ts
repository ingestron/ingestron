// Which source metadata document is a connection's: the first, in the order given, written for it.
import { describe, expect, it } from "vitest";
import { isMetadataFor } from "../../src/index.js";

describe("isMetadataFor", () => {
  const documents = [
    { connection: "other" },
    { connection: "erp", id: "first" },
    { connection: "erp" },
  ];

  it("picks the first document written for the connection", () => {
    expect(documents.find((document) => isMetadataFor(document, "erp"))).toMatchObject({
      id: "first",
    });
  });

  it("matches the connection's id exactly, and never a document that names none", () => {
    expect(isMetadataFor({ connection: "ERP" }, "erp")).toBe(false);
    expect(isMetadataFor({}, "erp")).toBe(false);
    expect(isMetadataFor({ connection: 7 }, "7")).toBe(false);
  });
});
