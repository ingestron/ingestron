// ingestron request while a variable is not set: what it cannot work out is left out and
// named by its unset variables only, and the checks that wait are said (spec/cli/request.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanUp,
  ingestron,
  project,
  section,
  withVariables,
  workspace,
} from "./request-fixtures.js";

cleanUp();

describe("ingestron request and what is not known yet", () => {
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
      "The source of flow `orders` holds `${envvar:INGT_REQ_SOURCE}`, which is not set, so it is not known yet and nothing its tables need is listed.",
    );
    expect(values).toContain("Any SQL to run once is left out");
    expect(output).not.toContain("## SQL to run once");
  });

  it.each([
    ["written in the flow", "source: ${envvar:P_PREFIX}${envvar:P_SUFFIX}", ""],
    [
      "copied from a value",
      "source: ${values.source}",
      "  source: ${envvar:P_PREFIX}${envvar:P_SUFFIX}\n",
    ],
  ])(
    "names only the unset variables of a source not known, never a set value %s",
    (_, source, value) => {
      const folder = withVariables();
      writeFileSync(join(folder, ".env.dev"), "P_PREFIX=topsecretprefix\n");
      writeFileSync(
        join(folder, "project.yaml"),
        project.replace("values:\n", `values:\n${value}`),
      );
      writeFileSync(
        join(folder, "flows/orders.yaml"),
        `apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\n${source}\n` +
          "tables:\n  orders: { object: orders, contract: shop.orders }\n",
      );
      const { code, output } = ingestron(folder, "request", "--env", "dev");
      expect(code).toBe(0);
      expect(output).toContain(
        "The source of flow `orders` holds `${envvar:P_SUFFIX}`, which is not set, so it is not known yet",
      );
      expect(output).not.toContain("topsecretprefix");
    },
  );

  it("names a table left out because its contract is not set, and a transform that reads it", () => {
    const folder = withVariables();
    writeFileSync(
      join(folder, "project.yaml"),
      project.replace("contracts/*.yaml]", "contracts/*.yaml, transforms/*.yaml]"),
    );
    writeFileSync(
      join(folder, "flows/orders.yaml"),
      "apiVersion: ingestron.io/v1\nkind: Flow\nid: orders\nsource: shop\n" +
        'tables:\n  orders: { object: orders, contract: "${envvar:P_CONTRACT}" }\n',
    );
    mkdirSync(join(folder, "transforms"));
    writeFileSync(
      join(folder, "transforms/recent.yaml"),
      "apiVersion: ingestron.io/v1\nkind: Transform\nid: recent\ninputs: [orders]\n" +
        "contract: shop.orders\ncode: SELECT * FROM {{ tables.orders }}\n",
    );
    const { code, output } = ingestron(folder, "request", "--env", "dev");
    expect(code).toBe(0);
    const values = section(output, "Values to provide");
    expect(values).toContain(
      "Table `orders` is left out: it is made from `${envvar:P_CONTRACT}`, which is not set.",
    );
    expect(values).toContain("Table `recent` is left out: it reads `orders`, which is left out.");
    expect(values).toContain(
      "The lists below leave these tables out, and so does any SQL to run once.",
    );
  });

  it("says the checks of the whole project wait for the values, and to run check", () => {
    const folder = workspace({
      "project.yaml": project.replace("contracts/*.yaml]", "contracts/*.yaml, platform.yaml]"),
      "platform.yaml":
        "apiVersion: ingestron.io/v1\nkind: Platform\nid: dev\ncompute: { serverless: false }\n",
    });
    const { code, output } = ingestron(folder, "request", "--env", "dev");
    expect(code).toBe(0);
    expect(section(output, "Values to provide")).toContain(
      "Until every variable is set, some checks may not have run: each pack's checks of the whole project",
    );
    expect(output).toContain("run `ingestron check` to run them.");
    // Once the value is set, the pack's check runs and the problem is found.
    process.env.INGT_REQ_LANDING = "/Volumes/synthetic/landing";
    const set = ingestron(folder, "request", "--env", "dev");
    expect(set.code).toBe(1);
    expect(ingestron(folder, "plan", "--env", "dev").output).toContain("classic compute");
  });
});
