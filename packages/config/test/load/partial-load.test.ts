// Validated documents remain inspectable after a failed load; generation gets no project.
import { describe, expect, it } from "vitest";
import { defineKind, memoryFiles, resolveProject } from "../../src/index.js";
const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["table"] },
});
const project = {
  "project.yaml": 'id: sales\nimports: ["*.pipeline.yaml"]\n',
  "orders.pipeline.yaml":
    "apiVersion: example.dev/v1\nkind: Pipeline\nid: orders\ntable: raw_orders\n",
};
describe("failed-load inspection", () => {
  it("exposes only valid imported unique documents after a failed load, never a project", () => {
    const files = {
      ...project,
      "empty.pipeline.yaml": "",
      "invalid.pipeline.yaml": "apiVersion: example.dev/v1\nkind: Pipeline\nid: invalid\n",
    };
    const result = resolveProject(memoryFiles(files), { kinds: [pipeline] });
    expect(result.ok).toBe(false);
    expect(result.project).toBeUndefined();
    if (!result.ok) expect(result.documents.map((document) => document.id)).toEqual(["orders"]);
    const duplicate = resolveProject(
      memoryFiles({ ...files, "copy.pipeline.yaml": project["orders.pipeline.yaml"] }),
      { kinds: [pipeline] },
    );
    if (!duplicate.ok) expect(duplicate.documents).toEqual([]);
    expect(resolveProject(memoryFiles({}), { kinds: [pipeline] })).toMatchObject({
      ok: false,
      documents: [],
    });
  });
});
