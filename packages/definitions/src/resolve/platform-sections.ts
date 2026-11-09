// What the Platform gets wrong beyond its schema (specification sections 7 and 7.2): a
// section for a pack the standard does not name, a section its pack's schema refuses, a
// Databricks field at its old place, and `notifications` that `alerts` replaces.
import { withoutUnsetEnvvars, type Fix, type FixEdit } from "@ingestron/config";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { Context } from "../context/index.js";
import { holdsUnsetEnvvar, type Source } from "../diagnostics/index.js";
import { sameValue } from "../internal/index.js";
import type { PackInfo } from "../pack/index.js";
import { movedFields, movedTo, notificationAlert, sectionsOf } from "../platform/index.js";
import { replaceMe } from "./replace-me.js";

/** What a pack without a `platformSection` allows: an empty section. */
const noFields = { type: "object", additionalProperties: false };

// Verbose, so each failure carries the failing value, for unset references.
const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: true });
const validators = new WeakMap<object, ValidateFunction>();

function validatorOf(pack: PackInfo): ValidateFunction {
  const schema = pack.platformSection ?? noFields;
  if (typeof schema !== "object") return ajv.compile(schema);
  let validate = validators.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validators.set(schema, validate);
  }
  return validate;
}

/** Reports every problem of the Platform that its schema does not catch. */
export function checkPlatform(context: Context): void {
  if (!context.platform) return;
  for (const [key, section] of Object.entries(sectionsOf(context.platform.value))) {
    const pack = context.packs.find((candidate) => candidate.id === key);
    if (pack) checkSection(context, pack, section);
    else reportUnknown(context, key);
  }
  if (!movedHome(context)) return;
  checkMoved(context);
  checkNotifications(context);
}

/** `UNKNOWN_PACK` at the section's key, with a fix that adds the pack when it is available. */
function reportUnknown(context: Context, key: string): void {
  const platform = context.platform!;
  const available = context.available.find((pack) => pack.id === key);
  const fixes: Fix[] = available
    ? [
        {
          title: `Add the "${key}" pack`,
          edits: [
            {
              file: context.standard.file,
              pointer: "/packs/-",
              set: `${available.id}@${available.version}`,
            },
          ],
        },
      ]
    : [];
  context.reporter.error(
    "UNKNOWN_PACK",
    `The Platform has a section "${key}", but the standard names no pack "${key}".`,
    { document: platform, pointer: `/${key}` },
    `Packs of this standard: ${context.packs.map((pack) => pack.id).join(", ")}.`,
    fixes,
  );
}

/** `BAD_SETTING` at each failure of the section, except what an unset reference causes. */
function checkSection(context: Context, pack: PackInfo, section: Record<string, unknown>): void {
  const validate = validatorOf(pack);
  if (validate(section)) return;
  const failures = withoutUnsetEnvvars(
    validate.errors ?? [],
    (text) => holdsUnsetEnvvar(context.project, text) || text.includes(replaceMe),
  );
  const hint = knownFields(pack);
  for (const failure of failures) {
    const { message, pointer } = describe(failure);
    context.reporter.error(
      "BAD_SETTING",
      `Platform section "${pack.id}": ${message}.`,
      { document: context.platform!, pointer: `/${pack.id}${pointer}` },
      hint,
    );
  }
}

/** The message and, below the section, the pointer of one schema failure. */
function describe(failure: ErrorObject): { message: string; pointer: string } {
  const params = failure.params as { additionalProperty?: string; missingProperty?: string };
  const at = (key: string) => `${failure.instancePath}/${key}`;
  if (params.additionalProperty !== undefined)
    return {
      message: `"${at(params.additionalProperty).slice(1)}" is not a setting`,
      pointer: at(params.additionalProperty),
    };
  if (params.missingProperty !== undefined)
    return {
      message: `"${at(params.missingProperty).slice(1)}" is required`,
      pointer: failure.instancePath,
    };
  const quoted = ["string", "number", "boolean"].includes(typeof failure.data)
    ? ` is ${JSON.stringify(failure.data)}; it`
    : "";
  return {
    message: `${failure.instancePath || "/"}${quoted} ${failure.message ?? "is not valid"}`,
    pointer: failure.instancePath,
  };
}

/** "Fields: a, b." from the pack's schema, for hints. */
function knownFields(pack: PackInfo): string | undefined {
  const properties = (pack.platformSection as { properties?: Record<string, unknown> } | undefined)
    ?.properties;
  const names = Object.keys(properties ?? {});
  return names.length > 0 ? `Fields: ${names.join(", ")}.` : undefined;
}

/**
 * True when the standard names the pack whose section the Databricks fields moved to: only
 * then are moved fields reported, `notifications` among them.
 */
function movedHome(context: Context): boolean {
  return context.packs.some((pack) => pack.id === movedTo && pack.platformSection);
}

/**
 * Each moved field at the top of the Platform: `BAD_SETTING` when the section holds another
 * value, else `PLATFORM_FIELD_MOVED`.
 */
function checkMoved(context: Context): void {
  const platform = context.platform!;
  const written = platform.value as unknown as Record<string, unknown>;
  const section = sectionsOf(platform.value)[movedTo] ?? {};
  for (const field of movedFields.filter((name) => written[name] !== undefined)) {
    const value = written[field];
    const at: Source = { document: platform, pointer: `/${field}` };
    const other = section[field];
    if (other !== undefined && differ(context, value, other)) {
      context.reporter.error(
        "BAD_SETTING",
        `"${field}" is also written in the ${movedTo} section, with another value.`,
        at,
        `Keep it in ${movedTo}.${field} and remove it here.`,
      );
      continue;
    }
    const edits: FixEdit[] = [
      ...(other === undefined
        ? [{ file: platform.file, pointer: `/${movedTo}/${field}`, set: value }]
        : []),
      { file: platform.file, pointer: `/${field}`, remove: true },
    ];
    context.reporter.warning(
      "PLATFORM_FIELD_MOVED",
      `"${field}" now belongs in the ${movedTo} section of the Platform.`,
      at,
      `Move it to ${movedTo}.${field}.`,
      [{ title: `Move to ${movedTo}.${field}`, edits }],
    );
  }
}

/** True when two values differ; a value that holds an unset reference is not known yet. */
function differ(context: Context, first: unknown, second: unknown): boolean {
  const unknown = (value: unknown) =>
    !context.deployTime && holdsUnsetEnvvar(context.project, value);
  return !sameValue(first, second) && !unknown(first) && !unknown(second);
}

/** `PLATFORM_FIELD_MOVED` for `notifications.on_failure`, which `alerts` replaces. */
function checkNotifications(context: Context): void {
  const platform = context.platform!;
  if (platform.value.notifications?.on_failure === undefined) return;
  const added = notificationAlert(platform.value);
  const alerts = platform.value.alerts;
  const edits: FixEdit[] = [
    ...(added
      ? [
          alerts
            ? { file: platform.file, pointer: "/alerts/-", set: added }
            : { file: platform.file, pointer: "/alerts", set: [added] },
        ]
      : []),
    { file: platform.file, pointer: "/notifications", remove: true },
  ];
  context.reporter.warning(
    "PLATFORM_FIELD_MOVED",
    `"notifications.on_failure" now belongs in "alerts" of the Platform.`,
    { document: platform, pointer: "/notifications" },
    "Write an email alert with on: [failure] in alerts.",
    [{ title: "Move to alerts", edits }],
  );
}
