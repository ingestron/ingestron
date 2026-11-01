// YAML errors that come from a reference written with a space after its colon.
import { expect, it } from "vitest";
import { parseYamlFile } from "../src/yaml-file.js";
import type { Diagnostic } from "../src/diagnostics.js";

it("says to remove the space in a reference such as ${file: x}", () => {
  const diagnostics: Diagnostic[] = [];
  parseYamlFile("t.yaml", "kind: Transform\ncode: ${file: customer_totals.sql}\n", diagnostics);
  expect(diagnostics[0]).toMatchObject({
    code: "YAML_SYNTAX",
    hint: "A reference has no space after its colon: write ${file:customer_totals.sql}.",
  });
});
