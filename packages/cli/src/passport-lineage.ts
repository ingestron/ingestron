// The passport's lineage (spec/cli/passport.md, section 8): a Mermaid flowchart
// from each source connection through tables and transforms to each output.
import {
  fullNameText,
  type ResolvedModel,
  type ResolvedProduct,
  type ResolvedTable,
} from "@ingestron/definitions";

interface Graph {
  ids: Map<string, string>;
  labels: Map<string, string>;
  edges: Set<string>;
}

/** The product's lineage as a Mermaid block, or a sentence when nothing is built here. */
export function lineage(model: ResolvedModel, product: ResolvedProduct): string {
  const graph: Graph = { ids: new Map(), labels: new Map(), edges: new Set() };
  const outputs = product.outputs.flatMap(({ tables }) => tables);
  for (const name of outputs) {
    const table = model.tables.find((item) => item.name === name);
    if (table) visit(model, graph, table, new Set());
  }
  if (graph.edges.size === 0) return "Not built in this environment, so there is no lineage here.";
  return ["```mermaid", "flowchart LR", ...graph.edges, "```"].join("\n");
}

function visit(model: ResolvedModel, graph: Graph, table: ResolvedTable, seen: Set<string>): void {
  if (seen.has(table.name)) return;
  seen.add(table.name);
  const target = `table:${table.name}`;
  graph.labels.set(target, table.name);
  if (table.ingest) {
    const { id, connector } = table.ingest.connection;
    graph.labels.set(`connection:${id}`, `${id} (${connector})`);
    edge(graph, `connection:${id}`, target);
  }
  for (const input of Object.values(table.transform?.inputs ?? {})) {
    const source = model.tables.find((item) => fullNameText(item.fullName) === input);
    if (!source) continue;
    graph.labels.set(`table:${source.name}`, source.name);
    edge(graph, `table:${source.name}`, target);
    visit(model, graph, source, seen);
  }
}

function edge(graph: Graph, from: string, to: string): void {
  graph.edges.add(`  ${node(graph, from)} --> ${node(graph, to)}`);
}

/** `n<index>` in order of first use, with its label quoted. */
function node(graph: Graph, key: string): string {
  if (!graph.ids.has(key)) graph.ids.set(key, `n${graph.ids.size}`);
  const label = (graph.labels.get(key) ?? key).replace(/"/g, "#quot;");
  return `${graph.ids.get(key)}["${label}"]`;
}
