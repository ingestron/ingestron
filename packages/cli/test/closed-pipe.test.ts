// A reader that stops early, as `ingestron plan | head -1` does, closes the pipe, and the next
// write fails with EPIPE: the CLI then exits quietly instead of printing a stack trace. The tests
// emit the error on a stream rather than closing a real pipe, which depends on timing.
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { exitOnClosedPipe } from "../src/terminal/index.js";

describe("exitOnClosedPipe", () => {
  it("exits with the code already set when the reader closes the pipe", () => {
    const stream = new PassThrough();
    const exits: number[] = [];
    exitOnClosedPipe(
      stream,
      () => 3,
      (code) => exits.push(code),
    );
    const closed = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    stream.emit("error", closed);
    expect(exits).toEqual([3]);
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
