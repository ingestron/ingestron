// The VS Code extension's commands, from its package.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Command = { command: string; title: string; category: string };

/** One row per command in the Command Palette. */
export function ExtensionCommands() {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "../vscode/package.json"), "utf8"),
  ) as {
    contributes: { commands: Command[] };
  };
  return (
    <ul>
      {manifest.contributes.commands.map((command) => (
        <li key={command.command}>
          <strong>
            {command.category}: {command.title}
          </strong>
        </li>
      ))}
    </ul>
  );
}
