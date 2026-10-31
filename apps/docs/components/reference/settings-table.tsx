// A method's settings, from its schema and defaults in the pack's code.
import { settingRows, shown } from "@/lib/reference";
import { Meaning, Name } from "./field-rows";

const homes = { platform: "platform", standard: "standard", definition: "flow or transform" };

/** Every setting of one method: default, meaning with allowed values, and where it goes. */
export function SettingsTable({ pack, method }: { pack: string; method: string }) {
  const rows = settingRows(pack, method);
  if (rows.length === 0) return <p>This method has no settings.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Setting</th>
          <th>Default</th>
          <th>Meaning</th>
          <th>Usually in</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((field) => (
          <tr key={field.docs}>
            <Name field={field} />
            <td>{field.default !== undefined && <code>{shown(field.default)}</code>}</td>
            <td>
              <Meaning field={field} />
            </td>
            <td>{field.placement && homes[field.placement]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
