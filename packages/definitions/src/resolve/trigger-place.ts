// Where a flow's triggers and parameters are written, for the problems about them.
import type { DefinitionDocument } from "@ingestron/config";
import type { Source } from "../diagnostics/index.js";
import type { FlowDoc } from "../documents/index.js";

/** A flow document. */
export type Flow = DefinitionDocument<FlowDoc>;

/**
 * The place at `pointer` in the flow, a JSON Pointer; each key is written as one segment. The
 * document, which holds functions, is not enumerable, so a model that holds the place can still
 * be cloned (a pack copies the model when it plans an environments build).
 */
export function placeIn(flow: Flow, ...keys: (string | number)[]): Source {
  const segments = keys.map((key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1"));
  const place = { pointer: ["", ...segments].join("/") };
  return Object.defineProperty(place, "document", { value: flow }) as Source;
}
