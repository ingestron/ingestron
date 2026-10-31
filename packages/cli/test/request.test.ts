// ingestron request: what to ask of whoever runs the data platform.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const examples = join(import.meta.dirname, "../../../samples");

function ingestron(example: string, ...args: string[]) {
  let output = "";
  const code = run(args, { cwd: join(examples, example), write: (text) => (output += text) });
  return { code, output };
}

describe("ingestron request", () => {
  it("prints the request for one environment, as the editor's command writes it", () => {
    const { code, output } = ingestron("guides/platform-setup", "request", "--env", "prod");
    expect(code).toBe(0);
    expect(output).toMatch(/^# Platform request: hr \(prod\)\n/);
    expect(output).toContain("GRANT USE CATALOG, CREATE SCHEMA ON CATALOG `hr_prod`");
  });

  it("prints one request per environment by default", () => {
    const { output } = ingestron("guides/platform-setup", "request");
    expect(output.match(/^# Platform request/gm)).toHaveLength(2);
  });
});

describe("what must exist before deploying", () => {
  it("lists the minimal starter's catalog, schema, files and compute, without a platform document", () => {
    const { output } = ingestron("starters/minimal", "request");
    expect(output).toContain("## Must exist before deploying");
    expect(output).toContain("- Catalog `dev`");
    expect(output).toContain("- Schema `dev.bronze`");
    expect(output).toContain("`/Volumes/dev/landing/shop`");
    expect(output).toContain("Serverless compute");
    expect(output).toContain("No workspace host is set");
    expect(output).toContain("## Schedules\n\n- No schedule:");
  });
});

describe("schedules", () => {
  it("shows the job and the Data Factory trigger, so a paused job beside a started trigger is visible", () => {
    const { output } = ingestron("starters/private-sql-server", "request", "--env", "prod");
    expect(output).toMatch(/## Schedules\n\n- Job `[^`]+`: `[^`]+` \([^)]+\), runs\./);
    expect(output).toMatch(/- Data Factory trigger `tr_[^`]+`: every [\w ]+, started\./);
  });
});
