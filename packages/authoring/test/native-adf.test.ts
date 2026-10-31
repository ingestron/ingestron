import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recipesFolder } from "@ingestron/pack-adf";
import { expect, it } from "vitest";
import { openProject } from "../src/project.js";
import { skeletons, plainText } from "../src/skeletons.js";
import { placeAt } from "../src/context.js";
import { connectorOf, fieldAt } from "../src/fields.js";
const folder = recipesFolder;
it("offers a SQL connection skeleton with only the default authentication fields", () => {
  const project = openProject(folder, new Map());
  const entry = skeletons(project, "connections/new.yaml").find(
    (item) => item.label === "Connection: SQL Server (adf)",
  )!;
  const snippet = plainText(entry.snippet!);
  expect(snippet).toContain("password:");
  expect(snippet).not.toContain("client_secret:");
  expect(snippet).not.toContain("credential:");
});
it("uses the resolved ADF route for shared connector metadata", () => {
  const file = "connections/salesforce.yaml";
  const text = readFileSync(join(folder, file), "utf8").replace(
    "connectivity: private",
    "connectivity: public",
  );
  const project = openProject(folder, new Map([[join(folder, file), text]]));
  const place = placeAt(file, text, text.length);
  expect(connectorOf(place, project, "dev")?.method).toBe("adf-table");
  expect(fieldAt(project, place, ["settings", "client_secret"], "dev")?.description).toContain(
    "secret",
  );
});
it("describes optional numeric ports without making them required", () => {
  const file = "connections/postgresql.yaml";
  const text = readFileSync(join(folder, file), "utf8");
  const project = openProject(folder, new Map());
  const field = fieldAt(project, placeAt(file, text, text.length), ["settings", "port"], "dev");
  expect(field?.type).toBe("number");
  expect(field?.required).toBe(false);
});
