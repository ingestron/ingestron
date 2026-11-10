// Where the installed kits are found (spec/cli/kits.md, "Where kits are found"): the
// @ingestron/standards package's kits folder, else a kits folder a bundled release copies
// beside its code.
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bundledKitsFolder } from "../src/folders.js";
import { standardsKitsFolder } from "../src/kits/index.js";

const made: string[] = [];
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true });
});

function folder(): string {
  const path = mkdtempSync(join(tmpdir(), "ingestron-kits-folder-"));
  made.push(path);
  mkdirSync(join(path, "kits"));
  return join(path, "kits");
}

describe("standardsKitsFolder", () => {
  it("is the @ingestron/standards package's kits folder when the package resolves", () => {
    const found = standardsKitsFolder();
    expect(found).toBeDefined();
    expect(realpathSync(found!)).toBe(
      realpathSync(join(import.meta.dirname, "../node_modules/@ingestron/standards/kits")),
    );
  });

  it("is the bundled kits folder when the package cannot be resolved", () => {
    const bundled = folder();
    expect(standardsKitsFolder([undefined, bundled])).toBe(bundled);
  });

  it("skips a package folder that has no kits", () => {
    const bundled = folder();
    expect(standardsKitsFolder([join(bundled, "../missing"), bundled])).toBe(bundled);
  });

  it("is undefined when neither exists", () => {
    expect(standardsKitsFolder([undefined, join(folder(), "../missing")])).toBeUndefined();
  });
});

describe("bundledKitsFolder", () => {
  // Compiled, folders.ts sits in dist/; bundled, in the bundle's own folder: either way the
  // kits folder a release copies sits beside that folder, as project-templates does.
  it("names kits beside the code's folder, as templatesFolder names project-templates", () => {
    expect(bundledKitsFolder).toBe(resolve(import.meta.dirname, "../kits"));
  });
});
