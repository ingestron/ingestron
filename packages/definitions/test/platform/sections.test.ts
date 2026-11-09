// The Platform's pack sections, moved fields and alerts (specification sections 7 and 7.2):
// what the conformance cases do not reach.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { platformSectionReference, resolveDefinitions, type PackInfo } from "../../src/index.js";

const conformance = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const load = (name: string) => parse(readFileSync(join(conformance, name), "utf8")) as never;
const test: PackInfo = load("pack.yaml");
const bridge: PackInfo = load("pack-bridge.yaml");
const databricks: PackInfo = load("pack-databricks.yaml");
const base = (load("123-platform-section.yaml") as { files: Record<string, string> }).files;

/** Case 123's project with another Platform body (indented two spaces) and these packs. */
function resolve(body: string, packs: PackInfo[] = [test, bridge, databricks], envvars = {}) {
  const names = packs.map(({ id, version }) => `${id}@${version}`).join(", ");
  const files = {
    ...base,
    "standard.yaml": `apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [${names}]\n`,
    "platform.yaml": `apiVersion: ingestron.io/v1\nkind: Platform\nid: lakehouse\n${body}\n`,
  };
  return resolveDefinitions(memoryFiles(files), { packs, environment: "dev", envvars });
}

const codes = (result: ReturnType<typeof resolve>) =>
  result.diagnostics.map(({ code, severity }) => `${code}:${severity}`);

describe("pack sections", () => {
  it("leaves a failure caused by an unset reference to the reference's own report", () => {
    const result = resolve("bridge: { warehouse_id: '${envvar:WAREHOUSE}' }");
    expect(result.diagnostics.map(({ code }) => code)).not.toContain("BAD_SETTING");
  });

  it("does not report a value that holds REPLACE_ME as a bad setting", () => {
    const result = resolve("bridge: { warehouse_id: REPLACE_ME }");
    expect(codes(result)).not.toContain("BAD_SETTING:error");
    expect(result.ok).toBe(true);
  });

  it("reports a value of the wrong type at its key", () => {
    const result = resolve("bridge: { warehouse_id: 5 }");
    expect(result.diagnostics[0]).toMatchObject({
      code: "BAD_SETTING",
      message: 'Platform section "bridge": /warehouse_id is 5; it must be string.',
      location: { file: "platform.yaml", line: 4 },
    });
  });

  it("lets a pack without a platformSection have an empty section only", () => {
    expect(resolve("test: {}").ok).toBe(true);
    const result = resolve("test: { x: 1 }");
    expect(result.diagnostics[0]).toMatchObject({
      code: "BAD_SETTING",
      message: 'Platform section "test": "x" is not a setting.',
    });
  });

  it("keeps every section as written, and none the Platform does not write", () => {
    const model = resolve("bridge: { warehouse_id: abc }\ndatabricks: {}").model!;
    expect(model.platform.sections).toEqual({ bridge: { warehouse_id: "abc" }, databricks: {} });
    expect(resolve("tags: { a: b }").model!.platform.sections).toEqual({});
  });

  it("refuses a key that is not a lower-case name as a field of the Platform", () => {
    expect(codes(resolve("Fabric: {}"))).toEqual(["SCHEMA:error"]);
    expect(codes(resolve("fabric: 3"))).toEqual(["SCHEMA:error"]);
  });
});

describe("moved fields", () => {
  it("reads the databricks section first, else the top, with the model unchanged", () => {
    const model = resolve(
      "mode: production\ncompute: { serverless: false }\ndatabricks:\n  mode: production",
    ).model!;
    expect(model.platform.mode).toBe("production");
    expect(model.platform.compute).toEqual({ serverless: false });
    const moved = resolve("databricks:\n  mode: production\n  workspace: { host: h }").model!;
    expect(moved.platform).toMatchObject({ mode: "production", workspace: { host: "h" } });
  });

  it("gives no warning without a databricks pack to move to, nor for a field in the section", () => {
    expect(codes(resolve("mode: production", [test]))).toEqual([]);
    expect(codes(resolve("databricks:\n  mode: production"))).toEqual([]);
  });

  it("warns once for each field and puts the fix before the next field's", () => {
    const result = resolve("mode: production\nworkspace: { host: h }");
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      '"mode" now belongs in the databricks section of the Platform.',
      '"workspace" now belongs in the databricks section of the Platform.',
    ]);
  });

  it("does not compare a value that holds an unset reference", () => {
    const result = resolve(
      "workspace: { host: '${envvar:HOST}' }\ndatabricks:\n  workspace: { host: other }",
    );
    expect(codes(result)).not.toContain("BAD_SETTING:error");
  });
});

describe("the fix that moves a field", () => {
  it("keeps an ${envvar:…} reference, so the variable's value is not written to the file", () => {
    const result = resolve("workspace: { host: '${envvar:HOST}' }", undefined, { HOST: "secret" });
    const edits = result.diagnostics[0]?.fixes?.[0]?.edits;
    expect(edits).toEqual([
      { file: "platform.yaml", pointer: "/databricks/workspace", set: { host: "${envvar:HOST}" } },
      { file: "platform.yaml", pointer: "/workspace", remove: true },
    ]);
  });
});

describe("alerts", () => {
  it("adds nothing for notifications that an email alert for failure already lists", () => {
    const result = resolve(
      "alerts: [{ kind: email, to: [a@example.com, b@example.com] }]\nnotifications: { on_failure: [b@example.com] }",
    );
    expect(result.model!.platform.alerts).toHaveLength(1);
    expect(result.model!.platform.notifications.on_failure).toEqual(["b@example.com"]);
  });

  it("adds the notifications' alert when the written one is only for slow runs", () => {
    const result = resolve(
      "alerts: [{ kind: email, to: [a@example.com], on: [slow] }]\nnotifications: { on_failure: [a@example.com] }",
    );
    expect(result.model!.platform.alerts).toEqual([
      { kind: "email", to: ["a@example.com"], on: ["slow"] },
      { kind: "email", to: ["a@example.com"], on: ["failure"] },
    ]);
  });

  it("fills alerts from notifications without a warning when no databricks section exists", () => {
    const result = resolve("notifications: { on_failure: [a@example.com] }", [test]);
    expect(result.diagnostics).toEqual([]);
    expect(result.model!.platform.alerts).toEqual([
      { kind: "email", to: ["a@example.com"], on: ["failure"] },
    ]);
  });

  it("makes no alert of an empty list, and its fix only removes notifications", () => {
    const result = resolve("notifications: { on_failure: [] }");
    expect(result.model!.platform.alerts).toEqual([]);
    expect(result.diagnostics[0]?.fixes?.[0]?.edits).toEqual([
      { file: "platform.yaml", pointer: "/notifications", remove: true },
    ]);
  });

  it("refuses an alert of no kind or a time it does not know", () => {
    expect(codes(resolve("alerts: [{ kind: sms, to: [x] }]"))).toContain("SCHEMA:error");
    expect(codes(resolve("alerts: [{ kind: email, to: [x], on: [never] }]"))).toContain(
      "SCHEMA:error",
    );
  });
});

describe("platformSectionReference", () => {
  it("has the pack's section fields, prefixed with its id, under its reference page", () => {
    const fields = platformSectionReference(bridge);
    expect(fields.map((field) => field.path)).toEqual([["bridge", "warehouse_id"]]);
    expect(fields[0]?.docs).toBe("/docs/reference/packs/bridge#platform-warehouse-id");
  });

  it("has none for a pack without a section", () => {
    expect(platformSectionReference(test)).toEqual([]);
  });
});
