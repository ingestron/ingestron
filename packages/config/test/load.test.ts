// Behaviour that the language-neutral conformance cases do not cover:
// the TypeScript API surface, Node file access and formatting.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defineKind,
  formatDiagnostics,
  loadProject,
  memoryFiles,
  resolveProject,
} from "../src/index.js";

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
}

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["table"] },
});

const project = {
  "project.yaml": 'id: sales\nimports: ["*.pipeline.yaml"]\n',
  "orders.pipeline.yaml":
    "apiVersion: example.dev/v1\nkind: Pipeline\nid: orders\ntable: raw_orders\n",
};

describe("project API", () => {
  it("finds documents by kind and id", () => {
    const result = resolveProject(memoryFiles(project), { kinds: [pipeline] });
    expect(result.ok).toBe(true);
    expect(result.project?.get(pipeline, "orders")?.value.table).toBe("raw_orders");
    expect(result.project?.all(pipeline).map((document) => document.id)).toEqual(["orders"]);
    expect(result.project?.get(pipeline, "missing")).toBeUndefined();
  });

  it("reads a manifest stored in a sub-folder, with imports relative to it", () => {
    const files = memoryFiles({
      "definitions/project.yaml": project["project.yaml"],
      "definitions/orders.pipeline.yaml": project["orders.pipeline.yaml"],
    });
    const result = resolveProject(files, {
      kinds: [pipeline],
      manifest: "definitions/project.yaml",
    });
    expect(result.project?.documents[0]?.file).toBe("definitions/orders.pipeline.yaml");
  });

  it("reports a missing manifest", () => {
    const result = resolveProject(memoryFiles({}), { kinds: [pipeline] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MISSING_FILE");
  });

  it("refuses files larger than the limit", () => {
    const result = resolveProject(memoryFiles(project), {
      kinds: [pipeline],
      limits: { maxFileBytes: 10 },
    });
    expect(result.diagnostics[0]?.code).toBe("FILE_TOO_LARGE");
  });
});

describe("loadProject (Node file system)", () => {
  it("loads files from disk and reads environment variables", () => {
    const root = mkdtempSync(join(tmpdir(), "intentlabs-config-"));
    writeFileSync(join(root, "project.yaml"), project["project.yaml"]);
    writeFileSync(
      join(root, "orders.pipeline.yaml"),
      project["orders.pipeline.yaml"].replace("raw_orders", "${envvar:TABLE}"),
    );
    const result = loadProject(root, {
      kinds: [pipeline],
      envvars: { TABLE: "from_env" },
    });
    expect(result.project?.get(pipeline, "orders")?.value.table).toBe("from_env");
  });

  it("treats a symbolic link that leaves the project as missing", () => {
    const outside = mkdtempSync(join(tmpdir(), "intentlabs-outside-"));
    writeFileSync(join(outside, "secret.yaml"), "password: hunter2\n");
    const root = mkdtempSync(join(tmpdir(), "intentlabs-config-"));
    mkdirSync(join(root, "shared"));
    symlinkSync(join(outside, "secret.yaml"), join(root, "shared/secret.yaml"));
    writeFileSync(join(root, "project.yaml"), project["project.yaml"]);
    writeFileSync(
      join(root, "orders.pipeline.yaml"),
      project["orders.pipeline.yaml"] + "leak: ${file:shared/secret.yaml}\n",
    );
    const result = loadProject(root, { kinds: [pipeline] });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["MISSING_FILE"]);
  });
});

describe("defineKind", () => {
  it("refuses a links key that is not a JSON Pointer", () => {
    expect(() =>
      defineKind({ apiVersion: "v1", kind: "A", schema: {}, links: { source: "B" } }),
    ).toThrow(/Link "source" is not a JSON Pointer/);
  });

  it("refuses a schema that declares a JSON Schema version it does not support", () => {
    expect(() =>
      defineKind({
        apiVersion: "v1",
        kind: "A",
        schema: { $schema: "http://json-schema.org/draft-04/schema#" },
      }),
    ).toThrow(/draft-04.*Supported: .*draft-07/s);
  });

  it("accepts schemas that declare draft-07, 2019-09 or 2020-12", () => {
    for (const $schema of [
      "http://json-schema.org/draft-07/schema#",
      "https://json-schema.org/draft/2019-09/schema",
      "https://json-schema.org/draft/2020-12/schema",
    ]) {
      expect(() => defineKind({ apiVersion: "v1", kind: "A", schema: { $schema } })).not.toThrow();
    }
  });

  it("refuses a schema that is not valid JSON Schema", () => {
    expect(() => defineKind({ apiVersion: "v1", kind: "A", schema: { type: "strng" } })).toThrow(
      /not a valid JSON Schema/,
    );
  });
});

describe("file access edge cases", () => {
  it("checks the size before reading when the file source can report it", () => {
    const files = {
      list: () => ["project.yaml"],
      size: () => 999_999_999,
      read: (): string => {
        throw new Error("must not read a file that is too large");
      },
    };
    const result = resolveProject(files, { kinds: [pipeline] });
    expect(result.diagnostics[0]?.code).toBe("FILE_TOO_LARGE");
  });

  it("imports symbolic links to files inside the project", () => {
    const root = mkdtempSync(join(tmpdir(), "intentlabs-config-"));
    mkdirSync(join(root, "real"));
    writeFileSync(join(root, "project.yaml"), project["project.yaml"]);
    writeFileSync(join(root, "real/orders.yaml"), project["orders.pipeline.yaml"]);
    symlinkSync(join(root, "real/orders.yaml"), join(root, "orders.pipeline.yaml"));
    const result = loadProject(root, { kinds: [pipeline] });
    expect(result.project?.all(pipeline).map((document) => document.id)).toEqual(["orders"]);
  });

  it("uses process.env when envvars is passed as undefined", () => {
    process.env.INTENTLABS_TEST_TABLE = "from_process";
    const root = mkdtempSync(join(tmpdir(), "intentlabs-config-"));
    writeFileSync(join(root, "project.yaml"), project["project.yaml"]);
    writeFileSync(
      join(root, "orders.pipeline.yaml"),
      project["orders.pipeline.yaml"].replace("raw_orders", "${envvar:INTENTLABS_TEST_TABLE}"),
    );
    const result = loadProject(root, { kinds: [pipeline], envvars: undefined });
    expect(result.project?.get(pipeline, "orders")?.value.table).toBe("from_process");
  });
});

describe("formatDiagnostics", () => {
  it("prints location, severity, code, message and hint", () => {
    const text = formatDiagnostics([
      {
        code: "UNKNOWN_REFERENCE",
        severity: "error",
        message: '"${bundle.target}" is not a reference.',
        hint: 'To pass it to the output unchanged, write "$${bundle.target}".',
        location: { file: "orders.yaml", line: 4, column: 6 },
      },
      { code: "NO_MATCH", severity: "warning", message: "No files match." },
    ]);
    expect(text).toBe(
      [
        "orders.yaml:4:6  error  UNKNOWN_REFERENCE",
        '  "${bundle.target}" is not a reference.',
        '  To pass it to the output unchanged, write "$${bundle.target}".',
        "(project)  warning  NO_MATCH",
        "  No files match.",
      ].join("\n"),
    );
  });

  it("prints the first fix, the one an editor offers first", () => {
    const edits = [{ file: "a.yaml", pointer: "/mode", set: "append" }];
    const text = formatDiagnostics([
      {
        code: "SCHEMA",
        severity: "error",
        message: 'mode is "apend"; use one of: append, upsert.',
        fixes: [
          { title: 'Change to "append"', edits },
          { title: 'Change to "upsert"', edits },
        ],
      },
    ]);
    expect(text.split("\n").at(-1)).toBe('  Fix: Change to "append".');
  });
});
