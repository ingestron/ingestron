// Every CLI command is explained in a hand-written page, not only listed in
// the generated reference, so code and docs change together.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { commands } from "@ingestron/cli";
import { describe, expect, it } from "vitest";

const content = join(process.cwd(), "content/docs");
const guides = pages(content).filter((path) => !path.includes("/reference/"));
const text = guides.map((path) => readFileSync(path, "utf8")).join("\n");

describe("command docs", () => {
  for (const { name } of commands) {
    it(`ingestron ${name} is explained in a guide`, () => {
      expect(text).toContain(`ingestron ${name}`);
    });
  }
});

function pages(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) return pages(path);
    return path.endsWith(".mdx") ? [path] : [];
  });
}

describe("VS Code command docs", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "../vscode/package.json"), "utf8"),
  ) as { contributes: { commands: { title: string; category: string }[] } };
  for (const { title, category } of manifest.contributes.commands) {
    it(`${category}: ${title} is explained in a guide`, () => {
      expect(text).toContain(`${category}: ${title}`);
    });
  }
});
