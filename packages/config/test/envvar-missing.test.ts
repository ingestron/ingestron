// What `${envvar:…}` says when a variable is set nowhere, for the command line and the editor.
import { describe, expect, it } from "vitest";
import { formatDiagnostics, hasErrors } from "../src/diagnostics.js";
import { memoryFiles } from "../src/files.js";
import { defineKind } from "../src/kinds.js";
import { resolveProject } from "../src/load.js";

describe("a variable set nowhere", () => {
  const pipeline = defineKind({
    apiVersion: "example.dev/v1",
    kind: "Pipeline",
    schema: { type: "object" },
  });
  const project = {
    "project.yaml": 'id: sales\nenvironments:\n  dev: {}\nimports: ["*.pipeline.yaml"]\n',
    "a.pipeline.yaml":
      "apiVersion: example.dev/v1\nkind: Pipeline\nid: a\nurl: https://${envvar:HOST}/x\n",
  };

  it("names the files to use, in the error hint", () => {
    const withEnvironment = resolveProject(memoryFiles(project), {
      kinds: [pipeline],
      environment: "dev",
    });
    expect(withEnvironment.diagnostics[0]?.hint).toBe(
      'Set HOST, add it to .env.dev or .env, or remove "${envvar:HOST}".',
    );
    const without = resolveProject(memoryFiles(project), { kinds: [pipeline] });
    expect(without.diagnostics[0]?.hint).toBe(
      'Set HOST, add it to .env, or remove "${envvar:HOST}".',
    );
  });

  it("is information for the editor, naming the file and keeping the text", () => {
    const result = resolveProject(memoryFiles(project), {
      kinds: [pipeline],
      environment: "dev",
      missingEnvvars: "information",
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "ENVVAR_MISSING",
      severity: "information",
      message: "HOST isn't set; add it to .env.dev or set it before running Ingestron.",
      hint: "Ingestron reads .env files in the project folder and the environment VS Code started with.",
    });
    expect(result.project?.documents[0]?.value).toMatchObject({ url: "https://${envvar:HOST}/x" });
    expect(hasErrors(result.diagnostics)).toBe(false);
    expect(formatDiagnostics(result.diagnostics)).toContain("information  ENVVAR_MISSING");
  });

  it("names .env alone when no environment is selected", () => {
    const result = resolveProject(memoryFiles(project), {
      kinds: [pipeline],
      missingEnvvars: "information",
    });
    expect(result.diagnostics[0]?.message).toBe(
      "HOST isn't set; add it to .env or set it before running Ingestron.",
    );
  });

  it("does not read a variable that only exists on the Object prototype", () => {
    const files = memoryFiles({
      ...project,
      "a.pipeline.yaml": project["a.pipeline.yaml"].replace("HOST", "constructor"),
    });
    const result = resolveProject(files, { kinds: [pipeline] });
    expect(result.diagnostics[0]?.code).toBe("ENVVAR_MISSING");
  });
});
