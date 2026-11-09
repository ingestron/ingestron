// The API computes and returns; printing belongs to whoever calls it, such as
// the command line. So no source file writes to the terminal.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = join(import.meta.dirname, "../src");

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : name.endsWith(".ts") ? [path] : [];
  });
}

/** The code without its comments, whose examples may print. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("@ingestron/core", () => {
  it("never writes to the terminal", () => {
    const writing = sourceFiles(source).filter((file) =>
      /process\.(stdout|stderr)|\bconsole\.|\bio\.write\(/.test(code(readFileSync(file, "utf8"))),
    );
    expect(writing).toEqual([]);
  });
});
