// Whether an ingest method can read a table's source.
import type { Facts } from "./choose.js";
import type { Method } from "./pack.js";

/** True when an ingest method reads this connector and connectivity. */
export function canServe(method: Method | undefined, facts: Facts): boolean {
  // A method that reads landed files is chosen only by runs-on.
  if (!method || method.reads === "landed") return false;
  const { connectors, connectivity } = method;
  if (connectors && !connectors.includes(facts.connector ?? "")) return false;
  return (
    !connectivity || facts.connectivity === undefined || connectivity.includes(facts.connectivity)
  );
}
