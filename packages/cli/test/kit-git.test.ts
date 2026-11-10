// How a kit's git URL is shown, and how git runs on the catalogue (spec/cli/kits.md, "Where kits
// are found" and "Git"). A git on PATH made in the test stands in for the real one: no network.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitTimeouts } from "../src/commands/clone.js";
import { ingestron, offlineCatalogue, temp } from "./kit-catalogue.js";

offlineCatalogue();

describe("init --kit never shows a URL's user name and password", () => {
  it.each([
    [
      "https://user:s3cret@example.com/kits.git",
      `The kit "https://example.com/kits.git" is a git URL; add the kit's folder and tag: <git-url>#<path>@<tag>.\n`,
    ],
    [
      "https://user:s3cret@example.com/kits.git#kits/a/b",
      `The kit "https://example.com/kits.git#kits/a/b" needs a tag after the folder: <git-url>#<path>@<tag>.\n`,
    ],
  ])("%s", (spec, message) => {
    const { code, output } = ingestron(temp(), "init", "x", "--kit", spec);
    expect(code).toBe(1);
    expect(output).toBe(message);
    expect(output).not.toContain("s3cret");
  });
});

describe("git on the catalogue", () => {
  /** A folder with a `git` that runs `script`, put first on PATH for `body`. */
  function withGit(script: string, body: () => void): void {
    const bin = temp();
    writeFileSync(join(bin, "git"), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, "git"), 0o755);
    const saved = { path: process.env.PATH, timeouts: { ...gitTimeouts } };
    process.env.PATH = `${bin}${delimiter}${saved.path ?? ""}`;
    try {
      body();
    } finally {
      process.env.PATH = saved.path;
      Object.assign(gitTimeouts, saved.timeouts);
    }
  }

  it("never waits for a password from git or ssh, keeping the user's own ssh command", () => {
    const out = join(temp(), "env.txt");
    const savedSsh = process.env.GIT_SSH_COMMAND;
    try {
      withGit(`echo "$GIT_TERMINAL_PROMPT|$GIT_SSH_COMMAND" >> "${out}"; exit 128`, () => {
        delete process.env.GIT_SSH_COMMAND;
        ingestron(temp(), "standard", "list");
        process.env.GIT_SSH_COMMAND = "ssh -i ~/.ssh/kits";
        ingestron(temp(), "init", "x", "--kit", "file:///no/such.git#kits/a/b@v1");
      });
    } finally {
      if (savedSsh === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = savedSsh;
    }
    expect(readFileSync(out, "utf8")).toBe(
      "0|ssh -o BatchMode=yes\n0|ssh -i ~/.ssh/kits -o BatchMode=yes\n",
    );
  });

  it("stops git when it does not answer in time", () => {
    withGit("exec sleep 5", () => {
      gitTimeouts.lsRemote = 200;
      gitTimeouts.clone = 300;
      const listed = ingestron(temp(), "standard", "list", "--platform", "duckdb");
      expect(listed.output).toBe(
        "Could not reach the catalogue; showing the kits installed with ingestron.\nduckdb/local-medallion@2026-11-10  Local medallion on DuckDB  (ga)\n",
      );
      const named = ingestron(temp(), "init", "x", "--kit", "duckdb/shop@2026-10-01");
      expect(named.output).toBe(
        "The kit duckdb/shop@2026-10-01 is not installed, and the catalogue could not be read: git did not answer within 0.2 seconds.\n",
      );
      const url = ingestron(temp(), "init", "x", "--kit", "file:///no/such.git#kits/a/b@v1");
      expect(url.output).toBe(
        "Could not clone file:///no/such.git: git did not answer within 0.3 seconds.\n",
      );
    });
  });
});
