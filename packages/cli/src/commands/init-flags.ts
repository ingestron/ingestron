// Validate project creation choices before writing files.
import { nameProblem } from "@ingestron/core";
import type { Options } from "../terminal/index.js";

/** Names given as flags are checked before anything else happens. */
export function checkInitFlags(options: Options): void {
  checkSources(options.init);
  const problem =
    (options.init.name !== undefined ? nameProblem(options.init.name, "project") : undefined) ??
    options.environments.map((name) => nameProblem(name, "environment")).find(Boolean);
  if (problem) throw new Error(problem);
}

/** One of --kit, --template and --standard at most, and no connection options with --template. */
function checkSources({
  kit,
  template,
  standard,
  connector,
  via,
  connectivity,
  platform,
}: Options["init"]) {
  const route = [connector, via, connectivity].some(Boolean);
  if (platform && [kit, template, route].some(Boolean))
    throw new Error(
      "Choose --platform with an optional --standard, or a kit, template or connection route.",
    );
  if (kit !== undefined && (template !== undefined || standard !== undefined))
    throw new Error("Choose --kit, --template or --standard, not two.");
  if (template && route) throw new Error("Choose connection options or --template, not both.");
}
