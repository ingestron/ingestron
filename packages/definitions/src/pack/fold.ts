// The fold property (specification section 2.1), as plain functions a pack's tests
// call: deploy-time values in a text, and a check that folding changes nothing.
import { environmentsDiagnostics } from "./environments.js";
import type { DeployValue, ResolvedModel } from "./model.js";
import type { Pack } from "./pack.js";

/**
 * A text split into its literal parts and the deploy-time values it holds, in order,
 * leaving out empty parts.
 * @example
 * splitDeployText("abfss://x@${envvar:ACCOUNT}.dfs", model.deployValues ?? []);
 * // ["abfss://x@", { name: "ACCOUNT", … }, ".dfs"]
 */
export function splitDeployText(
  text: string,
  deployValues: readonly DeployValue[],
): (string | DeployValue)[] {
  const parts: (string | DeployValue)[] = [];
  let rest = text;
  for (;;) {
    const next = nextValue(rest, deployValues);
    if (!next) break;
    if (next.at > 0) parts.push(rest.slice(0, next.at));
    parts.push(next.value);
    rest = rest.slice(next.at + next.value.text.length);
  }
  if (rest !== "") parts.push(rest);
  return parts;
}

function nextValue(text: string, deployValues: readonly DeployValue[]) {
  let found: { at: number; value: DeployValue } | undefined;
  for (const value of deployValues) {
    const at = value.text === "" ? -1 : text.indexOf(value.text);
    if (at >= 0 && (!found || at < found.at)) found = { at, value };
  }
  return found;
}

/** How a pack's platform reads its folded files, for {@link checkFold}. */
export interface FoldView {
  /**
   * What the platform makes of the folded files for one target, in the layout `build`
   * gives, with each parameter left for the deploying pipeline written as its value's text.
   */
  view(files: Readonly<Record<string, string>>, target: string): Record<string, string>;
  /** Whether two texts at one path are the same; default: equal text. */
  same?(path: string, viewed: string, rendered: string): boolean;
}

type Files = Readonly<Record<string, string>>;

/**
 * Checks the fold property, and that the files hold no deploy-time value's text and list
 * every deploy-time value they need, for the models of the first one, two and more
 * targets. Returns a sentence for each failure: none when the property holds.
 * @example
 * expect(checkFold(pack, { dev, test, prod }, { view: bundleTarget })).toEqual([]);
 */
export function checkFold(
  pack: Pack,
  models: Readonly<Record<string, ResolvedModel>>,
  fold: FoldView,
): string[] {
  if (!pack.buildEnvironments) return ["The pack does not build environments together."];
  const targets = Object.keys(models);
  // Without deploy-time values listed, rules 4 and 5 would hold with nothing to check.
  const plain = targets.filter((target) => !models[target]!.deployValues);
  if (plain.length > 0)
    return [`The models of ${plain.join(", ")} were resolved without deployTime.`];
  return targets.flatMap((_, index) => {
    const some = Object.fromEntries(
      targets.slice(0, index + 1).map((name) => [name, models[name]!]),
    );
    return checkTargets(pack, some, fold);
  });
}

/** One set of targets: the build has no errors, and each target's view is its render. */
function checkTargets(pack: Pack, models: Record<string, ResolvedModel>, fold: FoldView): string[] {
  const targets = Object.keys(models);
  const label = `With ${targets.join(", ")}`;
  const built = pack.buildEnvironments!(models);
  // Decided on the diagnostics, as a tool that writes the files decides: a notice is a warning.
  const errors = environmentsDiagnostics(built.problems).filter(
    (problem) => problem.severity === "error",
  );
  if (errors.length > 0)
    return errors.map((problem) => `${label}: buildEnvironments reports "${problem.message}"`);
  const values = targets.flatMap((target) => models[target]!.deployValues ?? []);
  const failures = Object.entries(built.files).flatMap(([path, text]) =>
    values
      .filter((value) => text.includes(value.text))
      .map((value) => `${label}: ${path} holds ${value.text}.`),
  );
  for (const target of targets) {
    const rendered = pack.build(models[target]!);
    failures.push(
      ...compareFiles(`${label}, for ${target}`, fold.view(built.files, target), rendered, fold),
    );
    failures.push(...unlisted(`${label}`, target, models[target]!, rendered, built.deployValues));
  }
  return [...new Set(failures)];
}

/** The view and the render have the same paths, and the same text at each. */
function compareFiles(label: string, viewed: Files, rendered: Files, fold: FoldView): string[] {
  const same = fold.same ?? ((_path: string, a: string, b: string) => a === b);
  const paths = [...new Set([...Object.keys(viewed), ...Object.keys(rendered)])].sort();
  return paths.flatMap((path) => {
    const view = viewed[path];
    const render = rendered[path];
    if (view === undefined) return [`${label}: ${path} is in the render but not in the view.`];
    if (render === undefined) return [`${label}: ${path} is in the view but not in the render.`];
    return same(path, view, render) ? [] : [`${label}: ${path} differs from the render.`];
  });
}

/** Each deploy-time value in the render is listed, with a name to supply it under. */
function unlisted(
  label: string,
  target: string,
  model: ResolvedModel,
  rendered: Files,
  listed: { name: string; suppliedAs: string[] }[],
): string[] {
  const texts = Object.values(rendered);
  return (model.deployValues ?? [])
    .filter((value) => texts.some((text) => text.includes(value.text)))
    .filter((value) => !listed.find((item) => item.name === value.name)?.suppliedAs.length)
    .map(
      (value) =>
        `${label}: ${value.text} is in the render of ${target} but not in deployValues with a name to supply it under.`,
    );
}
