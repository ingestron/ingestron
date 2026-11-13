// `ingestron init --kit` with an installed kit, and with connection options (spec/cli/projects.md,
// "Kits"). The catalogue tests are in init-kit-catalogue.test.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cliVersion,
  databricksKit,
  ingestron,
  kits,
  offlineCatalogue,
  temp,
} from "./kit-catalogue.js";

offlineCatalogue();

describe("init --kit with an installed kit", () => {
  it("the CLI's version meets each installed kit's requires", () => {
    expect(cliVersion).toBe("2.4.0");
    expect(kits.map((kit) => kit.id)).toEqual([
      "databricks/lakehouse-streaming",
      "duckdb/local-medallion",
    ]);
  });

  for (const kit of kits)
    it(`${kit.id} creates a project that resolves and plans`, () => {
      const cwd = temp();
      const created = ingestron(cwd, "init", "project", "--kit", `${kit.id}@${kit.version}`);
      expect(created.code, created.output).toBe(0);
      expect(created.output).toMatch(
        new RegExp(`^Created project from the kit ${kit.id}@${kit.version} \\(\\d+ files\\)\\.\\n`),
      );
      const folder = join(cwd, "project");
      expect(existsSync(join(folder, "kit.yaml"))).toBe(false);
      expect(readFileSync(join(folder, "STANDARD.md"), "utf8")).toBe(
        readFileSync(join(kit.folder, "README.md"), "utf8"),
      );
      const readme = readFileSync(join(folder, "README.md"), "utf8");
      expect(readme).toMatch(/^# project\n/);
      expect(readme).toContain(
        `The standard comes from ${kit.id}@${kit.version}; STANDARD.md explains its choices.`,
      );
      expect(readFileSync(join(folder, "standard.yaml"), "utf8")).toBe(
        readFileSync(join(kit.folder, "standard.yaml"), "utf8"),
      );
      expect(readFileSync(join(folder, "project.yaml"), "utf8")).toMatch(/^id: project$/m);
      const planned = ingestron(folder, "plan");
      expect(planned.code, planned.output).toBe(0);
    });

  it("writes gitignore as .gitignore and copies samples and published/.gitkeep", () => {
    const cwd = temp();
    expect(ingestron(cwd, "init", "local", "--kit", "duckdb/local-medallion").code).toBe(0);
    const folder = join(cwd, "local");
    expect(existsSync(join(folder, "gitignore"))).toBe(false);
    expect(readFileSync(join(folder, ".gitignore"), "utf8")).toContain("ingestron.duckdb*\n");
    expect(existsSync(join(folder, "samples/orders.csv"))).toBe(true);
    expect(existsSync(join(folder, "published/.gitkeep"))).toBe(true);
  });

  it("applies --name, --env and --set", () => {
    const cwd = temp();
    const { code, output } = ingestron(
      cwd,
      "init",
      "lake",
      "--kit",
      "databricks/lakehouse-streaming@2026-11-10",
      "--name",
      "sales",
      "--env",
      "dev",
      "--set",
      "service_principal_name=11111111-2222-3333-4444-555555555555",
    );
    expect(code, output).toBe(0);
    const project = readFileSync(join(cwd, "lake/project.yaml"), "utf8");
    expect(project).toMatch(/^id: sales$/m);
    expect(project).not.toContain("prod:");
    expect(readFileSync(join(cwd, "lake/platform.yaml"), "utf8")).toContain(
      "service_principal_name: 11111111-2222-3333-4444-555555555555",
    );
  });

  it("sets each permission group of the Databricks kit on its own", () => {
    const cwd = temp();
    const { code, output } = ingestron(
      cwd,
      "init",
      "lake",
      "--kit",
      "databricks/lakehouse-streaming@2026-11-10",
      "--set",
      "engineers=data-engineers",
    );
    expect(code, output).toBe(0);
    const project = readFileSync(join(cwd, "lake/project.yaml"), "utf8");
    expect(project).toMatch(/^ {2}engineers: data-engineers$/m);
    expect(project).toMatch(/^ {2}analysts: REPLACE_ME$/m);
    const platform = readFileSync(join(cwd, "lake/platform.yaml"), "utf8");
    expect(platform).toContain("group_name: ${values.engineers}");
    expect(platform).toContain("group_name: ${values.analysts}");
    const readme = readFileSync(join(cwd, "lake/README.md"), "utf8");
    expect(readme).toMatch(/^\| `analysts` \| `project\.yaml:7` \| Group that may view/m);
    expect(readme).not.toMatch(/^\| `engineers` /m);
  });

  it("refuses a folder with the kit's files", () => {
    const cwd = temp();
    mkdirSync(join(cwd, "local/flows"), { recursive: true });
    writeFileSync(join(cwd, "local/standard.yaml"), "mine\n");
    writeFileSync(join(cwd, "local/flows/orders.yaml"), "mine\n");
    const { code, output } = ingestron(
      cwd,
      "init",
      "local",
      "--kit",
      "duckdb/local-medallion@2026-11-10",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      "Nothing written: these files already exist in local:\n  flows/orders.yaml\n  standard.yaml\n",
    );
    expect(readdirSync(join(cwd, "local")).sort()).toEqual(["flows", "standard.yaml"]);
    expect(readFileSync(join(cwd, "local/standard.yaml"), "utf8")).toBe("mine\n");
  });

  it("refuses --kit with --template or --standard", () => {
    const cwd = temp();
    for (const other of [
      ["--template", "duckdb"],
      ["--standard", "standard.yaml"],
    ]) {
      const { code, output } = ingestron(
        cwd,
        "init",
        "x",
        "--kit",
        "duckdb/local-medallion",
        ...other,
      );
      expect(code).toBe(1);
      expect(output).toBe("Choose --kit, --template or --standard, not two.\n");
    }
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe("init --kit with connection options", () => {
  it("the kit gives the standard, project.yaml and platform.yaml; the route the source", () => {
    const cwd = temp();
    const { code, output } = ingestron(
      cwd,
      "init",
      "lake",
      "--kit",
      "databricks/lakehouse-streaming@2026-11-10",
      "--connector",
      "files",
      "--via",
      "databricks",
      "--yes",
    );
    expect(code, output).toBe(0);
    expect(output).toMatch(
      /^Created lake from the kit databricks\/lakehouse-streaming@2026-11-10 and files via databricks \(\d+ files\)\.\n/,
    );
    const folder = join(cwd, "lake");
    const kit = (file: string) => readFileSync(join(databricksKit.folder, file), "utf8");
    const written = (file: string) => readFileSync(join(folder, file), "utf8");
    expect(written("standard.yaml")).toBe(kit("standard.yaml"));
    expect(written("STANDARD.md")).toBe(kit("README.md"));
    // The kit's examples are not written; the route's are.
    expect(existsSync(join(folder, "flows/customers.yaml"))).toBe(false);
    expect(existsSync(join(folder, "transforms"))).toBe(false);
    expect(written("flows/orders.yaml")).not.toBe(kit("flows/orders.yaml"));
    // The kit's platform.yaml, with its comments.
    expect(written("platform.yaml")).toContain(
      "# Application ID of the service principal the pipelines and jobs run as",
    );
    // project.yaml: the kit's, with its comments, and the route's keys it lacks.
    const project = written("project.yaml");
    expect(project).toMatch(/^id: lake$/m);
    expect(project).toContain("      # The dev workspace's URL");
    // The kit writes landing for every environment, so the route's top-level landing is not
    // added: it would be a REPLACE_ME that nothing reads.
    // The top-level values are the kit's own two groups only.
    expect(project).toMatch(
      /^values:\n {2}# Group that manages[^\n]*\n {2}engineers: REPLACE_ME\n {2}# Group that may view[^\n]*\n {2}analysts: REPLACE_ME\nenvironments:\n/m,
    );
    expect(project).not.toMatch(/^ {2}landing: REPLACE_ME/m);
    expect(project.match(/landing: REPLACE_ME/g)).toHaveLength(2);
    expect(ingestron(folder, "plan").code).toBe(0);
  });

  it("refuses a route that needs a pack the kit does not use", () => {
    const cwd = temp();
    const { code, output } = ingestron(
      cwd,
      "init",
      "x",
      "--kit",
      "duckdb/local-medallion@2026-11-10",
      "--connector",
      "files",
      "--via",
      "databricks",
      "--yes",
    );
    expect(code).toBe(1);
    expect(output).toBe(
      "The kit duckdb/local-medallion uses duckdb@2; the route databricks needs databricks@2.\n",
    );
    expect(readdirSync(cwd)).toEqual([]);
  });
});
