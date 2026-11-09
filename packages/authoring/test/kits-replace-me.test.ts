// Every REPLACE_ME in every installed kit is explained on hover: what it is, where to find the
// value and a suggestion (spec/cli/kits.md). A kit's skeleton is what a team starts from, so
// none of its values may be left unexplained.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { isMap, isScalar, isSeq, parseDocument, type Node } from "yaml";
import { installedKits } from "@ingestron/core";
import { ProjectSnapshot } from "../src/index.js";

/** The YAML files under `folder`, relative to it, with forward slashes. */
function yamlFiles(folder: string, under = folder): string[] {
  return readdirSync(under).flatMap((entry) => {
    const path = join(under, entry);
    if (statSync(path).isDirectory()) return yamlFiles(folder, path);
    return /\.ya?ml$/.test(entry) ? [relative(folder, path).split("\\").join("/")] : [];
  });
}

/** The JSON Pointer of every value that is or holds REPLACE_ME. */
function replaceMePointers(node: Node | null | undefined, at = ""): string[] {
  if (isMap(node))
    return node.items.flatMap((pair) => {
      const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
      return replaceMePointers(pair.value as Node, `${at}/${escaped}`);
    });
  if (isSeq(node))
    return node.items.flatMap((item, index) => replaceMePointers(item as Node, `${at}/${index}`));
  return isScalar(node) && String(node.value).includes("REPLACE_ME") ? [at] : [];
}

const kits = installedKits();

describe("every kit's REPLACE_ME is explained", () => {
  it("there are kits to check", () => {
    expect(kits.map((kit) => kit.id)).toEqual([
      "databricks/lakehouse-streaming",
      "duckdb/local-medallion",
    ]);
  });

  for (const kit of kits) {
    it(`${kit.id}@${kit.version}: each has a description, where to find it and a suggestion`, () => {
      const snapshot = ProjectSnapshot.open(kit.folder);
      const environment = snapshot.environments[0];
      const missing: string[] = [];
      let checked = 0;
      for (const file of yamlFiles(kit.folder).filter((name) => name !== "kit.yaml")) {
        const text = snapshot.files.read(file) ?? "";
        for (const pointer of replaceMePointers(parseDocument(text).contents)) {
          checked += 1;
          const help = snapshot.replaceMeHelp(file, pointer, environment);
          const lacks = (["description", "find", "suggest"] as const).filter(
            (part) => !help?.[part],
          );
          if (lacks.length > 0) missing.push(`${file}#${pointer}: no ${lacks.join(", ")}`);
        }
      }
      expect(missing).toEqual([]);
      if (kit.id.startsWith("databricks/")) expect(checked).toBeGreaterThan(0);
    });
  }
});
