// The samples users read and start from: the starters this package ships, and
// guide folders listed the same way, each with the facts its project shows,
// found by resolving it rather than written by hand.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSamples, readSample, sampleFacts, templatesFolder } from "../src/samples.js";

const fixtures = join(import.meta.dirname, "fixtures");

describe("listSamples", () => {
  it("lists the starters in project-templates/, minimal first", () => {
    const starters = listSamples();
    expect(templatesFolder).toBe(join(import.meta.dirname, "../project-templates"));
    expect(starters).toHaveLength(9);
    expect(starters[0]?.name).toBe("minimal");
    expect(starters.every((sample) => sample.kind === "starter")).toBe(true);
    expect(starters.every((sample) => sample.title && /\.$/.test(sample.summary))).toBe(true);
  });

  it("lists a folder of guides in their order", () => {
    expect(listSamples(fixtures, "guide").map((guide) => guide.name)).toEqual([
      "environments",
      "layers-and-transforms",
      "platform-setup",
      "landing-only",
      "synapse-views",
      "duckdb-local",
    ]);
  });

  it("reads one guide folder", () => {
    const guide = readSample(join(fixtures, "environments"), "guide");
    expect(guide).toMatchObject({ name: "environments", kind: "guide" });
    expect(guide.summary).toMatch(/\.$/);
  });
});

describe("sampleFacts", () => {
  it("gives the packs, connectors, connectivity, methods and features a sample uses", () => {
    const erp = listSamples().find((sample) => sample.name === "private-sql-server")!;
    expect(sampleFacts(erp.folder)).toMatchObject({
      packs: ["databricks", "adf"],
      connectors: ["sqlserver"],
      connectivity: ["private"],
      methods: ["adf-copy", "streaming-table"],
      environments: ["dev", "prod"],
    });
  });

  it("names the features a sample shows", () => {
    expect(sampleFacts(join(fixtures, "layers-and-transforms")).features).toContain("transforms");
    const minimal = listSamples().find((sample) => sample.name === "minimal")!;
    expect(sampleFacts(minimal.folder).features).not.toContain("transforms");
  });
});
