// Deploy-time values (specification section 1.1): resolved with `deployTime`, each
// `${envvar:…}` is supplied by the pipeline that deploys the files. It is left as an
// unset reference, so checks of its value wait for the platform, but it never decides
// what is generated or what it is called.
import type { AnyDiagnostic, Project } from "@ingestron/config";
import type { Context } from "./context.js";
import { createReporter, type Reporter, type Source } from "../diagnostics/index.js";
import { deployValueHint } from "../pack/index.js";
import type { DeployValue } from "../pack/index.js";
import { unsetEnvvarAt, valueAt } from "../diagnostics/index.js";

const actions = ["ingest", "transform", "store", "serve"];

/** The values, by document kind, that choose what is generated or name it; `*` is any key. */
const deciding: Record<string, string[]> = {
  Connection: ["/connector", "/connectivity"],
  Flow: ["/source", "/layer", "/ingest/uses", "/store/uses", "/serve/uses", "/tables/*/contract"],
  Transform: ["/layer", "/contract", "/inputs/*", "/transform/uses", "/store/uses", "/serve/uses"],
  Standard: [
    "/packs/*",
    "/layers/*",
    "/layers/*/name",
    "/naming/*",
    ...actions.flatMap((action) => [
      `/${action}/default`,
      `/${action}/allowed/*`,
      `/${action}/when/*/*`,
    ]),
  ],
  Platform: ["/naming/*", "/mode"],
  DataProduct: ["/outputPorts/*/contractId"],
};

/** `DEPLOY_VALUE` at each value that decides what is generated and holds a deploy-time value. */
export function checkDeployValues(context: Context): void {
  for (const document of context.project.documents) {
    const pointers = ["/id", ...(deciding[document.kind] ?? [])].flatMap((pattern) =>
      pointersOf(document.value, pattern),
    );
    for (const pointer of pointers) {
      const at = { document, pointer };
      if (unsetEnvvarAt(context.project, at)) reportDeployValue(context.project, context, at);
    }
  }
}

/** Reports `DEPLOY_VALUE` at a value that holds a deploy-time value. */
export function reportDeployValue(
  project: Project,
  context: Pick<Context, "reporter">,
  at: Source,
): void {
  const text = firstHeld(project, valueAt(at.document.value, at.pointer));
  context.reporter.error(
    "DEPLOY_VALUE",
    `"${text}" is supplied only when deploying, so it cannot decide what is generated or what it is called.`,
    at,
    deployValueHint,
  );
}

/**
 * The reporter for resolving a loaded project. A problem at a value that holds an unset
 * reference is left out, except a settings failure (specification section 1). Resolving
 * with `deployTime`, such an error is `DEPLOY_VALUE` there instead (section 1.1).
 */
export function resolutionReporter(
  project: Project,
  start: readonly AnyDiagnostic[],
  deployTime: boolean,
): Reporter {
  const context = {} as { reporter: Reporter };
  context.reporter = createReporter(start, (at, code, severity) => {
    if (["BAD_SETTING", "DEPLOY_VALUE", "FIXED_SETTING"].includes(code)) return false;
    if (!unsetEnvvarAt(project, at)) return false;
    if (deployTime && severity === "error") reportDeployValue(project, context, at);
    return true;
  });
  return context.reporter;
}

/**
 * The model's deploy-time values, one per name, from the references the load resolved.
 * A reference whose value the environment overrides is not a use, so a value with no
 * use left, such as a default every environment replaces, is not listed.
 */
export function deployValuesOf(project: Project): DeployValue[] {
  const byName = new Map<string, DeployValue>();
  for (const { name, file, pointer, line } of project.envvarReferences) {
    const text = `\${envvar:${name}}`;
    if (!feeds(project, file, pointer, text)) continue;
    const value = byName.get(name) ?? { name, text, uses: [] };
    value.uses.push({ file, pointer, ...(line !== undefined && { line }) });
    byName.set(name, value);
  }
  return [...byName.values()];
}

/** True when the resolved value at the pointer, in the file's documents or values, holds the text. */
function feeds(project: Project, file: string, pointer: string, text: string): boolean {
  const documents = project.documents.filter((document) => document.file === file);
  const values = documents.length > 0 ? documents.map((document) => document.value) : [project];
  return values.some((value) => {
    const found = valueAt(value, pointer);
    return typeof found === "string" && found.includes(text);
  });
}

/** The deploy-time value that comes first in the text. */
function firstHeld(project: Project, value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const held = project.unsetEnvvars.filter((reference) => text.includes(reference));
  held.sort((a, b) => text.indexOf(a) - text.indexOf(b));
  return held[0] ?? "";
}

/** Every pointer the pattern matches in the value, `*` standing for each key or index. */
function pointersOf(value: unknown, pattern: string): string[] {
  let found: { pointer: string; value: unknown }[] = [{ pointer: "", value }];
  for (const key of pattern.slice(1).split("/")) {
    found = found.flatMap(({ pointer, value: current }) => {
      if (current === null || typeof current !== "object") return [];
      const keys = key === "*" ? Object.keys(current) : Object.hasOwn(current, key) ? [key] : [];
      return keys.map((name) => ({
        pointer: `${pointer}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        value: (current as Record<string, unknown>)[name],
      }));
    });
  }
  return found.map(({ pointer }) => pointer);
}
