// How hover writes setting values: YAML-like, quoting text that would read as structure.
import { expect, it } from "vitest";
import { shown, tableCell } from "../src/hover.js";

it("quotes text inside objects and lists when it would read as structure", () => {
  expect(shown({ delimiter: ",", header: true, name: "a b" })).toBe(
    '{ delimiter: ",", header: true, name: a b }',
  );
  expect(shown(["x", "|", ""])).toBe('[x, "|", ""]');
  expect(shown("plain")).toBe("plain");
});

it("keeps a | inside a Markdown table cell", () => {
  expect(tableCell('{ delimiter: "|" }')).toBe('{ delimiter: "\\|" }');
});
