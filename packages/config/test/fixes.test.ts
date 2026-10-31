// Applying a fix edits only the values and keys it names: the rest of the
// file, comments and layout included, stays as written.
import { describe, expect, it } from "vitest";
import { applyEdits, fixEdits, type FixEdit } from "../src/core.js";

/** The text of a.yaml after one edit. */
function after(
  text: string,
  edit: { pointer: string } & ({ set: unknown } | { rename: string } | { remove: true }),
): string {
  const fix = { title: "test", edits: [{ file: "a.yaml", ...edit } as FixEdit] };
  return applyEdits(
    text,
    fixEdits(fix, () => text),
  );
}

describe("fixEdits", () => {
  it("replaces a value, keeping its comment", () => {
    expect(after("a: 1 # one\nb: 2\n", { pointer: "/a", set: 3 })).toBe("a: 3 # one\nb: 2\n");
  });

  it("fills an empty value", () => {
    expect(after("status:\nid: x\n", { pointer: "/status", set: "draft" })).toBe(
      "status: draft\nid: x\n",
    );
  });

  it("adds a key at the end of a nested block mapping, at its indentation", () => {
    expect(after("a:\n  b: 1\nc: 2\n", { pointer: "/a/d", set: true })).toBe(
      "a:\n  b: 1\n  d: true\nc: 2\n",
    );
  });

  it("adds missing keys on the way as block mappings", () => {
    expect(
      after("id: x\n", { pointer: "/ingest/when/-", set: { connector: "sql", use: "m" } }),
    ).toBe("id: x\ningest:\n  when:\n    - connector: sql\n      use: m\n");
  });

  it("adds a key to a flow mapping in flow style", () => {
    expect(after("t: { object: o }\n", { pointer: "/t/ingest", set: { uses: "m" } })).toBe(
      "t: { object: o, ingest: { uses: m } }\n",
    );
  });

  it("adds an item to the end of a block list", () => {
    expect(after("l:\n  - a\n  - b\nz: 1\n", { pointer: "/l/-", set: "c" })).toBe(
      "l:\n  - a\n  - b\n  - c\nz: 1\n",
    );
  });

  it("adds an item to a flow list", () => {
    expect(after("packs: [a@1]\n", { pointer: "/packs/-", set: "b@1" })).toBe(
      "packs: [a@1, b@1]\n",
    );
  });

  it("renames a key", () => {
    expect(after("t: { retires: 2 }\n", { pointer: "/t/retires", rename: "retries" })).toBe(
      "t: { retries: 2 }\n",
    );
  });

  it("adds to a file without a final line break", () => {
    expect(after("a: 1", { pointer: "/b", set: 2 })).toBe("a: 1\nb: 2\n");
  });

  it("quotes text only when YAML needs it", () => {
    expect(after("a: x\n", { pointer: "/a", set: "op = 'D'" })).toBe("a: op = 'D'\n");
    expect(after("a: x\n", { pointer: "/a", set: "1.0" })).toBe('a: "1.0"\n');
  });

  it("removes a block key with every line of its value", () => {
    const text = "a: 1\nb: # note\n  c: 2\n  d: [3]\ne: 4\n";
    expect(after(text, { pointer: "/b", remove: true })).toBe("a: 1\ne: 4\n");
    expect(after(text, { pointer: "/b/c", remove: true })).toBe(
      "a: 1\nb: # note\n  d: [3]\ne: 4\n",
    );
  });

  it("removes a mapping or list the removal leaves empty", () => {
    expect(after("a:\n  b:\n    c: 1\nz: 2\n", { pointer: "/a/b/c", remove: true })).toBe("z: 2\n");
    expect(after("t: { w: { x: 1 } }\nz: 2\n", { pointer: "/t/w/x", remove: true })).toBe("z: 2\n");
  });

  it("removes an entry of a flow collection with one comma", () => {
    expect(after("t: { a: 1, b: 2 }\n", { pointer: "/t/a", remove: true })).toBe("t: { b: 2 }\n");
    expect(after("t: { a: 1, b: 2 }\n", { pointer: "/t/b", remove: true })).toBe("t: { a: 1 }\n");
    expect(after("l: [a, b, c]\n", { pointer: "/l/1", remove: true })).toBe("l: [a, c]\n");
  });

  it("removes a block list item", () => {
    expect(after("l:\n  - a\n  - { b: 1 }\nz: 1\n", { pointer: "/l/1", remove: true })).toBe(
      "l:\n  - a\nz: 1\n",
    );
  });

  it("removes nothing when the pointer names nothing", () => {
    expect(after("a: 1\n", { pointer: "/b/c", remove: true })).toBe("a: 1\n");
  });

  it("replaces a mapping or list, in flow style", () => {
    expect(after("a:\n  b: 1\n  c: 2\nz: 1\n", { pointer: "/a", set: { d: 3 } })).toBe(
      "a: { d: 3 }\nz: 1\n",
    );
    expect(after("t: { e: [1, 2] } # kept\n", { pointer: "/t/e", set: [3] })).toBe(
      "t: { e: [3] } # kept\n",
    );
  });
});
