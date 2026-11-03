// Annotations never show what came from .env or the host environment.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations.js";
import { openProject } from "../src/project.js";
import { cleanEnvironment, fromFile, fromHost, made, unset } from "./env-workspace.js";

cleanEnvironment();

describe("annotations and variables", () => {
  const connection = (folder: string) =>
    readFileSync(join(folder, "connections/shop.yaml"), "utf8");

  it("never show a value that came from .env", () => {
    const folder = made(fromFile, {
      ".env": `${fromFile}=SECRETFILEVALUE\n`,
      ".env.dev": `${fromFile}=SECRETDEVVALUE\n`,
    });
    const found = annotationsIn(
      openProject(folder, new Map()),
      "connections/shop.yaml",
      connection(folder),
      "dev",
    );
    expect(JSON.stringify(found)).not.toContain("SECRET");
  });

  it("never show a value that came from the host environment", () => {
    process.env[fromHost] = "SECRETHOSTVALUE";
    const folder = made(fromHost);
    const found = annotationsIn(
      openProject(folder, new Map()),
      "connections/shop.yaml",
      connection(folder),
      "dev",
    );
    expect(JSON.stringify(found)).not.toContain("SECRET");
  });

  it("never show a value that came from an unsaved .env", () => {
    const folder = made(fromFile);
    const unsaved = new Map([[join(folder, ".env.dev"), `${fromFile}=SECRETUNSAVED\n`]]);
    const found = annotationsIn(
      openProject(folder, unsaved),
      "connections/shop.yaml",
      connection(folder),
      "dev",
    );
    expect(JSON.stringify(found)).not.toContain("SECRET");
  });

  it("still show for a project with an unset variable", () => {
    const folder = made(unset);
    writeFileSync(join(folder, "flows/note.txt"), "from a file");
    const text =
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\nsource: shop\ndescription: ${file:note.txt}\ntables:\n  orders: { object: orders, contract: shop.orders }\n";
    const edited = new Map([[join(folder, "flows/orders.yaml"), text]]);
    const project = openProject(folder, edited);
    // Only the loader reads a file, so this needs the project to load around the unset variable.
    const found = annotationsIn(project, "flows/orders.yaml", text, "dev");
    expect(found).toContainEqual(expect.objectContaining({ label: "= from a file" }));
  });
});
