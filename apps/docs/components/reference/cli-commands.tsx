// The CLI's commands and options, from the CLI's own metadata.
import { commands, flags } from "@ingestron/cli";

/** Two tables: commands, then options. */
export function CliCommands() {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {commands.map(({ name, summary }) => (
            <tr key={name}>
              <td>
                <code>ingestron {name}</code>
              </td>
              <td>{summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {flags.map(({ flag, summary }) => (
            <tr key={flag}>
              <td>
                <code>{flag}</code>
              </td>
              <td>{summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
