// REPLACE_ME in a real project: a warning in plan and apply, an error in check, and the
// first section of the platform request (spec/cli/outputs.md section 4, request.md).
import { describe, expect, it } from "vitest";
import { edit, workspace } from "./workspace.js";

/** The private SQL Server starter, with its server and integration runtime still to write. */
function unwritten() {
  return workspace("private-sql-server", (folder) => {
    edit(folder, "connections/erp.yaml", /server: .*/, "server: REPLACE_ME");
    edit(folder, "platform.yaml", /integration_runtime: .*/, "integration_runtime: REPLACE_ME");
  });
}

describe("REPLACE_ME", () => {
  it("is a warning in plan, which counts the places still to write and exits 0", () => {
    const { ingestron } = unwritten();
    const { code, output } = ingestron("plan");
    expect(code, output).toBe(0);
    expect(output).toContain("dev, prod: warnings");
    expect(output).toContain(
      "settings.server is still REPLACE_ME: write the real value before deploying.",
    );
    expect(output).toContain(
      "2 places are still REPLACE_ME; ingestron check fails until each is written.\n",
    );
  });

  it("is an error in check, which exits 1 without checking the output folders", () => {
    const { ingestron } = unwritten();
    expect(ingestron("apply").code).toBe(0);
    const { code, output } = ingestron("check");
    expect(code).toBe(1);
    expect(output).toContain("dev, prod: the definitions have problems");
    expect(output).toMatch(/platform\.yaml:\d+:\d+ +error +REPLACE_ME/);
    expect(output).not.toContain("up to date");
  });

  it("opens the platform request with the values to replace, and leaves its exit code alone", () => {
    const { ingestron } = unwritten();
    const { code, output } = ingestron("request", "--env", "prod");
    expect(code).toBe(0);
    expect(output).toMatch(
      /^# Platform request: erp \(prod\)\n\n## Values to replace\n\nThese values are still `REPLACE_ME`; `ingestron check` fails until they are written:\n\n- `settings.server` in `connections\/erp.yaml` \(line \d+\)\n- `settings.adf-copy.integration_runtime` in `platform.yaml` \(line \d+\)\n/,
    );
  });

  it("is never counted when nothing is REPLACE_ME", () => {
    const { ingestron } = workspace("private-sql-server");
    expect(ingestron("plan").output).not.toContain("REPLACE_ME");
  });
});
