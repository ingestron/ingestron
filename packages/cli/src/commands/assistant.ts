// `ingestron assistant add`, and the files `init --assistant` writes: the project guide in
// AGENTS.md and the files that point a tool at it (spec/cli/assistants.md, sections 2 and 5). The
// text, the facts and every message are @ingestron/core's; this reads the files, calls it, writes
// and prints. A file that is not a regular file is never written to or through.
import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { nodeFiles } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import {
  assistantQuestion,
  guideFacts,
  guideLine,
  guideSection,
  guideUpdate,
  pointerFiles,
  pointerUpdate,
  readAssistantNames,
  type AssistantName,
} from "@ingestron/core/internal";
import type { Io, Options } from "../terminal/index.js";

/** What is at a path: nothing, a regular file with its text, or anything else. */
type Found = { state: "none" } | { state: "file"; text: string } | { state: "other" };

/** Looks at `path` without following a link, and at its parent folder inside `folder` likewise. */
function look(folder: string, path: string): Found {
  const parts = path.split("/");
  // A parent that is a link, a file or anything but a folder is not a place to write.
  for (let depth = 1; depth < parts.length; depth++) {
    const parent = lstatSync(join(folder, ...parts.slice(0, depth)), { throwIfNoEntry: false });
    if (parent === undefined) return { state: "none" };
    if (!parent.isDirectory()) return { state: "other" };
  }
  const stat = lstatSync(join(folder, ...parts), { throwIfNoEntry: false });
  if (stat === undefined) return { state: "none" };
  if (!stat.isFile()) return { state: "other" };
  return { state: "file", text: readFileSync(join(folder, ...parts), "utf8") };
}

/** The errors of `open` that mean the path is no longer what the check found. */
const changed = new Set(["EEXIST", "ELOOP", "EISDIR", "ENOTDIR"]);

/**
 * Writes `text` to the file at `file`, never through a link, even one made after the check: a new
 * file is created exclusively, and an existing one is opened without following a link. False when
 * the path turned out to be something else; the file is then left as it is.
 */
export function writeSafely(file: string, text: string, exists: boolean): boolean {
  const flags = exists
    ? constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
  let descriptor: number;
  try {
    descriptor = openSync(file, flags, 0o666);
  } catch (error) {
    if (changed.has((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
  try {
    writeFileSync(descriptor, text, "utf8");
  } finally {
    closeSync(descriptor);
  }
  return true;
}

/**
 * Writes `text` to `path` in `folder`, making `.github` with a plain mkdir when there is none.
 * False when the path is not a place to write.
 */
function put(folder: string, path: string, text: string, exists: boolean): boolean {
  const parts = path.split("/");
  if (parts.length > 1) {
    const parent = join(folder, ...parts.slice(0, -1));
    try {
      mkdirSync(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!lstatSync(parent).isDirectory()) return false;
    }
  }
  return writeSafely(join(folder, ...parts), text, exists);
}

/** The kinds of outcome `guideLine` has a line for. */
type Outcome = Parameters<typeof guideLine>[1];

/** Writes AGENTS.md: the section new, appended, replaced or left; the outcome to report. */
function writeAgents(folder: string, section: string): Outcome {
  const found = look(folder, "AGENTS.md");
  if (found.state === "other") return "not-regular";
  const exists = found.state === "file";
  const update = guideUpdate(exists ? found.text : undefined, section, true);
  const refused = "text" in update && !put(folder, "AGENTS.md", update.text, exists);
  return refused ? "not-regular" : update.kind;
}

/** Writes one file that points a tool at AGENTS.md; the outcome to report. */
function writePointer(folder: string, path: string, text: string): Outcome {
  const found = look(folder, path);
  if (found.state === "other") return "not-regular";
  const exists = found.state === "file";
  const update = pointerUpdate(path, exists ? found.text : undefined, text);
  const refused = update.kind !== "current" && !put(folder, path, update.text, exists);
  return refused ? "not-regular" : update.kind;
}

/**
 * Writes the guide and the files the names ask for in the project at `folder`, printing one line
 * for each. `out` is the output folder relative to `folder`, with `/` separators. Returns false
 * when there is no guide, or when a file was not a regular file.
 */
export function writeAssistantFiles(
  folder: string,
  names: readonly AssistantName[],
  out: string,
  io: Io,
): boolean {
  const facts = guideFacts(nodeFiles(folder), out);
  if ("noGuide" in facts) {
    io.write(`${facts.noGuide}\n`);
    return false;
  }
  const outcomes: [string, Outcome][] = [
    ["AGENTS.md", writeAgents(folder, guideSection(facts))],
    ...pointerFiles(names).map(({ path, text }): [string, Outcome] => [
      path,
      writePointer(folder, path, text),
    ]),
  ];
  for (const [file, outcome] of outcomes) io.write(`${guideLine(file, outcome, "write")}\n`);
  return outcomes.every(([, outcome]) => outcome !== "not-regular");
}

/** The output folder as the guide writes it: relative to the project folder, with `/` separators. */
export function guideOut(definitions: string, out: string, cwd: string): string {
  const shown = relative(definitions, resolve(cwd, out)).split(sep).join("/");
  return shown === "" ? "." : shown;
}

/**
 * What `plan` and `apply` do about AGENTS.md after their output folders: `plan` says when the
 * section is stale or edited by hand, `apply` rewrites a stale one and says so. Silent when there
 * is no file, it is the user's or not a regular file, the section is current, or there is no guide.
 * It reads the guide's facts without resolving, so it does not depend on the definitions being
 * valid, and it never changes the exit code (spec/cli/assistants.md, section 6).
 */
export function refreshGuide(options: Options, io: Io, available?: readonly Pack[]): void {
  if (options.command !== "plan" && options.command !== "apply") return;
  const definitions = resolve(io.cwd, options.definitions);
  const found = look(definitions, "AGENTS.md");
  if (found.state !== "file") return;
  const facts = guideFacts(
    nodeFiles(definitions),
    guideOut(definitions, options.out, io.cwd),
    available,
  );
  if ("noGuide" in facts) return;
  const update = guideUpdate(found.text, guideSection(facts), false);
  if (update.kind === "updated" && options.command === "apply")
    if (!writeSafely(join(definitions, "AGENTS.md"), update.text, true)) return;
  const line = guideLine("AGENTS.md", update.kind, options.command);
  if (line !== undefined) io.write(`${line}\n`);
}

/**
 * The names `init` writes files for: those of --assistant; else, with a terminal and no --yes,
 * those the person answers, asking again after a mistake; else none.
 */
export function chosenAssistants(init: Options["init"], io: Io): AssistantName[] {
  const given = init.assistants && readAssistantNames(init.assistants);
  if (given) return "mistake" in given ? [] : given;
  if (init.yes || !io.ask) return [];
  let prompt = assistantQuestion;
  for (;;) {
    const answer = readAssistantNames([io.ask(prompt)?.trim() ?? ""]);
    if (!("mistake" in answer)) return answer;
    prompt = `${answer.mistake}\n${assistantQuestion}`;
  }
}

/** assistant add: the guide and the files for the names, in the project folder. Returns the exit code. */
export function assistant(options: Options, io: Io): number {
  const definitions = resolve(io.cwd, options.definitions);
  const stat = statSync(join(definitions, "project.yaml"), { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    const shown = relative(io.cwd, definitions).split(sep).join("/") || ".";
    io.write(`No project.yaml in ${shown}.\n`);
    return 1;
  }
  const out = guideOut(definitions, options.out, io.cwd);
  return writeAssistantFiles(definitions, options.assistant!.names, out, io) ? 0 : 1;
}
