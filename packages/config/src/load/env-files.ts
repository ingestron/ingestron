// Reads `.env` and `.env.<environment>` for `${envvar:…}` (specification
// section 4.5). Only the text of the files is handled here; they are read
// through a `FileSource`, so this runs wherever the loader does.
//
// The reader's own diagnostics never quote a line or a value. Later problems
// may quote a value from .env, as they quote any other (specification 4.5).

import { tooLarge } from "../resolve/index.js";
import { warning, type Diagnostic } from "../diagnostics/index.js";
import type { FileSource } from "../files/index.js";
import { defaultLimits } from "../files/index.js";
import type { EnvvarReference } from "../resolve/index.js";

/** Where a variable's value came from (specification 4.6). */
type SetIn = NonNullable<EnvvarReference["setIn"]>;

/** The settings of one file, and a warning for each line that is not one. */
interface EnvFile {
  /** Name to value, last one wins; an empty value is kept here and counts as unset when merging. */
  values: Record<string, string>;
  diagnostics: Diagnostic[];
}

const byteOrderMark = "\ufeff";
const environmentName = /^[A-Za-z][A-Za-z0-9_-]*$/;
const assignment = /^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*/;

/**
 * Reads the text of one environment file. `file` is its path in the project,
 * used only to say where a bad line is.
 */
export function readEnvFile(text: string, file: string): EnvFile {
  const values = noPrototype();
  const diagnostics: Diagnostic[] = [];
  const body = text.startsWith(byteOrderMark) ? text.slice(1) : text;
  body.split("\n").forEach((rawLine, index) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.replace(/^[ \t]+/, "");
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const parsed = parseAssignment(trimmed);
    if (parsed === undefined) {
      diagnostics.push(
        warning(
          "ENV_FILE_LINE",
          `${file} line ${index + 1} is not a setting, so it is ignored.`,
          { file, line: index + 1, column: 1 },
          "Write NAME=value, with a name of letters, digits and _ that does not start with a digit. " +
            "Close any quote, and put only a # comment after it.",
        ),
      );
      return;
    }
    values[parsed.name] = parsed.value;
  });
  return { values, diagnostics };
}

function parseAssignment(line: string): { name: string; value: string } | undefined {
  const match = assignment.exec(line);
  if (!match) return undefined;
  const rest = line.slice(match[0].length);
  const value = rest.startsWith("'")
    ? singleQuoted(rest)
    : rest.startsWith('"')
      ? doubleQuoted(rest)
      : bare(rest, isWhitespace(match[0].at(-1)));
  return value === undefined ? undefined : { name: match[1]!, value };
}

function isWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t";
}

/** Whether only whitespace and an optional comment follow a closing quote. */
function endsCleanly(after: string): boolean {
  const trimmed = after.replace(/^[ \t]+/, "");
  return trimmed === "" || trimmed.startsWith("#");
}

function singleQuoted(rest: string): string | undefined {
  const close = rest.indexOf("'", 1);
  if (close === -1 || !endsCleanly(rest.slice(close + 1))) return undefined;
  return rest.slice(1, close);
}

function doubleQuoted(rest: string): string | undefined {
  let value = "";
  for (let at = 1; at < rest.length; at += 1) {
    const character = rest[at]!;
    if (character === '"') return endsCleanly(rest.slice(at + 1)) ? value : undefined;
    if (character === "\\") {
      const next = rest[at + 1];
      if (next === "n") value += "\n";
      else if (next === '"' || next === "\\") value += next;
      else {
        // Any other backslash stays as written, and the next character is read normally.
        value += character;
        continue;
      }
      at += 1;
    } else {
      value += character;
    }
  }
  return undefined;
}

/** An unquoted value: up to a `#` that has whitespace before it, then trimmed. */
function bare(rest: string, spaceBefore: boolean): string {
  // The whitespace after "=" counts as the whitespace before a "#" that follows it.
  const text = spaceBefore ? ` ${rest}` : rest;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === "#" && isWhitespace(text[at - 1])) {
      return text.slice(0, at).replace(/^[ \t]+|[ \t]+$/g, "");
    }
  }
  return text.replace(/^[ \t]+|[ \t]+$/g, "");
}

/** An object that has no inherited names, so a variable called `constructor` is just unset. */
function noPrototype(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}

/**
 * The variables `${envvar:…}` can read: the non-empty host values over
 * `.env.<environment>` (only when an environment is selected) over `.env`.
 * Each file is read whenever it exists, unless it is over `maxFileBytes`
 * (then it is an error, as for any project file). `setIn` says where each
 * value came from: `host`, or the file's path (specification 4.6). The
 * diagnostics are those and the files' bad lines.
 */
export function envvarsFor(
  files: FileSource,
  environment: string | undefined,
  host: Readonly<Record<string, string | undefined>>,
  maxFileBytes: number = defaultLimits.maxFileBytes,
): { envvars: Record<string, string>; setIn: Record<string, SetIn>; diagnostics: Diagnostic[] } {
  const envvars = noPrototype();
  const setIn = noPrototype() as Record<string, SetIn>;
  const diagnostics: Diagnostic[] = [];
  const paths: SetIn[] = [".env"];
  // The manifest's own rule for an environment name; anything else could name another file.
  if (environment !== undefined && environmentName.test(environment))
    paths.push(`.env.${environment}`);
  for (const path of paths) {
    const file = readFileIfPresent(files, path, maxFileBytes);
    diagnostics.push(...file.diagnostics);
    // An empty value counts as unset, so it never hides what an earlier file set.
    for (const [name, value] of Object.entries(file.values)) {
      if (value === "") continue;
      envvars[name] = value;
      setIn[name] = path;
    }
  }
  for (const [name, value] of Object.entries(host)) {
    if (value === undefined || value === "") continue;
    envvars[name] = value;
    setIn[name] = "host";
  }
  return { envvars, setIn, diagnostics };
}

function readFileIfPresent(files: FileSource, path: string, maxFileBytes: number): EnvFile {
  const none: EnvFile = { values: {}, diagnostics: [] };
  const knownSize = files.size?.(path);
  if (knownSize !== undefined && knownSize > maxFileBytes) {
    return { ...none, diagnostics: [tooLarge(path, knownSize, maxFileBytes)] };
  }
  const text = files.read(path);
  if (text === undefined) return none;
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > maxFileBytes) return { ...none, diagnostics: [tooLarge(path, bytes, maxFileBytes)] };
  return readEnvFile(text, path);
}
