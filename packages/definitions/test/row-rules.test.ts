// A contract's row checks carry their rule as data; a check written in a flow or transform does not.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { resolveDefinitions, type PackInfo, type ResolvedModel } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(conformance, "pack.yaml"), "utf8")) as PackInfo;

function expectationsOf(caseFile: string) {
  const { files } = parse(readFileSync(join(conformance, caseFile), "utf8")) as {
    files: Record<string, string>;
  };
  const result = resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });
  return (result.model as ResolvedModel).tables[0]!.expectations;
}

describe("row rules", () => {
  it("are set on every expectation made from a contract", () => {
    for (const file of [
      "01-minimal.yaml",
      "39-contract-quality-checks.yaml",
      "42-type-options.yaml",
    ]) {
      const contract = expectationsOf(file).filter((item) => item.from === "contract");
      expect(contract.length, file).toBeGreaterThan(0);
      for (const item of contract) expect(item.rule, `${file}: ${item.name}`).toBeDefined();
    }
  });

  it("are left off an expectation written in a flow", () => {
    const own = expectationsOf("19-quality.yaml").filter((item) => item.from === "definition");
    expect(own.map((item) => item.name)).toEqual(["positive_total", "known_id"]);
    for (const item of own) expect("rule" in item).toBe(false);
  });
});
