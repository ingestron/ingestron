import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { guideFacts, type GuideFacts } from "../src/internal.js";
import { standIns } from "./assistant-cases.js";

const facts = (files: Record<string, string>, out = "build"): GuideFacts => {
  const found = guideFacts(memoryFiles(files), out, standIns);
  if ("noGuide" in found) throw new Error(found.noGuide);
  return found;
};

const standard = (more = "") =>
  `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [fold@2, local@1]\n${more}`;
const project = "id: retail\nimports: ['*.yaml']\n";

describe("guideFacts reads the standard", () => {
  it("takes the first standard in path order, whatever the order of the imports", () => {
    const found = facts({
      "project.yaml": "id: retail\nimports: ['z-*.yaml', 'a-*.yaml']\n",
      "z-standard.yaml": standard().replace("acme", "last"),
      "a-standard.yaml": standard().replace("acme", "first"),
    });
    expect(found.standard?.id).toBe("first");
    expect(found.standard?.file).toBe("a-standard.yaml");
  });

  it("skips a file that does not parse, and a standard with no id", () => {
    const found = facts({
      "project.yaml": project,
      "a.yaml": "kind: [\n",
      "b.yaml": "kind: Standard\npacks: [fold@2]\n",
      "c.yaml": standard(),
    });
    expect(found.standard?.file).toBe("c.yaml");
  });

  it("gives no standard when its file cannot be read, and no environments when there are none", () => {
    const found = facts({ "project.yaml": project, "standard.yaml": "kind: [\n" });
    expect(found.standard).toBeUndefined();
    expect(found.environments).toEqual([]);
    expect(found.outputs).toEqual([]);
  });

  it("finds the origin, or the From comment, and whether STANDARD.md explains it", () => {
    const origin = standard("origin: { standard: acme, version: 2026-11 }\n");
    expect(facts({ "project.yaml": project, "standard.yaml": origin }).standard).toMatchObject({
      origin: "acme@2026-11",
      explained: false,
    });
    expect(
      facts({ "project.yaml": project, "standard.yaml": origin, "STANDARD.md": "# Why\n" })
        .standard,
    ).toMatchObject({ origin: "acme@2026-11", explained: true });
    expect(
      facts({
        "project.yaml": project,
        "standard.yaml": `# From  the platform team's kit \r\n${standard()}`,
      }).standard,
    ).toMatchObject({ from: "the platform team's kit" });
    expect(
      facts({
        "project.yaml": project,
        "standard.yaml": `# From the kit\n${standard("origin: { standard: acme, version: 1 }\n")}`,
      }).standard,
    ).toMatchObject({ origin: "acme@1" });
  });

  it("writes fixed values as flow text, in the order the standard writes them", () => {
    const found = facts({
      "project.yaml": project,
      "standard.yaml": standard(
        [
          "ingest:",
          "  fixed:",
          "    adf-copy: { retries: 2, every: { frequency: Hour, interval: 24 }, paused: false }",
          "store:",
          "  fixed:",
          "    streaming-table:",
          "      owner: data platform",
          '      flag: "true"',
          "      nothing: null",
          "      none: []",
          "      empty: {}",
          '      list: [a, "b c", 1]',
          '      "7": seven',
          "",
        ].join("\n"),
      ),
    });
    expect(found.standard?.fixed).toEqual([
      {
        action: "ingest",
        method: "adf-copy",
        settings: [
          ["retries", "2"],
          ["every", "{ frequency: Hour, interval: 24 }"],
          ["paused", "false"],
        ],
      },
      {
        action: "store",
        method: "streaming-table",
        settings: [
          ["owner", '"data platform"'],
          ["flag", '"true"'],
          ["nothing", "null"],
          ["none", "[]"],
          ["empty", "{}"],
          ["list", '[a, "b c", 1]'],
          ["7", "seven"],
        ],
      },
    ]);
  });
});
