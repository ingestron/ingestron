// Column names inserted from the metadata are written so the text stays valid: backticked in a
// check's SQL where the name needs it, a plain or double-quoted scalar in YAML; and columns are
// completed in a flow table's sequence, load cursor, deduplicate order and cleanse columns.
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { at, files, named, useSourceProject } from "./source-project.js";

useSourceProject();

const check = (typed: string, others: Record<string, string>) =>
  at(
    "flows/erp.yaml",
    (text) => text.replace("check: Email IS NOT NULL", `check: ${typed}`),
    others,
  );
const inserted = (item: { label: string; insertText?: string }) => item.insertText ?? item.label;

describe("a column inserted into a check's SQL", () => {
  const others = named("Order Date", "select", "a`b", "ünïcode", "plain_1");

  it("stays bare when it is a plain identifier, and the label is the bare name for all", () => {
    const items = check("a > |", others);
    expect(items.map((item) => item.label)).toEqual([
      "Order Date",
      "select",
      "a`b",
      "ünïcode",
      "plain_1",
    ]);
    expect(items.map(inserted)).toEqual([
      "`Order Date`",
      "`select`",
      "`a``b`",
      "`ünïcode`",
      "plain_1",
    ]);
  });

  it("quotes a word Spark SQL reserves whatever its case", () => {
    // `escape`, `time` and `within` are in the keywords table's reserved column; `limit` is not.
    const names = ["SELECT", "From", "order", "Escape", "time", "within", "limit", "selected"];
    const items = check("a > |", named(...names));
    expect(items.map(inserted)).toEqual([
      ...names.slice(0, 6).map((name) => `\`${name}\``),
      "limit",
      "selected",
    ]);
  });

  it("brings a space straight after the colon, and opens a YAML quote for a name in backticks", () => {
    const tight = (names: Record<string, string>) =>
      at("flows/erp.yaml", (text) => text.replace("check: Email IS NOT NULL", "check:|"), names);
    // A plain YAML scalar cannot start with a backtick, so the text is opened as a quoted one.
    expect(tight(others).map(inserted)).toEqual([
      ' "`Order Date`',
      ' "`select`',
      ' "`a``b`',
      ' "`ünïcode`',
      " plain_1",
    ]);
    // Escaped for the quote it opens, so that the text parses once the person closes the quote.
    const odd = tight(named('say "hi"', "back\\slash"));
    const checks = odd.map((item) => {
      const text = files["flows/erp.yaml"]!.replace(
        "check: Email IS NOT NULL",
        `check:${inserted(item)} > 0"`,
      );
      return (parse(text) as { tables: { customers: { expectations: { check: string }[] } } })
        .tables.customers.expectations[0]!.check;
    });
    expect(odd.map(inserted)).toEqual([' "`say \\"hi\\"`', ' "`back\\\\slash`']);
    expect(checks).toEqual(['`say "hi"` > 0', "`back\\slash` > 0"]);
  });

  it("is escaped for the YAML quote the check is written in", () => {
    const items = at(
      "flows/erp.yaml",
      (text) => text.replace("check: Email IS NOT NULL", 'check: "a > |"'),
      named('say "hi"', "back\\slash"),
    );
    expect(items.map(inserted)).toEqual(['`say \\"hi\\"`', "`back\\\\slash`"]);
  });

  it("closes a backtick already typed, and replaces what is typed after it", () => {
    const typed = "check: a > `Or";
    const items = check("a > `Or|", others);
    const start = files["flows/erp.yaml"]!.replace("check: Email IS NOT NULL", `${typed}`);
    expect(items.map(inserted)).toEqual([
      "Order Date`",
      "select`",
      "a``b`",
      "ünïcode`",
      "plain_1`",
    ]);
    expect(items[0]?.replaceFrom).toBe(start.indexOf(typed) + typed.length - "Or".length);
  });

  it("is not turned off by a quote inside a backticked name, nor a backtick inside a text", () => {
    const quoted = named("it's", "plain_1");
    const afterName = check("a > `it's` AND |", quoted);
    expect(afterName.map((item) => item.label)).toEqual(["it's", "plain_1"]);
    expect(afterName.map(inserted)).toEqual(["`it's`", "plain_1"]);
    // Still inside a text in single quotes, where a backtick means nothing: no column.
    expect(check("a = 'x`y' AND b = '|", quoted)).toEqual([]);
    expect(check("a = 'x`y' AND |", quoted).map((item) => item.label)).toEqual(["it's", "plain_1"]);
  });

  it("gives text that parses to a check holding the column, once the rest is typed", () => {
    const [item] = check("a > |", others);
    const text = files["flows/erp.yaml"]!.replace(
      "check: Email IS NOT NULL",
      `check: a > ${inserted(item!)} AND b # not a comment`,
    );
    const checkOf = (
      parse(text) as { tables: { customers: { expectations: { check: string }[] } } }
    ).tables.customers.expectations[0]!.check;
    expect(checkOf).toBe("a > `Order Date` AND b");
  });
});

describe("a column inserted into a contract's properties", () => {
  const names = ["Order Date", "123", "true", "a: b", "#tag", 'a"b', "ünïcode", "plain_1"];
  const metadata = (): Record<string, string> => {
    const columns = names.map(
      (name) =>
        `      - { name: ${JSON.stringify(name)}, sourceType: int, logicalType: integer, required: false }`,
    );
    return {
      "sources/erp.yaml": files["sources/erp.yaml"]!.replace(
        /(object: ERP\.dbo\.Orders\n.*\n    columns:\n)(?:      - .*\n){3}/,
        `$1${columns.join("\n")}\n`,
      ),
    };
  };
  const items = (typed: string) =>
    at(
      "contracts/orders.yaml",
      (text) => text.replace("- name: OrderID", `- name: ${typed}`),
      metadata(),
    );

  it("is a plain scalar when YAML keeps it a string, else double-quoted; the label is bare", () => {
    const found = items("|");
    expect(found.map((item) => item.label)).toEqual(names);
    expect(found.map(inserted)).toEqual([
      "Order Date",
      '"123"',
      '"true"',
      '"a: b"',
      '"#tag"',
      'a"b',
      "ünïcode",
      "plain_1",
    ]);
    for (const item of found) expect(parse(`k: ${inserted(item)}`)).toEqual({ k: item.label });
  });

  it("goes inside the quote the name is being typed in, escaped for it", () => {
    const double = items('"|"');
    expect(double.map(inserted)).toContain('a\\"b');
    const single = items("'|'");
    expect(single.map(inserted)).toContain("Order Date");
    const fromAt = files["contracts/orders.yaml"]!.indexOf("- name: OrderID") + "- name: ".length;
    expect(double[0]?.replaceFrom).toBe(fromAt + 1);
  });

  it("is quoted in flow style where a comma would end the name", () => {
    const found = at(
      "contracts/orders.yaml",
      (text) => text.replace("- name: OrderID\n        logicalType: integer\n", "- { name: | }\n"),
      { "sources/erp.yaml": metadata()["sources/erp.yaml"]!.replace("plain_1", "a, b") },
    );
    expect(found.map(inserted)).toContain('"a, b"');
  });
});
