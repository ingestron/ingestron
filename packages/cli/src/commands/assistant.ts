// `ingestron assistant add`, and the files `init --assistant` writes: the project guide in
// AGENTS.md and the files that point a tool at it (spec/cli/assistants.md, sections 2 and 5). The
// text, the facts and every message are @ingestron/core's; this reads the files, calls it, writes
// and prints. A file that is not a regular file is never written to or through.
import { lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { nodeFiles } from "@ingestron/config";
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

/** Writes `text` to `path` in `folder`, making its folder when there is none. */
function put(folder: string, path: string, text: string): void {
  const file = join(folder, ...path.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, "utf8");
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
  let regular = true;
  const say = (file: string, kind: Parameters<typeof guideLine>[1]) => {
    io.write(`${guideLine(file, kind, "write")}\n`);
    if (kind === "not-regular") regular = false;
  };
  const agents = look(folder, "AGENTS.md");
  if (agents.state === "other") say("AGENTS.md", "not-regular");
  else {
    const update = guideUpdate(
      agents.state === "file" ? agents.text : undefined,
      guideSection(facts),
      true,
    );
    if ("text" in update) put(folder, "AGENTS.md", update.text);
    say("AGENTS.md", update.kind as Parameters<typeof guideLine>[1]);
  }
  for (const { path, text } of pointerFiles(names)) {
    const found = look(folder, path);
    if (found.state === "other") {
      say(path, "not-regular");
      continue;
    }
    const update = pointerUpdate(path, found.state === "file" ? found.text : undefined, text);
    if (update.kind !== "current") put(folder, path, update.text);
    say(path, update.kind);
  }
  return regular;
}

/** The output folder as the guide writes it: relative to the project folder, with `/` separators. */
export function guideOut(definitions: string, out: string, cwd: string): string {
  const shown = relative(definitions, resolve(cwd, out)).split(sep).join("/");
  return shown === "" ? "." : shown;
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
