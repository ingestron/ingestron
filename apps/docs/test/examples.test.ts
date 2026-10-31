// The worked examples: front matter for listing, and safe reads of their files.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exampleFiles, listExamples, readExampleFile } from "../lib/examples.js";
import { connectorIds } from "../lib/reference.js";

describe("examples", () => {
  it("includes every connector example preview in its downloadable archive", () => {
    const archives = new Map(
      listExamples().map((example) => [example.name, exampleFiles(example.name)]),
    );
    for (const id of connectorIds()) {
      const page = readFileSync(
        join(process.cwd(), "content/docs/connectors", id, "examples.mdx"),
        "utf8",
      );
      for (const [, name, file] of page.matchAll(/<Example name="([^"]+)" file="([^"]+)"/g)) {
        expect(archives.get(name!), `${id}: ${name}/${file}`).toContain(file);
      }
    }
  });
  it("lists every sample with a title, summary and the facts found by resolving it", () => {
    const examples = listExamples();
    expect(examples).toHaveLength(18);
    for (const example of examples) {
      expect(example.title, example.name).not.toBe("");
      expect(example.summary, example.name).toMatch(/\.$/);
      expect(example.facts.packs.length, example.name).toBeGreaterThan(0);
    }
  });

  it("reads a real file", () => {
    expect(readExampleFile("minimal", "project.yaml")).toContain("environments");
  });

  it("names the example and file when the file is missing", () => {
    expect(() => readExampleFile("minimal", "nope.yaml")).toThrow(
      'Example "minimal" has no file "nope.yaml".',
    );
  });

  it("refuses a path outside the example", () => {
    expect(() => readExampleFile("minimal", "../../guides/environments/project.yaml")).toThrow(
      'Example "minimal": "../../guides/environments/project.yaml" is outside the example.',
    );
  });
});
