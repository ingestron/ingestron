// What each of a pack's capabilities does and needs on the platform, from the pack's own data.
import { packs } from "@/lib/reference";
import { Inline } from "./inline";

/** The pack's capabilities: the platform switch, what it does, and what it needs there. */
export function PackCapabilities({ pack }: { pack: string }) {
  const found = packs.find((candidate) => candidate.id === pack);
  if (!found?.capabilities?.length) throw new Error(`Pack "${pack}" declares no capabilities.`);
  return (
    <table>
      <thead>
        <tr>
          <th>Platform switch</th>
          <th>What it does</th>
          <th>What it needs on the platform</th>
        </tr>
      </thead>
      <tbody>
        {found.capabilities.map((capability) => (
          <tr key={capability.id} id={`manage-${capability.id}`}>
            <td>
              <code>manage.{capability.id}</code>
              <br />
              {capability.title}
            </td>
            <td>
              <Inline text={capability.does} />
            </td>
            <td>
              <ul>
                {capability.needs.map((need) => (
                  <li key={need}>
                    <Inline text={need} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
