// Planning and writing a new project from a template.
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { projectId, scaffoldFiles, writeScaffold } from "../src/scaffold.js";
import { builtInTemplates, readTemplate } from "../src/templates.js";

const template = (name: string) => builtInTemplates().find((item) => item.name === name)!;
const temp = () => mkdtempSync(join(tmpdir(), "ingestron-scaffold-test-"));

describe("scaffoldFiles", () => {
  const files = scaffoldFiles(template("minimal"), {
    name: "shop",
    environments: ["dev", "test"],
    values: { landing: "/Volumes/x" },
  });

  it("copies the template's files, without template.yaml or generated output", () => {
    expect(files["connections/shop.yaml"]?.toString()).toContain("path: ${values.landing}");
    expect(Object.keys(files).some((path) => path.startsWith("build/"))).toBe(false);
    expect(files["template.yaml"]).toBeUndefined();
  });

  it("writes the name, environments and answers into project.yaml, keeping its comments", () => {
    const text = files["project.yaml"]!.toString();
    expect(text.startsWith("# The smallest project")).toBe(true);
    expect(parse(text)).toMatchObject({
      id: "shop",
      environments: { dev: {}, test: {} },
      values: { landing: "/Volumes/x" },
    });
  });

  it("keeps an environment's own settings when it is chosen again", () => {
    const retail = scaffoldFiles(template("retail"), {
      name: "r",
      environments: ["prod"],
      values: {},
    });
    expect(parse(retail["project.yaml"]!.toString()).environments.prod.values.host).toContain(
      "adb-2222",
    );
  });

  it("replaces the standard with the chosen one, noting where it came from", () => {
    const standard = join(temp(), "acme.yaml");
    writeFileSync(
      standard,
      "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [databricks@1]\n",
    );
    const result = scaffoldFiles(template("minimal"), {
      name: "s",
      environments: ["dev"],
      values: {},
      standard: { file: standard, source: "https://example.com/acme.git#acme.yaml" },
    });
    expect(result["standard.yaml"]).toBe(
      `# From https://example.com/acme.git#acme.yaml\n${readFileSync(standard, "utf8")}`,
    );
  });

  it("refuses a template with a symbolic link", () => {
    const folder = temp();
    cpSync(template("minimal").folder, folder, { recursive: true });
    symlinkSync("/etc/hosts", join(folder, "hosts.yaml"));
    expect(() =>
      scaffoldFiles(readTemplate(folder, "linked"), {
        name: "x",
        environments: ["dev"],
        values: {},
      }),
    ).toThrow(
      'Template "linked" has a symbolic link: hosts.yaml. Templates may only hold regular files.',
    );
  });
});

describe("writeScaffold", () => {
  it("writes nothing and lists the clashes when a file exists", () => {
    const target = temp();
    writeFileSync(join(target, "project.yaml"), "id: mine\n");
    const result = writeScaffold(target, { "project.yaml": "id: x\n", "standard.yaml": "s\n" });
    expect(result).toEqual({ clashes: ["project.yaml"] });
    expect(existsSync(join(target, "standard.yaml"))).toBe(false);
    expect(readFileSync(join(target, "project.yaml"), "utf8")).toBe("id: mine\n");
  });

  it("writes every file, creating folders", () => {
    const target = join(temp(), "new");
    expect(writeScaffold(target, { "a/b.yaml": "x\n" })).toEqual({ written: ["a/b.yaml"] });
    expect(readFileSync(join(target, "a/b.yaml"), "utf8")).toBe("x\n");
  });
});

describe("projectId", () => {
  it("makes a valid id from a folder name", () => {
    expect(projectId("My Shop 2")).toBe("my_shop_2");
    expect(projectId("2026-data")).toBe("p_2026_data");
  });
});
