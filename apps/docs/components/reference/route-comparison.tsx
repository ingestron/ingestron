// A compact comparison uses the same supported routes as New project.
import { projectRoutes, projectSources } from "@ingestron/cli";

/** Compare selected sources without maintaining a second support matrix.
 * @example <RouteComparison ids={["files", "sqlserver"]} />
 */
export function RouteComparison({ ids }: { ids: string[] }) {
  const sources = projectSources();
  return (
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Databricks directly</th>
          <th>ADF → Databricks</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => (
          <tr key={id}>
            <td>
              <a href={`/docs/connectors/${id}`}>
                {sources.find((source) => source.id === id)?.title ?? id}
              </a>
            </td>
            {["databricks", "adf"].map((via) => (
              <RouteCell key={via} id={id} via={via} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RouteCell({ id, via }: { id: string; via: string }) {
  const route = projectRoutes(id).find((route) => route.via === via);
  if (!route) return <td>Not supported</td>;
  return (
    <td>
      <code>{route.method}</code>
      <br />
      {route.connectivity.join(", ")}
      <br />
      {route.maturity}
    </td>
  );
}
