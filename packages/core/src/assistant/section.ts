// The section of AGENTS.md that Ingestron owns: its hash, and what to do with a file that may hold it
// (spec/cli/assistants.md, sections 3 and 5).
import { sourceGuideHeading } from "../source-text.js";
import { hashOf, lineEnding, shapeOf } from "./markers.js";

/**
 * The hash a section records: of its text from the begin-marker line to the line before the end
 * marker, with CRLF read as LF.
 * @internal
 */
export function guideHash(section: string): string {
  const lines = section.split("\n");
  const end = lines.findLastIndex((line) => line.startsWith("<!-- ingestron:end"));
  return hashOf(end === -1 ? section : lines.slice(0, end).join("\n") + "\n");
}

/**
 * What to do with an `AGENTS.md`: write it whole, append the section, replace a stale one, leave a
 * current one, or leave one alone that a person edited or that is theirs. Every `text` is in the
 * line ending of `existing`.
 * @internal
 */
export type GuideUpdate =
  { kind: "new" | "appended" | "updated"; text: string } | { kind: "current" | "edited" | "user" };

/**
 * Compares the file's text (`undefined` when there is no file) with the section written now.
 * `append` says whether a file with no marker takes the section (`init`, `assistant add`) or is the
 * user's to leave alone (`plan`, `apply`).
 * @internal
 */
export function guideUpdate(
  existing: string | undefined,
  section: string,
  append: boolean,
): GuideUpdate {
  if (existing === undefined || (existing === "" && append)) return { kind: "new", text: section };
  const shape = shapeOf(existing);
  if (shape.kind === "edited") return { kind: "edited" };
  const eol = lineEnding(existing);
  if (shape.kind === "user") {
    if (!append) return { kind: "user" };
    const gap = existing.endsWith("\n") ? eol : eol + eol;
    return { kind: "appended", text: existing + gap + section.replaceAll("\n", eol) };
  }
  const body = existing.slice(shape.start, shape.endStart);
  if (shape.recorded !== hashOf(body)) return { kind: "edited" };
  if (shape.recorded === guideHash(section)) return { kind: "current" };
  const replacement = section.slice(0, -1).replaceAll("\n", eol);
  return {
    kind: "updated",
    text: existing.slice(0, shape.start) + replacement + existing.slice(shape.end),
  };
}

/**
 * True when the file holds an Ingestron section that has the `## Source metadata` part, which the
 * source request names as one more alternative.
 * @internal
 */
export function hasSourceGuide(agents: string | undefined): boolean {
  if (agents === undefined) return false;
  const shape = shapeOf(agents);
  if (shape.kind !== "section") return false;
  return agents
    .slice(shape.start, shape.endStart)
    .split("\n")
    .some((line) => line.replace(/\r$/, "") === sourceGuideHeading);
}
