// The source request's last alternative, offered when the project guide has its source metadata
// part (spec/cli/sources.md, section 4, "The alternatives").
import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { guideFacts, guideSection, sourceRequestFor, type GuideFacts } from "../src/internal.js";
import { standIns } from "./assistant-cases.js";
import { expected, project, recipesOf } from "./source-request-fixture.js";

const section = (withConnection: boolean): string =>
  guideSection(
    guideFacts(
      memoryFiles({
        "project.yaml": "id: retail\nenvironments: { dev: {} }\nimports: ['*.yaml']\n",
        "standard.yaml": "kind: Standard\nid: acme\npacks: [fold@2]\n",
        ...(withConnection && { "a.yaml": "kind: Connection\nid: crm\n" }),
      }),
      "build",
      standIns,
    ) as GuideFacts,
  );

const item = (connection: string): string =>
  `- Or ask the coding assistant this project's guide sets up to prepare the columns file from whatever you have (a data dictionary, a spreadsheet, API responses), saved as \`sources/${connection}.assistant.csv\`. Check it with \`ingestron source import ${connection} sources/${connection}.assistant.csv --dry-run\`.`;

/** The conformance request with the item after each columns-file item. */
const withItems = (name: string): string =>
  expected(name).replace(
    /^(- The columns file, saved as `sources\/(\w+)\.columns\.csv`.*)$/gm,
    (_, line: string, connection: string) => `${line}\n${item(connection)}`,
  );

const request = (agents: string | null) => {
  const files = project(agents === null ? {} : { "AGENTS.md": agents });
  return sourceRequestFor(files, "dev", { envvars: {}, recipes: recipesOf(files) }).text;
};

describe("sourceRequestFor: the assistant's columns file", () => {
  it("ends each connection's alternatives with it when the guide has the source part", () => {
    const text = request(`# Mine\n\n${section(true)}`);
    expect(text).toBe(withItems("request.dev.md"));
    expect(text).toContain(item("crm"));
    expect(text).toContain(item("erp"));
    expect(text).not.toContain(item("landing"));
  });

  it("puts it last, after the columns file's item", () => {
    const text = request(section(true));
    const lines = text.split("\n");
    const at = lines.indexOf(item("crm"));
    expect(lines[at - 1]).toMatch(/^- The columns file, saved as `sources\/crm\.columns\.csv`/);
    expect(lines[at + 1]).toBe("");
  });

  it("is the request as before without AGENTS.md", () => {
    expect(request(null)).toBe(expected("request.dev.md"));
  });

  it("is the request as before when AGENTS.md has no markers", () => {
    expect(request("# Mine\n\nNotes.\n")).toBe(expected("request.dev.md"));
  });

  it("is the request as before when the section lacks the source metadata part", () => {
    expect(request(section(false))).toBe(expected("request.dev.md"));
  });

  it("leaves a covered connection alone", () => {
    const text = request(section(true));
    expect(text).not.toContain("sources/landing.assistant.csv");
  });
});
