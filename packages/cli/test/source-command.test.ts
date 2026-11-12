// ingestron source request and the usage mistakes of source (spec/cli/sources.md, section 6), run
// on a copy of the request conformance project.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture, read, sourceProject } from "./source-projects.js";

const expected = (name: string) => read(fixture("request"), name);

describe("ingestron source request", () => {
  it("prints the conformance Markdown for an environment", () => {
    const { code, output } = sourceProject("request").ingestron(
      "source",
      "request",
      "--env",
      "dev",
    );
    expect(code).toBe(0);
    expect(output).toBe(expected("request.dev.md"));
  });

  it("asks about one connection with --connection", () => {
    const { code, output } = sourceProject("request").ingestron(
      "source",
      "request",
      "--connection",
      "erp",
      "--env",
      "prod",
    );
    expect(code).toBe(0);
    expect(output).toBe(expected("request.prod.erp.md"));
  });

  it("prints the problems and exits 1 for a connection the project lacks", () => {
    const { code, output } = sourceProject("request").ingestron(
      "source",
      "request",
      "--connection",
      "nope",
      "--env",
      "dev",
    );
    expect(code).toBe(1);
    expect(output).toBe(expected("request.unknown-connection.md"));
  });

  it("is for no particular environment without --env, and exits 1 when the definitions have problems", () => {
    const { code, output } = sourceProject("request").ingestron("source", "request");
    expect(code).toBe(1);
    expect(output).toBe(expected("request.default.md"));
  });

  it("writes nothing", () => {
    const { folder, ingestron } = sourceProject("request");
    ingestron("source", "request", "--env", "dev");
    expect(existsSync(join(folder, "sources/erp.yaml"))).toBe(false);
  });
});

describe("usage mistakes", () => {
  it.each([
    [["source"]],
    [["source", "nope"]],
    [["source", "import"]],
    [["source", "import", "erp"]],
    [["source", "import", "erp", "a.csv", "b.csv"]],
    [["source", "request", "extra"]],
    [["source", "request", "--env", "dev", "--env", "prod"]],
    [["source", "import", "erp", "a.csv", "--env", "dev", "--env", "prod"]],
  ])("%j exits 2", (args) => {
    const { code, output } = sourceProject("request").ingestron(...args);
    expect(code).toBe(2);
    expect(output).toContain("Usage: ingestron");
  });
});
