// Merges a method's settings from every layer and checks them (section 3).
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { Context } from "./context.js";
import type { Source } from "./diagnostics.js";
import { isRecord, merge, sameValue } from "./merge.js";
import type { Origin } from "./model.js";
import { reportMissing, type MethodUse, type SettingsUser } from "./missing-settings.js";
import type { Action, Method } from "./pack.js";

/** Settings from one layer, with where they were written (none for pack defaults). */
export interface SettingsLayer {
  value: Record<string, unknown>;
  at?: Source;
  /** True for flows, transforms and tables: these may not change fixed settings. */
  definition?: boolean;
  /** Which layer this is, recorded in each setting's origin. */
  origin: Origin["layer"];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new WeakMap<Method, ValidateFunction>();

/** The merged settings and where each came from, or undefined after reporting why they are not valid. */
export function mergeSettings(
  context: Context,
  action: Action,
  id: string,
  method: Method,
  layers: SettingsLayer[],
  user: SettingsUser,
): { settings: Record<string, unknown>; origins: Record<string, Origin> } | undefined {
  const { standard, platform, fixed } = organisationLayers(context, action, id);
  const all: SettingsLayer[] = [
    { value: method.defaults ?? {}, origin: "pack" },
    standard,
    ...platform,
    ...layers,
    fixed,
  ];
  if (!fixedRespected(context, layers, fixed.value)) return undefined;
  const settings = all.reduce<Record<string, unknown>>(
    (result, layer) => merge(result, layer.value),
    {},
  );
  if (!checkSchema(context, { action, id, method, user }, settings, all)) return undefined;
  return { settings, origins: originsOf(all) };
}

/** The standard's settings and fixed values, and the platform's settings, for one method. */
function organisationLayers(context: Context, action: Action, id: string) {
  const rules = context.standard.value[action];
  const at = (pointer: string) => ({ document: context.standard, pointer });
  const fixed: SettingsLayer = {
    value: rules?.fixed?.[id] ?? {},
    at: at(`/${action}/fixed/${id}`),
    origin: "fixed",
  };
  const standard: SettingsLayer = {
    value: rules?.settings?.[id] ?? {},
    at: at(`/${action}/settings/${id}`),
    origin: "standard",
  };
  const { platform: document } = context;
  const platform: SettingsLayer[] = document
    ? [
        {
          value: document.value.settings?.[id] ?? {},
          at: { document, pointer: `/settings/${id}` },
          origin: "platform",
        },
      ]
    : [];
  return { standard, platform, fixed };
}

/** For each top-level key, the last layer that set it, with where it was written. */
function originsOf(layers: SettingsLayer[]): Record<string, Origin> {
  const origins: Record<string, Origin> = {};
  for (const layer of layers) {
    for (const key of Object.keys(layer.value)) {
      const location = layer.at?.document.locate(`${layer.at.pointer}/${key}`);
      origins[key] = {
        layer: layer.origin,
        ...(location && { file: location.file, line: location.line }),
      };
    }
  }
  return origins;
}

function fixedRespected(
  context: Context,
  layers: SettingsLayer[],
  fixed: Record<string, unknown>,
): boolean {
  let respected = true;
  for (const layer of layers.filter((candidate) => candidate.definition)) {
    for (const { path, value } of changedFixed(fixed, layer.value, [])) {
      const pointer = path.map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
      const at = layer.at && {
        document: layer.at.document,
        pointer: layer.at.pointer + pointer.join(""),
      };
      const remove = at && {
        title: "Remove this setting",
        edits: [{ file: at.document.file, pointer: at.pointer, remove: true as const }],
      };
      context.reporter.error(
        "FIXED_SETTING",
        `The standard fixes "${path.join(".")}" to ${JSON.stringify(value)}.`,
        at,
        "Remove this setting, or change the standard.",
        remove ? [remove] : [],
      );
      respected = false;
    }
  }
  return respected;
}

/**
 * The fixed values that `value` changes, with their key paths. Mappings in
 * both are compared key by key, so keys beside the fixed ones are allowed.
 */
function changedFixed(
  fixed: Record<string, unknown>,
  value: Record<string, unknown>,
  path: string[],
): { path: string[]; value: unknown }[] {
  return Object.entries(value).flatMap(([key, given]) => {
    if (!(key in fixed)) return [];
    const wanted = fixed[key];
    if (isRecord(wanted) && isRecord(given)) return changedFixed(wanted, given, [...path, key]);
    return sameValue(wanted, given) ? [] : [{ path: [...path, key], value: wanted }];
  });
}

function checkSchema(
  context: Context,
  use: MethodUse,
  settings: Record<string, unknown>,
  layers: SettingsLayer[],
): boolean {
  const { id, method } = use;
  let validate = validators.get(method);
  if (!validate) {
    validate = ajv.compile(method.settings);
    validators.set(method, validate);
  }
  if (validate(settings)) return true;
  const failures = validate.errors ?? [];
  const missing = failures
    .filter((failure) => failure.keyword === "required" && failure.instancePath === "")
    .map((failure) => String(failure.params.missingProperty));
  if (missing.length > 0) reportMissing(context, use, missing);
  for (const failure of failures.filter((item) => !missing.includes(missingOf(item)))) {
    const { message, at } = describe(failure, layers);
    context.reporter.error(
      "BAD_SETTING",
      `Settings for "${id}": ${message}.`,
      at,
      knownSettings(method),
    );
  }
  return false;
}

function missingOf(failure: ErrorObject): string {
  return failure.keyword === "required" && failure.instancePath === ""
    ? String(failure.params.missingProperty)
    : "";
}

/** The message and location of one schema error, naming the key at the top level. */
function describe(failure: ErrorObject, layers: SettingsLayer[]): { message: string; at?: Source } {
  const params = failure.params as { additionalProperty?: string; missingProperty?: string };
  if (params.additionalProperty !== undefined) {
    const path = `${failure.instancePath}/${params.additionalProperty}`;
    return { message: `"${path.slice(1)}" is not a setting`, at: whereSet(layers, path) };
  }
  if (params.missingProperty !== undefined) {
    const path = `${failure.instancePath}/${params.missingProperty}`;
    return {
      message: `"${path.slice(1)}" is required`,
      at: whereSet(layers, failure.instancePath),
    };
  }
  const path = failure.instancePath;
  return {
    message: `${path || "/"} ${failure.message ?? "is not valid"}`,
    at: whereSet(layers, path),
  };
}

/** "Settings: a, b." from the method's schema, for hints. */
export function knownSettings(method: Method): string | undefined {
  const properties = (method.settings as { properties?: Record<string, unknown> }).properties;
  const names = Object.keys(properties ?? {});
  return names.length > 0 ? `Settings: ${names.join(", ")}.` : undefined;
}

/** The last layer that set the failing value's top-level key. */
function whereSet(layers: SettingsLayer[], path: string): Source | undefined {
  const key = path.split("/")[1];
  const layer = [...layers]
    .reverse()
    .find((candidate) => key !== undefined && isRecord(candidate.value) && key in candidate.value);
  return layer?.at && { document: layer.at.document, pointer: `${layer.at.pointer}${path}` };
}
