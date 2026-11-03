// Hovers and table labels never show what came from .env, the host environment or a secret,
// while problems still resolve with the real values.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations.js";
import { problems } from "../src/diagnostics.js";
import { hoverAt } from "../src/hover.js";
import { openProject } from "../src/project.js";
import { cleanEnvironment, fromFile, fromHost, made } from "./env-workspace.js";

cleanEnvironment();

const flow = (note: string) => `apiVersion: ingestron.io/v1
kind: Flow
id: orders
source: shop
tables:
  orders:
    object: orders
    contract: shop.orders
    ingest:
      with: { format: csv, options: { note: "${note}" } }
`;

function hoverFor(folder: string, text: string, needle: string, plus: number) {
  const open = new Map([[join(folder, "flows/orders.yaml"), text]]);
  const project = openProject(folder, open);
  return {
    project,
    shown: hoverAt(project, "flows/orders.yaml", text, text.indexOf(needle) + plus, "dev"),
  };
}

describe("hovers never show a value from .env or the host", () => {
  const text = flow("${envvar:" + fromFile + "}");

  it("the table hover shows the reference, and keeps showing other settings", () => {
    const folder = made(fromFile, {
      ".env": `${fromFile}=SECRETFILEVALUE\n`,
      ".env.dev": `${fromFile}=SECRETDEVVALUE\n`,
    });
    const { shown } = hoverFor(folder, text, "  orders:", 3);
    expect(shown).not.toContain("SECRET");
    expect(shown).toContain("${envvar:" + fromFile + "}");
    expect(shown).toContain("| `format` | `csv` |");
  });

  it("the setting-key hover shows the reference", () => {
    const folder = made(fromFile, { ".env.dev": `${fromFile}=SECRETDEVVALUE\n` });
    const { shown } = hoverFor(folder, text, "options", 2);
    expect(shown).not.toContain("SECRET");
    expect(shown).toContain("${envvar:" + fromFile + "}");
    expect(hoverFor(folder, text, "format", 2).shown).toContain("`format` for `orders`: `csv`");
  });

  it("neither shows the host environment's value", () => {
    process.env[fromHost] = "SECRETHOSTVALUE";
    const folder = made(fromHost);
    const hostText = flow("${envvar:" + fromHost + "}");
    expect(hoverFor(folder, hostText, "  orders:", 3).shown).not.toContain("SECRET");
    expect(hoverFor(folder, hostText, "options", 2).shown).not.toContain("SECRET");
    const open = new Map([[join(folder, "flows/orders.yaml"), hostText]]);
    const labels = annotationsIn(openProject(folder, open), "flows/orders.yaml", hostText, "dev");
    expect(JSON.stringify(labels)).not.toContain("SECRET");
    expect(labels.some((item) => item.label.startsWith("→"))).toBe(true);
  });

  it("problems still use the real value", () => {
    // A format only the real value makes valid: with the reference as text it would be an error.
    const folder = made(fromFile, { ".env.dev": `${fromFile}=csv\n` });
    const withValue = flow("x").replace("format: csv", 'format: "${envvar:' + fromFile + '}"');
    const open = new Map([[join(folder, "flows/orders.yaml"), withValue]]);
    expect(problems(openProject(folder, open), "dev")).toEqual([]);
    expect(hoverFor(folder, withValue, "  orders:", 3).shown).not.toContain("| `format` | `csv` |");
  });
});

describe("a secret reference is skipped", () => {
  function secretProject() {
    const folder = made(fromFile, { ".env.dev": `${fromFile}=x\n` });
    const manifest = join(folder, "project.yaml");
    return { folder, manifest };
  }

  it("in annotations and hovers", async () => {
    const { folder, manifest } = secretProject();
    const { readFileSync } = await import("node:fs");
    writeFileSync(
      manifest,
      `${readFileSync(manifest, "utf8").replace("values:", "values:\n  pw: ${secret:PW_NAME}")}`,
    );
    const text = flow("${values.pw}").replace("note:", "token:");
    const { project, shown } = hoverFor(folder, text, "  orders:", 3);
    expect(shown).not.toContain("PW_NAME");
    expect(shown).not.toContain("$secret");
    const key = hoverFor(folder, text, "options", 2).shown;
    expect(key ?? "").not.toContain("PW_NAME");
    const found = annotationsIn(project, "flows/orders.yaml", text, "dev");
    expect(JSON.stringify(found)).not.toContain("PW_NAME");
  });
});
