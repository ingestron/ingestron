// Where the installed kits are found (spec/cli/kits.md, "Where kits are found"): the kits folder
// a bundled release copies beside its code first, then the @ingestron/standards package's.
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bundledKitsFolder } from "../src/folders.js";
import { kitsFolderCandidates } from "../src/kits/find.js";
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

const packageKits = realpathSync(
  join(import.meta.dirname, "../node_modules/@ingestron/standards/kits"),
);

describe("kitsFolderCandidates", () => {
  it("looks beside the code first, then in the @ingestron/standards package", () => {
    const [first, second] = kitsFolderCandidates();
    expect(first).toBe(bundledKitsFolder);
    expect(realpathSync(second!)).toBe(packageKits);
  });
});

describe("standardsKitsFolder", () => {
  it("is the package's kits folder when nothing is copied beside the code", () => {
    const found = standardsKitsFolder();
    expect(found).toBeDefined();
    expect(realpathSync(found!)).toBe(packageKits);
  });

  it("is the bundled kits folder when it exists, even when the package resolves", () => {
    const bundled = folder();
    expect(standardsKitsFolder([bundled, packageKits])).toBe(bundled);
  });

  it("is the bundled kits folder when the package cannot be resolved", () => {
    const bundled = folder();
    expect(standardsKitsFolder([bundled, undefined])).toBe(bundled);
  });

  it("is the package's kits folder when no bundled folder exists", () => {
    expect(standardsKitsFolder([join(folder(), "../missing"), packageKits])).toBe(packageKits);
  });

  it("is undefined when neither exists", () => {
    expect(standardsKitsFolder([join(folder(), "../missing"), undefined])).toBeUndefined();
  });
});

describe("bundledKitsFolder", () => {
  // Compiled, folders.ts sits in dist/; bundled, in the bundle's own folder: either way the
  // kits folder a release copies sits beside that folder, as project-templates does.
  it("names kits beside the code's folder, as templatesFolder names project-templates", () => {
    expect(bundledKitsFolder).toBe(resolve(import.meta.dirname, "../kits"));
  });
});
