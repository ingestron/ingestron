// Matching one accept entry against one warning (specification, Accepted warnings), for
// resolving and for the tool that builds the files, and the entries left to that tool.
import { matchesImport } from "@ingestron/config";
import { codeHelp, type Diagnostic } from "../diagnostics/index.js";

/**
 * An entry of the Platform's `accept` list whose code only a pack's building of the files
 * reports (its origin is `build`), such as `PACK_NOTICE`: resolving never sees such a
 * warning, so the tool that builds the files matches it, with {@link acceptsWarning}, and
 * reports `unused` when no warning of a build matches it (specification, Accepted warnings).
 * @public
 */
export interface AcceptAtBuild {
  /** The entry's code. */
  code: string;
  /** What narrows the entry, as written. */
  about?: { file?: string; table?: string; feature?: string };
  /** The entry's reason. */
  reason: string;
  /** Where the entry is written: the Platform's file, or where a reference to the list is. */
  entry: { file: string; line: number };
  /** `ACCEPT_UNUSED` at the entry, with the fix that removes it where it can. */
  unused: Diagnostic;
}

/**
 * True when the entry accepts the problem: it is a warning, its code is the entry's, and each
 * key the entry's `about` gives matches it (specification, Accepted warnings). For a tool
 * that matches the warnings of a pack's build exactly as resolving matches its own.
 * @example acceptsWarning({ code: "PACK_NOTICE" }, notice) // true for any PACK_NOTICE warning
 * @public
 */
export function acceptsWarning(
  entry: { code: string; about?: { file?: string; table?: string; feature?: string } },
  warning: Diagnostic,
): boolean {
  return (
    warning.severity === "warning" &&
    entry.code === warning.code &&
    aboutMatches(entry.about ?? {}, warning)
  );
}

/** Whether only a pack's building of the files reports the code. */
export function fromBuild(code: string): boolean {
  return (
    Object.hasOwn(codeHelp, code) && codeHelp[code as keyof typeof codeHelp].origin === "build"
  );
}

/** True when each key `about` gives matches the warning (a key it leaves out is not checked). */
function aboutMatches(
  about: { file?: string; table?: string; feature?: string },
  warning: Diagnostic,
): boolean {
  const at = warning.location?.file;
  const { file, table, feature } = about;
  return (
    (file === undefined || (at !== undefined && matchesImport(file, at))) &&
    (table === undefined || warning.subject?.table === table) &&
    (feature === undefined || warning.subject?.feature === feature)
  );
}
