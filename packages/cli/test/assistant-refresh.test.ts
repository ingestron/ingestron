// `plan` and `apply` keep the project guide current, and `check` never looks at it
// (spec/cli/assistants.md, section 6).
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateAll, packs } from "@ingestron/core";
import { nodeFiles } from "@ingestron/config";
import { generate } from "../src/commands/generate.js";
import { readArgs } from "../src/terminal/index.js";
import { run } from "../src/index.js";
import { ingestron, project, read } from "./assistant-helpers.js";

const stale = "AGENTS.md: the Ingestron section would change";
const edited =
  "AGENTS.md: the Ingestron section was edited by hand, so apply will not update it. Move your notes outside it, or delete both markers to keep it as your own.";

/** A project whose guide was written, then whose environments changed, so the section is stale. */
function staleProject(more: Record<string, string> = {}): string {
  const folder = project(more);
  expect(ingestron(folder, ["assistant", "add", "agents"]).code).toBe(0);
  writeFileSync(
    join(folder, "project.yaml"),
    "id: local\nenvironments: { dev: {}, prod: {} }\nimports: ['*.yaml']\n",
  );
  return folder;
}

describe("plan and apply keep the guide current", () => {
  it("plan reports a stale section and never writes the file", () => {
    const folder = staleProject();
    const before = readFileSync(join(folder, "AGENTS.md"));
    const past = new Date("2020-01-01T00:00:00Z");
    utimesSync(join(folder, "AGENTS.md"), past, past);
    const { code, output } = ingestron(folder, ["plan"]);
    expect(code).toBe(0);
    expect(output.split("\n").filter((line) => line.startsWith("AGENTS.md"))).toEqual([stale]);
    expect(output.trimEnd().split("\n").at(-1)).toBe(stale);
    expect(readFileSync(join(folder, "AGENTS.md")).equals(before)).toBe(true);
    expect(lstatSync(join(folder, "AGENTS.md")).mtimeMs).toBe(past.getTime());
  });

  it("apply rewrites a stale section and says so", () => {
    const folder = staleProject();
    const { code, output } = ingestron(folder, ["apply"]);
    expect(code).toBe(0);
    expect(output.trimEnd().split("\n").at(-1)).toBe("AGENTS.md: updated the Ingestron section");
    expect(read(folder, "AGENTS.md")).toContain("Environments: `dev`, `prod`");
    expect(ingestron(folder, ["apply"]).output).not.toContain("AGENTS.md");
    expect(ingestron(folder, ["plan"]).output).not.toContain("AGENTS.md");
  });

  it("apply with a definitions error still refreshes the section, and exits 1", () => {
    const folder = staleProject({
      "flow.yaml":
        "apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: nowhere\ntables: { orders: { object: orders } }\n",
    });
    const { code, output } = ingestron(folder, ["apply"]);
    expect(code).toBe(1);
    expect(output.trimEnd().split("\n").at(-1)).toBe("AGENTS.md: updated the Ingestron section");
    expect(read(folder, "AGENTS.md")).toContain("Environments: `dev`, `prod`");
    expect(ingestron(folder, ["plan"]).code).toBe(1);
  });

  it("plan with a definitions error reports a stale section, and exits 1", () => {
    const folder = staleProject({
      "flow.yaml":
        "apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: nowhere\ntables: { orders: { object: orders } }\n",
    });
    const { code, output } = ingestron(folder, ["plan"]);
    expect(code).toBe(1);
    expect(output.trimEnd().split("\n").at(-1)).toBe(stale);
  });

  it("an apply from the extension's path refreshes the guide", () => {
    const folder = staleProject();
    let output = "";
    const code = run(["apply", "--definitions", "."], { cwd: folder, write: (t) => (output += t) });
    expect(code).toBe(0);
    expect(output).toContain("AGENTS.md: updated the Ingestron section");
  });

  it("reports an edited section in plan and apply and leaves the file", () => {
    const folder = staleProject();
    const text = read(folder, "AGENTS.md").replace("Rules", "My rules");
    writeFileSync(join(folder, "AGENTS.md"), text);
    expect(ingestron(folder, ["plan"]).output.trimEnd().split("\n").at(-1)).toBe(edited);
    const applied = ingestron(folder, ["apply"]);
    expect(applied.code).toBe(0);
    expect(applied.output.trimEnd().split("\n").at(-1)).toBe(
      "AGENTS.md: the Ingestron section was edited by hand, so it was not updated. Move your notes outside it, or delete both markers to keep it as your own.",
    );
    expect(read(folder, "AGENTS.md")).toBe(text);
  });

  it("says nothing when there is no AGENTS.md, a file of the user's, or a current section", () => {
    const none = project();
    expect(ingestron(none, ["apply"]).output).not.toContain("AGENTS.md");
    expect(readdirSync(none)).not.toContain("AGENTS.md");
    const mine = project({ "AGENTS.md": "# Mine\n" });
    expect(ingestron(mine, ["apply"]).output).not.toContain("AGENTS.md");
    expect(read(mine, "AGENTS.md")).toBe("# Mine\n");
    const current = project();
    ingestron(current, ["assistant", "add", "agents"]);
    const crlf = read(current, "AGENTS.md").replaceAll("\n", "\r\n");
    writeFileSync(join(current, "AGENTS.md"), crlf);
    expect(ingestron(current, ["apply"]).output).not.toContain("AGENTS.md");
    expect(read(current, "AGENTS.md")).toBe(crlf);
  });

  it("says nothing when there is no guide, and never changes the exit code", () => {
    const folder = staleProject();
    writeFileSync(join(folder, "project.yaml"), "environments: {}\n");
    for (const command of ["plan", "apply"]) {
      const { output } = ingestron(folder, [command]);
      expect(output).not.toContain("AGENTS.md");
      expect(output).not.toContain("No guide");
    }
  });

  it("never writes through a link", () => {
    const folder = staleProject();
    const text = read(folder, "AGENTS.md");
    writeFileSync(join(folder, "elsewhere.md"), text);
    rmSync(join(folder, "AGENTS.md"));
    symlinkSync(join(folder, "elsewhere.md"), join(folder, "AGENTS.md"));
    const { output } = ingestron(folder, ["apply"]);
    expect(output).not.toContain("AGENTS.md");
    expect(read(folder, "elsewhere.md")).toBe(text);
  });

  it("is a folder: nothing is said or written", () => {
    const folder = staleProject();
    rmSync(join(folder, "AGENTS.md"));
    mkdirSync(join(folder, "AGENTS.md"));
    const { code, output } = ingestron(folder, ["apply"]);
    expect(code).toBe(0);
    expect(output).not.toContain("AGENTS.md");
  });

  it("check never looks at it", () => {
    const folder = staleProject();
    ingestron(folder, ["apply", "--definitions", "."]);
    writeFileSync(join(folder, "AGENTS.md"), read(folder, "AGENTS.md").replace("Rules", "Mine"));
    const { code, output } = ingestron(folder, ["check"]);
    expect(code).toBe(0);
    expect(output).not.toContain("AGENTS.md");
  });

  it("generate with a prepared generation prints no guide line", () => {
    const folder = staleProject();
    const prepared = generateAll(nodeFiles(folder), packs, process.env, "warning");
    const options = readArgs(["plan", "--definitions", ".", "--out", "build"]);
    if (options === "help" || "mistake" in options) throw new Error("usage");
    let output = "";
    generate(options, { cwd: folder, write: (t) => (output += t) }, packs, prepared);
    expect(output).not.toContain("AGENTS.md");
  });
});
