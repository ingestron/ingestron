// Reference data comes from the packages, so pages match the code.
import { describe, expect, it } from "vitest";
import { connectorEntries, connectorIds, documentFields, settingRows } from "../lib/reference.js";

describe("reference data", () => {
  it("lists settings with defaults, values with meanings, and where they go", () => {
    const mode = settingRows("databricks", "lakeflow-connect").find((row) => row.name === "mode");
    expect(mode).toMatchObject({
      default: "upsert",
      placement: "definition",
      docs: "/docs/reference/packs/databricks#lakeflow-connect-mode",
    });
    expect(mode?.values?.map((item) => item.value)).toEqual(["append", "upsert", "history"]);
  });

  it("marks required settings", () => {
    const landing = settingRows("adf", "adf-copy").find((row) => row.name === "landing");
    expect(landing).toMatchObject({ required: true, placement: "platform" });
  });

  it("counts a connector read by two packs once and shows both", () => {
    expect(connectorIds()).toHaveLength(77);
    expect(new Set(connectorIds()).size).toBe(77);
    expect(connectorIds()).toEqual(
      expect.arrayContaining([
        "files",
        "kafka",
        "salesforce",
        "sqlserver",
        "postgresql",
        "microsoft-365",
      ]),
    );
    expect(connectorEntries("sqlserver").map((entry) => entry.pack)).toEqual(["databricks", "adf"]);
  });

  it("lists a document's fields at every depth from its schema", () => {
    expect(documentFields("Flow").map((row) => row.name)).toContain("tables");
    const kind = documentFields("Flow").find((row) => row.name === "kind");
    expect(kind?.type).toBe("Flow");
    const nested = documentFields("Flow").map((row) => row.path.join("."));
    expect(nested).toContain("tables.*.expectations.*.check");
  });
});
