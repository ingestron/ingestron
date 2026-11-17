// A new project imports only what it writes; each section's first file imports its folder
// (spec/cli/projects.md, "The new file's import").
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { nodeFiles, resolveProject } from "@ingestron/config";
import { draftConnection, projectPlatforms } from "@ingestron/core";
import { kinds } from "@ingestron/definitions";
import { parse } from "yaml";
import { run } from "../src/index.js";

const folders: string[] = [];
afterAll(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));
function lab() {
  const cwd = mkdtempSync(join(tmpdir(), "starter-imports-"));
  folders.push(cwd);
  let output = "";
  const invoke = (...args: string[]) => {
    output = "";
    return run(args, { cwd, write: (text) => void (output += text) });
  };
  return {
    cwd,
    invoke,
    output: () => output,
    read: (file: string) => readFileSync(join(cwd, file), "utf8"),
  };
}

it.each(projectPlatforms())("imports only the files the $id starter writes", ({ id }) => {
  const test = lab();
  expect(test.invoke("init", ".", "--platform", id, "--yes"), test.output()).toBe(0);
  const { imports } = parse(test.read("project.yaml")) as { imports: string[] };
  expect(imports).toContain("standard.yaml");
  expect(imports).toContain("platform.yaml");
  expect(imports.filter((entry) => entry.includes("*"))).toEqual([]);
  const loaded = resolveProject(nodeFiles(test.cwd), {
    kinds: Object.values(kinds),
    envvars: {},
    missingEnvvars: "information",
  });
  expect(loaded.diagnostics.map((item) => item.code)).not.toContain("NO_MATCH");
});

it("imports each section's folder with its first file, and says so", () => {
  const test = lab();
  test.invoke("init", ".", "--platform", "synapse", "--yes");
  const add = (...args: string[]) => test.invoke("connection", "add", ...args);
  const connector = ["--connector", "azure-sql-database", "--connectivity", "public"];
  expect(add("northwind", ...connector), test.output()).toBe(0);
  expect(test.output()).toBe(
    "Added connections/northwind.yaml; project.yaml now imports connections/*.yaml. Review the definition, then run plan. No source access or deployment occurred.\n",
  );
  expect(add("erp", ...connector), test.output()).toBe(0);
  expect(test.output()).toMatch(/^Added connections\/erp\.yaml\. Review/);
  expect(
    test.invoke("flow", "add", "orders", "--connection", "northwind", "--object", "dbo.Orders"),
    test.output(),
  ).toBe(0);
  expect(test.output()).toContain("project.yaml now imports flows/*.yaml.");
  const { imports } = parse(test.read("project.yaml")) as { imports: string[] };
  expect(imports.slice(-2)).toEqual(["connections/*.yaml", "flows/*.yaml"]);
  writeFileSync(join(test.cwd, "orders.csv"), "id,amount\n1,2.5\n");
  expect(test.invoke("contract", "orders.csv"), test.output()).toBe(0);
  expect(test.output()).toContain("project.yaml now imports contracts/*.yaml.\n");
  expect(parse(test.read("project.yaml")).imports.at(-1)).toBe("contracts/*.yaml");
});

it("adds the folder's pattern for a custom import list, keeping project.yaml's comments", () => {
  const test = lab();
  test.invoke("init", ".", "--platform", "synapse", "--yes");
  writeFileSync(
    join(test.cwd, "project.yaml"),
    test.read("project.yaml").replace("imports:", "# Reviewed by the platform team.\nimports:"),
  );
  const draft = draftConnection(nodeFiles(test.cwd), {
    id: "northwind",
    connector: "azure-sql-database",
    connectivity: "public",
  });
  expect(draft.imports?.added).toBe("connections/*.yaml");
  expect(draft.imports?.project).toContain("# Reviewed by the platform team.\n");
  expect(draft.imports?.project).toMatch(/- platform\.yaml\n {2}- connections\/\*\.yaml\n/);
});

it("adds the new file's own path when its folder holds another YAML file", () => {
  const test = lab();
  test.invoke("init", ".", "--platform", "synapse", "--yes");
  mkdirSync(join(test.cwd, "connections"));
  writeFileSync(join(test.cwd, "connections/legacy.yaml"), "kind: Connection\nid: legacy\n");
  const draft = draftConnection(nodeFiles(test.cwd), {
    id: "northwind",
    connector: "azure-sql-database",
    connectivity: "public",
  });
  expect(draft.imports?.added).toBe("connections/northwind.yaml");
  expect(parse(draft.imports!.project).imports).not.toContain("connections/*.yaml");
});
