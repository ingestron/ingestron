// The Platform document with smart defaults (specification section 7).
import type { Context } from "./context.js";
import type { PlatformDoc } from "./documents.js";
import type { ResolvedPlatform, Schedule } from "./model.js";

const productionNames = new Set(["prod", "production"]);

/** The platform for the selected environment; the defaults apply when there is no Platform document. */
export function resolvePlatform(context: Context): ResolvedPlatform {
  const doc: PlatformDoc = context.platform?.value ?? { id: "default" };
  const mode =
    doc.mode ?? (productionNames.has(context.environment) ? "production" : "development");
  const schedule = scheduleOf(doc, mode);
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

/** Schedules run in UTC unless told otherwise, and stay paused outside production. */
function scheduleOf(doc: PlatformDoc, mode: ResolvedPlatform["mode"]): Schedule | undefined {
  if (!doc.schedule) return undefined;
  const { cron, timezone = "UTC", paused = mode !== "production" } = doc.schedule;
  return { cron, timezone, paused };
}
