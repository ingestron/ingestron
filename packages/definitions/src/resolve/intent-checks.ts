// The checks of a resolved table: its audit column names (specification section 11.2), what
// its packs say about each intent value (section 11.5), then about its checks (section 11.7),
// then its cleansing (sections 6.1 and 6.2).
import type { DefinitionDocument } from "@ingestron/config";
import type { Context } from "../context/index.js";
import type { ConnectionDoc, FlowDoc, TransformDoc } from "../documents/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { checkAuditNames } from "./audit-names.js";
import { applyCleansing, type OwnCleanse } from "./cleanse.js";
import type { IntentPlaces } from "./complete.js";
import { judgeIntent } from "./judge.js";
import { checkActionDuties } from "./layer-duties.js";
import { judgeQuality, type OwnExpectations } from "./quality-judging.js";
import { connectionZone } from "./timezones.js";

/** What a flow table or transform writes about its checks and its cleansing, and where. */
export interface OwnChecks {
  expectations: OwnExpectations;
  cleanse: OwnCleanse;
}

/** What the flow writes for its table `name`. */
export function flowChecks(
  flow: DefinitionDocument<FlowDoc>,
  name: string,
  connection: ConnectionDoc,
): OwnChecks {
  const doc = flow.value.tables[name];
  const at = (field: string) => ({ document: flow, pointer: `/tables/${name}/${field}` });
  return {
    expectations: { docs: doc?.expectations, at: at("expectations") },
    cleanse: {
      doc: doc?.cleanse,
      at: at("cleanse"),
      zones: { zones: [connectionZone(connection)], at: { document: flow, pointer: "/source" } },
    },
  };
}

/** What the transform writes for its table, with the tables it reads. */
export function transformChecks(
  doc: DefinitionDocument<TransformDoc>,
  inputs: ReadonlyMap<string, ResolvedTable>,
): OwnChecks {
  const at = (field: string) => ({ document: doc, pointer: `/${field}` });
  return {
    expectations: { docs: doc.value.expectations, at: at("expectations") },
    cleanse: {
      doc: doc.value.cleanse,
      at: at("cleanse"),
      zones: {
        zones: doc.value.inputs.map((name) => inputs.get(name)?.timezone),
        at: at("inputs"),
      },
    },
  };
}

/**
 * Checks the table's audit column names and the duties its own actions ask of its layer,
 * then judges its intent, then its checks, then checks and judges its cleansing.
 */
export function checkTableIntent(
  context: Context,
  table: ResolvedTable,
  places: IntentPlaces,
  own: OwnChecks,
): void {
  checkAuditNames(context, table, places);
  checkActionDuties(context, table, own.expectations);
  judgeIntent(context, table, places);
  judgeQuality(context, table, own.expectations);
  applyCleansing(context, table, own.cleanse);
}
