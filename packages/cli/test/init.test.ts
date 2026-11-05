// ingestron init, as a user runs it: with flags, with --yes, or answering questions.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { run } from "../src/index.js";

function session(answers?: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "ingestron-init-"));
  const asked: string[] = [];
  let output = "";
  const io = {
    cwd,
    write: (text: string) => (output += text),
    ...(answers && {
      ask: (question: string) => {
        asked.push(question);
        return answers.shift() ?? "";
      },
    }),
  };
  const ingestron = (...args: string[]) => {
    output = "";
    return { code: run(args, io), output };
  };
  return { cwd, asked, ingestron };
}

describe("ingestron init with flags", () => {
  it("creates the project from a built-in template and shows its plan", () => {
    const { cwd, ingestron } = session();
    const { code, output } = ingestron("init", "shop", "--template", "minimal", "--yes");
    expect(code).toBe(0);
    expect(output).toContain("Created shop from the template minimal (7 files).");
    expect(output).toContain("databricks → shop/build/databricks (dev)\ncreate    databricks.yml");
    expect(output).toMatch(
      /1 value is still REPLACE_ME: README.md lists each one and where to find it.\n$/,
    );
    expect(parse(readFileSync(join(cwd, "shop/project.yaml"), "utf8"))).toMatchObject({
      id: "shop",
      values: { landing: "REPLACE_ME" },
    });
    expect(ingestron("apply", "--definitions", "shop", "--out", "shop/build").code).toBe(0);
    expect(ingestron("check", "--definitions", "shop", "--out", "shop/build").code).toBe(1);
  });

  it("writes the --set values, and then check passes", () => {
    const { ingestron } = session();
    const set = ["--set", "landing=/Volumes/main/landing/shop"];
    const { output } = ingestron("init", "shop", "--template", "minimal", "--yes", ...set);
    expect(output).toMatch(/Nothing to replace: the project runs as written.\n$/);
    expect(ingestron("apply", "--definitions", "shop", "--out", "shop/build").code).toBe(0);
    expect(ingestron("check", "--definitions", "shop", "--out", "shop/build").output).toContain(
      "databricks: up to date",
    );
  });

  it("a new project ignores .env files", () => {
    const { cwd, ingestron } = session();
    for (const template of ["minimal", "duckdb"]) {
      expect(ingestron("init", template, "--template", template, "--yes").code).toBe(0);
      const lines = readFileSync(join(cwd, template, ".gitignore"), "utf8").split("\n");
      expect(lines, template).toEqual(expect.arrayContaining([".env", ".env.*", "!.env.example"]));
      // Ignored by Git, so a person can keep real values beside the project.
      expect(lines.indexOf("!.env.example"), template).toBeGreaterThan(lines.indexOf(".env.*"));
    }
    expect(readFileSync(join(cwd, "duckdb/.gitignore"), "utf8")).toContain("ingestron.duckdb*");
  });

  it("init . into a folder that has a .gitignore keeps its lines and adds the .env lines once", () => {
    for (const template of ["minimal", "duckdb"]) {
      const { cwd, ingestron } = session();
      writeFileSync(join(cwd, ".gitignore"), "node_modules/\n*.log\n");
      const { code, output } = ingestron("init", ".", "--template", template, "--yes");
      expect(code, output).toBe(0);
      const lines = readFileSync(join(cwd, ".gitignore"), "utf8").split("\n");
      expect(lines.slice(0, 2), template).toEqual(["node_modules/", "*.log"]);
      for (const line of [".env", ".env.*", "!.env.example"])
        expect(
          lines.filter((item) => item === line),
          `${template} ${line}`,
        ).toHaveLength(1);
      expect(lines.indexOf("!.env.example")).toBeGreaterThan(lines.indexOf(".env.*"));
      if (template === "duckdb") expect(lines).toContain("ingestron.duckdb*");
      // Run into the same folder again: a project is there, so nothing more is written.
      expect(ingestron("init", ".", "--template", template, "--yes").code).not.toBe(0);
      expect(readFileSync(join(cwd, ".gitignore"), "utf8").split("\n")).toEqual(lines);
    }
  });

  it("says what it added to a .gitignore that was there, and does not count it as created", () => {
    const fresh = session().ingestron("init", "new", "--template", "minimal", "--yes").output;
    expect(fresh).toContain("Created new from the template minimal (7 files).");

    const merged = session();
    writeFileSync(join(merged.cwd, ".gitignore"), "node_modules/\n");
    expect(merged.ingestron("init", ".", "--template", "minimal", "--yes").output).toContain(
      "Created . from the template minimal (6 files); added the .env lines to .gitignore.\n",
    );

    const duckdb = session();
    writeFileSync(join(duckdb.cwd, ".gitignore"), ".env\n");
    expect(duckdb.ingestron("init", ".", "--template", "duckdb", "--yes").output).toMatch(
      /^Created \. from the template duckdb \(\d+ files\); added ingestron\.duckdb\*, published\/\*\.parquet and the \.env lines to \.gitignore\.\n/,
    );

    const complete = session();
    writeFileSync(join(complete.cwd, ".gitignore"), ".env\n.env.*\n!.env.example\n");
    expect(complete.ingestron("init", ".", "--template", "minimal", "--yes").output).toContain(
      "Created . from the template minimal (6 files).\n",
    );
  });

  it("takes the name, environments and answers from flags", () => {
    const { cwd, ingestron } = session();
    const args = ["--template", "minimal", "--name", "sales", "--env", "dev", "--env", "prod"];
    expect(ingestron("init", "here", ...args, "--set", "landing=/Volumes/z").code).toBe(0);
    expect(parse(readFileSync(join(cwd, "here/project.yaml"), "utf8"))).toMatchObject({
      id: "sales",
      environments: { dev: {}, prod: {} },
      values: { landing: "/Volumes/z" },
    });
  });

  it("refuses a value the project does not have, and lists those it has", () => {
    const { ingestron } = session();
    const { code, output } = ingestron(
      "init",
      "x",
      "--template",
      "minimal",
      "--yes",
      "--set",
      "landng=/x",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      '--set landng: this project has no value "landng". It has: source_path, landing.\n',
    );
  });

  it("writes nothing when a file exists, and lists it", () => {
    const { cwd, ingestron } = session();
    mkdirSync(join(cwd, "shop"));
    writeFileSync(join(cwd, "shop/project.yaml"), "id: mine\n");
    const { code, output } = ingestron("init", "shop", "--template", "minimal", "--yes");
    expect(code).toBe(1);
    expect(output).toBe("Nothing written: these files already exist in shop:\n  project.yaml\n");
    expect(existsSync(join(cwd, "shop/standard.yaml"))).toBe(false);
  });

  it("does not wait for answers without a terminal; it names the flag to pass", () => {
    const { ingestron } = session();
    const { code, output } = ingestron("init", "shop");
    expect(code).toBe(1);
    expect(output).toBe("Missing --connector. Pass it, or --yes to take the defaults.\n");
  });
});

describe("ingestron init asks only what picks the project", () => {
  it("asks for the source choices and nothing else", () => {
    const { cwd, asked, ingestron } = session(["", "files", "public", "databricks"]);
    expect(ingestron("init", "shop").code).toBe(0);
    expect(asked).toHaveLength(4);
    expect(asked[0]).toContain("Source category");
    expect(asked[1]).toContain("Connector");
    expect(asked[2]).toContain("Connectivity");
    expect(asked[3]).toContain("Route");
    expect(parse(readFileSync(join(cwd, "shop/project.yaml"), "utf8"))).toMatchObject({
      id: "shop",
      environments: { dev: {}, prod: {} },
      values: { landing: "REPLACE_ME" },
    });
  });

  it("accepts category and connector numbers from the list", () => {
    const { cwd, ingestron } = session(["", "", "", "1"]);
    expect(ingestron("init", "shop").code).toBe(0);
    expect(readFileSync(join(cwd, "shop/flows/orders.yaml"), "utf8")).toContain("kind: Flow");
  });

  it("asks nothing for a template, and takes the id from the folder", () => {
    const { cwd, asked, ingestron } = session([]);
    expect(ingestron("init", "Shop-1", "--template", "minimal").code).toBe(0);
    expect(asked).toEqual([]);
    expect(parse(readFileSync(join(cwd, "Shop-1/project.yaml"), "utf8")).id).toBe("shop_1");
  });
});

describe("names are checked up front", () => {
  it("refuses an invalid --env before doing anything else", () => {
    const { cwd, ingestron } = session();
    const { code, output } = ingestron("init", "shop", "--template", "minimal", "--env", "Prod-1");
    expect(code).toBe(1);
    expect(output).toContain('"Prod-1" is not a valid environment name');
    expect(existsSync(join(cwd, "shop"))).toBe(false);
  });

  it("refuses an invalid --name before doing anything else", () => {
    const { cwd, ingestron } = session();
    const { code, output } = ingestron(
      "init",
      "shop",
      "--template",
      "https://example.invalid/t.git",
      "--name",
      "tmp-01",
      "--yes",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      '"tmp-01" is not a valid project name: use lowercase letters, digits and underscores, starting with a letter. Try "tmp_01".\n',
    );
    expect(existsSync(join(cwd, "shop"))).toBe(false);
  });
});
