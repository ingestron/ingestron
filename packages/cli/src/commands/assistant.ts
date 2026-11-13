// `ingestron assistant add`, and the files `init --assistant` writes: the project guide in
// AGENTS.md and the files that point a tool at it (spec/cli/assistants.md, sections 2 and 5). The
// text, the facts and every message are @ingestron/core's; this reads the files, calls it, writes
// and prints. A file that is not a regular file is never written to or through.
import { lstatSync, mkdirSync, readFileSync, statSync } from "node:fs";
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
import { writeSafely } from "./assistant-write.js";

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

/** What happened to a file: a kind `guideLine` has a line for, and the error's code when it failed. */
interface Outcome {
  kind: Parameters<typeof guideLine>[1];
  code?: string;
}

/** The error's `code`, or `error` when it has none. */
const codeOf = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" ? code : "error";
};

/** True for a failure of the file system (it has a `code`), not a mistake in the program. */
const isFileError = (error: unknown): boolean =>
  typeof (error as NodeJS.ErrnoException | undefined)?.code === "string";

/**
 * Reads the file at `path`, decides what to write with `decide` (undefined when nothing is to be
 * written) and writes it. A read or write that fails is an outcome, never a throw.
 */
function writeFile(
  folder: string,
  path: string,
  decide: (existing: string | undefined) => { kind: Outcome["kind"]; text?: string },
): Outcome {
  let found: Found;
  try {
    found = look(folder, path);
  } catch (error) {
    return { kind: "unreadable", code: codeOf(error) };
  }
  if (found.state === "other") return { kind: "not-regular" };
  const exists = found.state === "file";
  const update = decide(found.state === "file" ? found.text : undefined);
  if (update.text === undefined) return { kind: update.kind };
  try {
    return { kind: put(folder, path, update.text, exists) ? update.kind : "not-regular" };
  } catch (error) {
    return { kind: "unwritable", code: codeOf(error) };
  }
}

/** Writes AGENTS.md: the section new, appended, replaced or left; the outcome to report. */
function writeAgents(folder: string, section: string): Outcome {
  return writeFile(folder, "AGENTS.md", (existing) => {
    const update = guideUpdate(existing, section, true);
    return "text" in update ? update : { kind: update.kind };
  });
}

/** Writes one file that points a tool at AGENTS.md; the outcome to report. */
function writePointer(folder: string, path: string, text: string): Outcome {
  return writeFile(folder, path, (existing) => {
    const update = pointerUpdate(path, existing, text);
    return update.kind === "current" ? { kind: "current" } : update;
  });
}

/**
 * Writes the guide and the files the names ask for in the project at `folder`, printing one line
 * for each. `out` is the output folder relative to `folder`, with `/` separators. Returns false
 * when there is no guide, or when a file was not a regular file or could not be read or written.
 */
export function writeAssistantFiles(
  folder: string,
  names: readonly AssistantName[],
  out: string,
  io: Io,
): boolean {
  const facts = factsOf(folder, out);
  if ("noGuide" in facts) {
    io.write(`${facts.noGuide}\n`);
    return false;
  }
  const writes: [string, () => Outcome][] = [
    ["AGENTS.md", () => writeAgents(folder, guideSection(facts))],
    ...pointerFiles(names).map(({ path, text }): [string, () => Outcome] => [
      path,
      () => writePointer(folder, path, text),
    ]),
  ];
  const failed = new Set<Outcome["kind"]>(["not-regular", "unreadable", "unwritable"]);
  let ok = true;
  // One file at a time, so that each line is out before the next file is looked at.
  for (const [file, write] of writes) {
    const { kind, code } = write();
    io.write(`${guideLine(file, kind, "write", code)}\n`);
    if (failed.has(kind)) ok = false;
  }
  return ok;
}

/** The guide's facts for the project at `folder`; a folder or file that cannot be read gives no guide. */
function factsOf(folder: string, out: string): ReturnType<typeof guideFacts> {
  try {
    return guideFacts(nodeFiles(folder), out);
  } catch (error) {
    if (!isFileError(error)) throw error;
    return { noGuide: "No guide: project.yaml cannot be read." };
  }
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
  const line = guideRefresh(options, io, available);
  if (line !== undefined) io.write(`${line}\n`);
}

/**
 * The line `refreshGuide` prints, or undefined for none. A file that cannot be read or written
 * (a mode that denies it, say) is left as it is: the guide never fails the command. Only a failure
 * of the file system is held back; a mistake in the program is thrown.
 */
function guideRefresh(
  options: Options,
  io: Io,
  available: readonly Pack[] | undefined,
): string | undefined {
  try {
    const definitions = resolve(io.cwd, options.definitions);
    const found = look(definitions, "AGENTS.md");
    if (found.state !== "file") return undefined;
    const facts = guideFacts(
      nodeFiles(definitions),
      guideOut(definitions, options.out, io.cwd),
      available,
    );
    if ("noGuide" in facts) return undefined;
    const update = guideUpdate(found.text, guideSection(facts), false);
    const writes = update.kind === "updated" && options.command === "apply";
    if (writes && !writeSafely(join(definitions, "AGENTS.md"), update.text, true)) return undefined;
    return guideLine("AGENTS.md", update.kind, options.command as "plan" | "apply");
  } catch (error) {
    if (isFileError(error)) return undefined;
    throw error;
  }
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
