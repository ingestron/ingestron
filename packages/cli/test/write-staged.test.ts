// writeStaged: several files written together, so a failure leaves every target as it was.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WriteRefused, writeStaged } from "../src/commands/write-staged.js";
import { temp } from "./assistant-helpers.js";

describe("writeStaged", () => {
  it("writes new and existing files, creating folders, and leaves no temporary file", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    writeStaged([
      { file: join(folder, "sources/erp.yaml"), text: "document\n" },
      { file: join(folder, "project.yaml"), text: "new\n" },
    ]);
    expect(readFileSync(join(folder, "sources/erp.yaml"), "utf8")).toBe("document\n");
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("new\n");
    expect(readdirSync(folder).sort()).toEqual(["project.yaml", "sources"]);
    expect(readdirSync(join(folder, "sources"))).toEqual(["erp.yaml"]);
  });

  it("writes neither file when the second is a folder, before creating anything", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    mkdirSync(join(folder, "other.yaml"));
    expect(() =>
      writeStaged([
        { file: join(folder, "sources/erp.yaml"), text: "document\n" },
        { file: join(folder, "other.yaml"), text: "new\n" },
      ]),
    ).toThrow(/not a regular file/);
    expect(readdirSync(folder).sort()).toEqual(["other.yaml", "project.yaml"]);
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("old\n");
  });

  it("keeps an existing file as it was, and leaves no temporary file, when the second fails to stage", () => {
    const folder = temp();
    writeFileSync(join(folder, "a.yaml"), "kept\n");
    // A file where the second file's folder should be: the folder cannot be made.
    writeFileSync(join(folder, "blocker"), "a file\n");
    expect(() =>
      writeStaged([
        { file: join(folder, "a.yaml"), text: "changed\n" },
        { file: join(folder, "blocker/b.yaml"), text: "x\n" },
      ]),
    ).toThrow();
    expect(readFileSync(join(folder, "a.yaml"), "utf8")).toBe("kept\n");
    expect(readdirSync(folder).sort()).toEqual(["a.yaml", "blocker"]);
  });

  it("keeps an existing file's mode", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    chmodSync(join(folder, "project.yaml"), 0o640);
    writeStaged([{ file: join(folder, "project.yaml"), text: "new\n" }]);
    expect(statSync(join(folder, "project.yaml")).mode & 0o777).toBe(0o640);
  });

  it("refuses a link, writing nothing and leaving the file it points at unchanged", () => {
    const folder = temp();
    const elsewhere = join(temp(), "project.yaml");
    writeFileSync(elsewhere, "old\n");
    symlinkSync(elsewhere, join(folder, "project.yaml"));
    expect(() =>
      writeStaged([
        { file: join(folder, "sources/erp.yaml"), text: "document\n" },
        { file: join(folder, "project.yaml"), text: "new\n" },
      ]),
    ).toThrow(WriteRefused);
    expect(readFileSync(elsewhere, "utf8")).toBe("old\n");
    expect(lstatSync(join(folder, "project.yaml")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
    expect(readdirSync(folder).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses a link to a missing file and a link made to a new target", () => {
    const folder = temp();
    const elsewhere = join(temp(), "made-by-link.yaml");
    symlinkSync(elsewhere, join(folder, "erp.yaml"));
    expect(() => writeStaged([{ file: join(folder, "erp.yaml"), text: "x\n" }])).toThrow(
      /not a regular file/,
    );
    expect(existsSync(elsewhere)).toBe(false);
  });

  it("refuses a file this user cannot write, as writing it in place would fail", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    chmodSync(join(folder, "project.yaml"), 0o444);
    if (process.getuid?.() === 0) return;
    expect(() => writeStaged([{ file: join(folder, "project.yaml"), text: "new\n" }])).toThrow(
      WriteRefused,
    );
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("old\n");
  });

  it.skipIf(process.getuid?.() === 0)(
    "refuses a folder it cannot write to by the target's path, not a temporary file's",
    () => {
      const folder = temp();
      mkdirSync(join(folder, "sources"));
      chmodSync(join(folder, "sources"), 0o555);
      try {
        const file = join(folder, "sources/erp.yaml");
        let refused: unknown;
        try {
          writeStaged([{ file, text: "x\n" }]);
        } catch (error) {
          refused = error;
        }
        expect(refused).toBeInstanceOf(WriteRefused);
        expect((refused as WriteRefused).file).toBe(file);
        expect((refused as WriteRefused).code).toBe("EACCES");
        expect(readdirSync(join(folder, "sources"))).toEqual([]);
      } finally {
        chmodSync(join(folder, "sources"), 0o755);
      }
    },
  );
});
