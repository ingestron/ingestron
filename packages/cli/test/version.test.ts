// The CLI's version is a constant written from its package.json when it is built, so a bundle
// that carries the CLI (the ingestron npm package, the VS Code extension) reports the CLI's own
// version, whatever package.json sits beside the bundle.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestVersion } from "../src/manifest-version.js";
import { cliVersion } from "../src/version.js";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
  version: string;
};

describe("cliVersion", () => {
  it("is the version in package.json, written at build time (pnpm build)", () => {
    expect(manifestVersion).toBe(manifest.version);
    expect(cliVersion()).toBe(manifest.version);
  });

  it("reads no file, so it holds in a bundle", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/version.ts"), "utf8");
    expect(source).not.toMatch(/readFileSync|import\.meta|new URL/);
  });
});
