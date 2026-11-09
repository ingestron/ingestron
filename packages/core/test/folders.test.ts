// The starters' folder is found from the compiled file's own location, so it
// must name the folder the package ships, wherever the source files live.
import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInTemplates } from "../src/scaffold/templates.js";
import { templatesFolder } from "../src/folders.js";

describe("templatesFolder", () => {
  it("names an existing folder with every built-in template", () => {
    expect(existsSync(templatesFolder)).toBe(true);
    const folders = readdirSync(templatesFolder);
    for (const template of builtInTemplates()) expect(folders).toContain(template.name);
  });
});
