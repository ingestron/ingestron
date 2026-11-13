// writeStaged when a rename fails after the first succeeded: the first file stays, and the
// refusal says so instead of saying nothing was written (spec/cli/sources.md, section 6).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as nodeFs from "node:fs";
import { temp } from "./assistant-helpers.js";

/** The rename that is to fail: the call it fails on (counting from 1) and the code it gives. */
const behave = vi.hoisted(() => ({ failOn: 0, calls: 0, code: "EIO" }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      behave.calls += 1;
      if (behave.calls === behave.failOn)
        throw Object.assign(new Error("stubbed"), { code: behave.code, path: from });
      actual.renameSync(from, to);
    },
  };
});

const { WriteRefused, writeStaged } = await import("../src/commands/write-staged.js");
const { withCatalog } = await import("./source-projects.js");

beforeEach(() => {
  behave.failOn = 0;
  behave.calls = 0;
});

describe("writeStaged, when the second rename fails", () => {
  it("keeps the first file, and refuses naming the second and the first", () => {
    const folder = temp();
    mkdirSync(join(folder, "sources"));
    writeFileSync(join(folder, "project.yaml"), "old\n");
    behave.failOn = 2;
    let refused: unknown;
    try {
      writeStaged([
        { file: join(folder, "sources/erp.yaml"), text: "document\n" },
        { file: join(folder, "project.yaml"), text: "new\n" },
      ]);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(WriteRefused);
    const error = refused as InstanceType<typeof WriteRefused>;
    expect(error.file).toBe(join(folder, "project.yaml"));
    expect(error.code).toBe("EIO");
    expect(error.written).toBe(join(folder, "sources/erp.yaml"));
    expect(readFileSync(join(folder, "sources/erp.yaml"), "utf8")).toBe("document\n");
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("old\n");
  });

  it("refuses with nothing written when the first rename fails", () => {
    const folder = temp();
    behave.failOn = 1;
    let refused: unknown;
    try {
      writeStaged([
        { file: join(folder, "a.yaml"), text: "a\n" },
        { file: join(folder, "b.yaml"), text: "b\n" },
      ]);
    } catch (error) {
      refused = error;
    }
    expect((refused as { code?: string }).code).toBe("EIO");
    expect((refused as { written?: string }).written).toBeUndefined();
  });
});

describe("ingestron source import, when the second rename fails", () => {
  it("says the document was written and the import is to be run again", () => {
    const { folder, ingestron } = withCatalog();
    behave.failOn = 2;
    const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    expect(code).toBe(1);
    expect(output).toBe(
      "Could not write project.yaml: EIO. sources/erp.yaml was written; import again to finish.\n",
    );
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(true);
  });
});
