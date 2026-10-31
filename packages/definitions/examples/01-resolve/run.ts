// Resolves a small project for dev and prints each table's choices.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { fullNameText, resolveDefinitions, type PackInfo } from "@ingestron/definitions";

const spec = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(spec, "pack.yaml"), "utf8")) as PackInfo;
const { files } = parse(readFileSync(join(spec, "01-minimal.yaml"), "utf8")) as {
  files: Record<string, string>;
};

const result = resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });
for (const table of result.model?.tables ?? []) {
  console.log(`${fullNameText(table.fullName)}: ${table.ingest?.method} → ${table.store?.method}`);
  console.log(`  columns: ${table.contract?.columns.map((column) => column.name).join(", ")}`);
}
console.log(`pipeline ${result.model?.names.pipeline}, mode ${result.model?.platform.mode}`);
