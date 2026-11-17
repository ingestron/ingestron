// A flow table's source filter (specification section 5.1): the method must filter source rows,
// and each parameter the filter refers to must be one the flow declares.
import type { Context } from "../context/index.js";
import type { Source } from "../diagnostics/index.js";
import type { ResolvedTable } from "../pack/index.js";
import { parameterReferences, scanFilter } from "../triggers/index.js";
import { placeIn, type Flow } from "./trigger-place.js";

/** The built-in parameters a filter may refer to without declaring them. */
const builtIn = new Set(["windowStart", "windowEnd", "load"]);

/** `FILTER_NOT_SUPPORTED` for a filter on a method that does not filter source rows. */
function reportNotSupported(context: Context, at: Source, method: string): void {
  context.reporter.error(
    "FILTER_NOT_SUPPORTED",
    `${method} does not filter source rows; remove \`filter\`, or use a method that does.`,
    at,
    "Take `filter` out, or choose an ingest method that filters source rows.",
  );
}

/** `TRIGGER_PARAMETER` for each name `filter` refers to that the flow does not declare and that is not built in, once. */
function checkReferences(context: Context, flow: Flow, at: Source, filter: string): void {
  const declared = flow.value.ingest?.parameters ?? {};
  for (const name of new Set(parameterReferences(filter)))
    if (!Object.hasOwn(declared, name) && !builtIn.has(name))
      context.reporter.error(
        "TRIGGER_PARAMETER",
        `"{{ parameters.${name} }}" names no parameter of the flow.`,
        at,
        "Declare the parameter under the flow's `ingest.parameters`, with a type and a default.",
      );
}

/** `TRIGGER_PARAMETER` for a filter that is blank, holds a stray brace, puts a reference in quoted text or a comment, or has parentheses that do not balance. */
function checkText(context: Context, at: Source, filter: string): void {
  const hint = "Write the reference in plain SQL, outside quotes and comments.";
  if (filter.trim() === "") {
    context.reporter.error(
      "TRIGGER_PARAMETER",
      "The filter is empty; remove it, or write a condition.",
      at,
      "Take `filter` out, or write a condition.",
    );
    return;
  }
  const { quoted, stray, unbalanced } = scanFilter(filter);
  for (const name of quoted)
    context.reporter.error(
      "TRIGGER_PARAMETER",
      `"{{ parameters.${name} }}" is inside a quoted text, name or comment of the filter; write it as plain SQL, such as name LIKE '%' + {{ parameters.${name} }} + '%'.`,
      at,
      hint,
    );
  if (stray)
    context.reporter.error(
      "TRIGGER_PARAMETER",
      'A filter cannot contain "@{", "{" or "}" except around {{ parameters.<name> }}.',
      at,
      "Take the brace out, or write the parameter as {{ parameters.<name> }}.",
    );
  if (unbalanced)
    context.reporter.error(
      "TRIGGER_PARAMETER",
      "The filter's parentheses do not balance.",
      at,
      "Close each ( with a ), and open each ) with a ( before it.",
    );
}

/**
 * `FILTER_NOT_SUPPORTED` when the table's ingest method does not filter source rows, else
 * `TRIGGER_PARAMETER` for each name the filter refers to that the flow does not declare and that is not built in, once
 * for each name, for a reference inside quotes or a comment, for a stray brace, and for a blank filter.
 * All are errors at the table's `ingest/filter`.
 * @param table - The table, once its steps are known.
 */
export function checkFilter(context: Context, flow: Flow, table: ResolvedTable): void {
  const filter = flow.value.tables[table.name]?.ingest?.filter;
  if (filter === undefined || !table.ingest) return;
  const at = placeIn(flow, "tables", table.name, "ingest", "filter");
  const { method } = table.ingest;
  if (context.pack.methods[method]?.filters !== true) {
    reportNotSupported(context, at, method);
    return;
  }
  checkReferences(context, flow, at, filter);
  checkText(context, at, filter);
}
