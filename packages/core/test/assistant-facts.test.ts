import { memoryFiles, type FileSource } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { guideFacts, type GuideFacts } from "../src/internal.js";
import { assistantCase, caseProject, standIns } from "./assistant-cases.js";

const facts = (files: Record<string, string>, out = "build"): GuideFacts => {
  const found = guideFacts(memoryFiles(files), out, standIns);
  if ("noGuide" in found) throw new Error(found.noGuide);
  return found;
};

const standard = (more = "") =>
  `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [fold@2, local@1]\n${more}`;
const project = "id: retail\nimports: ['*.yaml']\n";

describe("guideFacts for the Databricks and ADF case", () => {
  const found = guideFacts(caseProject(assistantCase("02-databricks-adf")), "build");
  if ("noGuide" in found) throw new Error(found.noGuide);

  it("reads the project, its environments, imports and standard", () => {
    expect(found.project).toBe("retail");
    expect(found.environments).toEqual([{ name: "dev" }, { name: "prod" }]);
    expect(found.imports).toEqual(["*.yaml"]);
    expect(found.standard).toEqual({
      id: "acme",
      file: "standard.yaml",
      explained: false,
      packs: ["databricks@2", "adf@2"],
      allowed: [
        { action: "ingest", methods: ["adf-copy", "files"] },
        { action: "store", methods: ["streaming-table"] },
      ],
      fixed: [{ action: "store", method: "streaming-table", settings: [["cluster_by", "auto"]] }],
      fixedIntent: ["history"],
    });
  });

  it("gives each pack's folder, and whether it builds environments together", () => {
    expect(found.outputs.map(({ folder, together }) => ({ folder, together }))).toEqual([
      { folder: "build/databricks/", together: true },
      { folder: "build/adf/", together: true },
    ]);
    expect(found.products).toBe(false);
    expect(found.connections).toEqual([]);
    expect(found.envvars).toEqual([]);
  });
});

describe("guideFacts reads the files without resolving", () => {
  it("writes runs-on as the project gives it, and adds a runs-on pack the standard lacks", () => {
    const found = facts({
      "project.yaml":
        "id: retail\nenvironments: { dev: {}, local: { runs-on: duckdb } }\nimports: ['*.yaml']\n",
      "standard.yaml": standard(),
    });
    expect(found.environments).toEqual([{ name: "dev" }, { name: "local", runsOn: "duckdb" }]);
    expect(
      found.outputs.map(({ id, name, folder, together }) => [id, name, folder, together]),
    ).toEqual([
      ["fold", "fold@2", "build/fold/", true],
      ["local", "local@1", "build/local/", false],
      ["duckdb", "duckdb", "build/duckdb/", undefined],
    ]);
  });

  it("does not add a runs-on pack the standard already lists", () => {
    const found = facts({
      "project.yaml": "id: retail\nenvironments: { l: { runs-on: local } }\nimports: ['*.yaml']\n",
      "standard.yaml": standard(),
    });
    expect(found.outputs.map(({ id }) => id)).toEqual(["fold", "local"]);
  });

  it("names a runs-on pack the standard lacks by its id, and finds the pack by it", () => {
    const found = facts({
      "project.yaml":
        "id: retail\nenvironments: { dev: {}, p: { runs-on: 'fold@3' }, q: { runs-on: other@1 } }\nimports: ['*.yaml']\n",
      "standard.yaml": standard().replace("[fold@2, local@1]", "[local@1]"),
    });
    expect(found.environments[1]).toEqual({ name: "p", runsOn: "fold@3" });
    expect(
      found.outputs.map(({ id, name, folder, together }) => [id, name, folder, together]),
    ).toEqual([
      ["local", "local@1", "build/local/", false],
      ["fold", "fold", "build/fold/", true],
      ["other", "other", "build/other/", undefined],
    ]);
  });

  it("writes a number environment name as the file writes it", () => {
    const found = facts({
      "project.yaml":
        "id: retail\nenvironments: { 1.0: {}, 0x10: {}, 3: {}, dev: {} }\nimports: ['*.yaml']\n",
      "standard.yaml": standard(),
    });
    expect(found.environments.map(({ name }) => name)).toEqual(["1.0", "0x10", "3", "dev"]);
  });

  it("lists the project's files once", () => {
    const files = {
      "project.yaml": "id: retail\nimports: ['*.yaml']\n",
      "standard.yaml": standard(),
      "STANDARD.md": "# Why\n",
    };
    let listed = 0;
    const source: FileSource = {
      ...memoryFiles(files),
      list: () => {
        listed += 1;
        return Object.keys(files);
      },
    };
    const found = guideFacts(source, "build", standIns);
    if ("noGuide" in found) throw new Error(found.noGuide);
    expect(found.standard?.explained).toBe(true);
    expect(listed).toBe(1);
  });

  it("finds connections, data products and the ${envvar:…} names, each once, in code point order", () => {
    const found = facts({
      "project.yaml": "id: retail\nimports: ['*.yaml']\nvalues: { a: '${envvar:ZED}' }\n",
      "standard.yaml": standard(),
      "b.yaml": "kind: Connection\nid: erp\nsettings: { p: '${envvar:ALPHA}/${envvar:ZED}' }\n",
      "a.yaml": "kind: Connection\nid: crm\n",
      "p.yaml": "kind: DataProduct\nid: sales\n",
    });
    expect(found.connections).toEqual(["crm", "erp"]);
    expect(found.products).toBe(true);
    expect(found.envvars).toEqual(["ALPHA", "ZED"]);
  });

  it("takes no envvar name from a file it skips, or from a file no import matches", () => {
    const found = facts({
      "project.yaml": project,
      "standard.yaml": standard(),
      "broken.yaml": "a: [\n# ${envvar:SKIPPED}\n",
      "notes.md": "${envvar:OTHER}",
    });
    expect(found.envvars).toEqual([]);
  });

  it("never reads a .env file, even one an import matches", () => {
    const files: Record<string, string> = {
      "project.yaml": "id: retail\nimports: ['**']\n",
      "standard.yaml": standard(),
      ".env": "SECRET=sentinel-value-7\n",
      ".env.dev": "SECRET=sentinel-value-8\n",
      "config/.env": "X=1\n",
    };
    const read: string[] = [];
    const source: FileSource = {
      ...memoryFiles(files),
      read: (path) => {
        read.push(path);
        return files[path];
      },
    };
    const found = guideFacts(source, "build", standIns);
    expect("noGuide" in found).toBe(false);
    expect(read.filter((path) => /(^|\/)\.env/.test(path))).toEqual([]);
  });
});

describe("guideFacts without a guide", () => {
  const none = (text: string | undefined): unknown =>
    guideFacts(memoryFiles(text === undefined ? {} : { "project.yaml": text }), "build");

  it("says project.yaml cannot be read when it does not parse, is not a mapping, or is missing", () => {
    const said = { noGuide: "No guide: project.yaml cannot be read." };
    expect(none("id: [retail\nimports: [\n")).toEqual(said);
    expect(none("- a\n- b\n")).toEqual(said);
    expect(none("just text")).toEqual(said);
    expect(none(undefined)).toEqual(said);
  });

  it("says project.yaml has no id when it parses but gives no string id", () => {
    const said = { noGuide: "No guide: project.yaml has no id." };
    expect(none("imports: ['*.yaml']\n")).toEqual(said);
    expect(none(":")).toEqual(said);
    expect(none("id: 7\n")).toEqual(said);
    expect(none("id: [a]\n")).toEqual(said);
  });
});
