// `ingestron init --kit` from the catalogue and from a git URL (spec/cli/kits.md, "Where kits
// are found"). The catalogue is a file:// repository made in the test: no network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogue,
  cliVersion,
  ingestron,
  leftBehind,
  offlineCatalogue,
  temp,
} from "./kit-catalogue.js";

offlineCatalogue();

describe("init --kit from the catalogue", () => {
  it("clones the catalogue at the kit's tag, and leaves no clone behind", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-10-01" },
    ]);
    const cwd = temp();
    let result = { code: -1, output: "" };
    const left = leftBehind(() => {
      result = ingestron(cwd, "init", "old", "--kit", "duckdb/local-medallion@2026-10-01");
    });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toMatch(
      /^Created old from the kit duckdb\/local-medallion@2026-10-01 \(\d+ files\)\.\n/,
    );
    expect(readFileSync(join(cwd, "old/standard.yaml"), "utf8")).toContain("version: 2026-10-01");
    expect(left).toEqual([]);
  });

  it("unknown version names the versions", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-10-01" },
    ]);
    const cwd = temp();
    let result = { code: -1, output: "" };
    const left = leftBehind(() => {
      result = ingestron(cwd, "init", "x", "--kit", "duckdb/local-medallion@2026-11-09");
    });
    expect(result.code).toBe(1);
    expect(result.output).toBe(
      "There is no version 2026-11-09 of the kit duckdb/local-medallion. It has: 2026-10-01, 2026-11-10.\n",
    );
    expect(left).toEqual([]);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("names the kits there are when there is no such kit", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/local-medallion", version: "2026-10-01" },
    ]);
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/no-such-kit");
    expect(code).toBe(1);
    expect(output).toBe(
      "There is no kit duckdb/no-such-kit, installed or in the catalogue. Installed kits: databricks/lakehouse-streaming, duckdb/local-medallion.\n",
    );
  });

  it("<id> alone takes the newest version that is not a preview", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/shop", version: "2026-10-01" },
      { id: "duckdb/shop", version: "2026-10-02-preview" },
    ]);
    const cwd = temp();
    const { code, output } = ingestron(cwd, "init", "x", "--kit", "duckdb/shop");
    expect(code, output).toBe(0);
    expect(output).toMatch(/^Created x from the kit duckdb\/shop@2026-10-01 /);
  });

  it("<id> alone with only preview versions names them", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/shop", version: "2026-10-02-preview" },
    ]);
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/shop");
    expect(code).toBe(1);
    expect(output).toBe(
      "The kit duckdb/shop has only preview versions: 2026-10-02-preview. Name one, such as duckdb/shop@2026-10-02-preview.\n",
    );
  });

  it("a preview version is used when it is named", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/shop", version: "2026-10-02-preview" },
    ]);
    const { code, output } = ingestron(
      temp(),
      "init",
      "x",
      "--kit",
      "duckdb/shop@2026-10-02-preview",
    );
    expect(code, output).toBe(0);
  });

  it("shows a kit's broken rule after its spec", () => {
    process.env.INGESTRON_STANDARDS_REPOSITORY = catalogue([
      { id: "duckdb/shop", version: "2026-10-01", change: (text) => `${text}colour: blue\n` },
    ]);
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/shop@2026-10-01");
    expect(code).toBe(1);
    expect(output).toBe(
      'duckdb/shop@2026-10-01: kit.yaml: unknown key "colour". Check its spelling or remove it.\n',
    );
  });

  it("names git's reason when the catalogue cannot be read", () => {
    const { code, output } = ingestron(temp(), "init", "x", "--kit", "duckdb/shop@2026-10-01");
    expect(code).toBe(1);
    expect(output).toMatch(
      /^The kit duckdb\/shop@2026-10-01 is not installed, and the catalogue could not be read: /,
    );
  });
});

describe("init --kit from a git URL", () => {
  it("refuses a kit that needs a newer ingestron", () => {
    const url = catalogue([
      {
        id: "duckdb/shop",
        version: "2026-12-01",
        change: (text) => text.replace(/ingestron: ">=[^"]+"/, 'ingestron: ">=99.0.0"'),
      },
    ]);
    const cwd = temp();
    let result = { code: -1, output: "" };
    const left = leftBehind(() => {
      result = ingestron(
        cwd,
        "init",
        "x",
        "--kit",
        `${url}#kits/duckdb/shop/2026-12-01@duckdb/shop@2026-12-01`,
      );
    });
    expect(result.code).toBe(1);
    expect(result.output).toBe(
      `The kit duckdb/shop@2026-12-01 needs ingestron >=99.0.0; this is ${cliVersion}.\n`,
    );
    expect(readdirSync(cwd)).toEqual([]);
    expect(left).toEqual([]);
  });

  it("creates the project from the folder at the tag", () => {
    const url = catalogue([{ id: "duckdb/shop", version: "2026-10-01" }]);
    const cwd = temp();
    const { code, output } = ingestron(
      cwd,
      "init",
      "x",
      "--kit",
      `${url}#kits/duckdb/shop/2026-10-01@duckdb/shop@2026-10-01`,
    );
    expect(code, output).toBe(0);
    expect(output).toMatch(/^Created x from the kit duckdb\/shop@2026-10-01 /);
  });
});
