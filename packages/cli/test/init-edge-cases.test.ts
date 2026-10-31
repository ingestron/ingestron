// `ingestron init` edge cases: comments, writing nothing on failure, binary
// files, links in Git sources, git arguments, credentials and terminal input.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLine } from "../src/ask.js";
import { scaffoldFiles, writeScaffold } from "../src/scaffold.js";
import { standardSource, templateSource, withoutCredentials } from "../src/sources.js";
import { builtInTemplates, readTemplate } from "../src/templates.js";

const temp = () => mkdtempSync(join(tmpdir(), "ingestron-hardening-"));
const minimal = () => builtInTemplates().find((item) => item.name === "minimal")!;

function templateCopy(): string {
  const folder = temp();
  cpSync(minimal().folder, folder, { recursive: true, filter: (path) => !path.includes("/build") });
  return folder;
}

function bareRepository(fill: (work: string) => void): string {
  const work = temp();
  fill(work);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, stdio: "ignore" });
  git("init", "--quiet", "--initial-branch", "main");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "x");
  const bare = join(temp(), "r.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare], { stdio: "ignore" });
  return `file://${bare}`;
}

describe("project.yaml comments", () => {
  it("keeps comments above environments", () => {
    const folder = templateCopy();
    writeFileSync(
      join(folder, "project.yaml"),
      "id: x\nenvironments:\n  # Development, used by everyone.\n  dev: {}\n  # Production.\n  prod: {}\n",
    );
    const text = scaffoldFiles(readTemplate(folder, "t"), {
      name: "x",
      environments: ["dev", "prod"],
      values: {},
    })["project.yaml"] as string;
    expect(text).toContain("  # Development, used by everyone.\n  dev: {}");
    expect(text).toContain("  # Production.\n  prod: {}");
  });
});

describe("nothing written", () => {
  it("counts a file where the template needs a folder as a clash", () => {
    const target = temp();
    writeFileSync(join(target, "flows"), "a file\n");
    expect(writeScaffold(target, { "connections/a.yaml": "a\n", "flows/b.yaml": "b\n" })).toEqual({
      clashes: ["flows"],
    });
    expect(existsSync(join(target, "connections"))).toBe(false);
  });

  it("counts a symbolic link in the target as a clash and never writes through it", () => {
    const target = temp();
    const outside = `../escaped-${Date.now()}.yaml`;
    symlinkSync(outside, join(target, "standard.yaml"));
    expect(writeScaffold(target, { "standard.yaml": "s\n" })).toEqual({
      clashes: ["standard.yaml"],
    });
    expect(existsSync(join(target, outside))).toBe(false);
  });
});

describe("binary files", () => {
  it("are copied byte for byte", () => {
    const folder = templateCopy();
    const bytes = Buffer.from([0, 255, 128, 10, 200, 1, 2, 3]);
    writeFileSync(join(folder, "sample.parquet"), bytes);
    const target = temp();
    writeScaffold(
      target,
      scaffoldFiles(readTemplate(folder, "t"), { name: "x", environments: ["dev"], values: {} }),
    );
    expect(readFileSync(join(target, "sample.parquet"))).toEqual(bytes);
  });
});

describe("links in Git sources", () => {
  it("refuses a standard that is a symbolic link", () => {
    const url = bareRepository((work) => symlinkSync("/etc/hosts", join(work, "acme.yaml")));
    expect(() => standardSource(`${url}#acme.yaml`, "/")).toThrow(
      '"acme.yaml" in the repository is not a regular file.',
    );
  });

  it("refuses a template folder that is a symbolic link", () => {
    const url = bareRepository((work) => {
      mkdirSync(join(work, "real"));
      cpSync(minimal().folder, join(work, "real"), {
        recursive: true,
        filter: (p) => !p.includes("/build"),
      });
      symlinkSync("real", join(work, "lake"));
    });
    expect(() => templateSource(`${url}#lake`, "/")).toThrow(
      '"lake" in the repository is not a folder.',
    );
  });

  it("refuses a template.yaml that is a symbolic link", () => {
    const folder = templateCopy();
    const elsewhere = join(temp(), "t.yaml");
    writeFileSync(elsewhere, "title: x\nsummary: y\n");
    execFileSync("rm", [join(folder, "template.yaml")]);
    symlinkSync(elsewhere, join(folder, "template.yaml"));
    expect(() => readTemplate(folder, "t")).toThrow(
      'Template "t": template.yaml is not a regular file.',
    );
  });
});

describe("git arguments and credentials", () => {
  it("refuses a source that starts with -", () => {
    expect(() => templateSource("--upload-pack=touch.git", "/")).toThrow(
      'A template or standard cannot start with "-": --upload-pack=touch.git.',
    );
  });

  it("never shows or writes the credentials in a URL", () => {
    expect(withoutCredentials("https://x-access-token:SECRET@github.com/a/b.git#s.yaml")).toBe(
      "https://github.com/a/b.git#s.yaml",
    );
    expect(() => templateSource("https://user:SECRET@127.0.0.1:9/r.git", "/")).toThrow(
      /^Could not clone https:\/\/127\.0\.0\.1:9\/r\.git/,
    );
    try {
      templateSource("https://user:SECRET@127.0.0.1:9/r.git", "/");
    } catch (error) {
      expect(String(error)).not.toContain("SECRET");
    }
  });
});

describe("terminal answers", () => {
  it("decode characters of several bytes", () => {
    const bytes = Buffer.from("Tāmaki é\nrest", "utf8");
    let at = 0;
    const read = (buffer: Buffer) => (at < bytes.length ? ((buffer[0] = bytes[at++]!), 1) : 0);
    expect(readLine(read)).toBe("Tāmaki é");
  });
});
