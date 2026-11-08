// A flow table's connection and steps as the model records them, and what is not known
// yet when the flow's source holds an unset reference (specification section 1).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "./context.js";
import type { ChosenBy, ResolvedTable } from "./model.js";
import { kinds, type ConnectionDoc, type FlowDoc } from "./documents.js";
import { stepOf, type StepResult } from "./steps.js";
import { holdsUnsetEnvvar } from "./unknown-values.js";

type Flow = DefinitionDocument<FlowDoc>;

/** A flow table's resolved steps. */
export type FlowSteps = {
  ingest: StepResult;
  store?: StepResult;
  endsAtFiles?: ChosenBy;
  serve?: StepResult;
};

/**
 * The flow's connection. A source that holds an unset reference names a connection not
 * known yet: a stand-in whose id, connector and connectivity are that text.
 */
export function connectionOf(context: Context, source: string): ConnectionDoc | undefined {
  const connection = context.project.get(kinds.connection, source)?.value;
  if (connection || !holdsUnsetEnvvar(context.project, source)) return connection;
  return { id: source, connector: source, connectivity: source, settings: {} };
}

/** The connection as a table records it. */
function connectionInTable(connection: ConnectionDoc) {
  const { id, connector, connectivity } = connection;
  return { id, connector, connectivity, settings: { ...connection.settings } };
}

/**
 * False when the flow's source holds an unset reference and no `uses` names its ingest
 * method: which method ingests, and so every step, is not known. Their settings are then
 * not checked, which counts as a problem left out.
 */
export function stepsKnown(context: Context, flow: Flow): boolean {
  if (!holdsUnsetEnvvar(context.project, flow.value.source) || flow.value.ingest?.uses) return true;
  context.reporter.leaveOut();
  return false;
}

/** `sourceNotKnown` for a table of a flow whose source holds an unset reference. */
export function sourceNotKnown(context: Context, flow: Flow): { sourceNotKnown?: string } {
  const { source } = flow.value;
  return holdsUnsetEnvvar(context.project, source) ? { sourceNotKnown: source } : {};
}

/** The resolved steps as the table records them; none when they are not known. */
export function tableSteps(
  steps: Partial<FlowSteps>,
  connection: ConnectionDoc,
  object: string,
): Pick<ResolvedTable, "ingest" | "store" | "endsAtFiles" | "serve"> {
  return {
    ...(steps.ingest && {
      ingest: {
        ...stepOf(steps.ingest),
        connection: connectionInTable(connection),
        object,
        renamed: steps.ingest.renames,
      },
    }),
    ...(steps.store && { store: stepOf(steps.store) }),
    ...(steps.endsAtFiles && { endsAtFiles: steps.endsAtFiles }),
    ...(steps.serve && { serve: stepOf(steps.serve) }),
  };
}
