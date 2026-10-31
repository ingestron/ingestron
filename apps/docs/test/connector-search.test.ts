import { expect, it } from "vitest";
import { extraStructure, searchTitle } from "../lib/search.js";

it("identifies example searches by connector without assigning a platform", () => {
  expect(searchTitle("/docs/connectors/sqlserver/examples", "Examples")).toBe(
    "SQL Server: Examples",
  );
});

it("indexes connection fields at their real chapter anchors", () => {
  const data = extraStructure("/docs/connectors/rest/adf-connection");
  expect(data.contents).toContainEqual(
    expect.objectContaining({
      heading: "connection-client_secret",
      content: expect.stringContaining("client_secret"),
    }),
  );
  expect(data.headings.map((heading) => heading.id)).toContain("connection-client_secret");
});
it("keeps Databricks connection searches separate from ADF credentials", () => {
  const data = extraStructure("/docs/connectors/sqlserver/databricks-connection");
  expect(data.contents.some((item) => item.content.includes("uc_connection"))).toBe(true);
  expect(data.contents.some((item) => item.content.includes("host_name_in_certificate"))).toBe(
    false,
  );
});

it("indexes only the ingestion options rendered for Microsoft 365", () => {
  const data = extraStructure("/docs/connectors/microsoft-365/adf-ingestion");
  expect(data.contents).toContainEqual(
    expect.objectContaining({
      heading: "adf-table-source-options-allowed-groups",
      content: expect.stringContaining("allowed_groups"),
    }),
  );
  expect(data.contents.some((item) => item.content.includes("pagination"))).toBe(false);
});
