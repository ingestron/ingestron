// The operations policy and quality results (specification section 11.6): defaults, what the
// standard fixes, and the packs that judge them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  resolveDefinitions,
  type IntentUse,
  type PackInfo,
  type ResolvedModel,
} from "../../src/index.js";
import { resolveOperations } from "../../src/intent/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const load = (name: string) => parse(readFileSync(join(conformance, name), "utf8")) as never;
const test: PackInfo = load("pack.yaml");
const ops: PackInfo = load("pack-ops.yaml");
const base = (load("121-operations.yaml") as { files: Record<string, string> }).files;

/** The project of case 121 with another standard body, and the packs given. */
function resolve(standard: string, packs: PackInfo[], intent?: Record<string, IntentUse>) {
  const names = packs.map(({ id, version }) => `${id}@${version}`).join(", ");
  const files = {
    ...base,
    "standard.yaml": `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [${names}]\n${standard}`,
  };
  const [first, ...rest] = packs;
  const given =
    first && intent ? [{ ...first, intent: { ...first.intent, ...intent } }, ...rest] : packs;
  return resolveDefinitions(memoryFiles(files), { packs: given, environment: "dev" });
}

const messages = (result: ReturnType<typeof resolve>) =>
  result.diagnostics.map(({ code, message, location }) => ({
    code,
    message,
    file: location?.file,
    line: location?.line,
  }));

describe("resolveOperations", () => {
  it("gives the defaults when the standard says nothing", () => {
    expect(resolveOperations()).toEqual({
      schedule: { per: "project" },
      trigger: "schedule",
      alerts: { on: ["failure"] },
      require_tags: [],
    });
  });

  it("lets fixed win, key by key inside a mapping", () => {
    const result = resolveOperations(
      { retries: { count: 1, interval: "1m" }, timeout: "1h" },
      { retries: { count: 3 } as never },
    );
    expect(result.retries).toEqual({ count: 3, interval: "1m" });
    expect(result.timeout).toBe("1h");
  });
});

describe("project operations", () => {
  it("defaults the model's operations and quality results", () => {
    const model = resolve("", [test]).model as ResolvedModel;
    expect(model.operations).toEqual(resolveOperations());
    expect(model.qualityResults).toBe(false);
  });

  it("applies fixed.operations and reports at the fixed value", () => {
    const standard = "operations: { timeout: 1h }\nfixed: { operations: { timeout: 2h } }\n";
    const result = resolve(standard, [test]);
    expect((result.model as ResolvedModel).operations.timeout).toBe("2h");
    expect(messages(result)).toEqual([
      {
        code: "NOT_APPLIED",
        message:
          "operations.timeout: 2h isn't applied on test: No pack of this standard runs jobs.",
        file: "standard.yaml",
        line: 6,
      },
    ]);
  });

  it("judges each alert other than failure and a flow schedule", () => {
    const standard = "operations: { schedule: { per: flow }, alerts: { on: [failure, slow] } }\n";
    expect(messages(resolve(standard, [test])).map(({ message }) => message)).toEqual([
      "operations.schedule: flow isn't applied on test: No pack of this standard runs jobs.",
      "operations.alerts: slow isn't applied on test: No pack of this standard runs jobs.",
    ]);
  });

  it("gives the first pack's reason when it says not-yet, and nothing when it says elsewhere", () => {
    const standard = "operations: { timeout: 1h }\n";
    const reason = { use: "not-yet", reason: "Jobs are planned." } as const;
    const first = resolve(standard, [test], { operations: reason });
    expect(messages(first)[0]?.message).toBe(
      "operations.timeout: 1h isn't applied on test: Jobs are planned.",
    );
    const elsewhere = { use: "elsewhere", reason: "The platform team." } as const;
    expect(messages(resolve(standard, [test], { operations: elsewhere }))).toEqual([]);
  });

  it("is judged by the first pack that declares operations used, and reports its not-yet", () => {
    const standard = "operations: { timeout: 1h, trigger: files }\n";
    const some: PackInfo = {
      ...ops,
      intent: {
        operations: { use: "used", does: "Runs jobs." },
        "operations.trigger=files": { use: "not-yet", reason: "No file triggers." },
      },
    };
    expect(messages(resolve(standard, [test, some]))).toEqual([
      {
        code: "NOT_APPLIED",
        message: "operations.trigger: files isn't applied on ops: No file triggers.",
        file: "standard.yaml",
        line: 5,
      },
    ]);
  });

  it("reports a preview feature of the pack that runs jobs when the standard allows only GA", () => {
    const status = {
      level: "preview",
      label: "Beta",
      checked: "2026-11-09",
      source: "https://x.test",
    };
    const some: PackInfo = {
      ...ops,
      intent: { operations: { use: "used", does: "Runs jobs.", status } as IntentUse },
    };
    const standard = "features: ga\noperations: { timeout: 1h }\n";
    expect(messages(resolve(standard, [test, some]))[0]).toMatchObject({
      code: "PREVIEW_FEATURE",
      file: "standard.yaml",
      line: 6,
    });
  });
});

describe("quality results", () => {
  it("is NOT_APPLIED once when the store step's pack does not keep results", () => {
    const standard = "quality: { results: true }\n";
    const result = resolve(standard, [test], {
      "quality.results": { use: "not-yet", reason: "Results are planned." },
    });
    expect(messages(result)).toEqual([
      {
        code: "NOT_APPLIED",
        message: "quality.results: true isn't applied on test: Results are planned.",
        file: "standard.yaml",
        line: 5,
      },
    ]);
    expect((result.model as ResolvedModel).qualityResults).toBe(true);
  });

  it("says nothing when the pack has no entry, or the setting is false", () => {
    expect(messages(resolve("quality: { results: true }\n", [test]))).toEqual([]);
    const off = resolve("quality: { results: false }\n", [test], {
      "quality.results": { use: "not-yet", reason: "Results are planned." },
    });
    expect(messages(off)).toEqual([]);
  });
});
