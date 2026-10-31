// The samples users read and start from: starters and guides, each with the
// facts its project shows, found by resolving it rather than written by hand.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSamples, sampleFacts, samplesFoldersFor } from "../src/samples.js";

describe("listSamples", () => {
  const samples = listSamples();

  it("lists the starters, minimal first, then the guides in their order", () => {
    const starters = samples.filter((sample) => sample.kind === "starter");
    const guides = samples.filter((sample) => sample.kind === "guide");
    expect(starters).toHaveLength(8);
    expect(starters[0]?.name).toBe("minimal");
    expect(guides.map((guide) => guide.name)).toEqual([
      "environments",
      "change-data",
      "quality",
      "layers-and-transforms",
      "standards-and-conventions",
      "platform-setup",
      "existing-tables",
      "adf-native-connectors",
      "connection-first-files",
      "connection-first-adf",
    ]);
    expect(samples.every((sample) => sample.title && /\.$/.test(sample.summary))).toBe(true);
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

  it("names the features a guide shows", () => {
    const quality = listSamples().find((sample) => sample.name === "quality")!;
    expect(sampleFacts(quality.folder).features).toContain("quality checks");
    const layers = listSamples().find((sample) => sample.name === "layers-and-transforms")!;
    expect(sampleFacts(layers.folder).features).toContain("transforms");
    const minimal = listSamples().find((sample) => sample.name === "minimal")!;
    expect(sampleFacts(minimal.folder).features).not.toContain("quality checks");
  });
});

describe("samplesFoldersFor", () => {
  it("uses the packaged templates when installed in a project with its own samples/", () => {
    const project = mkdtempSync(join(tmpdir(), "ingestron-project-"));
    mkdirSync(join(project, "samples/starters"), { recursive: true });
    const installed = join(project, "node_modules/ingestron");
    mkdirSync(join(installed, "project-templates"), { recursive: true });
    expect(samplesFoldersFor(installed)).toEqual({
      starters: join(installed, "project-templates"),
    });
  });

  it("uses the repository's samples inside this repository", () => {
    const root = join(import.meta.dirname, "..");
    const samples = join(root, "../../samples");
    expect(samplesFoldersFor(root)).toEqual({
      starters: join(samples, "starters"),
      guides: join(samples, "guides"),
    });
  });
});
