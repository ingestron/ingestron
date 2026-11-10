// How a kit's git URL is shown, and how git runs on the catalogue (spec/cli/kits.md, "Where kits
// are found" and "Git"). A git on PATH made in the test stands in for the real one: no network.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitTimeouts, kitGit, kitSshCommand } from "../src/commands/clone.js";
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
      withGit(
        `[ "$1" = config ] && exit 1\necho "$GIT_TERMINAL_PROMPT|$GIT_SSH_COMMAND" >> "${out}"; exit 128`,
        () => {
          delete process.env.GIT_SSH_COMMAND;
          ingestron(temp(), "standard", "list");
          process.env.GIT_SSH_COMMAND = "ssh -i ~/.ssh/kits";
          ingestron(temp(), "init", "x", "--kit", "file:///no/such.git#kits/a/b@v1");
        },
      );
    } finally {
      if (savedSsh === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = savedSsh;
    }
    expect(readFileSync(out, "utf8")).toBe(
      "0|ssh -o BatchMode=yes\n0|ssh -i ~/.ssh/kits -o BatchMode=yes\n",
    );
  });

  it("stops git when it does not answer in time", () => {
    withGit('[ "$1" = config ] && exit 1\nexec sleep 5', () => {
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

describe("the ssh command of a kit's git calls", () => {
  const names = [
    "GIT_SSH_COMMAND",
    "GIT_SSH",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  /** The ssh command a kit's git call runs with, for this environment. */
  function sshFor(env: Record<string, string | undefined>): string | undefined {
    for (const name of names) delete process.env[name];
    for (const [name, value] of Object.entries(env))
      if (value !== undefined) process.env[name] = value;
    return kitGit("https://example.com/kits.git", temp(), 5_000).env.GIT_SSH_COMMAND;
  }
  const config = (value: string) => ({
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.sshCommand",
    GIT_CONFIG_VALUE_0: value,
  });

  it("keeps core.sshCommand and adds BatchMode after it", () => {
    expect(sshFor(config("ssh -i ~/.ssh/work"))).toBe("ssh -i ~/.ssh/work -o BatchMode=yes");
  });

  it("keeps an explicit GIT_SSH_COMMAND over core.sshCommand", () => {
    const env = { ...config("ssh -i ~/.ssh/work"), GIT_SSH_COMMAND: "ssh -i ~/.ssh/kits" };
    expect(sshFor(env)).toBe("ssh -i ~/.ssh/kits -o BatchMode=yes");
  });

  it("keeps GIT_SSH when there is no other setting", () => {
    expect(sshFor({ GIT_SSH: "/opt/bin/wrapper" })).toBe("/opt/bin/wrapper -o BatchMode=yes");
    expect(sshFor({ GIT_SSH: "/opt/my bin/wrapper" })).toBe(
      "'/opt/my bin/wrapper' -o BatchMode=yes",
    );
  });

  it("reads core.sshCommand before GIT_SSH, as git does", () => {
    expect(sshFor({ ...config("ssh -i ~/.ssh/work"), GIT_SSH: "/opt/bin/wrapper" })).toBe(
      "ssh -i ~/.ssh/work -o BatchMode=yes",
    );
  });

  it("uses ssh when nothing is set", () => {
    expect(sshFor({})).toBe("ssh -o BatchMode=yes");
  });

  it("builds the command from the environment and a reader of core.sshCommand", () => {
    expect(kitSshCommand({}, () => undefined)).toBe("ssh -o BatchMode=yes");
    expect(kitSshCommand({ GIT_SSH_COMMAND: " ssh -F x " }, () => "never")).toBe(
      "ssh -F x -o BatchMode=yes",
    );
    expect(kitSshCommand({}, () => "  ")).toBe("ssh -o BatchMode=yes");
  });
});
