// ingestron source import when a file cannot be written (spec/cli/sources.md, section 6): a
// refusal that names the path from the project folder, with no summary and no stack trace.
import { chmodSync, existsSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { read, withCatalog } from "./source-projects.js";

describe("ingestron source import, refusing a file it cannot write", () => {
  it("prints no summary before refusing a document that is a link", () => {
    const { folder, ingestron } = withCatalog();
    const outside = join(mkdtempSync(join(tmpdir(), "ingestron-outside-")), "erp.yaml");
    writeFileSync(outside, "theirs\n");
    symlinkSync(outside, join(folder, "sources/erp.yaml"));
    const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    expect(code).toBe(1);
    expect(output).not.toContain("added");
    expect(output).not.toContain("Wrote");
    expect(output).toBe(
      "sources/erp.yaml is not a regular file (it is a link or a folder). Nothing was written.\n",
    );
  });

  it.skipIf(process.getuid?.() === 0)(
    "refuses a read-only document by its project-relative path, with no stack trace",
    () => {
      const { folder, ingestron } = withCatalog();
      ingestron("source", "import", "erp", "sources/erp.catalog.csv");
      chmodSync(join(folder, "sources/erp.yaml"), 0o444);
      const before = read(folder, "sources/erp.yaml");
      const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
      expect(code).toBe(1);
      expect(output).toBe("Could not write sources/erp.yaml: EACCES. Nothing was written.\n");
      expect(read(folder, "sources/erp.yaml")).toBe(before);
    },
  );

  it.skipIf(process.getuid?.() === 0)(
    "refuses a read-only project.yaml the import would change, writing neither file",
    () => {
      const { folder, ingestron } = withCatalog();
      chmodSync(join(folder, "project.yaml"), 0o444);
      const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
      expect(code).toBe(1);
      expect(output).toBe("Could not write project.yaml: EACCES. Nothing was written.\n");
      expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
    },
  );
});
