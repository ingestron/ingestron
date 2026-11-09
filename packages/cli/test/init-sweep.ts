// Every connector, connectivity and route, created with init (spec/cli/projects.md): nothing
// is asked, only REPLACE_ME warns, README.md lists each one, and --set fills every name.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { run } from "../src/index.js";
import { methodSettings } from "@ingestron/core/internal";
import { projectValues } from "@ingestron/core/internal";
import { projectRoutes, projectSources } from "@ingestron/core";

/** One combination init can create. */
export interface Combination {
  connector: string;
  connectivity: string;
  via: string;
}

/** Every connector, with each connectivity it is reached with, and each route there. */
export function combinations(): Combination[] {
  return projectSources().flatMap((source) =>
    [...new Set(projectRoutes(source.id).flatMap((route) => route.connectivity))].flatMap(
      (connectivity) =>
        projectRoutes(source.id, connectivity).map((route) => ({
          connector: source.id,
          connectivity,
          via: route.via,
        })),
    ),
  );
}

/** One part of the combinations, so the parts run side by side. */
export function part(index: number, parts: number): Combination[] {
  return combinations().filter((_, at) => at % parts === index);
}

function ingestron(cwd: string, args: string[]) {
  let output = "";
  const code = run(args, {
    cwd,
    write: (text) => (output += text),
    now: () => new Date("2026-11-04T09:00:00Z"),
  });
  return { code, output };
}

const diagnosticLine = /^(\S+):(\d+):\d+ +(warning|error) +(\S+)$/gm;

/** init --yes: exit 0, nothing asked, only REPLACE_ME and pack notices, README.md matching. */
export function createsWithPlaceholders({ connector, connectivity, via }: Combination) {
  const cwd = mkdtempSync(join(tmpdir(), "init-sweep-"));
  const args = [
    "init",
    "p",
    "--connector",
    connector,
    "--connectivity",
    connectivity,
    "--via",
    via,
    "--yes",
  ];
  const { code, output } = ingestron(cwd, args);
  expect(code, output).toBe(0);
  const found = [...output.matchAll(diagnosticLine)];
  expect(
    found.filter((match) => !["REPLACE_ME", "PACK_NOTICE"].includes(match[4]!)),
    output,
  ).toEqual([]);
  const places = new Set(
    found.filter((match) => match[4] === "REPLACE_ME").map((match) => `${match[1]}:${match[2]}`),
  );
  const folder = join(cwd, "p");
  const files = projectFiles(folder);
  // Every REPLACE_ME written is warned, and there is at least one.
  const written = projectValues(files)
    .filter((value) => value.kind === "replace")
    .map((value) => `${value.file}:${value.line}`);
  expect(written.length).toBeGreaterThan(0);
  expect(places, output).toEqual(new Set(written));
  const readme = readFileSync(join(folder, "README.md"), "utf8");
  expect(readmePlaces(readme), readme).toEqual(places);
  for (const place of places) {
    const [file, line] = place.split(":");
    const lines = String(files[file!]).split("\n");
    const above = lines[Number(line) - 2] ?? "";
    const twoAbove = lines[Number(line) - 3] ?? "";
    expect(above.trim(), `${place} has a comment above it`).toMatch(/^# .{1,98}$/);
    expect(twoAbove.trim(), `${place} has one comment line, not two`).not.toMatch(/^#/);
  }
  expectDefaultsCommented(files);
  for (const secret of projectValues(files).filter((value) => value.kind === "secret"))
    expect(readme).toContain(`\`${String(secret.value).slice(9, -1)}\``);
  return { cwd, files };
}

/** The written defaults that say how the project runs each have a comment, beside or above. */
function expectDefaultsCommented(files: Record<string, string>): void {
  const defaults: [string, RegExp][] = [
    ["platform.yaml", /^(schedule: \{|\s+cron:|\s+timezone:)/],
    ["standard.yaml", /^(packs:|\s+catalog:|\s+every:|\s+start:|\s+layout:)/],
  ];
  for (const [file, pattern] of defaults) {
    const lines = (files[file] ?? "").split("\n");
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      const commented = line.includes(" # ") || /^\s*#/.test(lines[index - 1] ?? "");
      expect(commented, `${file}:${index + 1} ${line} has a comment`).toBe(true);
    });
  }
}

/** Every `file:line` README.md's table gives, `:line` read with the file before it. */
function readmePlaces(readme: string): Set<string> {
  const places = new Set<string>();
  const start = readme.indexOf("## Values to replace");
  const section = readme.slice(start, readme.indexOf("\n## ", start + 1));
  for (const row of section.split("\n").filter((line) => line.startsWith("| `"))) {
    const cell = row.split(" | ")[1] ?? "";
    let file = "";
    for (const [, path, line] of cell.matchAll(/`([^`:]*):(\d+)`/g)) {
      if (path) file = path;
      places.add(`${file}:${line}`);
    }
  }
  return places;
}

function projectFiles(folder: string): Record<string, string> {
  const paths = ["project.yaml", "standard.yaml", "platform.yaml"].filter((name) =>
    existsSync(join(folder, name)),
  );
  for (const sub of ["connections", "flows"])
    paths.push(...readdirSync(join(folder, sub)).map((entry) => `${sub}/${entry}`));
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(folder, path), "utf8")]));
}

/** A real-looking value for a REPLACE_ME: the schema's example where it has one, else a name. */
export function exampleFor(name: string, written: string, keys: string[], file: string): string {
  if (name === "storage_account") return "erplake";
  if (name === "key_vault") return "kv-erp";
  if (file === "platform.yaml") {
    const example = (methodSettings(keys[1]!)[keys[2]!] as { examples?: unknown[] } | undefined)
      ?.examples?.[0];
    if (typeof example === "string") return example;
  }
  return written.replaceAll("REPLACE_ME", "sample");
}

/** init again, with --set for every name still REPLACE_ME: nothing is left to replace. */
export function fillsEveryName(
  { connector, connectivity, via }: Combination,
  files: Record<string, string>,
) {
  const set = new Map<string, string>();
  for (const value of projectValues(files).filter((item) => item.kind === "replace"))
    set.set(value.name, exampleFor(value.name, String(value.value), value.keys, value.file));
  const cwd = mkdtempSync(join(tmpdir(), "init-sweep-set-"));
  const args = [
    "init",
    "p",
    "--connector",
    connector,
    "--connectivity",
    connectivity,
    "--via",
    via,
    "--yes",
  ];
  const given = [...set].flatMap(([name, value]) => ["--set", `${name}=${value}`]);
  const { code, output } = ingestron(cwd, [...args, ...given]);
  expect(code, output).toBe(0);
  expect(output, given.join(" ")).not.toContain("REPLACE_ME warning");
  expect(output).not.toMatch(/warning +(?!PACK_NOTICE)\S+$/m);
  expect(output).toContain("Nothing to replace: the project runs as written.");
  // Filled, it applies, and check passes: no REPLACE_ME left, and the output up to date.
  const where = ["--definitions", "p", "--out", "p/build"];
  const applied = ingestron(cwd, ["apply", "--no-diff", ...where]);
  expect(applied.code, applied.output).toBe(0);
  const checked = ingestron(cwd, ["check", ...where]);
  expect(checked.code, checked.output).toBe(0);
}
