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
