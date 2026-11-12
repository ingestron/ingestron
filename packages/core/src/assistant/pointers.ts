// The files that point a tool at AGENTS.md (spec/cli/assistants.md, section 2), and how they are updated.
import { lineEnding } from "./markers.js";
import type { AssistantName } from "./names.js";

const claudeText = "<!-- Ingestron: the project guide is in AGENTS.md. -->\n@AGENTS.md\n";

const copilotText = [
  "See [AGENTS.md](../AGENTS.md) for this Ingestron project.",
  "",
  "- Change the definitions, never the generated files: Ingestron reports a hand edit there as a conflict.",
  "- After a change, follow AGENTS.md: run its plan command, fix every problem it reports, and show the user the plan before applying. Its check command must then pass.",
  "- Never write a password, token, key or connection string in any file. Use `${secret:name}` for a credential.",
  "",
].join("\n");

/**
 * The files besides `AGENTS.md` that the names write, with the exact text of each, in the order
 * they are written.
 * @internal
 */
export function pointerFiles(names: readonly AssistantName[]): { path: string; text: string }[] {
  return [
    ...(names.includes("claude") ? [{ path: "CLAUDE.md", text: claudeText }] : []),
    ...(names.includes("copilot")
      ? [{ path: ".github/copilot-instructions.md", text: copilotText }]
      : []),
  ];
}

/**
 * What to do with a pointer file. A new or empty file is written whole. A file that has the line
 * that makes the point (`@AGENTS.md` in CLAUDE.md, the first line of the text in any other) is
 * current. Any other file gets the text appended: CLAUDE.md's lines directly, any other after one
 * blank line, in the file's line ending.
 * @internal
 */
export function pointerUpdate(
  path: string,
  existing: string | undefined,
  text: string,
): { kind: "new" | "added"; text: string } | { kind: "current" } {
  if (existing === undefined || existing === "") return { kind: "new", text };
  const key = path === "CLAUDE.md" ? "@AGENTS.md" : text.split("\n", 1)[0]!;
  if (existing.split("\n").some((line) => line.replace(/\r$/, "") === key))
    return { kind: "current" };
  const eol = lineEnding(existing);
  const joined = existing.endsWith("\n") ? existing : existing + eol;
  const blank = path === "CLAUDE.md" ? "" : eol;
  return { kind: "added", text: joined + blank + text.replaceAll("\n", eol) };
}
