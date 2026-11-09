// The package's values: a ProjectSnapshot to start from, and the helpers that take no project.
import { describe, expect, it } from "vitest";
import * as authoring from "../src/index.js";

describe("@ingestron/authoring's exports", () => {
  it("are ProjectSnapshot and the helpers that take no project", () => {
    expect(Object.keys(authoring).sort()).toEqual(
      [
        "ProjectSnapshot",
        "codeDocs",
        "docsLinks",
        "docsUrl",
        "generatedForTable",
        "inProject",
        "positionAt",
        "projectFolderOf",
        "replaceMeHelp",
        "tableAtCursor",
      ].sort(),
    );
  });
});
