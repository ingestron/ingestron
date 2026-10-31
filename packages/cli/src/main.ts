#!/usr/bin/env node
// The `ingestron` command.
import { askInTerminal } from "./ask.js";
import { run } from "./index.js";

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  write: (text) => process.stdout.write(text),
  // Questions only when a person can answer them; otherwise init needs flags.
  ...(process.stdin.isTTY && { ask: askInTerminal }),
});
