// The Platform document with smart defaults (specification section 7).
import type { Context } from "../context/context.js";
import type { PlatformDoc } from "../documents/documents.js";
import type { ResolvedPlatform, Schedule } from "../pack/model.js";

/** Environments that are personal copies, when every environment is generated together. */
const developmentNames = new Set(["dev"]);
/** Environments whose schedules run unless the platform says otherwise. */
const productionNames = new Set(["prod", "production"]);

/**
 * The platform for the selected environment; the defaults apply when there is no Platform
 * document. `together`: every environment is generated together (`environmentsTogether`).
 */
export function resolvePlatform(context: Context, together: boolean): ResolvedPlatform {
  const doc: PlatformDoc = context.platform?.value ?? { id: "default" };
  const mode = doc.mode ?? defaultMode(context.environment, together);
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

/**
 * Generated together, a shared environment such as test is deployed by a pipeline, so it
 * is production. Otherwise only prod and production are, as before definitions 1.8.
 */
function defaultMode(environment: string, together: boolean): ResolvedPlatform["mode"] {
  if (together) return developmentNames.has(environment) ? "development" : "production";
  return productionNames.has(environment) ? "production" : "development";
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
