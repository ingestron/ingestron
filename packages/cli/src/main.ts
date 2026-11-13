#!/usr/bin/env node
// The `ingestron` command.
import { askInTerminal, exitOnClosedPipe } from "./terminal/index.js";
import { run } from "./index.js";

// A reader that stops early, such as `ingestron plan | head -1`, ends the command quietly.
for (const stream of [process.stdout, process.stderr])
  exitOnClosedPipe(
    stream,
    () => Number(process.exitCode ?? 0),
    (code) => process.exit(code),
  );

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  write: (text) => process.stdout.write(text),
  // Questions only when a person can answer them; otherwise init needs flags.
  ...(process.stdin.isTTY && { ask: askInTerminal }),
});
