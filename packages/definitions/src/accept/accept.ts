// Accepted warnings (specification, Accepted warnings): the Platform's `accept` list takes the
// warnings it names out of the result's problems, and says which entries are invalid or unused.
import {
  type DefinitionDocument,
  type FileSource,
  type Fix,
  type Project,
  type Severity,
} from "@ingestron/config";
import { codeHelp, loadingCodeHelp, type Diagnostic } from "../diagnostics/index.js";
import { kinds, type AcceptDoc, type PlatformDoc } from "../documents/index.js";
import { holdsReference, writtenValue } from "../internal/index.js";
import { acceptsWarning, fromBuild, type AcceptAtBuild } from "./matching.js";

/**
 * A warning the Platform's `accept` list accepted, with the entry that did.
 * @public
 */
export interface AcceptedWarning {
  /** The warning, as it would have been reported, with its subject. */
  diagnostic: Diagnostic;
  /** The entry's reason. */
  reason: string;
  /** Where the entry is written: the Platform's file, or where a reference to the list is. */
  entry: { file: string; line: number };
}

/** What `accept` needs of a result: the problems, and whether the project resolved. */
interface Resolved {
  ok: boolean;
  diagnostics: Diagnostic[];
  model?: unknown;
}

/** The levels a code is reported at, from its help; undefined for a code that does not exist. */
export function severitiesOf(code: string): readonly Severity[] | undefined {
  if (Object.hasOwn(codeHelp, code)) return codeHelp[code as keyof typeof codeHelp].severities;
  if (Object.hasOwn(loadingCodeHelp, code))
    return loadingCodeHelp[code as keyof typeof loadingCodeHelp].severities;
  return undefined;
}

/** The codes that cannot be accepted, so that a stale list always shows. */
const never = new Set(["ACCEPT_CODE", "ACCEPT_UNUSED"]);

/** Why an entry's code cannot be accepted, or undefined when it can. */
function codeProblem(code: string): { message: string; hint: string } | undefined {
  const severities = severitiesOf(code);
  if (never.has(code))
    return {
      message: `"${code}" can't be accepted, so that a stale list always shows.`,
      hint: "Remove the entry, or fix the entry that the warning is about.",
    };
  if (severities === undefined)
    return {
      message: `"${code}" is not a problem code, so no warning can be accepted by it.`,
      hint: "Use the code of a warning, as ingestron check prints it.",
    };
  if (severities.length === 0)
    return {
      message: `"${code}" is no longer reported, so there is nothing to accept.`,
      hint: `Remove the entry. ${codeHelp[code as keyof typeof codeHelp].fix}`,
    };
  if (!severities.includes("warning"))
    return {
      message: `"${code}" is only ever ${severities.map(inWords).join(" or ")}, and only warnings can be accepted.`,
      hint: "Fix the problem instead; an error stops a run until it is fixed.",
    };
  return undefined;
}

function inWords(severity: Severity): string {
  return severity === "error" ? "an error" : severity;
}

/** The entry in words, for the message of an unused one: `NOT_APPLIED (table "orders")`. */
function describe(entry: AcceptDoc): string {
  const about = (["file", "table", "feature"] as const).flatMap((key) =>
    entry.about?.[key] === undefined ? [] : [`${key} "${entry.about[key]}"`],
  );
  return about.length > 0 ? `${entry.code} (${about.join(", ")})` : entry.code;
}

/** An entry of the list with a code that can be accepted, and whether a warning matched it. */
interface Valid {
  entry: AcceptDoc;
  index: number;
  used: boolean;
}

/** The Platform's list, and how to point at and remove its entries. */
interface Accepting {
  platform: DefinitionDocument<PlatformDoc>;
  /** The fix that removes entry `index`, when the Platform's file writes the list itself. */
  removing(index: number): Fix[];
}

/**
 * The result without the warnings the Platform accepts, and with them in `accepted`. An entry
 * with an invalid code is `ACCEPT_CODE`, an error, so the project no longer resolves; an entry
 * that matches nothing is `ACCEPT_UNUSED`, but only for a project that resolved without errors,
 * since an error can leave warnings unreported. A project that did not load accepts nothing.
 */
export function acceptWarnings<Result extends Resolved>(
  files: FileSource,
  project: Project | undefined,
  result: Result,
): Result & { accepted: AcceptedWarning[]; acceptAtBuild?: AcceptAtBuild[] } {
  const platform = project?.all(kinds.platform)[0] as DefinitionDocument<PlatformDoc> | undefined;
  const list = platform?.value.accept;
  if (!platform || !Array.isArray(list) || list.length === 0) return { ...result, accepted: [] };
  const literal = isLiteral(files, platform);
  const accepting: Accepting = {
    platform,
    removing: (index) =>
      literal
        ? [
            {
              title: "Remove the entry",
              edits: [{ file: platform.file, pointer: `/accept/${index}`, remove: true }],
            },
          ]
        : [],
  };
  const { valid, wrong } = checkEntries(accepting, list);
  const { kept, accepted } = takeOut(accepting, valid, result.diagnostics);
  // An entry for a warning of a build is the building tool's to match and judge.
  const atBuild = valid
    .filter((item) => fromBuild(item.entry.code))
    .map((item) => buildEntry(accepting, item));
  // Judged on the result as it was, and only when no entry is `ACCEPT_CODE` either.
  const unused = unusedEntries(accepting, valid, result.ok && wrong.length === 0);
  const { model, ...rest } = result;
  return {
    ...rest,
    ...(result.ok && wrong.length === 0 ? { model } : { ok: false }),
    diagnostics: [...kept, ...wrong, ...unused],
    accepted,
    ...(atBuild.length > 0 && { acceptAtBuild: atBuild }),
  } as Result & { accepted: AcceptedWarning[]; acceptAtBuild?: AcceptAtBuild[] };
}

/**
 * `ACCEPT_UNUSED` for each entry that matched nothing, but only for a project without errors
 * (an `ACCEPT_CODE` error counts), since an error can leave warnings unreported.
 */
function unusedEntries(accepting: Accepting, valid: Valid[], errorFree: boolean): Diagnostic[] {
  if (!errorFree) return [];
  return valid
    .filter((item) => !item.used && !fromBuild(item.entry.code))
    .map((item) => unusedEntry(accepting, item));
}

/** An entry for a warning of a build, as the building tool is given it. */
function buildEntry(accepting: Accepting, item: Valid): AcceptAtBuild {
  const { file, line } = accepting.platform.locate(`/accept/${item.index}`);
  const { code, about, reason } = item.entry;
  return {
    code,
    ...(about !== undefined && { about }),
    reason,
    entry: { file, line },
    unused: unusedEntry(accepting, item),
  };
}

/** The entries with a code that can be accepted, and `ACCEPT_CODE` for each other. */
function checkEntries(
  { platform, removing }: Accepting,
  list: AcceptDoc[],
): { valid: Valid[]; wrong: Diagnostic[] } {
  const valid: Valid[] = [];
  const wrong: Diagnostic[] = [];
  list.forEach((entry, index) => {
    const problem = codeProblem(entry.code);
    if (!problem) return void valid.push({ entry, index, used: false });
    const fixes = removing(index);
    wrong.push({
      code: "ACCEPT_CODE",
      severity: "error",
      message: problem.message,
      hint: problem.hint,
      location: platform.locate(`/accept/${index}/code`),
      ...(fixes.length > 0 && { fixes }),
    });
  });
  return { valid, wrong };
}

/**
 * Splits the problems into those that remain and the warnings accepted, each by the first entry
 * that matches it; every entry that matches is marked used, even one an earlier entry shadows.
 */
function takeOut(
  { platform }: Accepting,
  valid: Valid[],
  diagnostics: Diagnostic[],
): { kept: Diagnostic[]; accepted: AcceptedWarning[] } {
  const kept: Diagnostic[] = [];
  const accepted: AcceptedWarning[] = [];
  for (const diagnostic of diagnostics) {
    const matching = valid.filter((item) => acceptsWarning(item.entry, diagnostic));
    for (const item of matching) item.used = true;
    const first = matching[0];
    if (!first) {
      kept.push(diagnostic);
      continue;
    }
    const { file, line } = platform.locate(`/accept/${first.index}`);
    accepted.push({ diagnostic, reason: first.entry.reason, entry: { file, line } });
  }
  return { kept, accepted };
}

/** True when the Platform's file writes the list itself, not through a value or another file. */
function isLiteral(files: FileSource, platform: DefinitionDocument): boolean {
  const written = writtenValue(files, platform.file, "/accept");
  return written !== undefined && Array.isArray(written.value) && !holdsReference(written.value);
}

function unusedEntry({ platform, removing }: Accepting, { entry, index }: Valid): Diagnostic {
  const fixes = removing(index);
  return {
    code: "ACCEPT_UNUSED",
    severity: "warning",
    message: `The accept entry for ${describe(entry)} matches no warning in this run.`,
    hint: "Remove the entry, or correct its code or about. To accept different warnings in each environment, write the list as a value: accept: ${values.accept}.",
    location: platform.locate(`/accept/${index}`),
    ...(fixes.length > 0 && { fixes }),
  };
}
