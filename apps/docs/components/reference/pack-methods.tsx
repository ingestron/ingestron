// Every method of a pack: what it does, what it reads and hands over, its settings.
import { packs } from "@/lib/reference";
import { SettingsTable } from "./settings-table";

/** One section per method, with an id the connector pages link to. */
export function PackMethods({ pack }: { pack: string }) {
  const found = packs.find((candidate) => candidate.id === pack);
  if (!found) throw new Error(`No pack "${pack}".`);
  return (
    <>
      {Object.entries(found.methods).map(([id, method]) => (
        <section key={id}>
          <h3 id={id}>
            <code>{id}</code> ({method.action})
          </h3>
          <p>{method.description}</p>
          <ul>
            {method.connectors && <li>Reads: {method.connectors.join(", ")}</li>}
            {method.connectivity && <li>Connectivity: {method.connectivity.join(", ")}</li>}
            {method.accepts && <li>Accepts: {method.accepts.join(", ")}</li>}
            <li>Hands over: {method.produces}</li>
          </ul>
          <SettingsTable pack={pack} method={id} />
        </section>
      ))}
    </>
  );
}
