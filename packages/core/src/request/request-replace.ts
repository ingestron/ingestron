// The request's first section: each value still REPLACE_ME (spec/cli/request.md).
import type { AnyDiagnostic } from "@ingestron/config";

/** "Values to replace": a line for each REPLACE_ME diagnostic, in order; nothing when there is none. */
export function valuesToReplace(diagnostics: readonly AnyDiagnostic[]): string | undefined {
  const lines = diagnostics
    .filter((diagnostic) => diagnostic.code === "REPLACE_ME")
    .map(({ message, location }) => {
      // The message starts with the field, as the definitions write it.
      const field = message.slice(0, message.indexOf(" is still REPLACE_ME"));
      const where = location ? ` in \`${location.file}\` (line ${location.line})` : "";
      return `- \`${field}\`${where}`;
    });
  if (lines.length === 0) return undefined;
  return [
    "## Values to replace",
    "These values are still `REPLACE_ME`; `ingestron check` fails until they are written:",
    lines.join("\n"),
  ].join("\n\n");
}
