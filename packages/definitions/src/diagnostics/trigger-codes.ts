// Help for the codes about a flow's triggers and parameters (specification section 5.1),
// shown on the documentation site with the others.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";

/** What each code means and how to fix it. */
export const triggerCodeHelp: Record<
  Extract<
    DefinitionCode,
    | "TRIGGER_NOT_ALLOWED"
    | "TRIGGER_PARAMETER"
    | "TRIGGER_OPTION"
    | "TRIGGER_HOURS"
    | "TRIGGER_LOOKBACK"
    | "TRIGGER_KEY"
    | "TRIGGER_ENVIRONMENT"
    | "FILTER_NOT_SUPPORTED"
  >,
  CodeHelp
> = {
  TRIGGER_NOT_ALLOWED: {
    meaning:
      "A flow writes a trigger the standard does not allow: the standard keeps one schedule for the project, its `operations.trigger` is not `schedule`, or it allows other trigger types.",
    fix: "Take the trigger out of the flow, or ask for the standard's `operations.schedule`, `operations.trigger` or `operations.triggers.types` to allow it.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_PARAMETER: {
    meaning:
      "A flow declares a parameter wrongly (a reserved or badly spelled name, no default, a default of the wrong type), or a trigger gives a parameter a value the flow does not allow (a name it does not declare, a value of the wrong type, a built-in parameter used wrongly).",
    fix: "Declare the parameter under `ingest.parameters` with a type and a default, and give it a value of that type, or an expression.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_OPTION: {
    meaning:
      "A trigger has an option its type does not have, such as `lookback` on a tumbling window, `delay` on a schedule or `at` on a schedule by the minute or hour, gives both `month_days` and `occurrences`, has a `start` or `end` Ingestron cannot read, depends on a trigger that is not a tumbling window of the project, or shares its name with another trigger of the flow.",
    fix: "Take the option out, keep one of `month_days` and `occurrences`, write the time as 2026-12-01T02:30:00, name a tumbling-window trigger of the project, or give each trigger its own name.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_HOURS: {
    meaning:
      "A trigger starts a run outside the hours the standard allows in the selected environment (`operations.triggers.hours`), or its recurrence has so many starts in a cycle that they cannot be checked.",
    fix: "Change the trigger's times so that every run starts inside the hours, give it fewer days or times, or ask for the standard's `operations.triggers.hours` to allow them.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_LOOKBACK: {
    meaning:
      "A schedule trigger runs an incremental table with no `lookback` and no `load: full`, or with a lookback shorter than the longest gap between its runs, so a missed run would leave rows unread.",
    fix: "Give the trigger a `lookback` at least as long as its longest gap between runs, or set its `load` parameter to `full`.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_KEY: {
    meaning:
      "A trigger reloads or overlaps rows of a table that has no primary key, or whose store keeps every row as it arrived (`history: none`), so the rows it loads again would be duplicated.",
    fix: "Declare a primary key in the table's contract or source metadata, and keep the table with a history that merges by it, such as `history: latest`.",
    severities: ["error"],
    origin: "resolve",
  },
  TRIGGER_ENVIRONMENT: {
    meaning:
      "A key of the standard's `operations.triggers.environments` is not an environment `project.yaml` declares, so its values never apply.",
    fix: "Name a declared environment, as the message lists them, or take the entry out.",
    severities: ["warning"],
    origin: "resolve",
  },
  FILTER_NOT_SUPPORTED: {
    meaning:
      "A flow table writes `ingest.filter`, but the ingest method it uses does not filter source rows.",
    fix: "Take `filter` out, or choose an ingest method that filters source rows.",
    severities: ["error"],
    origin: "resolve",
  },
};
