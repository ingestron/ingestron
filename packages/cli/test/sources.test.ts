// Where templates and standards come from: built-in names, folders and Git URLs.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isGitUrl, standardSource, templateSource } from "../src/sources.js";
import { builtInTemplates } from "../src/templates.js";

const temp = (prefix = "ingestron-sources-test-") => mkdtempSync(join(tmpdir(), prefix));

/** A bare repository holding the minimal template under templates/lake and a standard. */
function repository(): string {
  const work = temp();
  const lake = join(work, "templates/lake");
  mkdirSync(lake, { recursive: true });
  cpSync(builtInTemplates().find((item) => item.name === "minimal")!.folder, lake, {
    recursive: true,
    filter: (path) => !path.includes("/build"),
  });
  writeFileSync(
    join(work, "acme.yaml"),
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [databricks@1]\n",
  );
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, stdio: "ignore" });
  git("init", "--quiet", "--initial-branch", "main");
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "--quiet",
    "-m",
    "templates",
  );
  const bare = join(temp(), "templates.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare], { stdio: "ignore" });
  return `file://${bare}`;
}

describe("templateSource", () => {
  it("finds a built-in template by name", () => {
    const source = templateSource("minimal", "/");
    expect(source.template.title).toBe("Minimal project");
    source.done();
  });

  it("reads a folder relative to the working folder", () => {
    const parent = temp();
    cpSync(builtInTemplates()[0]!.folder, join(parent, "mine"), { recursive: true });
    expect(templateSource("./mine", parent).template.name).toBe("mine");
  });

  it("clones a Git URL, takes the folder after #, and removes the clone when done", () => {
    const source = templateSource(`${repository()}#templates/lake`, "/");
    expect(source.template.questions[0]?.value).toBe("landing");
    source.done();
    expect(existsSync(source.template.folder)).toBe(false);
  });

  it("names the URL when it cannot be cloned, and leaves nothing behind", () => {
    // Its own temporary folder, so clones by other test files cannot interfere.
    const own = temp();
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = own;
    try {
      expect(() => templateSource("file:///no/such/repository.git", "/")).toThrow(
        /^Could not clone file:\/\/\/no\/such\/repository\.git/,
      );
      expect(readdirSync(own)).toEqual([]);
    } finally {
      // Assigning undefined would set the text "undefined"; delete it instead.
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it("refuses a folder after # that leaves the repository", () => {
    expect(() => templateSource(`${repository()}#../../etc`, "/")).toThrow(
      'The part after "#" must stay inside the repository: ../../etc.',
    );
  });

  it("lists the built-in templates for an unknown name", () => {
    expect(() => templateSource("nope", "/")).toThrow(
      'No template "nope". Built-in templates: kafka, minimal, private-files, private-sql-server, pyspark, retail, salesforce, sql-server.',
    );
  });
});

describe("standardSource", () => {
  it("takes a standard file from a Git URL", () => {
    const url = `${repository()}#acme.yaml`;
    const source = standardSource(url, "/");
    expect(existsSync(source.file)).toBe(true);
    expect(source.source).toBe(url);
    source.done();
  });
});

describe("isGitUrl", () => {
  it("tells URLs from paths", () => {
    expect(
      ["https://x/y.git", "git@github.com:a/b.git", "file:///r.git", "ssh://h/r"].map(isGitUrl),
    ).toEqual([true, true, true, true]);
    expect(["./mine", "minimal", "../t"].map(isGitUrl)).toEqual([false, false, false]);
  });
});
