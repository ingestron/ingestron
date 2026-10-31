import { describe, expect, it } from "vitest";
import { matchesGlob } from "../src/glob.js";
import { resolveProjectPath } from "../src/paths.js";

describe("resolveProjectPath", () => {
  it.each([
    ["a.yaml", "b.yaml", "b.yaml"],
    ["pipelines/a.yaml", "./b.yaml", "pipelines/b.yaml"],
    ["pipelines/a.yaml", "../shared/c.yaml", "shared/c.yaml"],
    ["a/b/c.yaml", "../../d.yaml", "d.yaml"],
  ])("from %s, %s is %s", (from, target, expected) => {
    expect(resolveProjectPath(from, target)).toBe(expected);
  });

  it.each(["../x.yaml", "/etc/passwd", "https://example.com/x", "C:/x", "a\\b"])(
    "refuses %s",
    (target) => {
      expect(resolveProjectPath("a.yaml", target)).toBeUndefined();
    },
  );
});

describe("matchesGlob", () => {
  it.each([
    ["a.yaml", "*.yaml", true],
    ["dir/a.yaml", "*.yaml", false],
    ["dir/a.yaml", "**/*.yaml", true],
    ["a.yaml", "**/*.yaml", true],
    ["x/y/z.pipeline.yaml", "x/**/*.pipeline.yaml", true],
    ["a.yml", "a.y?l", true],
    ["a+b.yaml", "a+b.yaml", true],
  ])("%s against %s is %s", (path, pattern, expected) => {
    expect(matchesGlob(path, pattern)).toBe(expected);
  });
});
