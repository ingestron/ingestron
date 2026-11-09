// Kits: the conformance cases in spec/cli/conformance/kits/cases.json, and the version range check.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { installedKits, parseKitSpec, readKit } from "../src/kits/index.js";
import { satisfies } from "../src/kits/range.js";

interface Broken {
  name: string;
  from: string;
  edits?: Record<string, [string, string][]>;
  files?: Record<string, string>;
  remove?: string[];
  place?: string;
  error: string;
}

const conformance = resolve(import.meta.dirname, "../../../spec/cli/conformance/kits");
const cases = JSON.parse(readFileSync(join(conformance, "cases.json"), "utf8")) as {
  valid: { folder: string; kit: Record<string, unknown> };
  broken: Broken[];
  catalogue: { root: string; order: string[] };
  specs: { spec: string; result?: unknown; error?: string }[];
};

const made: string[] = [];
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true });
});

/** A copy of a case's starting kit with its changes made, below a new root; returns both. */
function build(item: Broken): { root: string; folder: string } {
  const root = mkdtempSync(join(tmpdir(), "ingestron-kit-test-"));
  made.push(root);
  const folder = join(root, item.place ?? "kit");
  mkdirSync(dirname(folder), { recursive: true });
  cpSync(join(conformance, item.from), folder, { recursive: true });
  for (const [file, text] of Object.entries(item.files ?? {}))
    writeFileSync(join(folder, file), text);
  for (const [file, pairs] of Object.entries(item.edits ?? {})) {
    let text = readFileSync(join(folder, file), "utf8");
    for (const [from, to] of pairs) {
      if (!text.includes(from)) throw new Error(`${item.name}: "${from}" is not in ${file}.`);
      text = text.replace(from, to);
    }
    writeFileSync(join(folder, file), text);
  }
  for (const file of item.remove ?? []) rmSync(join(folder, file));
  return { root, folder };
}

describe("readKit", () => {
  it("reads the valid kit", () => {
    const folder = join(conformance, cases.valid.folder);
    expect(readKit(folder)).toEqual({ ...cases.valid.kit, folder });
  });

  for (const item of cases.broken) {
    it(`refuses: ${item.name}`, () => {
      const { root, folder } = build(item);
      expect(() => (item.place ? readKit(folder, root) : readKit(folder))).toThrow(
        new Error(item.error),
      );
    });
  }

  it("checks a folder's place only when it is read below a root", () => {
    const { folder } = build({
      name: "alone",
      from: cases.valid.folder,
      place: "anywhere",
      error: "",
    });
    expect(readKit(folder).id).toBe("duckdb/local-medallion");
  });
});

describe("installedKits", () => {
  const root = join(conformance, cases.catalogue.root);

  it("lists every version, by id and then date, a preview before its general version", () => {
    const kits = installedKits(root);
    expect(kits.map((kit) => `${kit.id}@${kit.version}`)).toEqual(cases.catalogue.order);
    for (const kit of kits) expect(kit.folder).toBe(join(root, kit.id, kit.version));
  });

  it("is empty for a root that is not there", () => {
    expect(installedKits(join(conformance, "no-such-root"))).toEqual([]);
  });

  for (const item of cases.broken.filter((c) => c.place)) {
    it(`refuses a catalogue with a kit in the wrong place: ${item.name}`, () => {
      const { root: made } = build(item);
      expect(() => installedKits(made)).toThrow(new Error(item.error));
    });
  }
});

describe("parseKitSpec", () => {
  for (const item of cases.specs) {
    it(item.error ? `refuses "${item.spec}"` : `reads "${item.spec}"`, () => {
      if (item.error) expect(() => parseKitSpec(item.spec)).toThrow(new Error(item.error));
      else expect(parseKitSpec(item.spec)).toEqual(item.result);
    });
  }
});

describe("version ranges", () => {
  it.each([
    [">=2.4.0", "2.4.0", true],
    [">=2.4.0", "2.3.9", false],
    [">=2.4.0", "10.0.0", true],
    ["^2.4.0", "2.9.1", true],
    ["^2.4.0", "3.0.0", false],
    ["^2.4.0", "2.3.0", false],
    ["^0.4.0", "0.4.9", true],
    ["^0.4.0", "0.5.0", false],
    ["^0.0.3", "0.0.3", true],
    ["^0.0.3", "0.0.4", false],
    ["~2.4.0", "2.4.7", true],
    ["~2.4.0", "2.5.0", false],
    ["~2.4.3", "2.4.2", false],
    [">=2.4.0", "2.5.0-beta.1", true],
  ])("%s accepts %s: %s", (range, version, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });
});
