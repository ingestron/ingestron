// Every built-in template and every installed kit gets a small, true guide.
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { builtInTemplates, installedKits } from "@ingestron/core";
import { ingestron, read, temp } from "./assistant-helpers.js";

describe("every template and installed kit", () => {
  const sections = [
    ...builtInTemplates().map((template) => ({
      label: `template ${template.name}`,
      args: ["--template", template.name],
    })),
    ...installedKits().map((kit) => ({
      label: `kit ${kit.id}@${kit.version}`,
      args: ["--kit", `${kit.id}@${kit.version}`],
    })),
  ];
  it("has some", () => expect(sections.length).toBeGreaterThan(2));
  for (const { label, args } of sections)
    it(`${label}: a small guide that names the project and each pack, and plan stays quiet`, () => {
      const cwd = temp();
      const made = ingestron(cwd, ["init", "app", ...args, "--assistant", "agents", "--yes"]);
      expect(made.code, made.output).toBe(0);
      const folder = join(cwd, "app");
      const text = read(folder, "AGENTS.md");
      expect(Buffer.byteLength(text)).toBeLessThan(6144);
      const id = (parse(read(folder, "project.yaml")) as { id: string }).id;
      expect(text).toContain(`Project \`${id}\``);
      const standard = parse(read(folder, "standard.yaml")) as { packs: string[] };
      for (const pack of standard.packs) expect(text).toContain(`\`${pack}\``);
      const plan = ingestron(cwd, ["plan", "--definitions", "app", "--out", "app/build"]);
      expect(plan.output).not.toContain("AGENTS.md");
    });
});
