import { nameVariables } from "@ingestron/definitions";

/** Naming variables from the same metadata used by the resolver.
 * @example <NamingVariables />
 */
export function NamingVariables() {
  return (
    <table>
      <thead>
        <tr>
          <th>Variable</th>
          <th>Meaning</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(nameVariables).map(([name, description]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>{description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
