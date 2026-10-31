// Every code @ingestron/config reports while loading has help here, so the
// documentation and the editor can explain it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadingCodeHelp } from "../src/index.js";

it("explains every code the loader reports", () => {
  const declarations = readFileSync(
    join(import.meta.dirname, "../node_modules/@ingestron/config/dist/diagnostics.d.ts"),
    "utf8",
  );
  const union = /export type DiagnosticCode = ([^;]+);/.exec(declarations)![1]!;
  const codes = [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]!);
  expect(codes.length).toBeGreaterThan(0);
  expect(codes.filter((code) => !(code in loadingCodeHelp))).toEqual([]);
});
