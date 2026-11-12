import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import {
  guideFacts,
  guideHash,
  guideSection,
  guideUpdate,
  hasSourceGuide,
  type GuideFacts,
} from "../src/internal.js";
import { assistantCase, caseProject, standIns } from "./assistant-cases.js";

const files = (changes: Record<string, string> = {}) =>
  memoryFiles({
    "project.yaml": "id: retail\nenvironments: { dev: {} }\nimports: ['*.yaml']\n",
    "standard.yaml": "kind: Standard\nid: acme\npacks: [fold@2]\n",
    ...changes,
  });
const sectionFor = (changes: Record<string, string> = {}): string =>
  guideSection(guideFacts(files(changes), "build", standIns) as GuideFacts);
const S = sectionFor();
const begin = S.slice(0, S.indexOf("\n") + 1);
const crlf = (text: string) => text.replaceAll("\n", "\r\n");
const withHash = (hash: string) => S.replace(/sha256:[0-9a-f]{64}/, `sha256:${hash}`);

describe("guideUpdate", () => {
  it("writes a new file whole, also when it is empty", () => {
    expect(guideUpdate(undefined, S, true)).toEqual({ kind: "new", text: S });
    expect(guideUpdate("", S, true)).toEqual({ kind: "new", text: S });
  });

  it("appends to the user's file after one blank line, in the file's line ending", () => {
    const lf = guideUpdate("# Mine\nnotes\n", S, true);
    expect(lf).toEqual({ kind: "appended", text: `# Mine\nnotes\n\n${S}` });
    const mixed = guideUpdate("# Mine\r\nnotes", S, true);
    expect(mixed.kind).toBe("appended");
    const text = (mixed as { text: string }).text;
    expect(text.startsWith("# Mine\r\nnotes\r\n\r\n<!-- ingestron:begin")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
    expect(text.endsWith("-->\r\n")).toBe(true);
    expect(guideUpdate("one line", S, true)).toEqual({
      kind: "appended",
      text: `one line\n\n${S}`,
    });
  });

  it("leaves a file without markers alone when it is not to append", () => {
    expect(guideUpdate("# Mine\n", S, false)).toEqual({ kind: "user" });
    expect(guideUpdate("", S, false)).toEqual({ kind: "user" });
  });

  it("is current when the file holds the section, whatever the line endings", () => {
    expect(guideUpdate(S, S, false)).toEqual({ kind: "current" });
    expect(guideUpdate(S, S, true)).toEqual({ kind: "current" });
    expect(guideUpdate(`# Mine\n\n${S}\nmore\n`, S, false)).toEqual({ kind: "current" });
    expect(guideUpdate(crlf(S), S, false)).toEqual({ kind: "current" });
    expect(guideUpdate(S.trimEnd(), S, false)).toEqual({ kind: "current" });
  });

  it("updates a stale section in place, and keeps the text around it byte for byte", () => {
    const other = sectionFor({
      "project.yaml": "id: retail\nenvironments: { dev: {}, prod: {} }\nimports: ['*.yaml']\n",
    });
    expect(other).not.toBe(S);
    const before = "# Team notes\n\nBe brief.\n\n";
    const after = "\n## More\n\nAsk first.";
    const update = guideUpdate(`${before}${S.trimEnd()}${after}`, other, false);
    expect(update).toEqual({ kind: "updated", text: `${before}${other.trimEnd()}${after}` });
    expect(guideUpdate(`${before}${S}${after}`, other, true)).toEqual({
      kind: "updated",
      text: `${before}${other}${after}`,
    });
  });

  it("rewrites in the file's line ending, and leaves the other lines as they are", () => {
    const other = sectionFor({ "project.yaml": "id: other\nimports: ['*.yaml']\n" });
    const existing = `# Notes\r\n\r\n${crlf(S)}\r\nlast\r\n`;
    expect(guideUpdate(existing, other, false)).toEqual({
      kind: "updated",
      text: `# Notes\r\n\r\n${crlf(other)}\r\nlast\r\n`,
    });
    const first = `${S}tail\r\n`;
    expect(guideUpdate(first, other, false)).toEqual({ kind: "updated", text: `${other}tail\r\n` });
  });

  it("calls any other arrangement of the markers, or a wrong hash, edited by hand", () => {
    const end = S.slice(S.lastIndexOf("<!-- ingestron:end"));
    const shapes = [
      S + S,
      `${begin}${begin}text\n${end}`,
      `${end}${S}`,
      `${begin}text\n`,
      `${begin}text\n<!-- ingestron:end -->\n`,
      `${begin}text\n<!-- ingestron:end sha256:abc -->\n`,
      `${S}<!-- ingestron:end sha256:${"0".repeat(64)} -->\n`,
      `<!-- ingestron:end sha256:${"0".repeat(64)} -->\n`,
      `<!-- ingestron:begin guide 1. -->`,
      `<!-- ingestron:begin other thing -->\ntext\n${end}`,
      S.replace("4. A value", "4. (Edited.) A value"),
      withHash("0".repeat(64)),
      `${S.trimEnd()} \n`,
    ];
    for (const shape of shapes) {
      expect(guideUpdate(shape, S, true).kind, shape).toBe("edited");
      expect(guideUpdate(shape, S, false).kind, shape).toBe("edited");
    }
  });

  it("does not treat a marker in the middle of a line as a marker", () => {
    expect(guideUpdate("see `<!-- ingestron:begin guide` here\n", S, false)).toEqual({
      kind: "user",
    });
  });
});

describe("guideHash", () => {
  it("is the hash of the text before the end marker, with CRLF read as LF", () => {
    expect(guideHash(crlf(S))).toBe(guideHash(S));
    expect(S).toContain(`sha256:${guideHash(S)} -->`);
  });

  it("is the hash the conformance cases record", () => {
    const stale = assistantCase("08-stale-plan").files["AGENTS.md"]!;
    const section = stale.slice(
      stale.indexOf("<!-- ingestron:begin"),
      stale.indexOf("\n\n## More notes") + 1,
    );
    expect(section).toContain(
      "sha256:5188f2782f59e693f00b590cc8d790667c9af9f7fe4646a1a8d6fe9ba6db7211",
    );
    expect(guideHash(section)).toBe(
      "5188f2782f59e693f00b590cc8d790667c9af9f7fe4646a1a8d6fe9ba6db7211",
    );
  });
});

describe("guideUpdate against the conformance cases", () => {
  const sectionOfCase = (name: string): string => {
    const found = assistantCase(name);
    return guideSection(guideFacts(caseProject(found), "build", standIns) as GuideFacts);
  };
  const existing = (name: string) => assistantCase(name).files["AGENTS.md"]!;

  it("says a stale section would change (08, 10) and keeps the user's text when it updates (09)", () => {
    expect(guideUpdate(existing("08-stale-plan"), sectionOfCase("08-stale-plan"), false).kind).toBe(
      "updated",
    );
    expect(
      guideUpdate(existing("10-check-ignores"), sectionOfCase("10-check-ignores"), false).kind,
    ).toBe("updated");
    const update = guideUpdate(existing("09-stale-apply"), sectionOfCase("09-stale-apply"), false);
    expect(update.kind).toBe("updated");
    const text = (update as { text: string }).text;
    expect(text.startsWith("# Team notes\n\nUse British English in every message.\n\n")).toBe(true);
    expect(
      text.endsWith("\n\n## More notes\n\nAsk first.\n") || text.includes("## More notes"),
    ).toBe(true);
    expect(text).toContain(sectionOfCase("09-stale-apply"));
  });

  it("finds a hand edit (05), the user's file (06) and a current CRLF section (16)", () => {
    expect(
      guideUpdate(existing("05-edited-section"), sectionOfCase("05-edited-section"), false).kind,
    ).toBe("edited");
    expect(
      guideUpdate(existing("06-markers-removed"), sectionOfCase("06-markers-removed"), false).kind,
    ).toBe("user");
    expect(guideUpdate(existing("16-crlf-plan"), sectionOfCase("16-crlf-plan"), false).kind).toBe(
      "current",
    );
  });

  it("appends in CRLF to the user's file of case 14, with the hash of the LF text", () => {
    const found = assistantCase("14-crlf-existing");
    const section = guideSection(guideFacts(caseProject(found), "build") as GuideFacts);
    const update = guideUpdate(found.files["AGENTS.md"], section, true) as { text: string };
    for (const text of found.expect.contains!["AGENTS.md"]!) expect(update.text).toContain(text);
  });

  it("appends to the user's file of case 04", () => {
    const found = assistantCase("04-existing-agents");
    const section = guideSection(guideFacts(caseProject(found), "build") as GuideFacts);
    const update = guideUpdate(found.files["AGENTS.md"], section, true) as { text: string };
    for (const text of found.expect.contains!["AGENTS.md"]!) expect(update.text).toContain(text);
  });
});

describe("hasSourceGuide", () => {
  it("is true for a section that holds the source metadata part", () => {
    const withSources = sectionFor({ "a.yaml": "kind: Connection\nid: crm\n" });
    expect(hasSourceGuide(`# Mine\n\n${withSources}`)).toBe(true);
    expect(hasSourceGuide(crlf(withSources))).toBe(true);
    expect(hasSourceGuide(S)).toBe(false);
    expect(hasSourceGuide(undefined)).toBe(false);
    expect(hasSourceGuide("## Source metadata\n")).toBe(false);
    expect(hasSourceGuide(withSources + withSources)).toBe(false);
  });
});
