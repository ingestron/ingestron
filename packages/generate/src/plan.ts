// Planning: decides, for each path, what applying would do. Never writes.
import { digestOf } from "./digest.js";
import { lineDiff } from "./diff.js";
import type { Entry, OutputFolder } from "./folder.js";
import { readManifest } from "./manifest.js";
import { checkWantedPaths, manifestFile } from "./paths.js";
import type { Problem } from "./problems.js";

/** What applying does to one path. See the Changes table in README.md. */
export type ChangeKind =
  "create" | "update" | "unchanged" | "adopt" | "delete" | "forget" | "conflict";

/** Why a path cannot be written or deleted safely. */
export type ConflictReason = "EDITED" | "NOT_GENERATED" | "NOT_A_FILE";

/** What was at a path when planning: a content digest, "absent" or "other". */
export type Seen = string;

/**
 * The planned change for one path.
 * @example
 * { path: "jobs/orders.yml", change: "update", seen: "sha256:…", diff: "@@ -1,1 +1,1 @@\n-a\n+b" }
 */
export interface Change {
  path: string;
  change: ChangeKind;
  /** Only on conflicts. */
  reason?: ConflictReason;
  /** What was at the path when planning, so applying can detect later edits. */
  seen: Seen;
  /** Only on updates: the line diff from the file on disk to the new content. */
  diff?: string;
}

/**
 * A plan for one output folder. Apply it with `applyPlan` only when `clean`.
 * @example
 * const plan = planGeneration(folder, { "bundle.yml": text });
 * if (plan.upToDate) console.log("Nothing to do.");
 */
export interface Plan {
  /** One change per path, in path order. */
  changes: Change[];
  problems: Problem[];
  /** No problems and no conflicts: the plan can be applied. */
  clean: boolean;
  /** Every change is `unchanged`: the folder already holds exactly the wanted files. */
  upToDate: boolean;
  /** A copy of the wanted files the plan was made for; applying writes these. */
  wanted: ReadonlyMap<string, string>;
  /** What the manifest file was when planning. */
  manifestSeen: Seen;
}

/**
 * Compares the wanted files with the output folder and its manifest.
 * @example
 * const plan = planGeneration(nodeFolder("build/bundle"), { "bundle.yml": "bundle: {}\n" });
 */
export function planGeneration(
  folder: OutputFolder,
  wanted: Readonly<Record<string, string>>,
): Plan {
  // A Map copy: later changes to the caller's object cannot reach the plan,
  // and names such as "constructor" are ordinary paths.
  const files = new Map(Object.entries(wanted));
  const problems = checkWantedPaths([...files.keys()]);
  const manifest = readManifest(folder);
  const manifestSeen = seenOf(folder.read(manifestFile));
  if ("problem" in manifest)
    return finish([], [manifest.problem, ...problems], files, manifestSeen);
  const badPaths = new Set(problems.map((problem) => problem.path));
  const paths = new Set([...files.keys(), ...manifest.files.keys()]);
  const changes = [...paths]
    .filter((path) => !badPaths.has(path))
    .sort()
    .map((path) => changeFor(path, files.get(path), manifest.files.get(path), folder.read(path)));
  return finish(changes, problems, files, manifestSeen);
}

function finish(
  changes: Change[],
  problems: Problem[],
  wanted: Plan["wanted"],
  manifestSeen: Seen,
): Plan {
  const clean = problems.length === 0 && changes.every((change) => change.change !== "conflict");
  const upToDate = clean && changes.every((change) => change.change === "unchanged");
  return { changes, problems, clean, upToDate, wanted, manifestSeen };
}

/** The digest of a file, or "absent" / "other". */
export function seenOf(entry: Entry): Seen {
  return entry.kind === "file" ? digestOf(entry.content) : entry.kind;
}

/** One row of the planning table in the specification. */
function changeFor(
  path: string,
  wanted: string | undefined,
  generated: string | undefined,
  entry: Entry,
): Change {
  const seen = seenOf(entry);
  const result = (change: ChangeKind, reason?: ConflictReason): Change =>
    reason ? { path, change, reason, seen } : { path, change, seen };
  if (entry.kind === "other") return result("conflict", "NOT_A_FILE");
  if (wanted === undefined) {
    if (entry.kind === "absent") return result("forget");
    return seen === generated ? result("delete") : result("conflict", "EDITED");
  }
  if (entry.kind === "absent") return result("create");
  if (entry.content === wanted) return result(generated === undefined ? "adopt" : "unchanged");
  if (generated === undefined) return result("conflict", "NOT_GENERATED");
  if (seen !== generated) return result("conflict", "EDITED");
  return { ...result("update"), diff: lineDiff(entry.content, wanted) };
}
