// The lines `init`, `assistant add`, `plan` and `apply` print about the guide: the closed set of
// spec/cli/assistants.md, sections 5 and 6. The two "No guide" lines come from `guideFacts`.
import type { GuideUpdate } from "./section.js";

type Kind = GuideUpdate["kind"] | "added" | "not-regular";

const edited = (file: string, ending: string): string =>
  `${file}: the Ingestron section was edited by hand, so ${ending} Move your notes outside it, or delete both markers to keep it as your own.`;

/** What `init` and `assistant add` print for each outcome. */
const written: Partial<Record<Kind, (file: string) => string>> = {
  new: (file) => `${file}: written`,
  appended: (file) => `${file}: added the Ingestron section`,
  updated: (file) => `${file}: updated the Ingestron section`,
  current: (file) => `${file}: up to date`,
  edited: (file) => edited(file, "it was not updated."),
  "not-regular": (file) => `${file}: not a regular file, so nothing was written to it.`,
  added: (file) =>
    file === "CLAUDE.md"
      ? "CLAUDE.md: added @AGENTS.md"
      : file === "AGENTS.md"
        ? "AGENTS.md: added the Ingestron section"
        : `${file}: added the link to AGENTS.md`,
};

/** What `plan` prints: only a stale or an edited section. */
const planned: Partial<Record<Kind, (file: string) => string>> = {
  updated: (file) => `${file}: the Ingestron section would change`,
  edited: (file) => edited(file, "apply will not update it."),
};

/** What `apply` prints: only a section it rewrote or will not rewrite. */
const applied: Partial<Record<Kind, (file: string) => string>> = {
  updated: written.updated!,
  edited: written.edited!,
};

/**
 * The line for a file's outcome, or `undefined` when the command says nothing. `write` is `init`
 * and `assistant add`; `plan` and `apply` speak only of a stale or edited section in `AGENTS.md`.
 * @internal
 */
export function guideLine(
  file: string,
  kind: Kind,
  command: "write" | "plan" | "apply",
): string | undefined {
  const lines = { write: written, plan: planned, apply: applied }[command];
  return lines[kind]?.(file);
}
