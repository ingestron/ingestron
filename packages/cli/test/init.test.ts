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
    expect(output).toContain("Created shop from the template minimal (5 files).");
    expect(output).toContain("dev → shop/build/dev\ncreate    databricks.yml");
    expect(parse(readFileSync(join(cwd, "shop/project.yaml"), "utf8"))).toMatchObject({
      id: "shop",
      values: { landing: "/Volumes/dev/landing/shop" },
    });
    expect(ingestron("apply", "--definitions", "shop", "--out", "shop/build").code).toBe(0);
    expect(ingestron("check", "--definitions", "shop", "--out", "shop/build").output).toContain(
      "dev: up to date",
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

  it("refuses an answer the template does not ask", () => {
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
    expect(output).toBe('The template asks no "landng". It asks: landing.\n');
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

describe("ingestron init asking questions", () => {
  it("asks for source choices before project settings", () => {
    const { cwd, asked, ingestron } = session([
      "",
      "files",
      "public",
      "databricks",
      "",
      "dev, prod",
      "",
      "/Volumes/y",
    ]);
    expect(ingestron("init", "shop").code).toBe(0);
    expect(asked[0]).toContain("Source category");
    expect(asked[1]).toContain("Connector");
    expect(asked[2]).toContain("Connectivity");
    expect(asked[3]).toContain("Route");
    expect(parse(readFileSync(join(cwd, "shop/project.yaml"), "utf8"))).toMatchObject({
      environments: { dev: {}, prod: {} },
      values: { source_path: "/Volumes/y" },
    });
  });

  it("accepts category and connector numbers from the list", () => {
    const { cwd, ingestron } = session(["", "", "", "1", "", "", "", ""]);
    expect(ingestron("init", "shop").code).toBe(0);
    expect(readFileSync(join(cwd, "shop/flows/orders.yaml"), "utf8")).toContain("kind: Flow");
  });
});

describe("names are checked up front", () => {
  it("explains an invalid name and asks again", () => {
    const { cwd, asked, ingestron } = session(["tmp-01", "tmp_01", "", "", ""]);
    expect(ingestron("init", "shop", "--template", "minimal").code).toBe(0);
    expect(asked[1]).toBe(
      '"tmp-01" is not a valid project name: use lowercase letters, digits and underscores, starting with a letter. Try "tmp_01".\nProject name [shop]: ',
    );
    expect(parse(readFileSync(join(cwd, "shop/project.yaml"), "utf8")).id).toBe("tmp_01");
  });

  it("explains an invalid environment and asks again", () => {
    const { asked, ingestron } = session(["", "dev, Prod-1", "dev, prod", "", ""]);
    expect(ingestron("init", "shop", "--template", "minimal").code).toBe(0);
    expect(asked[2]).toContain('"Prod-1" is not a valid environment name');
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
