// Tables built by transforms, in dependency order (specification section 5).
import type { DefinitionDocument } from "@ingestron/config";
import { NO_STORE } from "./choose.js";
import { codeWithValues } from "./code-values.js";
import type { Context } from "./context.js";
import { contractFor, expectationsFor } from "./contract.js";
import { kinds, type TransformDoc } from "./documents.js";
import { flowTableNames } from "./flows.js";
import type { ResolvedTable } from "./model.js";
import { serveStep } from "./serve.js";
import { resolveStep, stepOf } from "./steps.js";
import { fullNameText, renderTableName, type TableNamer } from "./tables.js";

type TransformDocument = DefinitionDocument<TransformDoc>;

/** Transform tables after their inputs; problems are reported and the tables left out. */
export function transformTables(
  context: Context,
  namer: TableNamer,
  flowTables: ResolvedTable[],
): ResolvedTable[] {
  const resolved = new Map(flowTables.map((table) => [table.name, table]));
  const declared = flowTableNames(context);
  // Flow tables that failed are already reported; their readers are blocked.
  const failed = new Set([...declared].filter((name) => !resolved.has(name)));
  let pending = checkTransforms(context, declared, failed);
  const result: ResolvedTable[] = [];
  while (pending.length > 0) {
    const blocked = pending.filter((doc) => doc.value.inputs.some((input) => failed.has(input)));
    blocked.forEach((doc) => failed.add(doc.value.id));
    const ready = pending.filter(
      (doc) => !blocked.includes(doc) && doc.value.inputs.every((input) => resolved.has(input)),
    );
    if (ready.length === 0 && blocked.length === 0) {
      reportCycle(context, pending);
      break;
    }
    for (const doc of ready) {
      const table = transformTable(context, namer, doc, resolved);
      if (table) resolved.set(table.name, table);
      else failed.add(doc.value.id);
      if (table) result.push(table);
    }
    pending = pending.filter((doc) => !ready.includes(doc) && !blocked.includes(doc));
  }
  return result;
}

/** Reports duplicate table names and unknown inputs; returns the transforms that can be tried. */
function checkTransforms(
  context: Context,
  flowNames: Set<string>,
  failed: Set<string>,
): TransformDocument[] {
  const documents = context.project.all(kinds.transform);
  const names = new Set(flowNames);
  const all = new Set([...names, ...documents.map((doc) => doc.value.id)]);
  return documents.filter((doc) => {
    const { id, inputs } = doc.value;
    if (names.has(id)) {
      context.reporter.error(
        "DUPLICATE_TABLE",
        `Another flow or transform already produces a table named "${id}".`,
        { document: doc, pointer: "/id" },
      );
      failed.add(id);
      return false;
    }
    names.add(id);
    const unknown = inputs
      .map((input, index) => ({ input, index }))
      .filter(({ input }) => !all.has(input));
    for (const { input, index } of unknown) {
      context.reporter.error("UNKNOWN_INPUT", `No flow or transform produces "${input}".`, {
        document: doc,
        pointer: `/inputs/${index}`,
      });
    }
    if (unknown.length > 0) failed.add(id);
    return unknown.length === 0;
  });
}

function reportCycle(context: Context, pending: TransformDocument[]): void {
  const [first] = pending;
  if (!first) return;
  const ids = pending.map((doc) => doc.value.id).join(", ");
  context.reporter.error(
    "INPUT_CYCLE",
    `These transforms read each other's results in a loop: ${ids}.`,
    { document: first, pointer: "/inputs" },
  );
}

function transformTable(
  context: Context,
  namer: TableNamer,
  doc: TransformDocument,
  resolved: Map<string, ResolvedTable>,
): ResolvedTable | undefined {
  const value = doc.value;
  const layer = namer.layerOf(value.layer, 1, { document: doc, pointer: "/layer" });
  if (!layer) return undefined;
  const steps = transformSteps(context, doc, layer);
  const contract = contractFor(context, value.id, value.contract, {
    document: doc,
    pointer: "/contract",
  });
  const fullName = renderTableName(context, namer, { layer, table: value.id });
  const code = codeWithValues(context, doc, value.code);
  if (!steps || !contract || !fullName || code === undefined) return undefined;
  if (!readsTables(context, doc, resolved)) return undefined;
  const inputs = Object.fromEntries(
    value.inputs.map((input) => [input, inputName(resolved, input)]),
  );
  return {
    name: value.id,
    layer,
    fullName,
    origin: { kind: "Transform", id: value.id, file: doc.file },
    contract,
    expectations: expectationsFor(context, contract, value.expectations),
    transform: {
      ...stepOf(steps.transform),
      code,
      inputs,
    },
    store: stepOf(steps.store),
    ...(steps.serve && { serve: stepOf(steps.serve) }),
  };
}

/** A transform reads tables and hands its result to the store step. */
function transformSteps(context: Context, doc: TransformDocument, layer: string) {
  const owner = { owner: doc, doc: doc.value.transform };
  const transform = resolveStep(context, "transform", owner, { layer, input: "table" }, [], {
    method: "inputs",
    produces: "table",
  });
  const storeFacts = { layer, input: transform?.produces ?? "query" };
  const store =
    doc.value.store?.uses === NO_STORE
      ? refuseNoStore(context, doc)
      : resolveStep(
          context,
          "store",
          { owner: doc, doc: doc.value.store },
          storeFacts,
          [],
          transform,
        );
  if (!transform || !store) return undefined;
  const serve = serveStep(context, { owner: doc, doc: doc.value.serve }, { layer }, store);
  if (serve === false) return undefined;
  return serve ? { transform, store, serve } : { transform, store };
}

/** Every input is a table: one that ends at the landed files is not (`HANDOVER`). */
function readsTables(
  context: Context,
  doc: TransformDocument,
  resolved: Map<string, ResolvedTable>,
): boolean {
  let tables = true;
  doc.value.inputs.forEach((input, index) => {
    if (!resolved.get(input)?.endsAtFiles) return;
    tables = false;
    context.reporter.error(
      "HANDOVER",
      `"${input}" ends at the landed files, so there is no table to read.`,
      { document: doc, pointer: `/inputs/${index}` },
      "Give its flow a store step.",
    );
  });
  return tables;
}

/** A transform's query needs a store step (`HANDOVER`). */
function refuseNoStore(context: Context, doc: TransformDocument): undefined {
  context.reporter.error(
    "HANDOVER",
    `A transform's query needs a store step, so its store cannot be "${NO_STORE}".`,
    { document: doc, pointer: "/store/uses" },
    "Name a store method, or leave store out to let the standard choose.",
  );
  return undefined;
}

/** Inputs are resolved before the transform, so the name is always there. */
function inputName(resolved: Map<string, ResolvedTable>, input: string): string {
  const table = resolved.get(input);
  return table ? fullNameText(table.fullName) : input;
}
