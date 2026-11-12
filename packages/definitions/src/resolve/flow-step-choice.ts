// A flow table's ingest, store and serve steps: which methods, as the flow and the table
// choose them (specification section 4).
import type { DefinitionDocument } from "@ingestron/config";
import { allowsWritten, endsAtFiles, NO_STORE, type Facts, type Named } from "../choose/index.js";
import type { Context } from "../context/index.js";
import { unusedStoreSettings } from "../context/index.js";
import type { FlowDoc } from "../documents/index.js";
import { landedIngest, leftOut } from "./runs-on.js";
import { serveStep } from "./serve.js";
import type { SettingsLayer } from "./settings.js";
import { resolveStep, type StepResult } from "./steps.js";
import { stepsKnown, type FlowSteps } from "./flow-sources.js";

type Flow = DefinitionDocument<FlowDoc>;

/**
 * The table's steps: none when they are not known yet, false when runs-on leaves the
 * table out (with a warning), undefined after reporting why they cannot be resolved.
 */
export function flowTableSteps(
  context: Context,
  flow: Flow,
  name: string,
  facts: Facts,
): Partial<FlowSteps> | false | undefined {
  if (!stepsKnown(context, flow)) return {};
  const at = { document: flow, pointer: `/tables/${name}` };
  if (leftOut(context, named(flow, "ingest"), facts, name, at)) return false;
  return flowSteps(context, flow, name, facts);
}

/**
 * The ingest and store steps. The store method is checked even when ingest
 * failed, so every problem is found in one run. A method that already writes
 * the table has no store step, and naming one is an error; `store: none`
 * ends the flow at the files ingest lands.
 */
function flowSteps(
  context: Context,
  flow: Flow,
  name: string,
  facts: Facts,
): FlowSteps | undefined {
  const steps = keepSteps(context, flow, name, facts);
  if (!steps) return undefined;
  const last = steps.store ?? steps.ingest;
  const serve = serveStep(
    context,
    named(flow, "serve"),
    facts,
    last,
    tableLayer(flow, name, "serve"),
  );
  if (serve === false) return undefined;
  return serve ? { ...steps, serve } : steps;
}

/** The ingest and store steps, before any serve step. */
function keepSteps(
  context: Context,
  flow: Flow,
  name: string,
  facts: Facts,
): FlowSteps | undefined {
  const ingest = ingestStep(context, flow, name, facts);
  if (ingest?.produces === "table") return afterTable(context, flow, ingest);
  const storeFacts = ingest ? { ...facts, input: ingest.produces } : facts;
  const none = endsAtFiles(context, named(flow, "store"), storeFacts);
  if (none) unusedStoreSettings(context, flow, name);
  if (none !== undefined) return none && ingest ? { ingest, endsAtFiles: none } : undefined;
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

/** The ingest step: the landed method under runs-on, else the method chosen as usual. */
function ingestStep(
  context: Context,
  flow: Flow,
  name: string,
  facts: Facts,
): StepResult | undefined {
  const local = landedIngest(context, named(flow, "ingest"), facts);
  if (local) return local.step;
  return resolveStep(
    context,
    "ingest",
    named(flow, "ingest"),
    facts,
    tableLayer(flow, name, "ingest"),
  );
}

/** An ingest that writes the table has no store step; a store method named for it is an error. */
function afterTable(context: Context, flow: Flow, ingest: StepResult): FlowSteps | undefined {
  const uses = flow.value.store?.uses;
  if (uses === undefined) return { ingest };
  if (uses === NO_STORE)
    return allowsWritten(context, "store", named(flow, "store"), NO_STORE) ? { ingest } : undefined;
  reportStoreAfterTable(context, flow, ingest.method);
  return undefined;
}

/** The flow's choice for an action; a method nobody named is the source's, or the store's. */
function named(flow: Flow, action: "ingest" | "store" | "serve"): Named {
  const doc = flow.value[action];
  return { owner: flow, doc, at: action !== "ingest" && doc ? `/${action}` : "/source" };
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
function tableLayer(
  flow: Flow,
  name: string,
  action: "ingest" | "store" | "serve",
): SettingsLayer[] {
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
