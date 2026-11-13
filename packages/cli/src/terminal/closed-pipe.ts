// A reader that stops early, as `ingestron plan | head -1` does, closes the pipe the CLI writes
// to. The next write then fails with EPIPE; the CLI exits quietly instead of printing a stack
// trace.

/**
 * Exits with the code already set when the stream's reader has closed the pipe; any other error
 * fails as it would without this.
 */
export function exitOnClosedPipe(
  stream: NodeJS.EventEmitter,
  code: () => number,
  exit: (code: number) => void,
): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
    exit(code());
  });
}
