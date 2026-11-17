// Where a filter's references may stand (specification section 5.1): in plain SQL code, never
// inside quoted text, a quoted name or a comment, and with no brace but a reference's own.
import { describe, expect, it } from "vitest";
import { parameterReferences } from "../../src/index.js";
import { scanFilter } from "../../src/triggers/filter-text.js";
import { problems, resolve } from "./project.js";

const ref = "{{ parameters.p }}";
const scan = (text: string) => scanFilter(text);

describe("scanFilter", () => {
  const inside: [string, string][] = [
    ["a string", `name = '${ref}'`],
    ["a string with a pattern", `name LIKE '%${ref}%'`],
    ["a string after a doubled quote", `a = 'it''s ${ref}'`],
    ["a string that opens with a doubled quote", `a = '''${ref}'`],
    ["a national string", `a = N'${ref}'`],
    ["a quoted name", `"${ref}" = 1`],
    ["a bracketed name", `[${ref}] = 1`],
    ["a bracketed name after a doubled bracket", `[a]]b ${ref}] = 1`],
    ["a line comment", `a = 1 -- ${ref}`],
    ["a block comment", `a = 1 /* ${ref} */`],
    ["a nested block comment", `a = 1 /* b = 2 /* why */ AND c = ${ref} */ AND d = 1`],
    ["a block comment whose nested one is unclosed", `/* /* */ a = ${ref}`],
    ["a block comment with a quote and a line comment mark", `/* ' -- */ x /* ${ref} */ ${ref}`],
    ["a string that is never closed", `a = 'x ${ref}`],
    ["a block comment that is never closed", `a = 1 /* ${ref}`],
  ];
  for (const [what, text] of inside)
    it(`finds a reference inside ${what}`, () => {
      expect(scan(text)).toEqual({ quoted: ["p"], stray: false });
    });

  const code: [string, string][] = [
    ["plain code", `a = ${ref}`],
    ["a pattern built in code", `name LIKE '%' + ${ref} + '%'`],
    ["after a string that holds a comment mark", `n = 'a -- b' AND a = ${ref}`],
    ["after a string that holds a comment opener", `n = '/*' AND a = ${ref} AND m = '*/'`],
    ["after a line comment's line ends", `a = 1 -- note\n AND b = ${ref}`],
    ["after nested block comments that are all closed", `/* /* */ */ a = ${ref}`],
    ["after a closed block comment", `a = 1 /* x */ AND b = ${ref}`],
    ["after a bracketed name with a doubled bracket", `[a]]b] = ${ref}`],
    ["after a doubled quote in a quoted name", `"a""b" = ${ref}`],
  ];
  for (const [what, text] of code)
    it(`allows a reference in ${what}`, () => {
      expect(scan(text)).toEqual({ quoted: [], stray: false });
    });

  it("reports each name once, in the order found", () => {
    const text = "a = '{{ parameters.b }}{{ parameters.a }}{{ parameters.b }}'";
    expect(scan(text).quoted).toEqual(["b", "a"]);
  });

  it("finds a brace that is not a reference's own, anywhere", () => {
    for (const text of [
      "a = '@{x}'",
      "a = { 1 }",
      "a = 1 }",
      "a = '{'",
      "a = {{ parameters.p }",
      "a = {{ p }}",
    ])
      expect(scan(text).stray, text).toBe(true);
    expect(scan("a = {{parameters.p}} AND b = {{ parameters.q }}").stray).toBe(false);
  });

  it("finds parentheses in plain code that do not balance", () => {
    for (const text of ["1=1) OR (1=1", "(a = 1", "a = 1)", "((a = 1)", ") a = 1 ("])
      expect(scan(text).unbalanced, text).toBe(true);
  });

  it("counts no parenthesis inside quotes, names or comments", () => {
    for (const text of ["(a = 1) AND (b = 2)", "a = ')' AND [b(] = 1 /* ( */ AND (c) -- )", ""])
      expect(scan(text).unbalanced, text).toBeUndefined();
  });
});

const copy =
  "  uses: copy\n  with: { landing: /landing }\n  parameters:\n    p: { type: string, default: a }";
const filtered = (filter: string) =>
  resolve(copy, undefined, 1, undefined, `, ingest: { filter: ${JSON.stringify(filter)} }`);

describe("a table's filter text", () => {
  it("is refused when a reference is inside quoted text, once for each name", () => {
    expect(problems(filtered(`name LIKE '%${ref}%' AND x = '${ref}'`))).toEqual([
      `TRIGGER_PARAMETER: "${ref}" is inside a quoted text, name or comment of the filter; write it as plain SQL, such as name LIKE '%' + ${ref} + '%'.`,
    ]);
  });

  it("holds the safe form", () => {
    const result = filtered(`name LIKE '%' + ${ref} + '%'`);
    expect(problems(result)).toEqual([]);
    expect(result.model?.tables[0]?.ingest?.filter).toBe(`name LIKE '%' + ${ref} + '%'`);
  });

  it("is refused with a stray brace or an @{", () => {
    const message =
      'TRIGGER_PARAMETER: A filter cannot contain "@{", "{" or "}" except around {{ parameters.<name> }}.';
    expect(problems(filtered("a = '@{x}'"))).toEqual([message]);
    expect(problems(filtered("a = { 1 }"))).toEqual([message]);
  });

  it("is refused when its parentheses do not balance", () => {
    expect(problems(filtered("1=1) OR (1=1"))).toEqual([
      "TRIGGER_PARAMETER: The filter's parentheses do not balance.",
    ]);
  });

  it("is refused when blank, empty or only whitespace", () => {
    const message = "TRIGGER_PARAMETER: The filter is empty; remove it, or write a condition.";
    expect(problems(filtered("  \n "))).toEqual([message]);
    expect(problems(filtered(""))).toEqual([
      "SCHEMA: tables.orders.ingest.filter must have at least 1 characters.",
    ]);
  });
});

describe("parameterReferences from the package root", () => {
  it("returns the names", () => {
    expect(parameterReferences(`a = ${ref}`)).toEqual(["p"]);
  });
});
