// Opens example 07's files in the YAML language server used by VS Code's YAML
// extension, so that what the editor shows is tested, not only Ajv's verdict.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageService } from "yaml-language-server/lib/umd/languageservice/yamlLanguageService.js";

const folder = join(import.meta.dirname, "../examples/07-editor-setup/definitions");

const service = getLanguageService({
  schemaRequestService: (uri: string) => Promise.resolve(readFileSync(new URL(uri), "utf8")),
  workspaceContext: {
    resolveRelativePath: (path: string, base: string) => new URL(path, base).href,
  },
});
service.configure({ validate: true, hover: true, completion: true, schemas: [] });

// The service caches parsed documents by URI and version, so each opening gets a new version.
let version = 0;

/** Opens `text` as if it were saved as `file` in example 07, using the file's schema comment. */
function open(file: string, text?: string): TextDocument {
  const uri = pathToFileURL(join(folder, file)).href;
  version += 1;
  return TextDocument.create(
    uri,
    "yaml",
    version,
    text ?? readFileSync(join(folder, file), "utf8"),
  );
}

async function problems(document: TextDocument): Promise<string[]> {
  const diagnostics = await service.doValidation(document, false);
  return diagnostics.map(
    (diagnostic) => `${diagnostic.range.start.line + 1}: ${diagnostic.message}`,
  );
}

async function hoverText(document: TextDocument, key: string): Promise<string> {
  const line = document
    .getText()
    .split("\n")
    .findIndex((text) => text.startsWith(`${key}:`));
  const hover = await service.doHover(document, { line, character: 1 });
  const contents = hover?.contents;
  return typeof contents === "object" && "value" in contents ? contents.value : "";
}

/** The example file with one line replaced. */
function edited(file: string, from: string, to: string): TextDocument {
  return open(file, readFileSync(join(folder, file), "utf8").replace(from, to));
}

describe("project.yaml in the YAML language server", () => {
  it("accepts the example and describes each field on hover", async () => {
    const document = open("project.yaml");
    expect(await problems(document)).toEqual([]);
    expect(await hoverText(document, "id")).toMatch(/Identifier of the project/);
    expect(await hoverText(document, "imports")).toMatch(/Glob patterns/);
  });

  it("flags a reference in a field the loader reads literally", async () => {
    const document = edited("project.yaml", "id: sales", "id: ${values.id}");
    expect(await problems(document)).toEqual([expect.stringMatching(/^2: .*pattern/)]);
  });

  it("flags an unknown field", async () => {
    const document = edited("project.yaml", "id: sales", "id: sales\nimport: []");
    expect(await problems(document)).toEqual(["3: Property import is not allowed."]);
  });
});

describe("a pipeline document in the YAML language server", () => {
  it("accepts the example, including a whole reference in an integer field", async () => {
    expect(await problems(open("orders.pipeline.yaml"))).toEqual([]);
  });

  it("shows the field's own description on hover, not reference boilerplate", async () => {
    const text = await hoverText(open("orders.pipeline.yaml"), "table");
    expect(text).toMatch(/^Target table name\./);
    expect(text).not.toMatch(/\|\||definition reference/);
  });

  it("flags a value of the wrong type and an unescaped placeholder", async () => {
    const wrongType = edited("orders.pipeline.yaml", "${values.workers}", "4x");
    expect(await problems(wrongType)).toEqual([expect.stringMatching(/^7: .*integer/)]);
    const unescaped = edited("orders.pipeline.yaml", "$${bundle.target}", "${bundle.target}");
    expect(await problems(unescaped)).toEqual([expect.stringMatching(/^9: .*pattern/)]);
  });
});
