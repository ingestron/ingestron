// Tables brought in by flows: ingest and store steps, contract, quality and names.
import type { DefinitionDocument } from "@ingestron/config";
import type { Facts, Named } from "./choose.js";
import type { Context } from "./context.js";
import { contractFor, expectationsFor } from "./contract.js";
import { kinds, type ConnectionDoc, type FlowDoc } from "./documents.js";
import type { ResolvedTable } from "./model.js";
import type { SettingsLayer } from "./settings.js";
import { resolveStep, stepOf, type StepResult } from "./steps.js";
import { renderTableName, type TableNamer } from "./tables.js";

type Flow = DefinitionDocument<FlowDoc>;

/** Every flow table in path order; tables that cannot be resolved are reported and left out. */
export function flowTables(context: Context, namer: TableNamer): ResolvedTable[] {
  const seen = new Set<string>();
  return context.project.all(kinds.flow).flatMap((flow) =>
    Object.keys(flow.value.tables).flatMap((name) => {
      if (seen.has(name)) {
        reportDuplicate(context, flow, name);
        return [];
      }
      seen.add(name);
      const table = flowTable(context, flow, name, namer);
      return table ? [table] : [];
    }),
  );
}

/** Table names declared by flows, whether or not they resolve. */
export function flowTableNames(context: Context): Set<string> {
  return new Set(context.project.all(kinds.flow).flatMap((flow) => Object.keys(flow.value.tables)));
}

function reportDuplicate(context: Context, flow: Flow, name: string): void {
  context.reporter.error(
    "DUPLICATE_TABLE",
    `Another flow already produces a table named "${name}".`,
    { document: flow, pointer: `/tables/${name}` },
    "Transforms refer to tables by name, so each name has one producer.",
  );
}

function flowTable(
  context: Context,
  flow: Flow,
  name: string,
  namer: TableNamer,
): ResolvedTable | undefined {
  const doc = flow.value.tables[name];
  const layer = namer.layerOf(flow.value.layer, 0, { document: flow, pointer: "/layer" });
  const connection = context.project.get(kinds.connection, flow.value.source)?.value;
  if (!doc || !layer || !connection) return undefined;
  const facts = { connectivity: connection.connectivity, connector: connection.connector, layer };
  const steps = flowSteps(context, flow, name, facts);
  const contract = contractFor(context, name, doc.contract, {
    document: flow,
    pointer: `/tables/${name}/contract`,
  });
  const fullName = renderTableName(context, namer, {
    layer,
    table: name,
    flow: flow.value.id,
    source: flow.value.source,
  });
  if (!steps || !contract || !fullName) return undefined;
  return {
    name,
    layer,
    fullName,
    origin: { kind: "Flow", id: flow.value.id, file: flow.file },
    contract,
    expectations: expectationsFor(context, contract, doc.expectations),
    ingest: {
      ...stepOf(steps.ingest),
      connection: connectionOf(connection),
      object: doc.object,
      renamed: steps.ingest.renames,
    },
    ...(steps.store && { store: stepOf(steps.store) }),
  };
}

/**
 * The ingest and store steps. The store method is checked even when ingest
 * failed, so every problem is found in one run. A method that already writes
 * the table has no store step, and naming one is an error.
 */
function flowSteps(
  context: Context,
  flow: Flow,
  name: string,
  facts: Facts,
): { ingest: StepResult; store?: StepResult } | undefined {
  const ingest = resolveStep(
    context,
    "ingest",
    named(flow, "ingest"),
    facts,
    tableLayer(flow, name, "ingest"),
  );
  if (ingest?.produces === "table") {
    if (flow.value.store?.uses) reportStoreAfterTable(context, flow, ingest.method);
    return flow.value.store?.uses ? undefined : { ingest };
  }
  const storeFacts = ingest ? { ...facts, input: ingest.produces } : facts;
  const store = resolveStep(
    context,
    "store",
    named(flow, "store"),
    storeFacts,
    tableLayer(flow, name, "store"),
    ingest,
  );
  return ingest && store ? { ingest, store } : undefined;
}

/** The flow's choice for an action; a method nobody named is the source's, or the store's. */
function named(flow: Flow, action: "ingest" | "store"): Named {
  const doc = flow.value[action];
  return { owner: flow, doc, at: action === "store" && doc ? "/store" : "/source" };
}

function reportStoreAfterTable(context: Context, flow: Flow, method: string): void {
  context.reporter.error(
    "HANDOVER",
    `"${method}" writes the table itself, so the flow has no store step.`,
    { document: flow, pointer: "/store/uses" },
    "Remove store.uses, or build another table from it with a transform.",
  );
}

/** Settings written on the table itself, the last layer before `fixed`. */
function tableLayer(flow: Flow, name: string, action: "ingest" | "store"): SettingsLayer[] {
  const value = flow.value.tables[name]?.[action]?.with;
  return value
    ? [
        {
          value,
          at: { document: flow, pointer: `/tables/${name}/${action}/with` },
          definition: true,
          origin: "table",
        },
      ]
    : [];
}

function connectionOf(connection: ConnectionDoc) {
  const { id, connector, connectivity } = connection;
  return { id, connector, connectivity, settings: { ...connection.settings } };
}
