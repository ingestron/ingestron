import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { guideFacts, guideHash, guideSection, type GuideFacts } from "../src/internal.js";
import { assistantCase, caseProject, standIns } from "./assistant-cases.js";

const sectionOf = (files: Record<string, string>, out = "build"): string => {
  const facts = guideFacts(memoryFiles(files), out, standIns);
  if ("noGuide" in facts) throw new Error(facts.noGuide);
  return guideSection(facts);
};

const standard = (more = "", packs = "[fold@2, local@1]") =>
  `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: ${packs}\n${more}`;
const project = (more = "") =>
  `id: retail\nenvironments: { dev: {}, prod: {} }\nimports: ["*.yaml"]\n${more}`;

describe("guideSection against the conformance cases", () => {
  const cases = [
    "01-duckdb-only",
    "02-databricks-adf",
    "03-runs-on",
    "11-connections",
    "13-many-fixed-settings",
    "17-fixed-values",
  ];

  for (const name of cases) {
    it(`gives what ${name} expects, and nothing it forbids`, () => {
      const found = assistantCase(name);
      const facts = guideFacts(caseProject(found), "build");
      if ("noGuide" in facts) throw new Error(facts.noGuide);
      const section = guideSection(facts);
      for (const text of found.expect.contains?.["AGENTS.md"] ?? [])
        expect(section).toContain(text);
      for (const text of found.expect.absent?.["AGENTS.md"] ?? [])
        expect(section).not.toContain(text);
    });
  }

  it("gives the whole section of the Databricks and ADF case, byte for byte", () => {
    const found = assistantCase("02-databricks-adf");
    const facts = guideFacts(caseProject(found), "build");
    if ("noGuide" in facts) throw new Error(facts.noGuide);
    expect(guideSection(facts)).toBe(found.expect.contains?.["AGENTS.md"]?.[0]);
  });

  it("records the hash of the section the case shows, and of the DuckDB-only case", () => {
    const duckdb = guideSection(
      guideFacts(caseProject(assistantCase("01-duckdb-only")), "build") as GuideFacts,
    );
    expect(duckdb).toContain(
      "<!-- ingestron:end sha256:423f0f50de23c00bda2cfe489dde0e3a7a63f06b76312b85e68487d2cfcbc7d9 -->\n",
    );
  });

  it("gives the sections the stale and current cases hold, with the stand-in packs", () => {
    const found = assistantCase("16-crlf-plan");
    const stale = assistantCase("09-stale-apply");
    const facts = guideFacts(caseProject(found), "build", standIns) as GuideFacts;
    const section = guideSection(facts);
    expect(section.replaceAll("\n", "\r\n")).toBe(found.files["AGENTS.md"]);
    // The stale case was written for one environment: its text is the section for that project.
    const one = guideFacts(
      memoryFiles({
        ...stale.files,
        "project.yaml": "id: retail\nenvironments: { dev: {} }\nimports: ['*.yaml']\n",
      }),
      "build",
      standIns,
    ) as GuideFacts;
    expect(stale.files["AGENTS.md"]).toContain(guideSection(one));
  });
});

describe("guideSection", () => {
  const files = { "project.yaml": project(), "standard.yaml": standard() };

  it("is the same bytes twice, LF only, ending in a line ending", () => {
    const section = sectionOf(files);
    expect(sectionOf(files)).toBe(section);
    expect(section).not.toContain("\r");
    expect(section.endsWith("-->\n")).toBe(true);
    expect(section.startsWith("<!-- ingestron:begin guide 1. ")).toBe(true);
  });

  it("records the hash of its own text", () => {
    const section = sectionOf(files);
    expect(section).toContain(`<!-- ingestron:end sha256:${guideHash(section)} -->\n`);
    expect(guideHash(section)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses the output folder it is given, with / separators", () => {
    expect(sectionOf(files, "out/gen")).toContain("never `out/gen/`.");
    expect(sectionOf(files, "out/gen")).toContain("`out/gen/fold/`");
  });

  it("names no tool and holds no value", () => {
    const section = sectionOf({
      ...files,
      "a.yaml": "kind: Connection\nid: c\nx: ${envvar:TOKEN}\n",
    });
    expect(section).not.toMatch(/claude|copilot|codex|cursor/i);
    expect(section).toContain("This project uses: `TOKEN`.");
  });

  it("has no source metadata without a connection", () => {
    const section = sectionOf(files);
    expect(section).not.toContain("## Source metadata");
    expect(section).not.toContain("ingestron source");
    expect(sectionOf({ ...files, "a.yaml": "kind: Connection\nid: c\n" })).toContain(
      "## Source metadata",
    );
  });

  it("says what it can without a standard or environments", () => {
    const section = sectionOf({ "project.yaml": "id: retail\nimports: ['*.yaml']\n" });
    expect(section).toContain("- Project `retail`. Environments: none (`project.yaml`).");
    expect(section).toContain("- No standard was found in the files project.yaml imports.");
    expect(section).toContain("- Generated, one folder per pack: none yet.");
    expect(section).toContain("3. Work inside the standard. ");
    expect(section).not.toContain("allows");
    expect(section).toContain("This project uses none.");
    expect(sectionOf({ "project.yaml": "id: retail\nimports: []\n" })).toContain(
      "- Definitions: the files `project.yaml` imports: none.",
    );
  });

  it("writes the origin, the From comment and STANDARD.md", () => {
    const origin = standard("origin: { standard: acme, version: 2026-11 }\n");
    expect(sectionOf({ "project.yaml": project(), "standard.yaml": origin })).toContain(
      "- Standard `acme` in `standard.yaml`, from the published standard `acme@2026-11`. Packs: `fold@2`, `local@1`.\n",
    );
    expect(
      sectionOf({ "project.yaml": project(), "standard.yaml": origin, "STANDARD.md": "x" }),
    ).toContain(
      "`standard.yaml`, from the published standard `acme@2026-11`; STANDARD.md explains its choices. Packs:",
    );
    expect(
      sectionOf({ "project.yaml": project(), "standard.yaml": `# From the kit  \n${standard()}` }),
    ).toContain("`standard.yaml`, from the kit. Packs:");
    expect(
      sectionOf({ "project.yaml": project(), "standard.yaml": `# From the kit\n${origin}` }),
    ).toContain("from the published standard `acme@2026-11`. Packs:");
  });

  it("writes the deploy sentence for one, two and three packs, and the DuckDB one", () => {
    const text = (packs: string) =>
      sectionOf({
        "project.yaml": project(),
        "standard.yaml": standard("", packs),
      });
    expect(text("[fold@2]")).toContain(
      "are not secrets. The `fold@2` output keeps them as values the deploying pipeline supplies. Do not read",
    );
    expect(text("[fold@2, local@1, x@3]")).toContain(
      "The `fold@2`, `local@1` and `x@3` output keeps them",
    );
    expect(text("[duckdb@2]")).not.toContain("deploying pipeline");
    expect(text("[duckdb@2]")).toContain("are not secrets. DuckDB reads them from the environment");
  });

  it("names a runs-on pack by its id in the deploy sentence, and writes runs on in the environments", () => {
    const section = sectionOf({
      "project.yaml": "id: r\nenvironments: { dev: { runs-on: duckdb } }\nimports: ['*.yaml']\n",
      "standard.yaml": standard("", "[fold@2]"),
    });
    expect(section).toContain("Environments: `dev` (runs on `duckdb`) (`project.yaml`).");
    expect(section).toContain("The `fold@2` output keeps them");
    expect(section).toContain("are not secrets. The `fold@2` output keeps them");
    expect(section).toContain("supplies. DuckDB reads them from the environment");
    expect(section).toContain("`build/fold/` (every environment together), `build/duckdb/`.");
  });

  it("adds the data product folder after the packs", () => {
    const section = sectionOf({
      ...files,
      "p.yaml": "kind: DataProduct\nid: s\n",
    });
    expect(section).toContain(
      "`build/local/` (a folder per environment), `build/products/` (data product passports).",
    );
  });

  it("keeps a pack the CLI does not have without a parenthesis", () => {
    expect(
      sectionOf({ "project.yaml": project(), "standard.yaml": standard("", "[other@1]") }),
    ).toContain("- Generated, one folder per pack: `build/other/`.");
  });

  it("lists keys only above eight fixed settings, and not for fewer", () => {
    const fixed = (count: number) =>
      standard(
        `store:\n  fixed:\n    t:\n${Array.from({ length: count }, (_, i) => `      k${i}: v${i}`).join("\n")}\n`,
      );
    const eight = sectionOf({ "project.yaml": project(), "standard.yaml": fixed(8) });
    const nine = sectionOf({ "project.yaml": project(), "standard.yaml": fixed(9) });
    expect(eight).toContain("`k0: v0`");
    expect(nine).toContain("`k0`, `k1`");
    expect(nine).not.toContain("v0");
  });

  it("keeps a large project small and cuts its lists after 20", () => {
    const connections = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `c${String(i).padStart(2, "0")}.yaml`,
        `kind: Connection\nid: conn${String(i).padStart(2, "0")}\n`,
      ]),
    );
    const envvars = `x: [${Array.from({ length: 40 }, (_, i) => `"\${envvar:VAR_${String(i).padStart(2, "0")}}"`).join(", ")}]\n`;
    const fixed = `store:\n  fixed:\n    t:\n${Array.from({ length: 30 }, (_, i) => `      key_${i}: value_${i}`).join("\n")}\n`;
    const section = sectionOf({
      "project.yaml": project(),
      "standard.yaml": standard(fixed),
      "envvars.yaml": envvars,
      ...connections,
    });
    expect(Buffer.byteLength(section)).toBeLessThan(6144);
    expect(section).toContain("`conn19`, and 40 more.");
    expect(section).toContain("`VAR_19`, and 20 more.");
    expect(section).not.toMatch(/conn20|value_/);
  });
});
