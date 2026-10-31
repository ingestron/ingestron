// The templates `ingestron init` offers, from the CLI itself.
import { builtInTemplates } from "@ingestron/cli";

/** One row per built-in template: its name, what it sets up, and what it asks. */
export function BuiltInTemplates() {
  return (
    <table>
      <thead>
        <tr>
          <th>Template</th>
          <th>Sets up</th>
          <th>Asks</th>
        </tr>
      </thead>
      <tbody>
        {builtInTemplates().map((template) => (
          <tr key={template.name}>
            <td>
              <code>{template.name}</code>
            </td>
            <td>
              <strong>{template.title}.</strong> {template.summary}
            </td>
            <td>
              {template.questions.length === 0
                ? "nothing"
                : template.questions.map((question) => (
                    <div key={question.value}>
                      <code>{question.value}</code>: {question.ask}
                    </div>
                  ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
