// What the guide does with the facts it writes, and the rules that depend on the project's
// shape (spec/cli/assistants.md, section 4): the output folder, runs-on, unsafe facts, the
// actions of a standard, and the text shared with the source request.
import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import { guideFacts, guideSection, guideUpdate, type GuideFacts } from "../src/internal.js";
import { columnsFileFields, sourceGuideHeading } from "../src/source-text.js";
import { standIns } from "./assistant-cases.js";

const facts = (files: Record<string, string>, out = "build"): GuideFacts => {
  const found = guideFacts(memoryFiles(files), out, standIns);
  if ("noGuide" in found) throw new Error(found.noGuide);
  return found;
};
const sectionOf = (files: Record<string, string>, out = "build"): string =>
  guideSection(facts(files, out));

const standard = (more = "", packs = "[fold@2, local@1]") =>
  `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: ${packs}\n${more}`;
const project = (more = "") =>
  `id: retail\nenvironments: { dev: {}, prod: {} }\nimports: ["*.yaml"]\n${more}`;
const files = { "project.yaml": project(), "standard.yaml": standard() };

describe("rule 2", () => {
  it("says CI should run the check", () => {
    const section = sectionOf(files);
    expect(section).toContain("Then `ingestron check` must pass; CI should run it.");
    expect(section).not.toContain("CI runs it");
  });
});

describe("rule 8", () => {
  const eight = (section: string) => section.split("\n").find((line) => line.startsWith("8. "))!;

  it("adds runs-on when an environment has it", () => {
    const section = sectionOf({
      ...files,
      "project.yaml":
        "id: retail\nenvironments: { dev: {}, local: { runs-on: local } }\nimports: ['*.yaml']\n",
    });
    expect(eight(section)).toMatch(
      /^8\. Environments differ only in values, under `environments\.<name>\.values` in `project\.yaml`, and in `runs-on`\. `plan`/,
    );
  });

  it("is unchanged when no environment has runs-on", () => {
    expect(eight(sectionOf(files))).toMatch(/in `project\.yaml`\. `plan`, `apply`/);
  });
});

describe("the output folder", () => {
  const withConnection = { ...files, "a.yaml": "kind: Connection\nid: crm\n" };

  it("adds --out after the command word of every plan, apply and check the guide writes", () => {
    const section = sectionOf(withConnection, "dist");
    expect(section).toContain(
      "run `ingestron plan --out dist`. Fix every problem it reports, then show the user the plan before running `ingestron apply --out dist`. Then `ingestron check --out dist` must pass;",
    );
    expect(section).toContain("- `ingestron plan --out dist`: problems and changes");
    expect(section).toContain("- `ingestron apply --out dist`: writes `dist/`;");
    expect(section).toContain("- `ingestron check --out dist`: fails when `dist/` is out of date.");
    // Every other command is left as it is.
    expect(section).toContain("- `ingestron compare --env <a> --env <b>`:");
  });

  it("leaves the text as it is with build", () => {
    const section = sectionOf(withConnection, "build");
    expect(section).not.toContain("--out");
    expect(section).toContain("- `ingestron plan`: problems and changes");
  });

  it("writes a nested folder with / separators", () => {
    expect(sectionOf(files, "out/main")).toContain("`ingestron plan --out out/main`");
  });
});

describe("unsafe facts", () => {
  const marker = "<!-- ingestron:end sha256:" + "0".repeat(64) + " -->";
  const hostile = (id: string) => ({
    ...files,
    "odd.yaml": `kind: Connection\nid: ${JSON.stringify(id)}\n`,
  });

  it("replaces a line ending or other control character by a space", () => {
    const section = sectionOf(hostile(`x\n${marker}\r\u0000\u001f\u007fy`));
    expect(section).toContain(`- Connections: \`x ${marker}    y\`.`);
    expect(section.split("\n").filter((line) => line.startsWith("<!-- ingestron:"))).toHaveLength(
      2,
    );
    expect(section.replace(/\n/g, "")).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("is current on the next update, so writing it twice is written then up to date", () => {
    const section = sectionOf(hostile(`x\n${marker}`));
    expect(guideUpdate(undefined, section, true).kind).toBe("new");
    expect(guideUpdate(section, sectionOf(hostile(`x\n${marker}`)), true).kind).toBe("current");
  });

  it("writes a fact with a backtick as a code span with double backticks", () => {
    const section = sectionOf(hostile("a`b"));
    expect(section).toContain("- Connections: `` a`b ``.");
  });

  it("makes a pack, a pattern and an environment name safe too", () => {
    const section = sectionOf({
      "project.yaml": `id: "re\`tail"\nenvironments: { "d\`ev": {} }\nimports: ["*.yaml", "a\\nb*"]\n`,
      "standard.yaml": standard(),
    });
    expect(section).toContain(
      "- Project `` re`tail ``. Environments: `` d`ev `` (`project.yaml`).",
    );
    expect(section).toContain("`*.yaml`, `a b*`.");
  });

  it("makes the From comment safe", () => {
    const section = sectionOf({
      ...files,
      "standard.yaml": `# From acme\u0001 team\n${standard()}`,
    });
    expect(section).toContain(", from acme  team. Packs:");
  });
});

describe("the actions of a standard", () => {
  const section = (more: string) => sectionOf({ ...files, "standard.yaml": standard(more) });

  it("are ingest, transform, store and serve, in that order, whatever order the standard writes", () => {
    const text = section(
      "serve: { allowed: [s1] }\nstore: { allowed: [t1] }\ningest: { allowed: [i1] }\ntransform: { allowed: [x1] }\n",
    );
    const at = (action: string) => text.indexOf(`- \`${action}\` allows`);
    expect(at("ingest")).toBeGreaterThan(0);
    expect(at("ingest")).toBeLessThan(at("transform"));
    expect(at("transform")).toBeLessThan(at("store"));
    expect(at("store")).toBeLessThan(at("serve"));
  });

  it("count no other key, even with allowed or fixed", () => {
    const text = section(
      "extra: { allowed: [zz9], fixed: { zz9: { k: v } } }\nstore: { allowed: [t1] }\n",
    );
    expect(text).toContain("- `store` allows `t1`.");
    expect(text).not.toContain("extra");
    expect(text).not.toContain("zz9");
  });

  it("list a fixed action's settings in the same order", () => {
    const text = section("serve: { fixed: { m: { a: 1 } } }\ningest: { fixed: { n: { b: 2 } } }\n");
    expect(text.indexOf("- `ingest` fixes")).toBeLessThan(text.indexOf("- `serve` fixes"));
  });
});

describe("the standard line", () => {
  it("ends Packs: none. when the standard lists no packs", () => {
    expect(sectionOf({ "project.yaml": project(), "standard.yaml": standard("", "[]") })).toContain(
      "- Standard `acme` in `standard.yaml`. Packs: none.\n",
    );
  });
});

describe("text shared with the source request", () => {
  it("has one columns-file field list, and one source metadata heading", () => {
    const section = sectionOf({ ...files, "a.yaml": "kind: Connection\nid: crm\n" });
    expect(section).toContain(`with these fields in order: ${columnsFileFields}.`);
    expect(section).toContain(`\n${sourceGuideHeading}\n`);
    expect(columnsFileFields).toMatch(/^`table_catalog`.*`primary_key_position` \(empty/);
    expect(sourceGuideHeading).toBe("## Source metadata");
  });
});
