// The Platform document with smart defaults (specification section 7).
import type { Context } from "./context.js";
import type { PlatformDoc } from "./documents.js";
import type { ResolvedPlatform, Schedule } from "./model.js";

/** Environments that are personal copies: `dev`, and `default` when none is selected. */
const developmentNames = new Set(["dev", "default"]);
/** Environments whose schedules run unless the platform says otherwise. */
const productionNames = new Set(["prod", "production"]);

/** The platform for the selected environment; the defaults apply when there is no Platform document. */
export function resolvePlatform(context: Context): ResolvedPlatform {
  const doc: PlatformDoc = context.platform?.value ?? { id: "default" };
  // A shared environment such as test is deployed by a pipeline, so it is production.
  const mode =
    doc.mode ?? (developmentNames.has(context.environment) ? "development" : "production");
  const runs = doc.mode === "production" || (!doc.mode && productionNames.has(context.environment));
  const schedule = scheduleOf(doc, runs);
  return {
    mode,
    workspace: { ...doc.workspace },
    ...(doc.run_as && { run_as: doc.run_as }),
    compute: { serverless: true, ...doc.compute },
    ...(schedule && { schedule }),
    ...collectionsOf(doc),
  };
}

/** Settings that are empty when not given. */
function collectionsOf(
  doc: PlatformDoc,
): Pick<ResolvedPlatform, "tags" | "permissions" | "notifications" | "manage" | "grants"> {
  return {
    tags: { ...doc.tags },
    permissions: [...(doc.permissions ?? [])],
    notifications: { on_failure: [...(doc.notifications?.on_failure ?? [])] },
    manage: { schemas: false, tags: false, comments: false, checks: false, ...doc.manage },
    grants: { ...doc.grants },
  };
}

/**
 * Schedules run in UTC unless told otherwise, and stay paused unless they `run`: the
 * platform sets production mode, or leaves mode unset in prod or production.
 */
function scheduleOf(doc: PlatformDoc, run: boolean): Schedule | undefined {
  if (!doc.schedule) return undefined;
  const { cron, timezone = "UTC", paused = !run } = doc.schedule;
  return { cron, timezone, paused };
}
