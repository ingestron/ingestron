// A reader that stops early, as `ingestron plan | head -1` does, closes the pipe: the CLI then
// exits quietly instead of printing a stack trace.
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { exitOnClosedPipe } from "../src/terminal/index.js";

describe("exitOnClosedPipe", () => {
  it("exits with the code already set when the reader closes the pipe", async () => {
    // A reader that takes one chunk and exits, as head does.
    const reader = spawn(process.execPath, [
      "-e",
      "process.stdin.once('data', () => process.exit(0))",
    ]);
    const exited = new Promise<number>((resolve) => {
      exitOnClosedPipe(reader.stdin, () => 3, resolve);
    });
    const line = `${"x".repeat(1023)}\n`;
    const writeOn = () => {
      if (!reader.stdin.destroyed) reader.stdin.write(line, () => setImmediate(writeOn));
    };
    writeOn();
    expect(await exited).toBe(3);
  });

  it("leaves any other error to fail as it would", () => {
    const stream = new PassThrough();
    exitOnClosedPipe(
      stream,
      () => 0,
      () => {
        throw new Error("must not exit");
      },
    );
    const failure = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    expect(() => stream.emit("error", failure)).toThrow("disk full");
  });
});
