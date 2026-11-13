// writeStaged when writing a temporary file fails and so does removing it: the refusal keeps the
// first error and names the target, never the temporary file. And a coded error with no path
// names the file the import writes (spec/cli/sources.md, section 6).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as nodeFs from "node:fs";
import { temp } from "./assistant-helpers.js";

/** What is to fail: writing a temporary file, removing it, and looking at a target. */
const behave = vi.hoisted(() => ({ write: false, unlink: false, lstat: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  const fail = (code: string, path?: string) =>
    Object.assign(new Error("stubbed"), { code, ...(path !== undefined && { path }) });
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (behave.write && typeof args[0] === "number") throw fail("ENOSPC");
      actual.writeFileSync(...args);
    },
    unlinkSync: (path: nodeFs.PathLike) => {
      if (behave.unlink) throw fail("EPERM", String(path));
      actual.unlinkSync(path);
    },
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
      if (behave.lstat) throw fail("EIO");
      return actual.lstatSync(...args);
    },
  };
});

const { WriteRefused, writeStaged } = await import("../src/commands/write-staged.js");
const { withCatalog } = await import("./source-projects.js");

beforeEach(() => {
  behave.write = false;
  behave.unlink = false;
  behave.lstat = false;
});

describe("writeStaged, when a temporary file cannot be written or removed", () => {
  it("refuses with the write's error, naming the target", () => {
    const folder = temp();
    behave.write = true;
    behave.unlink = true;
    let refused: unknown;
    try {
      writeStaged([{ file: join(folder, "a.yaml"), text: "a\n" }]);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(WriteRefused);
    expect((refused as InstanceType<typeof WriteRefused>).code).toBe("ENOSPC");
    expect((refused as InstanceType<typeof WriteRefused>).file).toBe(join(folder, "a.yaml"));
    expect(existsSync(join(folder, "a.yaml"))).toBe(false);
  });
});

describe("ingestron source import, refusing a write", () => {
  it("names the document, not a temporary file, when the temporary file cannot be removed", () => {
    const { folder, ingestron } = withCatalog();
    behave.write = true;
    behave.unlink = true;
    const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    expect(code).toBe(1);
    expect(output).toBe("Could not write sources/erp.yaml: ENOSPC. Nothing was written.\n");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
  });

  it("names the document for a coded error that carries no path", () => {
    const { ingestron } = withCatalog();
    behave.lstat = true;
    const { code, output } = ingestron("source", "import", "erp", "sources/erp.catalog.csv");
    behave.lstat = false;
    expect(code).toBe(1);
    expect(output).toBe("Could not write sources/erp.yaml: EIO. Nothing was written.\n");
  });
});
