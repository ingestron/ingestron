// Behaviour of environment files that the conformance cases do not pin down:
// the reader on its own, precedence, and that its own messages never quote a line.
import { describe, expect, it } from "vitest";
import { envvarsFor, readEnvFile } from "../src/env-files.js";
import { memoryFiles } from "../src/files.js";

describe("readEnvFile", () => {
  it("reads NAME=value, comments and blank lines", () => {
    const { values, diagnostics } = readEnvFile(
      "# shared\n\nA=1\n  # indented comment\n   \nB = two words \n",
      ".env",
    );
    expect(values).toEqual({ A: "1", B: "two words" });
    expect(diagnostics).toEqual([]);
  });

  it("accepts export and both quotes", () => {
    const { values } = readEnvFile(
      "export A=1\nexport   B='x y'\nC=\"p q\"\nexport=5\nD='#not a comment'\n",
      ".env",
    );
    expect(values).toEqual({ A: "1", B: "x y", C: "p q", export: "5", D: "#not a comment" });
  });

  it("keeps = and # inside values", () => {
    const { values } = readEnvFile(
      "CS=a=b;c=d\nURL=https://x/y#frag\nV=a #c\nW=a\t#c\nH=#x\nE= #x\n",
      ".env",
    );
    expect(values).toEqual({
      CS: "a=b;c=d",
      URL: "https://x/y#frag",
      V: "a",
      W: "a",
      H: "#x",
      E: "",
    });
  });

  it("does not expand $NAME", () => {
    const { values } = readEnvFile('A=1\nB=$A\nC=${A}\nD=$(echo hi)\nE="$A"\n', ".env");
    expect(values).toEqual({ A: "1", B: "$A", C: "${A}", D: "$(echo hi)", E: "$A" });
  });

  it("reads CRLF and BOM files", () => {
    const { values, diagnostics } = readEnvFile(
      "\ufeffA=1\r\nB='two'\r\n\r\nC=3 # note\r\n",
      ".env",
    );
    expect(values).toEqual({ A: "1", B: "two", C: "3" });
    expect(diagnostics).toEqual([]);
  });

  it("the last of a repeated name wins", () => {
    expect(readEnvFile("A=1\nA=2\nA=\n", ".env").values).toEqual({ A: "" });
  });

  it('understands only \\n, \\" and \\\\ in double quotes', () => {
    const { values } = readEnvFile('A="x\\ny"\nB="q\\"r"\nC="s\\\\t"\nD="u\\tv"\n', ".env");
    expect(values).toEqual({ A: "x\ny", B: 'q"r', C: "s\\t", D: "u\\tv" });
  });

  it("allows a comment after a closing quote, with or without a space", () => {
    const { values, diagnostics } = readEnvFile("A='a' #x\nB='b'#x\nC=\"c\"  \n", ".env");
    expect(values).toEqual({ A: "a", B: "b", C: "c" });
    expect(diagnostics).toEqual([]);
  });

  it("reports a bad line as ENV_FILE_LINE without its value", () => {
    const { values, diagnostics } = readEnvFile(
      "NOT A LINE\n1BAD=secret-one\nAFTER='secret-two'x\nOPEN=\"secret-three\nGOOD=1\n",
      ".env.dev",
    );
    expect(values).toEqual({ GOOD: "1" });
    expect(diagnostics.map((d) => [d.code, d.severity, d.location])).toEqual(
      [1, 2, 3, 4].map((line) => [
        "ENV_FILE_LINE",
        "warning",
        { file: ".env.dev", line, column: 1 },
      ]),
    );
    const printed = JSON.stringify(diagnostics);
    for (const text of ["secret-one", "secret-two", "secret-three", "NOT A LINE", "1BAD"]) {
      expect(printed).not.toContain(text);
    }
    expect(diagnostics[0]?.message).toContain(".env.dev");
    expect(diagnostics[0]?.message).toContain("1");
  });

  it("does not treat names such as __proto__ or constructor specially", () => {
    const { values } = readEnvFile("__proto__=x\nconstructor=y\n", ".env");
    expect(Object.keys(values)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(values)).toBeNull();
  });
});

describe("envvarsFor", () => {
  it("host beats .env.<environment> beats .env", () => {
    const files = memoryFiles({
      ".env": "A=env\nB=env\nC=env\n",
      ".env.dev": "B=dev\nC=dev\n",
    });
    const { envvars, diagnostics } = envvarsFor(files, "dev", { C: "host" });
    expect(envvars).toEqual({ A: "env", B: "dev", C: "host" });
    expect(diagnostics).toEqual([]);
  });

  it("an empty host value does not hide the file's", () => {
    const files = memoryFiles({ ".env": "A=file\n", ".env.dev": "B=dev\n" });
    const { envvars } = envvarsFor(files, "dev", { A: "", B: undefined });
    expect(envvars).toEqual({ A: "file", B: "dev" });
  });

  it("an empty value in .env.<environment> does not hide .env's", () => {
    const files = memoryFiles({ ".env": "A=file\n", ".env.dev": "A=\n" });
    expect(envvarsFor(files, "dev", {}).envvars).toEqual({ A: "file" });
  });

  it("reads .env.<environment> only for the selected environment", () => {
    const files = memoryFiles({ ".env": "A=1\n", ".env.prod": "P=1\n" });
    expect(envvarsFor(files, "dev", {}).envvars).toEqual({ A: "1" });
    expect(envvarsFor(files, undefined, {}).envvars).toEqual({ A: "1" });
  });

  it("does not look for a file outside the project through the environment name", () => {
    const read: string[] = [];
    const files = {
      list: () => [],
      read: (path: string) => (read.push(path), undefined),
    };
    envvarsFor(files, "../x", {});
    expect(read).toEqual([".env"]);
  });

  it("reads .env.<environment> only for a name the manifest allows", () => {
    for (const name of ["a:b", "dev.local", "1dev", "a b", ""]) {
      const read: string[] = [];
      const files = { list: () => [], read: (path: string) => (read.push(path), undefined) };
      envvarsFor(files, name, {});
      expect(read, name).toEqual([".env"]);
    }
    const read: string[] = [];
    envvarsFor({ list: () => [], read: (path) => (read.push(path), undefined) }, "dev-2_x", {});
    expect(read).toEqual([".env", ".env.dev-2_x"]);
  });

  it("reports a bad line in each file, naming that file", () => {
    const files = memoryFiles({ ".env": "oops\n", ".env.dev": "A=1\nalso oops\n" });
    const { diagnostics } = envvarsFor(files, "dev", {});
    expect(diagnostics.map((d) => d.location)).toEqual([
      { file: ".env", line: 1, column: 1 },
      { file: ".env.dev", line: 2, column: 1 },
    ]);
  });

  it("works without any env file and keeps unrelated host names", () => {
    const { envvars, diagnostics } = envvarsFor(memoryFiles({}), "dev", { PATH: "/bin" });
    expect(envvars).toEqual({ PATH: "/bin" });
    expect(diagnostics).toEqual([]);
  });
});

describe("envvarsFor limits", () => {
  it("refuses an environment file over the size limit without reading it", () => {
    const files = {
      list: () => [],
      size: () => 100,
      read: (): string => {
        throw new Error("must not read a file that is too large");
      },
    };
    const { envvars, diagnostics } = envvarsFor(files, undefined, { A: "1" }, 10);
    expect(envvars).toEqual({ A: "1" });
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([["FILE_TOO_LARGE", "error"]]);
  });
});
