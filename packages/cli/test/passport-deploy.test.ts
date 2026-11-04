// Passports in build/products, from the same run as the pipelines, and each value
// supplied when deploying written by its variable's name (spec/cli/passport.md).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { project } from "./passport-fixtures.js";

describe("passports generated with every environment", () => {
  it("writes every environment's passports in build/products, beside the bundle", () => {
    const folder = project();
    let output = "";
    const io = { cwd: folder, write: (text: string) => (output += text) };
    expect(run(["apply"], io), output).toBe(0);
    expect(output).toContain("products → build/products (dev, prod)");
    for (const environment of ["dev", "prod"])
      expect(
        readFileSync(join(folder, "build/products", environment, "sales.md"), "utf8"),
      ).toContain("# Daily sales");
  });

  it("writes a value supplied when deploying by its variable's name, never a value from the host", () => {
    const folder = project((root) => {
      const file = join(root, "contracts/customers.product.yaml");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace(
          '"https://example.com/customer-data"',
          '"${envvar:INGT_SUPPORT_URL}"',
        ),
      );
    });
    process.env.INGT_SUPPORT_URL = "https://from-host.example.com";
    try {
      expect(run(["apply"], { cwd: folder, write: () => undefined })).toBe(0);
    } finally {
      delete process.env.INGT_SUPPORT_URL;
    }
    const page = readFileSync(join(folder, "build/products/dev/customers.md"), "utf8");
    expect(page).toContain(
      "- Ask: customer-data (teams), `INGT_SUPPORT_URL` (supplied when deploying)",
    );
    expect(page).not.toContain("from-host");
  });

  it("writes a word that holds a value supplied when deploying as code, with the name in its place", () => {
    const folder = project((root) => {
      const file = join(root, "contracts/customers.product.yaml");
      writeFileSync(
        file,
        readFileSync(file, "utf8").replace(
          '"https://example.com/customer-data"',
          '"https://${envvar:INGT_TEAMS_HOST}/teams/customer-data"',
        ),
      );
    });
    expect(run(["apply"], { cwd: folder, write: () => undefined })).toBe(0);
    const page = readFileSync(join(folder, "build/products/prod/customers.md"), "utf8");
    expect(page).toContain(
      "- Ask: customer-data (teams), `https://<INGT_TEAMS_HOST>/teams/customer-data` (`INGT_TEAMS_HOST` supplied when deploying)",
    );
  });
});
