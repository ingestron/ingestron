// Tables brought in by flows: ingest and store steps, contract, quality and names.
import type { DefinitionDocument } from "@ingestron/config";
import { aboutOne, type Context } from "../context/index.js";
import { needsOf, sourceTableOf } from "./source-tables.js";
import { flowTableSteps } from "./flow-step-choice.js";
import { flowContract } from "./flow-contract.js";
import {
  checkSourceMetadata,
  matchTable,
  type SourceTable,
  type TableMatch,
} from "../sources/index.js";
import { kinds, type ConnectionDoc, type FlowDoc } from "../documents/index.js";
import type { DeclaredIntent } from "./declared-intent.js";
import type { ResolvedTable } from "../pack/index.js";
import { renderTableName, type TableNamer } from "../tables/index.js";
import { flowFacts } from "./rule-facts.js";
import { tableIntent } from "./complete.js";
import { checkTableIntent, flowChecks } from "./intent-checks.js";
import { checksIn } from "./layer-duties.js";
import { connectionOf, sourceNotKnown, tableSteps, type FlowSteps } from "./flow-sources.js";

type Flow = DefinitionDocument<FlowDoc>;

/**
 * Every flow table in path order; tables that cannot be resolved are reported and left out.
 * Each table's entry in its connection's source metadata is looked for as well (section 12.3),
 * and, when `listed` is given, each flow table is added to it as a source table (section
 * 12.7), whether or not it resolved.
 */
export function flowTables(
  context: Context,
  namer: TableNamer,
  listed?: SourceTable[],
): ResolvedTable[] {
  const seen = new Set<string>();
  checkSourceMetadata(context);
  return context.project.all(kinds.flow).flatMap((flow) =>
    Object.keys(flow.value.tables).flatMap((name) => {
      if (seen.has(name)) {
        reportDuplicate(context, flow, name);
        return [];
      }
      seen.add(name);
      const match = matchTable(aboutOne(context, name), flow, name, flow.value.source);
      const table = flowTable(aboutOne(context, name), flow, name, namer, match, listed);
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
  match: TableMatch | undefined,
  listed: SourceTable[] | undefined,
): ResolvedTable | undefined {
  const layer = namer.layerOf(flow.value.layer, 0, { document: flow, pointer: "/layer" });
  const connection = connectionOf(context, flow.value.source);
  const about = { flow, name, layer, match };
  const listWithNeeds = (steps: Partial<FlowSteps> | undefined) => {
    const needs = needsOf(context, about, steps);
    listed?.push(sourceTableOf(about, needs));
    return needs;
  };
  if (!layer || !connection) return void listWithNeeds(undefined);
  const { facts, declared } = flowFacts(context, flow, name, {
    connectivity: connection.connectivity,
    connector: connection.connector,
    layer,
  });
  const steps = flowTableSteps(context, flow, name, facts);
  if (steps === false) return void listWithNeeds(undefined);
  return finishTable(context, flow, name, namer, {
    layer,
    connection,
    steps,
    declared,
    match,
    needs: listWithNeeds(steps),
  });
}

/** What `finishTable` has of a flow table once its steps are known. */
interface FoundTable {
  layer: string;
  connection: ConnectionDoc;
  steps: Partial<FlowSteps> | undefined;
  declared: DeclaredIntent;
  match: TableMatch | undefined;
  /** Why the table needs a contract, if it does (section 12.5). */
  needs: string | undefined;
}

/** The resolved table, with its name and intent; undefined when a part of it is missing. */
function finishTable(
  context: Context,
  flow: Flow,
  name: string,
  namer: TableNamer,
  { layer, connection, steps, declared, match, needs }: FoundTable,
): ResolvedTable | undefined {
  const doc = flow.value.tables[name]!;
  const { places, ...intent } = tableIntent(context, declared, steps);
  const contract = flowContract(context, flow, name, steps, match, needs);
  const { id, source } = flow.value;
  const fullName = renderTableName(context, namer, { layer, table: name, flow: id, source });
  if (!steps || !contract || !fullName) return undefined;
  const table: ResolvedTable = {
    name,
    layer,
    fullName,
    origin: { kind: "Flow", id: flow.value.id, file: flow.file },
    contract,
    ...checksIn(context, layer, contract, doc.expectations),
    ...intent,
    ...tableSteps(steps, connection, doc.object),
    ...sourceNotKnown(context, flow),
  };
  checkTableIntent(context, table, places, flowChecks(flow, name, connection));
  return table;
}
