// The editor knows the governance fields: hover describes each, completion offers them, and a
// REPLACE_ME in a Platform field that holds the team's own value says where to find it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { hoverAt } from "../src/hover/hover.js";
import { replaceMeHelp } from "../src/hover/replace-me.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

const retail = join(filledTemplates, "retail");
const read = (file: string) => readFileSync(join(retail, file), "utf8");

const standard = `${read("standard.yaml").replace(
  "naming:",
  "layers:\n  - name: bronze\n    access: { contract: false, roles: [{ role: marketing-analysts, access: read }] }\nnaming:",
)}governance:
  classification: { tag: sensitivity }
  access: { grants: exact }
  masks: { pii: hash }
  filters:
    region_rows: { function: region_filter, match: { tag: region } }
`;
const platform = `${read("platform.yaml")}  manage: { grants: true, masks: true, filters: true }
  governance:
    functions: main.governance
    unmasked: [REPLACE_ME]
principals:
  marketing-analysts: REPLACE_ME
synapse:
  manage: { grants: true }
`;

const project = openProject(
  retail,
  new Map([
    [join(retail, "standard.yaml"), standard],
    [join(retail, "platform.yaml"), platform],
  ]),
);
const texts: Record<string, string> = { "standard.yaml": standard, "platform.yaml": platform };

/** The hover on the first `needle` of `file`, two characters in. */
const hover = (file: string, needle: string) =>
  hoverAt(project, file, texts[file]!, texts[file]!.indexOf(needle) + 2, "dev");

describe("hover on the standard's access fields", () => {
  it.each([
    ["layers[].access", "access: { contract", "**access**:"],
    ["layers[].access.contract", "contract: false", "**contract**:"],
    ["layers[].access.roles", "roles: [", "**roles**:"],
    ["governance.classification.tag", "tag: sensitivity", "**tag**:"],
    ["governance.access.grants", "grants: exact", "**grants**:"],
    ["governance.masks", "masks: {", "**masks**:"],
    ["governance.masks.<class>", "pii:", "**pii**:"],
    ["governance.filters", "filters:", "**filters**:"],
    ["governance.filters.<name>.function", "function: region_filter", "**function**:"],
    ["governance.filters.<name>.match", "match: {", "**match**:"],
    ["governance.filters.<name>.match.tag", "tag: region", "**tag**:"],
  ])("describes %s", (_field, needle, start) => {
    const shown = hover("standard.yaml", needle)!;
    expect(shown).toContain(start);
    expect(shown.split("\n\n")[0]!.length).toBeGreaterThan(start.length + 10);
  });
});

describe("hover on the platform's access fields", () => {
  it.each([
    ["principals", "principals:", "**principals**:"],
    ["principals.<role>", "marketing-analysts: REPLACE", "**marketing-analysts**:"],
    ["databricks.manage.grants", "grants: true, masks", "**grants**:"],
    ["databricks.manage.masks", "masks: true", "**masks**:"],
    ["databricks.manage.filters", "filters: true", "**filters**:"],
    ["databricks.governance", "governance:\n    functions", "**governance**:"],
    ["databricks.governance.functions", "functions: main", "**functions**:"],
    ["databricks.governance.unmasked", "unmasked:", "**unmasked**:"],
    ["synapse.manage.grants", "grants: true }\n", "**grants**:"],
  ])("describes %s", (_field, needle, start) => {
    const shown = hover("platform.yaml", needle)!;
    expect(shown).toContain(start);
    expect(shown.split("\n\n")[0]!.length).toBeGreaterThan(start.length + 10);
  });

  it("names a mapping's key by the key, not by the schema's *", () => {
    expect(hover("platform.yaml", "marketing-analysts: REPLACE")).not.toContain("*****");
    expect(hover("standard.yaml", "pii:")).toMatch(/^\*\*pii\*\*: /);
  });
});

describe("completion of the access fields", () => {
  /** The key labels offered where `|` is, in `file` written as `edit` changes it. */
  const keysAt = (file: string, edit: (text: string) => string) => {
    const marked = edit(texts[file]!);
    const text = marked.replace("|", "");
    const opened = openProject(retail, new Map([[join(retail, file), text]]));
    return completionsAt(opened, file, text, marked.indexOf("|"), "dev").map((item) => item.label);
  };

  it("offers the governance keys", () => {
    const offered = keysAt("standard.yaml", (text) =>
      text.replace(/governance:[\s\S]*$/, "governance:\n  |\n"),
    );
    expect(offered).toEqual(
      expect.arrayContaining(["products", "classification", "access", "masks", "filters"]),
    );
  });

  it("offers a layer's access keys", () => {
    const offered = keysAt("standard.yaml", (text) =>
      text.replace(
        "access: { contract: false, roles: [{ role: marketing-analysts, access: read }] }",
        "access:\n      |",
      ),
    );
    expect(offered).toEqual(expect.arrayContaining(["contract", "roles"]));
  });

  it("offers a filter's keys", () => {
    const offered = keysAt("standard.yaml", (text) =>
      text.replace("{ function: region_filter, match: { tag: region } }", "\n      |"),
    );
    expect(offered).toEqual(["function", "match"]);
  });

  it("offers a Platform section's keys", () => {
    expect(
      keysAt("platform.yaml", (text) =>
        text.replace("    functions: main.governance\n", "    |\n"),
      ),
    ).toEqual(["functions"]);
    expect(
      keysAt("platform.yaml", (text) => text.replace("  manage: { grants: true }\n", "  |\n")),
    ).toEqual(["manage"]);
    expect(
      keysAt("platform.yaml", (text) =>
        text.replace("  manage: { grants: true, masks: true, filters: true }", "  manage:\n    |"),
      ).sort(),
    ).toEqual(["checks", "comments", "filters", "grants", "masks", "schemas", "tags"].sort());
  });
});

describe("a REPLACE_ME in a Platform field of the team's own value", () => {
  it.each([
    ["/principals/marketing-analysts", "principals", "<group, user or service principal>"],
    ["/databricks/governance/unmasked/0", "unmasked", "<group>"],
    ["/databricks/governance/functions", "functions", "<catalog>.<schema>"],
  ])("says where to find %s and suggests a value", (pointer, field, suggest) => {
    const help = replaceMeHelp(project, "platform.yaml", pointer, "dev");
    expect(help).toMatchObject({ field, suggest });
    expect(help?.description).toBeTruthy();
    expect(help?.find).toBeTruthy();
  });

  it("shows them in the hover", () => {
    const shown = hover("platform.yaml", "REPLACE_ME]")!;
    expect(shown).toContain("**unmasked** still needs a value.");
    expect(shown).toContain("Where to find it:");
    expect(shown).toContain("Suggested: `<group>`");
  });
});
