// Opens the retail example in the YAML language server used by VS Code's YAML
// extension, with the schemas `ingestron schemas` writes and the setting it prints.
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageService } from "yaml-language-server/lib/umd/languageservice/yamlLanguageService.js";
import { run } from "../src/index.js";

const folder = mkdtempSync(join(tmpdir(), "ingestron-editor-"));
cpSync(join(import.meta.dirname, "../project-templates/retail"), folder, {
  recursive: true,
  filter: (path) => !path.includes("/build"),
});
run(["schemas"], { cwd: folder, write: () => undefined });

const service = getLanguageService({
  schemaRequestService: (uri: string) => Promise.resolve(readFileSync(new URL(uri), "utf8")),
  workspaceContext: {
    resolveRelativePath: (path: string, base: string) => new URL(path, base).href,
  },
});
service.configure({
  validate: true,
  hover: true,
  completion: true,
  schemas: [
    {
      uri: pathToFileURL(join(folder, ".ingestron/schemas/definitions.json")).href,
      fileMatch: ["*.yaml"],
    },
  ],
});

// The service caches parsed documents by URI and version.
let version = 0;
function open(path: string, text = readFileSync(join(folder, path), "utf8")): TextDocument {
  version += 1;
  return TextDocument.create(pathToFileURL(join(folder, path)).href, "yaml", version, text);
}

async function problems(document: TextDocument): Promise<string[]> {
  return (await service.doValidation(document, false)).map(
    (item) => `${item.range.start.line + 1}: ${item.message}`,
  );
}

function yamlFiles(at: string): string[] {
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    if (statSync(path).isDirectory())
      return name.startsWith(".") || name === "build" ? [] : yamlFiles(path);
    return name.endsWith(".yaml") ? [relative(folder, path)] : [];
  });
}

describe("editor schemas in the YAML language server", () => {
  it("accepts every file of the example, chosen by kind", async () => {
    const files = yamlFiles(folder);
    expect(files.length).toBe(10);
    for (const file of files)
      expect({ file, problems: await problems(open(file)) }).toEqual({ file, problems: [] });
  });

  it("flags a misspelt field and a value the schema does not allow", async () => {
    const flow = readFileSync(join(folder, "flows/shop.yaml"), "utf8");
    expect(
      await problems(open("flows/shop.yaml", flow.replace("source: shop", "sourc: shop"))),
    ).toEqual(['1: Missing property "source".', "5: Property sourc is not allowed."]);
    const platform = readFileSync(join(folder, "platform.yaml"), "utf8");
    expect(
      await problems(open("platform.yaml", platform.replace("level: CAN_VIEW", "level: CAN_READ"))),
    ).toEqual([
      expect.stringMatching(
        /^\d+: Value is not accepted. Valid values: "CAN_VIEW", "CAN_RUN", "CAN_MANAGE"/,
      ),
    ]);
  });

  it("checks template.yaml with its own schema", async () => {
    const text = readFileSync(join(folder, "template.yaml"), "utf8").replace("title:", "titel:");
    expect(await problems(open("template.yaml", text))).toEqual([
      expect.stringMatching(/^\d+: Missing property "title"\./),
      expect.stringMatching(/^\d+: Property titel is not allowed\./),
    ]);
  });

  it("describes fields on hover", async () => {
    const document = open("flows/shop.yaml");
    const line = document
      .getText()
      .split("\n")
      .findIndex((text) => text.startsWith("source:"));
    const hover = await service.doHover(document, { line, character: 1 });
    const text =
      hover && typeof hover.contents === "object" && "value" in hover.contents
        ? hover.contents.value
        : "";
    expect(text).toContain("Id of the Connection to read from.");
  });
});
