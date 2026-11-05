// Every field described once, for the editor and the documentation alike.
import { describe, expect, it } from "vitest";
import { documentReference, methodReference, type PackInfo } from "../src/index.js";

describe("documentReference", () => {
  it("describes fields at every depth, through $ref, with a path that matches any key or item", () => {
    const uses = documentReference("Flow").find(
      (field) => field.path.join("/") === "tables/*/ingest/with",
    );
    expect(uses).toMatchObject({
      name: "with",
      description: expect.stringMatching(/\S/),
      docs: "/docs/reference/documents#flow-tables-item-ingest-with",
    });
  });

  it("gives each allowed value with its meaning", () => {
    const connectivity = documentReference("Connection").find(
      (field) => field.name === "connectivity",
    );
    expect(connectivity?.values?.map((item) => item.value)).toEqual([
      "public",
      "workspace",
      "private",
    ]);
    expect(connectivity?.values?.every((item) => item.description)).toBe(true);
  });

  it("says which fields are required", () => {
    const fields = documentReference("Flow");
    expect(fields.find((field) => field.path.join("/") === "source")?.required).toBe(true);
    expect(fields.find((field) => field.path.join("/") === "description")?.required).toBe(false);
  });
});

describe("methodReference", () => {
  const pack = {
    id: "test",
    methods: {
      copy: {
        action: "ingest",
        description: "Copies.",
        produces: "files",
        defaults: { mode: "full" },
        placement: { platform: ["landing"] },
        settings: {
          type: "object",
          required: ["landing"],
          properties: {
            landing: { type: "string", description: "Where files land.", examples: ["/landing"] },
            mode: {
              enum: ["full", "incremental"],
              enumDescriptions: ["Everything.", "What changed."],
              description: "What is copied.",
            },
          },
        },
      },
    },
  } as unknown as PackInfo;

  it("describes each setting with its default, values, placement and page", () => {
    const [landing, mode] = methodReference(pack, "copy");
    expect(landing).toMatchObject({
      name: "landing",
      required: true,
      placement: "platform",
      example: "/landing",
      docs: "/docs/reference/packs/test#copy-landing",
    });
    expect(mode).toMatchObject({
      default: "full",
      placement: "definition",
      values: [
        { value: "full", description: "Everything." },
        { value: "incremental", description: "What changed." },
      ],
    });
  });
});

describe("documentReference for contracts", () => {
  it("describes ODCS fields through allOf branches, without looping on nested columns", () => {
    const fields = documentReference("DataContract");
    const type = fields.find(
      (field) => field.path.join(".") === "schema.*.properties.*.logicalType",
    );
    expect(type?.description).toMatch(/\S/);
    expect(type?.docs).toBe(
      "/docs/reference/documents#datacontract-schema-item-properties-item-logicaltype",
    );
    expect(fields.find((field) => field.path.join(".") === "status")?.example).toBe("proposed");
    expect(fields.length).toBeLessThan(400);
  });
});

describe("documentReference through if and then", () => {
  it("describes a contract quality rule's own fields, such as metric and mustBe", () => {
    const fields = documentReference("DataContract");
    const at = (path: string) => fields.find((field) => field.path.join(".") === path);
    const metric = at("schema.*.properties.*.quality.*.metric");
    expect(metric?.values?.map((item) => item.value)).toContain("nullValues");
    expect(at("schema.*.properties.*.quality.*.mustBe")?.description).toMatch(/\S/);
    expect(at("schema.*.properties.*.quality.*.arguments")?.description).toMatch(/\S/);
  });
});

describe("required fields", () => {
  it("count only what every form requires, not what one alternative of oneOf does", () => {
    const fields = documentReference("DataContract");
    const at = (path: string) => fields.find((field) => field.path.join(".") === path);
    expect(at("schema.*.properties.*.quality.*.mustBe")?.required).toBe(false);
    expect(at("schema.*.properties.*.name")?.required).toBe(true);
  });
});

describe("ranges and the values of a mapping", () => {
  const pack = {
    id: "test",
    methods: {
      copy: {
        action: "ingest",
        description: "Copies.",
        produces: "files",
        settings: {
          type: "object",
          properties: {
            parallel: { type: "integer", minimum: 1, maximum: 50, description: "At once." },
            retries: { anyOf: [{ type: "integer", minimum: 0 }, { const: "never" }] },
            audit: {
              type: "object",
              description: "Columns added to every row, by name.",
              additionalProperties: {
                anyOf: [
                  {
                    enum: ["run.id", "run.trigger_time"],
                    enumDescriptions: ["The run's id.", "When the run started."],
                  },
                  { type: "string", minLength: 1 },
                ],
                description: "A run value, or other text written as it is.",
              },
            },
            labels: {
              type: "object",
              description: "Labels, by name.",
              additionalProperties: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  } as unknown as PackInfo;
  const fields = methodReference(pack, "copy");
  const at = (path: string) => fields.find((field) => field.path.join(".") === path);

  it("gives a setting's minimum and maximum from its schema, or from the branch that has them", () => {
    expect(at("parallel")).toMatchObject({ minimum: 1, maximum: 50 });
    expect(at("retries")).toMatchObject({ minimum: 0 });
    expect(at("retries")).not.toHaveProperty("maximum");
    expect(at("retries")?.type).toBe("a whole number, or never");
    expect(at("audit")).not.toHaveProperty("minimum");
  });

  it("describes a mapping's values as `*` when they have a description or allowed values", () => {
    expect(at("audit.*")).toEqual({
      path: ["audit", "*"],
      name: "*",
      type: "one of the values, or text",
      required: false,
      description: "A run value, or other text written as it is.",
      values: [
        { value: "run.id", description: "The run's id." },
        { value: "run.trigger_time", description: "When the run started." },
      ],
      placement: "definition",
      docs: "/docs/reference/packs/test#copy-audit-item",
    });
  });

  it("leaves out a mapping's values that say nothing beyond the mapping's own field", () => {
    expect(at("labels")).toBeDefined();
    expect(at("labels.*")).toBeUndefined();
  });

  it("gives the Platform's mode its default when environments are generated together", () => {
    const mode = documentReference("Platform").find((field) => field.name === "mode");
    expect(mode?.description).toBe(
      "Default: development in an environment named dev, and production in every other, test and default included. A tool that resolves one environment at a time, without generating them together as the CLI does, gives production only to prod and production.",
    );
  });

  it("says schedule.paused stays paused in test, though its mode is production", () => {
    const paused = documentReference("Platform").find(
      (field) => field.path.join(".") === "schedule.paused",
    );
    expect(paused?.description).toBe(
      "Default: running in an environment named prod or production, and where the platform sets mode: production itself; paused everywhere else, test included, though its mode is production by default.",
    );
  });
});
