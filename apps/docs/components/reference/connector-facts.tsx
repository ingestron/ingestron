// Routes stay in package metadata; chapters provide detailed instructions.
import { Fragment, type ReactNode } from "react";
import { ingestionRows } from "@/lib/connector-settings";
import { connectorEntries, type ConnectorEntry } from "@/lib/reference";

/** A compact route summary linking to each platform's full chapters.
 * @example <ConnectorFacts id="sqlserver" />
 */
export function ConnectorFacts({ id }: { id: string }) {
  const entries = connectorEntries(id);
  if (entries.length === 0) throw new Error(`No pack reads connector "${id}".`);
  return (
    <div className="connector-routes">
      {entries.map((entry) => (
        <Route key={entry.pack} id={id} entry={entry} />
      ))}
    </div>
  );
}

function Route({ id, entry }: { id: string; entry: ConnectorEntry }) {
  const { pack, connector } = entry;
  return (
    <section>
      <h3>{pack === "adf" ? "Azure Data Factory → landing → Databricks" : "Databricks"}</h3>
      <dl className="connector-summary">
        {routeFacts(id, entry).map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
      <nav aria-label={`${connector.title} ${pack} chapters`} className="chapter-links">
        <a href={`/docs/connectors/${id}/${pack}-connection`}>Connection and access →</a>
        <a href={`/docs/connectors/${id}/${pack}-ingestion`}>Ingestion →</a>
        <a href={connector.docs}>Vendor prerequisites ↗</a>
      </nav>
    </section>
  );
}

function routeFacts(
  id: string,
  { pack, connector, connectivity }: ConnectorEntry,
): [string, ReactNode][] {
  const { reading, maturity } = connector;
  const modes = ingestionRows(id, pack).find((field) => field.path.join(".") === "mode")?.values;
  const facts: [string, ReactNode][] = [
    ["Method", <code key="method">{connector.method}</code>],
    ["Connectivity", connectivity.join(", ") || "any"],
    ["Source object", <code key="object">{connector.object}</code>],
    ["Generates", connector.generates],
  ];
  if (reading)
    facts.push([
      "Reading",
      `Full selection · ${reading.format} landing · query ${reading.query}${reading.runtime ? ` · ${reading.runtime} runtime required` : ""}`,
    ]);
  else if (modes) facts.push(["Reading modes", modes.map((mode) => String(mode.value)).join(", ")]);
  if (maturity) facts.push(["Availability", `${maturity.status} · checked ${maturity.checked}`]);
  return facts;
}
