// The CLI's version is a constant written from its package.json when it is built, so a bundle
// that carries the CLI (the ingestron npm package, the VS Code extension) reports the CLI's own
// version, whatever package.json sits beside the bundle.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

describe("pnpm check:version", () => {
  /** Runs the script with --check in a copy of the package holding `version` and `written`. */
  function check(version: string, written: string) {
    const root = mkdtempSync(join(tmpdir(), "ingestron-version-"));
    mkdirSync(join(root, "src"));
    cpSync(join(import.meta.dirname, "../scripts"), join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ version }));
    writeFileSync(
      join(root, "src/manifest-version.ts"),
      readFileSync(join(import.meta.dirname, "../src/manifest-version.ts"), "utf8").replace(
        /"[^"]+";/,
        `"${written}";`,
      ),
    );
    const run = spawnSync(process.execPath, [join(root, "scripts/write-version.mjs"), "--check"], {
      encoding: "utf8",
    });
    return {
      status: run.status,
      stderr: run.stderr,
      after: readFileSync(join(root, "src/manifest-version.ts"), "utf8"),
    };
  }

  it("fails a manifest-version.ts that is not package.json's version, and writes nothing", () => {
    const stale = check("9.9.9", "2.3.0");
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain(
      "src/manifest-version.ts does not hold package.json's version 9.9.9. Run pnpm build and commit the file.",
    );
    expect(stale.after).toContain('"2.3.0";');
  });

  it("passes when the two agree", () => {
    expect(check("9.9.9", "9.9.9").status).toBe(0);
  });

  it("runs in pnpm validate before the build, which would rewrite the file", () => {
    const { scripts } = JSON.parse(
      readFileSync(join(import.meta.dirname, "../package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(scripts.validate).toMatch(/^pnpm check:version && /);
  });
});
