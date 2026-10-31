// What one pack does with each contract field, from the pack's own declarations.
import type { ContractUse } from "@ingestron/definitions";
import { packs } from "@/lib/reference";
import { Inline } from "./inline";

const order = { used: 0, "not-yet": 1, elsewhere: 2, documentation: 3 };
const words = { used: "Used", "not-yet": "Not yet", elsewhere: "Elsewhere", documentation: "" };

/** The pack's contract fields: used, not yet and elsewhere in a table; documentation only folded. */
export function ContractUseTable({ pack }: { pack: string }) {
  const found = packs.find((candidate) => candidate.id === pack);
  if (!found?.contract) throw new Error(`Pack "${pack}" declares no contract fields.`);
  const entries = Object.entries(found.contract).sort(
    ([a, x], [b, y]) => order[x.use] - order[y.use] || a.localeCompare(b),
  );
  const shown = entries.filter(([, use]) => use.use !== "documentation");
  const documentation = entries.filter(([, use]) => use.use === "documentation");
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Use</th>
            <th>What it does, or why not</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(([path, use]) => (
            <tr key={path}>
              <td>
                <code>{path}</code>
              </td>
              <td>
                {words[use.use]}
                {use.use === "used" && use.needs && (
                  <>
                    {" "}
                    with <code>manage.{use.needs}</code>
                  </>
                )}
              </td>
              <td>
                <Inline text={textOf(use)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Fields that only document the contract ({documentation.length})</summary>
        <p>
          {documentation.map(([path], index) => (
            <span key={path}>
              {index > 0 && ", "}
              <code>{path}</code>
            </span>
          ))}
          . A path covers the fields under it.
        </p>
      </details>
    </>
  );
}

function textOf(use: ContractUse): string {
  if (use.use === "used") return use.does;
  if (use.use === "documentation") return "";
  return use.reason;
}
