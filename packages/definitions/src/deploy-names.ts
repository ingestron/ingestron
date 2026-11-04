// Different deploy-time values at the same place in two targets (specification section
// 2.1): one variable name should have a different value in each pipeline stage.
import type { Walk } from "./compare-targets.js";
import { splitDeployText } from "./fold.js";
import type { ResolvedModel } from "./model.js";

/**
 * Two targets holding different deploy-time values at one place is `DEPLOY_VALUE`. Each
 * target's values are in text order; against the first target holding any, the first
 * other whose list differs is reported, at the first position where both hold a value.
 */
export function checkDeployNames(values: Record<string, unknown>, walk: Walk): void {
  const held = Object.entries(values)
    .map(([target, value]) => ({ target, names: deployNames(walk.models[target], value) }))
    .filter((entry) => entry.names.length > 0);
  const [first, ...others] = held;
  if (!first) return;
  for (const other of others) {
    const at = first.names.findIndex(
      (name, index) => other.names[index] !== undefined && other.names[index] !== name,
    );
    if (at < 0) continue;
    const second = { target: other.target, name: other.names[at]! };
    reportNames(walk, { target: first.target, name: first.names[at]! }, second);
    return;
  }
}

function reportNames(
  walk: Walk,
  first: { target: string; name: string },
  second: { target: string; name: string },
): void {
  const values = walk.models[second.target]?.deployValues ?? [];
  const use = values.find((value) => value.name === second.name)?.uses[0];
  walk.found.structural.push({
    code: "DEPLOY_VALUE",
    severity: "error",
    message: `This value is \${envvar:${first.name}} in ${first.target} and \${envvar:${second.name}} in ${second.target}.`,
    hint: "Use one variable name and give it a different value in each pipeline stage.",
    file: use?.file ?? "project.yaml",
    ...(use?.line !== undefined && { line: use.line }),
  });
}

/** The names of the deploy-time values a text holds, in the order the text holds them. */
function deployNames(model: ResolvedModel | undefined, value: unknown): string[] {
  if (typeof value !== "string") return [];
  return splitDeployText(value, model?.deployValues ?? []).flatMap((part) =>
    typeof part === "string" ? [] : [part.name],
  );
}
