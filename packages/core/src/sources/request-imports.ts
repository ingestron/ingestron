// The end of the source request: the commands that import each file it asks for
// (spec/cli/sources.md, section 4, "Importing").

/** The argument as sh reads it: in single quotes, a `'` written `'\''`, unless it is plain. */
function shellWord(text: string): string {
  return /^[A-Za-z0-9._/-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

/**
 * The commands that import each file the steps save, as `[<connection>, <file>]`, with `--env`
 * only when the request was asked for one; nothing when nothing was asked for.
 */
export function importing(
  lines: readonly (readonly string[])[],
  environment: string | undefined,
): string | undefined {
  if (lines.length === 0) return undefined;
  const env = environment !== undefined ? ["--env", environment] : [];
  const commands = lines
    .map((line) => ["ingestron", "source", "import", ...line, ...env].map(shellWord).join(" "))
    .join("\n");
  return [
    "## Importing",
    "Import each file you saved, from the project's folder:",
    `\`\`\`sh\n${commands}\n\`\`\``,
    "A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.",
  ].join("\n\n");
}
