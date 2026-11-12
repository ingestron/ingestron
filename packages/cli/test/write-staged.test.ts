// writeStaged: several files written together, so a failure leaves every target as it was.
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeStaged } from "../src/commands/write-staged.js";
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

  it("writes neither file when the second cannot be written", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    // A folder where project.yaml should be: the second file cannot be staged.
    mkdirSync(join(folder, "other.yaml"));
    expect(() =>
      writeStaged([
        { file: join(folder, "sources/erp.yaml"), text: "document\n" },
        { file: join(folder, "other.yaml"), text: "new\n" },
      ]),
    ).toThrow(/is not a file/);
    expect(readdirSync(folder).sort()).toEqual(["other.yaml", "project.yaml", "sources"]);
    expect(readdirSync(join(folder, "sources"))).toEqual([]);
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("old\n");
  });

  it("keeps an existing file as it was when the second cannot be written", () => {
    const folder = temp();
    writeFileSync(join(folder, "a.yaml"), "kept\n");
    mkdirSync(join(folder, "b.yaml"));
    expect(() =>
      writeStaged([
        { file: join(folder, "a.yaml"), text: "changed\n" },
        { file: join(folder, "b.yaml"), text: "x\n" },
      ]),
    ).toThrow();
    expect(readFileSync(join(folder, "a.yaml"), "utf8")).toBe("kept\n");
    expect(readdirSync(folder).sort()).toEqual(["a.yaml", "b.yaml"]);
  });

  it("keeps an existing file's mode", () => {
    const folder = temp();
    writeFileSync(join(folder, "project.yaml"), "old\n");
    chmodSync(join(folder, "project.yaml"), 0o640);
    writeStaged([{ file: join(folder, "project.yaml"), text: "new\n" }]);
    expect(statSync(join(folder, "project.yaml")).mode & 0o777).toBe(0o640);
  });

  it("writes through a link to the file it points at, keeping the link", () => {
    const folder = temp();
    const elsewhere = join(temp(), "project.yaml");
    writeFileSync(elsewhere, "old\n");
    symlinkSync(elsewhere, join(folder, "project.yaml"));
    writeStaged([{ file: join(folder, "project.yaml"), text: "new\n" }]);
    expect(readFileSync(elsewhere, "utf8")).toBe("new\n");
    expect(readFileSync(join(folder, "project.yaml"), "utf8")).toBe("new\n");
    expect(readdirSync(folder)).toEqual(["project.yaml"]);
  });
});
