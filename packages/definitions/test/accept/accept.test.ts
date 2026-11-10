// Accepted warnings beyond the conformance cases (specification, Accepted warnings): the
// severities each code lists, and both entry points.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { describe, expect, it } from "vitest";
import {
  acceptsWarning,
  codeHelp,
  loadDefinitions,
  loadingCodeHelp,
  resolveDefinitions,
} from "../../src/index.js";
import { severitiesOf } from "../../src/accept/index.js";
import type { PackInfo } from "../../src/index.js";

describe("severities", () => {
  it("lists at least one level for every code but the one no longer reported", () => {
    const empty = [...Object.entries(codeHelp), ...Object.entries(loadingCodeHelp)]
      .filter(([, help]) => help.severities.length === 0)
      .map(([code]) => code);
    expect(empty).toEqual(["CONTRACT_FIELD_UNUSED"]);
  });

  it("knows which codes are warnings, which are errors and which are both", () => {
    expect(severitiesOf("NOT_APPLIED")).toEqual(["warning"]);
    expect(severitiesOf("HANDOVER")).toEqual(["error"]);
    expect(severitiesOf("DEDUPLICATE_MODE")).toEqual(["error", "warning"]);
    expect(severitiesOf("NO_MATCH")).toEqual(["warning"]);
    expect(severitiesOf("ENVVAR_MISSING")).toEqual(["error", "information"]);
  });

  it("records where each code is reported: only a pack's build reports two of them", () => {
    const fromBuild = Object.entries(codeHelp)
      .filter(([, help]) => help.origin === "build")
      .map(([code]) => code);
    expect(fromBuild).toEqual(["SECRET_NAME_DIFFERS", "PACK_NOTICE"]);
    expect(
      Object.values(codeHelp).every((help) => ["resolve", "build"].includes(help.origin)),
    ).toBe(true);
  });

  it("knows no code that does not exist, nor one that is a property of every object", () => {
    expect(severitiesOf("NOT_A_CODE")).toBeUndefined();
    expect(severitiesOf("constructor")).toBeUndefined();
    expect(severitiesOf("toString")).toBeUndefined();
  });
});

const pack = {
  id: "test",
  version: 1,
  defaults: {
    naming: { catalog: "c", schema: "s", table: "{{ table }}", pipeline: "p", job: "j" },
    layers: ["bronze"],
    types: { string: "STRING", integer: "BIGINT" },
    quality: { required: "warn", default: "warn" },
  },
  rules: { ingest: { default: "copy" }, store: { default: "table" } },
  methods: {
    copy: {
      action: "ingest",
      description: "Copies files.",
      connectors: ["files"],
      produces: "files",
      settings: { type: "object" },
    },
    table: {
      action: "store",
      description: "Keeps a table.",
      accepts: ["files"],
      produces: "table",
      settings: { type: "object" },
    },
  },
  contract: { "schema.*.properties.*.tags": { use: "used", does: "Tags.", needs: "tags" } },
  capabilities: [{ id: "tags", title: "tags", does: "Applies tags.", needs: ["a privilege"] }],
} as unknown as PackInfo;

const project: Record<string, string> = {
  "project.yaml": 'id: retail\nenvironments: { dev: {} }\nimports: ["*.yaml"]\n',
  "standard.yaml": "apiVersion: ingestron.io/v1\nkind: Standard\nid: acme\npacks: [test@1]\n",
  "shop.yaml":
    "apiVersion: ingestron.io/v1\nkind: Connection\nid: shop\nconnector: files\nconnectivity: public\nsettings: {}\n",
  "sales.yaml":
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: sales\nsource: shop\ntables:\n  orders: { object: orders, contract: orders }\n",
  "orders.odcs.yaml":
    "apiVersion: v3.1.0\nkind: DataContract\nid: orders\nversion: 1.0.0\nstatus: draft\nschema:\n  - name: orders\n    properties:\n      - { name: email, logicalType: string, tags: [pii] }\n",
};
const platform =
  "apiVersion: ingestron.io/v1\nkind: Platform\nid: lake\naccept:\n  - code: CAPABILITY_OFF\n    reason: Terraform applies the tags.\n";

describe("entry points", () => {
  it("accepts nothing without a Platform", () => {
    const result = resolveDefinitions(memoryFiles(project), { packs: [pack], environment: "dev" });
    expect(result.accepted).toEqual([]);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["CAPABILITY_OFF"]);
  });

  it("accepts the warning, and keeps the model", () => {
    const result = resolveDefinitions(memoryFiles({ ...project, "platform.yaml": platform }), {
      packs: [pack],
      environment: "dev",
    });
    expect(result.ok).toBe(true);
    expect(result.model).toBeDefined();
    expect(result.diagnostics).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      reason: "Terraform applies the tags.",
      entry: { file: "platform.yaml", line: 5 },
      diagnostic: { code: "CAPABILITY_OFF", subject: { table: "orders", feature: "tags" } },
    });
  });

  it("takes the model away when an entry names a code that cannot be accepted", () => {
    const bad = platform.replace("CAPABILITY_OFF", "HANDOVER");
    const result = resolveDefinitions(memoryFiles({ ...project, "platform.yaml": bad }), {
      packs: [pack],
      environment: "dev",
    });
    expect(result.ok).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toEqual(["CAPABILITY_OFF", "ACCEPT_CODE"]);
  });

  it("accepts nothing when the project does not load", () => {
    const broken = { ...project, "platform.yaml": platform, "sales.yaml": "kind: Flow\n" };
    const result = resolveDefinitions(memoryFiles(broken), { packs: [pack], environment: "dev" });
    expect(result.ok).toBe(false);
    expect(result.accepted).toEqual([]);
  });

  it("matches in loadDefinitions as in resolveDefinitions", () => {
    const folder = mkdtempSync(join(tmpdir(), "accept-"));
    try {
      for (const [name, text] of Object.entries({ ...project, "platform.yaml": platform })) {
        mkdirSync(join(folder, name, ".."), { recursive: true });
        writeFileSync(join(folder, name), text);
      }
      const result = loadDefinitions(folder, { packs: [pack], environment: "dev" });
      expect(result.diagnostics).toEqual([]);
      expect(result.accepted.map((item) => item.diagnostic.code)).toEqual(["CAPABILITY_OFF"]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("entries for a pack's build", () => {
  const atBuild =
    'apiVersion: ingestron.io/v1\nkind: Platform\nid: lake\naccept:\n  - code: CAPABILITY_OFF\n    reason: Terraform applies the tags.\n  - code: PACK_NOTICE\n    about: { file: "factory/**" }\n    reason: The platform team keeps the runtime.\n';

  it("are valid, not judged unused, and given to the building tool with their unused warning", () => {
    const result = resolveDefinitions(memoryFiles({ ...project, "platform.yaml": atBuild }), {
      packs: [pack],
      environment: "dev",
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.acceptAtBuild).toEqual([
      {
        code: "PACK_NOTICE",
        about: { file: "factory/**" },
        reason: "The platform team keeps the runtime.",
        entry: { file: "platform.yaml", line: 7 },
        unused: expect.objectContaining({
          code: "ACCEPT_UNUSED",
          severity: "warning",
          message:
            'The accept entry for PACK_NOTICE (file "factory/**") matches no warning in this run.',
          location: expect.objectContaining({ file: "platform.yaml", line: 7 }),
          fixes: [expect.objectContaining({ title: "Remove the entry" })],
        }),
      },
    ]);
  });

  it("are absent when the list has none", () => {
    const result = resolveDefinitions(memoryFiles({ ...project, "platform.yaml": platform }), {
      packs: [pack],
      environment: "dev",
    });
    expect(result.acceptAtBuild).toBeUndefined();
  });

  it("match a build's warnings as resolving matches its own", () => {
    const notice = {
      code: "PACK_NOTICE",
      severity: "warning" as const,
      message: "The runtime keeps settings the files do not write.",
      location: { file: "factory/linkedService/shir.json", line: 1, column: 1 },
    };
    expect(acceptsWarning({ code: "PACK_NOTICE" }, notice)).toBe(true);
    expect(acceptsWarning({ code: "PACK_NOTICE", about: { file: "factory/**" } }, notice)).toBe(
      true,
    );
    expect(acceptsWarning({ code: "PACK_NOTICE", about: { file: "views/**" } }, notice)).toBe(
      false,
    );
    expect(acceptsWarning({ code: "SECRET_NAME_DIFFERS" }, notice)).toBe(false);
    const nowhere = { code: notice.code, severity: notice.severity, message: notice.message };
    expect(acceptsWarning({ code: "PACK_NOTICE", about: { file: "**" } }, nowhere)).toBe(false);
    expect(acceptsWarning({ code: "PACK_NOTICE" }, { ...notice, severity: "error" })).toBe(false);
  });
});
