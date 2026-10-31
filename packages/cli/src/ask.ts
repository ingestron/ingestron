// Asks a question in the terminal and reads one line, synchronously, so the
// CLI stays a simple function from arguments to an exit code.
import { readSync } from "node:fs";

/** Writes the question and returns the answer line, trimmed. */
export function askInTerminal(question: string): string {
  process.stdout.write(question);
  return readLine((buffer) => readSync(0, buffer, 0, 1, null));
}

/** Reads bytes until a newline and decodes them once, so characters of several bytes survive. */
export function readLine(read: (buffer: Buffer) => number): string {
  const byte = Buffer.alloc(1);
  const bytes: number[] = [];
  while (read(byte) === 1 && byte[0] !== 0x0a) bytes.push(byte[0]!);
  return Buffer.from(bytes).toString("utf8").trim();
}
