// Resolves a project that breaks its standard and prints the problem found.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDiagnostics, memoryFiles } from "@ingestron/config";
import { parse } from "yaml";
import { resolveDefinitions, type PackInfo } from "@ingestron/definitions";

const spec = join(import.meta.dirname, "../../../../spec/definitions/conformance");
const pack = parse(readFileSync(join(spec, "pack.yaml"), "utf8")) as PackInfo;
const { files } = parse(readFileSync(join(spec, "08-fixed-setting.yaml"), "utf8")) as {
  files: Record<string, string>;
};

const result = resolveDefinitions(memoryFiles(files), { packs: [pack], environment: "dev" });
console.log(`model: ${result.model ? "resolved" : "none"}`);
console.log(formatDiagnostics(result.diagnostics));
