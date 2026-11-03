// Planning and writing a new project from a template.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { projectId, scaffoldFiles, withEnvIgnores, writeScaffold } from "../src/scaffold.js";
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

describe("withEnvIgnores", () => {
  const comment = "# Values for ${envvar:…}: keep them out of Git; commit a .env.example instead.";

  it("makes a .gitignore of its own when there is none", () => {
    expect(withEnvIgnores(undefined)).toBe(`${comment}\n.env\n.env.*\n!.env.example\n`);
  });

  it("adds the lines after the template's own, once", () => {
    const once = withEnvIgnores("ingestron.duckdb*");
    expect(once).toBe(`ingestron.duckdb*\n\n${comment}\n.env\n.env.*\n!.env.example\n`);
    expect(withEnvIgnores(once)).toBe(once);
  });

  it("adds only the lines that are missing", () => {
    expect(withEnvIgnores(".env\nbuild/\n")).toBe(".env\nbuild/\n.env.*\n!.env.example\n");
    expect(withEnvIgnores(".env\n.env.*\n")).toBe(".env\n.env.*\n!.env.example\n");
  });

  it("leaves a file that has all three lines in order alone", () => {
    const text = "build/\n.env\n.env.*\n!.env.example\n";
    expect(withEnvIgnores(text)).toBe(text);
    expect(withEnvIgnores(text.replaceAll("\n", "\r\n"))).toBe(text.replaceAll("\n", "\r\n"));
  });

  it("puts the exception after .env.* again when it sits before", () => {
    expect(withEnvIgnores("!.env.example\n.env\n.env.*\n")).toBe(
      "!.env.example\n.env\n.env.*\n!.env.example\n",
    );
    // A missing .env.* is added after the exception, so the exception is added again.
    expect(withEnvIgnores("!.env.example\nbuild/\n")).toBe(
      "!.env.example\nbuild/\n.env\n.env.*\n!.env.example\n",
    );
  });

  it("keeps the file's own line ending", () => {
    expect(withEnvIgnores("build/\r\n")).toBe(
      `build/\r\n\r\n${comment}\r\n.env\r\n.env.*\r\n!.env.example\r\n`,
    );
    expect(withEnvIgnores(".env\r\nbuild/")).toBe(".env\r\nbuild/\r\n.env.*\r\n!.env.example\r\n");
  });
});

describe("writeScaffold and an existing .gitignore", () => {
  it("merges into it instead of reporting a clash, and still refuses other files", () => {
    const target = temp();
    writeFileSync(join(target, ".gitignore"), "node_modules/\n.env\n");
    const result = writeScaffold(target, {
      "project.yaml": "id: x\n",
      ".gitignore": withEnvIgnores("ingestron.duckdb*\n"),
    });
    expect(result).toEqual({ written: [".gitignore", "project.yaml"] });
    const lines = readFileSync(join(target, ".gitignore"), "utf8").split("\n");
    expect(lines.filter((line) => line === ".env")).toHaveLength(1);
    expect(lines).toEqual(
      expect.arrayContaining(["node_modules/", "ingestron.duckdb*", ".env.*", "!.env.example"]),
    );
    expect(lines.indexOf("!.env.example")).toBeGreaterThan(lines.indexOf(".env.*"));
    expect(writeScaffold(target, { "project.yaml": "id: y\n" })).toEqual({
      clashes: ["project.yaml"],
    });
  });

  it("is the same when run twice", () => {
    const target = temp();
    writeFileSync(join(target, ".gitignore"), "node_modules/\n");
    const files = { ".gitignore": withEnvIgnores("ingestron.duckdb*\n") };
    writeScaffold(target, files);
    const once = readFileSync(join(target, ".gitignore"), "utf8");
    writeScaffold(target, files);
    expect(readFileSync(join(target, ".gitignore"), "utf8")).toBe(once);
  });

  it("still refuses a .gitignore that is a link or a folder", () => {
    const target = temp();
    mkdirSync(join(target, ".gitignore"));
    expect(writeScaffold(target, { ".gitignore": withEnvIgnores(undefined) })).toEqual({
      clashes: [".gitignore"],
    });
    const other = temp();
    writeFileSync(join(other, "real"), "x\n");
    symlinkSync(join(other, "real"), join(other, ".gitignore"));
    expect(writeScaffold(other, { ".gitignore": withEnvIgnores(undefined) })).toEqual({
      clashes: [".gitignore"],
    });
  });
});
