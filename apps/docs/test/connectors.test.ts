// Every connector a pack reads has a page and at least one example.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listExamples } from "../lib/examples.js";
import { connectorIds } from "../lib/reference.js";

const catalogueExamples = listExamples();
const pages = join(process.cwd(), "content/docs/connectors");

describe("connector coverage", () => {
  for (const id of connectorIds()) {
    it(`${id} has a page and an example`, () => {
      expect(
        existsSync(join(pages, id, "index.mdx")),
        `content/docs/connectors/${id}/index.mdx`,
      ).toBe(true);
      const examples = catalogueExamples.filter((example) => example.facts.connectors.includes(id));
      expect(examples.length, `a sample that reads ${id}`).toBeGreaterThan(0);
    });
  }
});
