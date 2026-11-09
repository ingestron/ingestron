// The Platform's alerts (specification section 7). Reading only: the checks that report
// problems are in the resolve module, which this module does not import. Its sections and
// moved fields are read in the documents module.
import type { AlertDoc, PlatformDoc } from "../documents/index.js";
import type { Alert } from "../pack/index.js";

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
