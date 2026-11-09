// The Platform's pack sections, its moved Databricks fields and its alerts
// (specification sections 7 and 7.2). Reading only: the checks that report problems are
// in the resolve module, which this module does not import.
import type { AlertDoc, PlatformDoc } from "../documents/index.js";
import { isRecord } from "../internal/index.js";
import type { Alert } from "../pack/index.js";

/** The Platform fields that belong to Databricks, written in its section as `databricks.<field>`. */
export const movedFields = [
  "mode",
  "workspace",
  "run_as",
  "compute",
  "permissions",
  "manage",
  "grants",
] as const;

/** One of the {@link movedFields}. */
export type MovedField = (typeof movedFields)[number];

/** The pack whose section the moved fields belong to. */
export const movedTo = "databricks";

/** The keys that are not sections: the fields of the Platform, and two reserved for later. */
const reserved = new Set([
  "apiVersion",
  "kind",
  "id",
  "description",
  "workspace",
  "mode",
  "run_as",
  "compute",
  "settings",
  "naming",
  "tags",
  "permissions",
  "schedule",
  "notifications",
  "manage",
  "grants",
  "alerts",
  "accept",
  "principals",
]);

/** Each pack section the Platform writes, by pack id (a mapping under a key that is not a field). */
export function sectionsOf(doc: PlatformDoc): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(doc))
    if (!reserved.has(key) && isRecord(value)) sections[key] = value;
  return sections;
}

/**
 * The Platform with each moved field as the `databricks` section has it, else as the top
 * has it; the model reads this, so a pack finds them where it always did.
 */
export function withMovedFields(doc: PlatformDoc): PlatformDoc {
  const section = sectionsOf(doc)[movedTo] ?? {};
  const moved = movedFields.filter((field) => section[field] !== undefined);
  return { ...doc, ...Object.fromEntries(moved.map((field) => [field, section[field]])) };
}

/** An alert with `on` filled in. */
function complete(alert: AlertDoc): Alert {
  return { ...alert, on: alert.on ?? ["failure"] } as Alert;
}

/** True when an email alert for failure already lists every address. */
function covered(alerts: Alert[], to: string[]): boolean {
  return alerts.some(
    (alert) =>
      alert.kind === "email" &&
      alert.on.includes("failure") &&
      to.every((address) => alert.to.includes(address)),
  );
}

/**
 * Every alert: the Platform's `alerts` as written, then `notifications.on_failure` as an
 * email alert for failure, unless an email alert for failure already lists those addresses.
 */
export function alertsOf(doc: PlatformDoc): Alert[] {
  const alerts = (doc.alerts ?? []).map(complete);
  const added = notificationAlert(doc);
  return added ? [...alerts, added] : alerts;
}

/** The email alert that `notifications.on_failure` adds to the written alerts, if any. */
export function notificationAlert(doc: PlatformDoc): Alert | undefined {
  const to = doc.notifications?.on_failure ?? [];
  if (to.length === 0 || covered((doc.alerts ?? []).map(complete), to)) return undefined;
  return { kind: "email", to: [...to], on: ["failure"] };
}
