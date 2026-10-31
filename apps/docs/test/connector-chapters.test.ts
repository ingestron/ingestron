import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { connectorEntries, connectorIds } from "../lib/reference.js";

const root = join(process.cwd(), "content/docs/connectors");

for (const id of connectorIds()) {
  it(`${id} keeps its overview URL and provides chapters for every supported route`, () => {
    const folder = join(root, id);
    const overview = readFileSync(join(folder, "index.mdx"), "utf8");
    expect(overview).toContain(`<ConnectorFacts id="${id}"`);
    expect(overview).toContain('id="settings"');
    const meta = JSON.parse(readFileSync(join(folder, "meta.json"), "utf8"));
    expect(meta.root).not.toBe(true);
    expect(meta.defaultOpen).toBe(false);
    expect(meta.pages).toContain("index");
    expect(meta.pages).toContain("examples");
    const examples = readFileSync(join(folder, "examples.mdx"), "utf8");
    expect(examples).toContain(`<ExamplesList connector="${id}"`);
    expect(examples).toContain("<Example ");
    expect(overview).not.toContain("<ExamplesList");
    for (const { pack } of connectorEntries(id)) {
      for (const chapter of ["connection", "ingestion"]) {
        const name = `${pack}-${chapter}`;
        expect(meta.pages).toContain(name);
        expect(existsSync(join(folder, `${name}.mdx`))).toBe(true);
      }
      const connection = readFileSync(join(folder, `${pack}-connection.mdx`), "utf8");
      expect(connection.replace(/\s+/g, " ")).toContain(
        `<ConnectorSettings id="${id}" pack="${pack}"`,
      );
      expect(connection.replace(/\s+/g, " ")).toContain("<Example ");
      const ingestion = readFileSync(join(folder, `${pack}-ingestion.mdx`), "utf8");
      expect(ingestion).toContain("<Example ");
      expect(ingestion).not.toContain("Ingestion and examples");
      expect(ingestion).not.toContain("<ExamplesList");
      expect(ingestion).not.toContain("## Generate and inspect");
    }
  });
}
