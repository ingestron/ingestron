// The same connector and method facts drive CLI and editor project choices.
import type { Method } from "@ingestron/definitions";
import { packs } from "./packs.js";
/** One source in the project builder's categorised catalogue.
 * @example const source: ProjectSource = projectSources()[0]!;
 */
export interface ProjectSource {
  id: string;
  title: string;
  category: string;
}
/** An ingestion route supported by an installed pack.
 * @example const route: ProjectRoute = projectRoutes("files")[0]!;
 */
export interface ProjectRoute {
  via: string;
  method: string;
  title: string;
  connectivity: string[];
  maturity: string;
}
/** Available sources, grouped by discovery category and title.
 * @example const sources = projectSources();
 */
export function projectSources(): ProjectSource[] {
  const sources = new Map<string, ProjectSource>();
  for (const pack of packs)
    for (const connector of pack.connectors ?? [])
      sources.set(connector.id, {
        id: connector.id,
        title: connector.title,
        category: connector.category ?? "Other sources",
      });
  return [...sources.values()].sort(
    (a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
  );
}
/** Supported routes for a source, optionally filtered by network reachability.
 * @example const routes = projectRoutes("sqlserver", "private");
 */
export function projectRoutes(connector: string, connectivity?: string): ProjectRoute[] {
  return packs.flatMap((pack) =>
    (pack.connectors ?? [])
      .filter((source) => source.id === connector)
      .flatMap((source) => {
        const method = pack.methods[source.method];
        if (!supported(method, connector, connectivity)) return [];
        const destinations =
          pack.id === "adf"
            ? adfDestinations.filter(([via]) => reads(via!, method, connector))
            : [["databricks", "Databricks directly"]];
        return destinations.map(([via, title]) => ({
          via: via!,
          method: source.method,
          title: title!,
          connectivity: method.connectivity ?? [],
          maturity: source.maturity?.status ?? "Not stated",
        }));
      }),
  );
}

/** Where ADF's landed files go next, as `--via` and the route's title. */
const adfDestinations = [
  ["adf-databricks", "ADF ingestion into Databricks"],
  ["adf-synapse", "ADF ingestion, served as Synapse serverless SQL views"],
  ["adf-duckdb", "ADF ingestion into DuckDB tables"],
  ["adf-files", "ADF ingestion, ending at the landed files"],
];

/** Earlier names for a route, still accepted as `--via`. */
export const routeAliases: Record<string, string> = { adf: "adf-databricks" };

/**
 * Synapse and DuckDB read ADF's table copies, which land typed files under the
 * contract's names; not files copied as they are, nor (for Synapse) JSON.
 */
function reads(via: string, method: Method, connector: string): boolean {
  if (via === "adf-synapse") return method.renames === true && connector !== "microsoft-365";
  if (via === "adf-duckdb") return method.renames === true;
  return true;
}

function supported(
  method: Method | undefined,
  connector: string,
  connectivity?: string,
): method is Method {
  if (!method || method.action !== "ingest") return false;
  if (!method.connectors?.includes(connector)) return false;
  return !connectivity || Boolean(method.connectivity?.includes(connectivity));
}
