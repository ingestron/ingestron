// ingestron standard install <kit> and standard list (spec/cli/kits.md, "Commands"): replace the
// project's Standard with a kit's, keeping its path and id, and list the kits there are.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { formatDiagnostics, loadProject, nodeFiles } from "@ingestron/config";
import { kinds } from "@ingestron/definitions";
import { generateAll, installedKits, packs, type Kit } from "@ingestron/core";
import {
  compareVersions,
  environmentReportsText,
  kitFiles,
  packReportsText,
} from "@ingestron/core/internal";
import type { Io, Options } from "../terminal/index.js";
import { catalogueKits, kitSource, refuseNewer } from "./sources.js";

/** The project's Standard document: its file, its id and where it came from. */
interface ProjectStandard {
  file: string;
  id: string;
  origin?: { standard: string; version: string };
}

/** Runs `standard install` or `standard list`. Returns the exit code. */
export function standard(options: Options, io: Io): number {
  try {
    const action = options.standard!;
    if (action.action === "list") return list(io, action.platform);
    return install(options, io, action.kit);
  } catch (error) {
    io.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** Replaces the project's Standard with the kit's and says what else the kit changed. */
function install(options: Options, io: Io, spec: string): number {
  const folder = resolve(io.cwd, options.definitions);
  const own = projectStandard(folder);
  const checked = gitStatus(folder, own.file);
  if (checked === "changed")
    throw new Error(
      `${own.file} has changes that are not committed; commit them first so git diff shows only the new standard.`,
    );
  const { kit, done } = kitSource(spec, io.cwd);
  try {
    refuseNewer(kit);
    const text = readFileSync(join(kit.folder, "standard.yaml"), "utf8");
    writeFileSync(join(folder, own.file), withId(text, own.id));
    if (checked === "unknown")
      io.write(
        `Could not ask git whether ${own.file} has changes, so it is replaced without that check.\n\n`,
      );
    const was = own.origin ? ` (was ${own.origin.version})` : "";
    io.write(`Replaced ${own.file} with ${kit.id}@${kit.version}${was}.\n\n`);
    const notes = kit.notes.trim();
    if (notes) io.write(`${notes}\n\n`);
    io.write(`${notApplied(kit, own.origin, io.cwd)}\n`);
    const problems = newProblems(folder);
    if (problems) io.write(`${problems}\n`);
    io.write("Next: run ingestron plan, then review git diff.\n");
    return 0;
  } finally {
    done();
  }
}

/** The one Standard document among the project's files; refuses none, or more than one. */
function projectStandard(folder: string): ProjectStandard {
  const loaded = loadProject(folder, {
    kinds: Object.values(kinds),
    ...firstEnvironment(folder),
    envvars: {},
    deployEnvvars: true,
  });
  if (!loaded.ok)
    throw new Error(
      `The project could not be read, so its standard was not replaced:\n${formatDiagnostics(loaded.diagnostics)}`,
    );
  const found = loaded.project.documents.filter((document) => document.kind === "Standard");
  if (found.length === 0)
    throw new Error(
      "The project has no Standard document to replace. Add one to project.yaml's imports, or start a project with ingestron init --kit <kit>.",
    );
  if (found.length > 1) {
    const files = found.map((document) => document.file).join(", ");
    throw new Error(
      `The project has ${found.length} Standard documents (${files}); keep one, then run this again.`,
    );
  }
  const [document] = found;
  return { file: document!.file, id: document!.id, ...originOf(document!.value) };
}

/** The first environment project.yaml declares, read as plan reads it; none when it has none. */
function firstEnvironment(folder: string): { environment?: string } {
  try {
    const project = parse(readFileSync(join(folder, "project.yaml"), "utf8")) as {
      environments?: Record<string, unknown>;
    };
    const [environment] = Object.keys(project?.environments ?? {});
    return environment === undefined ? {} : { environment };
  } catch {
    return {};
  }
}

/** The Standard's `origin`, when it names a kit and a version as text. */
function originOf(value: unknown): Pick<ProjectStandard, "origin"> {
  const origin = (value as { origin?: { standard?: unknown; version?: unknown } }).origin;
  const { standard, version } = origin ?? {};
  return typeof standard === "string" && typeof version === "string"
    ? { origin: { standard, version } }
    : {};
}

/** What git says of the file: changes not committed, none, or no answer (as outside a repository). */
function gitStatus(folder: string, file: string): "changed" | "clean" | "unknown" {
  try {
    const output = execFileSync("git", ["status", "--porcelain", "--", file], {
      cwd: folder,
      stdio: "pipe",
      encoding: "utf8",
    });
    return output.trim() === "" ? "clean" : "changed";
  } catch {
    return "unknown";
  }
}

/** The kit's standard text with only the value of its top-level `id:` changed. */
function withId(text: string, id: string): string {
  return text.replace(/^id:[ \t]*[^\s#]*/m, `id: ${id}`);
}

/** The kit's other files that changed since the project's version of the kit. */
function notApplied(kit: Kit, origin: ProjectStandard["origin"], cwd: string): string {
  const unavailable =
    "Not applied: the earlier version is not available, so the kit's other files cannot be compared.\n";
  if (!origin) return unavailable;
  let old: ReturnType<typeof kitSource>;
  try {
    old = kitSource(`${origin.standard}@${origin.version}`, cwd);
  } catch {
    return unavailable;
  }
  try {
    const changed = changedFiles(kitFiles(old.kit), kitFiles(kit));
    if (changed.length === 0)
      return `Not applied: no other kit file changed since ${origin.version}.\n`;
    const listed = changed.map((path) => `  ${path}\n`).join("");
    return `Not applied: the kit's other files that changed since ${origin.version}; compare them with yours:\n${listed}`;
  } finally {
    old.done();
  }
}

/** The paths, other than the standard, in one set of files and not the other or that differ. */
function changedFiles(
  before: Record<string, string | Buffer>,
  after: Record<string, string | Buffer>,
): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  paths.delete("standard.yaml");
  const same = (path: string) => {
    const [a, b] = [before[path], after[path]];
    return a !== undefined && b !== undefined && Buffer.from(a).equals(Buffer.from(b));
  };
  return [...paths].filter((path) => !same(path)).sort(codePoints);
}

/** The project's problems with the new standard, as plan prints them; empty when it builds. */
function newProblems(folder: string): string {
  const generated = generateAll(nodeFiles(folder), packs, process.env, "warning");
  if (!generated.resolved) return environmentReportsText(generated.environmentReports);
  return generated.ok ? "" : packReportsText(generated.packReports);
}

/** Every kit, installed first, then those only in the catalogue (spec/cli/kits.md). */
function list(io: Io, platform: string | undefined): number {
  const mine = (id: string) => platform === undefined || id.startsWith(`${platform}/`);
  const all = installedKits();
  const installed = all
    .filter((kit) => mine(kit.id))
    .sort((a, b) => codePoints(a.id, b.id) || compareVersions(a.version, b.version));
  const lines = installed.map(
    (kit) => `${kit.id}@${kit.version}  ${kit.title}  (${kit.features})\n`,
  );
  const tagged = catalogueKits(io.cwd);
  if (typeof tagged === "string")
    io.write("Could not reach the catalogue; showing the kits installed with ingestron.\n");
  else {
    const have = new Set(all.map((kit) => `${kit.id}@${kit.version}`));
    const online = tagged
      .filter((item) => mine(item.id) && !have.has(`${item.id}@${item.version}`))
      .sort((a, b) => codePoints(a.id, b.id) || compareVersions(a.version, b.version));
    lines.push(...online.map((item) => `${item.id}@${item.version}  (online)\n`));
  }
  io.write(lines.join("") || `No kits found${platform === undefined ? "" : ` for ${platform}`}.\n`);
  return 0;
}

/** Code-point order, the same on every computer. */
function codePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
