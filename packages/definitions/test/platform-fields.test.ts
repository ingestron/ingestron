// The Platform fields a pack says it reads must be fields of the Platform schema
// (specification section 7); a pack that lists another is refused.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { loadDefinitions, resolveDefinitions, type PackInfo } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const read = (file: string) => parse(readFileSync(join(conformance, file), "utf8"));
const test = read("pack.yaml") as PackInfo;
const files = (read("01-minimal.yaml") as { files: Record<string, string> }).files;
const listing = (platformFields: string[]): PackInfo => ({ ...test, platformFields });
const resolve = (pack: PackInfo) =>
  resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });

describe("platformFields", () => {
  it("accepts every field the Databricks and ADF packs read", () => {
    const fields = [
      "mode",
      "compute.serverless",
      "schedule.timezone",
      "schedule.paused",
      "manage.schemas",
      "manage.tags",
      "manage.comments",
      "manage.checks",
    ];
    expect(resolve(listing(fields)).ok).toBe(true);
  });

  it("accepts a pack that lists none, as every pack before 1.9 does", () => {
    expect(resolve({ ...test, platformFields: undefined }).ok).toBe(true);
  });

  it("refuses a field the Platform document does not have, naming the pack and the path", () => {
    expect(() => resolve(listing(["mode", "schedule.pausd"]))).toThrow(
      new Error(
        'The pack "test" lists the platform field "schedule.pausd", which the Platform document does not have.',
      ),
    );
  });

  it("refuses a key under a value that is not a mapping, and a key for a mapping's values", () => {
    expect(() => resolve(listing(["mode.production"]))).toThrow(/"mode\.production"/);
    expect(() => resolve(listing(["tags.team"]))).toThrow(/"tags\.team"/);
    expect(() => resolve(listing(["manage.*"]))).toThrow(/"manage\.\*"/);
  });

  it("names the first pack, in the order given, that lists a path the reference does not have", () => {
    const other = { ...listing(["compute.size"]), id: "other" };
    const run = (packs: PackInfo[]) => () =>
      resolveDefinitions(memoryFiles(files), { packs, environment: "dev" });
    expect(run([listing(["mode"]), other])).toThrow(/^The pack "other" lists .*"compute\.size"/);
    expect(run([other, listing(["schedule.pausd"])])).toThrow(/^The pack "other"/);
    expect(run([listing(["schedule.pausd"]), other])).toThrow(/^The pack "test"/);
  });

  it("refuses the pack when loading from a folder too, before the folder is read", () => {
    const missing = join(conformance, "no-such-folder");
    expect(() => loadDefinitions(missing, { packs: [listing(["compute.size"])] })).toThrow(
      /"compute\.size"/,
    );
  });
});
