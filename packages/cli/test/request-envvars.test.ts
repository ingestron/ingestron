// ingestron request and environment variables: unset ones do not stop it, and its
// "Values to provide" says where each is used and set, never its value (spec/cli/request.md).
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformRequest, run } from "../src/index.js";

const names = ["INGT_REQ_LANDING", "INGT_REQ_FOLDER", "INGT_REQ_SOURCE"];
const folderValue = "synthetic-folder-7f3a";
const saved = new Map<string, string | undefined>();
const folders: string[] = [];

/** The minimal Databricks starter, with its files replaced or added as given. */
function workspace(files: Record<string, string> = {}): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-request-"));
  folders.push(folder);
  cpSync(join(import.meta.dirname, "../project-templates/minimal"), folder, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return folder;
}

const project = [
  "id: shop",
  "values:",
  "  landing: ${envvar:INGT_REQ_LANDING}",
  "environments:",
  "  dev: {}",
  "imports: [standard.yaml, connections/*.yaml, flows/*.yaml, contracts/*.yaml]",
  "",
].join("\n");

const connection = [
  "apiVersion: ingestron.io/v1",
  "kind: Connection",
  "id: shop",
  "connector: files",
  "connectivity: public",
  "settings:",
  "  path: ${values.landing}/${envvar:INGT_REQ_FOLDER}",
  "",
].join("\n");

/** One variable unset, and one set in .env.dev. */
const withVariables = () =>
  workspace({
    "project.yaml": project,
    "connections/shop.yaml": connection,
    ".env.dev": `INGT_REQ_FOLDER=${folderValue}\n`,
  });

function ingestron(cwd: string, ...args: string[]) {
  let output = "";
  const code = run(args, { cwd, write: (text) => (output += text) });
  return { code, output };
}

/** The text of one `##` section, up to the next. */
function section(output: string, title: string): string {
  const start = output.indexOf(`## ${title}\n`);
  if (start === -1) return "";
  const end = output.indexOf("\n## ", start + 1);
  return output.slice(start, end === -1 ? undefined : end);
}

beforeEach(() => {
  for (const name of names) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("ingestron request with environment variables", () => {
  it("lists each variable after the title, where it is used and where it is set, and exits 0", () => {
    const { code, output } = ingestron(withVariables(), "request", "--env", "dev");
    expect(code).toBe(0);
    expect(output).toMatch(/^# Platform request: shop \(dev\)\n\n## Values to provide\n/);
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "Set them in the pipeline that runs Ingestron for this environment, or in `.env.dev` on your own computer, kept out of Git.",
    );
    expect(values).toContain(
      "- `INGT_REQ_LANDING`, used for `values.landing` in `project.yaml`: not set yet.",
    );
    expect(values).toContain(
      "- `INGT_REQ_FOLDER`, used for `settings.path` in `connections/shop.yaml`: set in `.env.dev`.",
    );
    expect(values).not.toContain(folderValue);
  });

  it("says a variable set where Ingestron runs is set there, without its value", () => {
    process.env.INGT_REQ_LANDING = "/Volumes/synthetic/landing";
    const { output } = ingestron(withVariables(), "request", "--env", "dev");
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "- `INGT_REQ_LANDING`, used for `values.landing` in `project.yaml`: set in the environment Ingestron runs in.",
    );
    expect(values).not.toContain("/Volumes/synthetic/landing");
    expect(values).not.toContain("Until a variable is set");
  });

  it("shows an unset value elsewhere as its reference, and says so", () => {
    const { output } = ingestron(withVariables(), "request", "--env", "dev");
    expect(section(output, "Values to provide")).toContain(
      "Until a variable is set, this request shows it as `${envvar:NAME}`",
    );
    expect(output).toContain(`\`\${envvar:INGT_REQ_LANDING}/${folderValue}\``);
  });

  it("leaves out what a flow whose source is not known needs, and the SQL, and says so", () => {
    const folder = withVariables();
    writeFileSync(
      join(folder, "flows/orders.yaml"),
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\nsource: ${envvar:INGT_REQ_SOURCE}\n" +
        "tables:\n  orders: { object: orders, contract: shop.orders }\n",
    );
    const { code, output } = ingestron(folder, "request", "--env", "dev");
    expect(code).toBe(0);
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "The source of flow `orders`, `${envvar:INGT_REQ_SOURCE}`, is not known yet, so nothing its tables need is listed.",
    );
    expect(values).toContain("Any SQL to run once is left out");
    expect(output).not.toContain("## SQL to run once");
  });

  it("still gives the short note, and exits 1, when the definitions have a real error", () => {
    const folder = withVariables();
    writeFileSync(
      join(folder, "flows/orders.yaml"),
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\nsource: shop\n" +
        "tables:\n  orders: { object: orders, contract: shop.missing }\n",
    );
    const { code, output } = ingestron(folder, "request", "--env", "dev");
    expect(code).toBe(1);
    expect(output).toBe(
      "# Platform request (dev)\n\nThe definitions have problems; fix them first.\n",
    );
  });

  it("has no such section when the definitions read no environment variable", () => {
    const { code, output } = ingestron(workspace(), "request", "--env", "dev");
    expect(code).toBe(0);
    expect(output).not.toContain("Values to provide");
    expect(output).not.toContain("envvar");
  });

  it("gives the editor's command the same text", () => {
    const folder = withVariables();
    const { output } = ingestron(folder, "request", "--env", "dev");
    expect(platformRequest(nodeFiles(folder), "dev")).toBe(output);
  });
});
