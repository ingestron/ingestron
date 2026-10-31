// Projects, open editors over files on disk, and positions in YAML.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openProject, projectFolderOf, resolved } from "../src/project.js";
import { keyPath, offsetAt, positionAt, rangeOf, spotAt } from "../src/yaml.js";

const examples = join(import.meta.dirname, "../../../samples");
const retail = join(examples, "starters/retail");

describe("projects", () => {
  it("belong to the nearest folder with project.yaml", () => {
    expect(projectFolderOf(join(retail, "flows/shop.yaml"))).toBe(retail);
    expect(projectFolderOf(join(examples, "README.md"))).toBeUndefined();
  });

  it("read open editors before the files on disk", () => {
    const changed = "apiVersion: ingestron.io/v1\nkind: Flow\nid: shop\n";
    const project = openProject(retail, new Map([[join(retail, "flows/shop.yaml"), changed]]));
    expect(project.files.read("flows/shop.yaml")).toBe(changed);
    expect(project.files.read("standard.yaml")).toContain("kind: Standard");
    expect(project.environments).toEqual(["dev", "prod"]);
  });

  it("include an open editor that is not saved yet", () => {
    const path = join(retail, "flows/new.yaml");
    const project = openProject(retail, new Map([[path, "kind: Flow\n"]]));
    expect(project.files.list()).toContain("flows/new.yaml");
  });
});

describe("positions in YAML", () => {
  const text = "kind: Flow\nsource: shop\ntables:\n  orders:\n    contract: shop.orders\n";

  it("find the key or value at an offset, with its pointer", () => {
    expect(spotAt(text, text.indexOf("shop\n"))).toMatchObject({
      pointer: "/source",
      part: "value",
      text: "shop",
    });
    expect(spotAt(text, text.indexOf("contract") + 2)).toMatchObject({
      pointer: "/tables/orders/contract",
      part: "key",
    });
  });

  it("find a pointer's range", () => {
    const [start, end] = rangeOf(text, "/tables/orders/contract")!;
    expect(text.slice(start, end)).toBe("shop.orders");
  });

  it("know which mapping a new key on a line belongs to, while typing", () => {
    const typing = "kind: Flow\ntables:\n  orders:\n    obj\n";
    expect(keyPath(typing, typing.indexOf("obj"))).toEqual(["tables", "orders"]);
    expect(keyPath("kind: Flow\nso", 13)).toEqual([]);
  });

  it("survive a syntax error", () => {
    const broken = "kind: Flow\nsource: [shop\n";
    expect(() => spotAt(broken, 3)).not.toThrow();
  });

  it("convert offsets and lines", () => {
    expect(positionAt(text, text.indexOf("tables"))).toEqual({ line: 2, character: 0 });
    expect(offsetAt(text, { line: 2, character: 0 })).toBe(text.indexOf("tables"));
  });
});

describe("resolving", () => {
  it("happens once per project snapshot and environment", () => {
    const project = openProject(retail, new Map());
    expect(resolved(project, "dev")).toBe(resolved(project, "dev"));
    expect(resolved(project, "prod")).not.toBe(resolved(project, "dev"));
  });
});
