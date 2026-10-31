// Helpers for packages built on this one: document locations and shared formatting.
import { describe, expect, it } from "vitest";
import { defineKind, formatDiagnostics, memoryFiles, resolveProject } from "../src/index.js";

const pipeline = defineKind<{ table: string }>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object" },
});

const project = {
  "project.yaml": 'id: sales\nimports: ["*.pipeline.yaml"]\n',
  "orders.pipeline.yaml":
    "apiVersion: example.dev/v1\nkind: Pipeline\nid: orders\ntable: raw_orders\n",
};

describe("document locations", () => {
  it("locates a field, its nearest written parent, or else the document", () => {
    const files = memoryFiles({
      ...project,
      "orders.pipeline.yaml": project["orders.pipeline.yaml"] + "steps:\n  - name: load\n",
    });
    const document = resolveProject(files, { kinds: [pipeline] }).project?.get(pipeline, "orders");
    expect(document?.locate("/table")).toEqual({
      file: "orders.pipeline.yaml",
      line: 4,
      column: 8,
    });
    expect(document?.locate("/steps/0/name")).toEqual({
      file: "orders.pipeline.yaml",
      line: 6,
      column: 11,
    });
    expect(document?.locate("/steps/0/missing")).toEqual({
      file: "orders.pipeline.yaml",
      line: 6,
      column: 5,
    });
    expect(document?.locate("/nothing")).toEqual({
      file: "orders.pipeline.yaml",
      line: 1,
      column: 1,
    });
  });
});

describe("formatDiagnostics with codes from other packages", () => {
  it("prints any code", () => {
    const text = formatDiagnostics([{ code: "BAD_NAME", severity: "error", message: "No." }]);
    expect(text).toBe("(project)  error  BAD_NAME\n  No.");
  });
});

describe("formatDiagnostics with a hint of several lines", () => {
  it("indents every line, so an example stays under its problem", () => {
    const text = formatDiagnostics([
      {
        code: "SCHEMA",
        severity: "error",
        message: "fixed is empty.",
        hint: "Settings.\nFor example:\n  fixed: {}",
      },
    ]);
    expect(text).toBe(
      "(project)  error  SCHEMA\n  fixed is empty.\n  Settings.\n  For example:\n    fixed: {}",
    );
  });
});
