// The `./core` subpath is a public entry point: browsers and webviews import it
// by name, so moving files inside the package must not change what it offers.
import { describe, expect, it } from "vitest";

describe("the ./core subpath", () => {
  it("still resolves by name and offers the same values", async () => {
    const core = await import("@ingestron/config/core");
    expect(Object.keys(core).sort()).toEqual([
      "applyEdits",
      "defaultLimits",
      "defineKind",
      "fixEdits",
      "formatDiagnostics",
      "isSecretReference",
      "manifestSchema",
      "memoryFiles",
      "resolveProject",
      "toEditorSchema",
      "withoutUnsetEnvvars",
    ]);
  });

  it("is the main entry point without Node file access", async () => {
    const core = await import("@ingestron/config/core");
    const main = await import("@ingestron/config");
    expect(Object.keys(main).sort()).toEqual(
      [...Object.keys(core), "loadProject", "nodeFiles"].sort(),
    );
  });
});
