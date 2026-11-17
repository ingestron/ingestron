// The hover on a flow trigger: when it next starts in the selected environment. A start outside the
// standard's hours is the TRIGGER_HOURS error, which the problems show.
import type { ResolvedTrigger } from "@ingestron/definitions";
import { parseDocument } from "yaml";
import { resolvedForDisplay, type Project } from "../project/index.js";
import { nextStarts } from "./trigger-starts.js";

/** How many starts are shown. */
const SHOWN = 3;

/** A moment as `Sun 6 Dec 02:00`, in `zone`. */
function dated(at: Date, zone: string): string {
  const options = {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  } as const;
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
}

/** The name written for the trigger at `index` under `ingest.triggers` in `file`. */
function nameAt(project: Project, file: string, index: number): string | undefined {
  try {
    const document = parseDocument(project.files.read(file) ?? "");
    const name = document.getIn(["ingest", "triggers", index, "name"]);
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

interface Found {
  trigger: ResolvedTrigger;
  env: string;
}

function triggerNamed(
  project: Project,
  file: string,
  name: string,
  environment: string | undefined,
): Found | undefined {
  const { model } = resolvedForDisplay(project, environment);
  const trigger = model?.tables
    .filter((table) => table.origin.file === file)
    .flatMap((table) => table.ingest?.triggers ?? [])
    .find((item) => item.name === name);
  if (!model || !trigger) return undefined;
  return { trigger, env: model.project.environment };
}

/** The index of the trigger a path under `ingest/triggers/<n>` is in. */
function indexOf(segments: string[]): number | undefined {
  const [ingest, triggers, index] = segments;
  return ingest === "ingest" && triggers === "triggers" && /^\d+$/.test(index ?? "")
    ? Number(index)
    : undefined;
}

/**
 * Markdown for a hover at `segments`, a path under `ingest/triggers/<n>` in the flow `file`:
 * the trigger's next three starts after `now` in its own zone. Undefined elsewhere, when the project does not resolve, or when no start can
 * be computed.
 * @example triggerHover(project, "flows/shop.yaml", ["ingest", "triggers", "1", "every"], "prod")
 */
export function triggerHover(
  project: Project,
  file: string,
  segments: string[],
  environment: string | undefined,
  now: Date = new Date(),
): string | undefined {
  const index = indexOf(segments);
  const name = index === undefined ? undefined : nameAt(project, file, index);
  const found = name === undefined ? undefined : triggerNamed(project, file, name, environment);
  const starts = found && nextStarts(found.trigger, now, SHOWN);
  if (!found || !starts) return undefined;
  const { trigger } = found;
  const list = starts.map((start) => dated(start, trigger.timezone)).join(", ");
  return `Next starts in ${found.env} (${trigger.timezone}): ${list}.`;
}
