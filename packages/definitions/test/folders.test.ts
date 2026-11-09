// The schemas folder is found from the compiled file's own location, so it
// must name the folder the package ships, wherever the source files live.
import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schemasFolder } from "../src/folders.js";

describe("schemasFolder", () => {
  it("names an existing folder with the kind schemas", () => {
    expect(existsSync(schemasFolder)).toBe(true);
    expect(readdirSync(schemasFolder)).toContain("odps-v1.1.0.schema.json");
  });
});
