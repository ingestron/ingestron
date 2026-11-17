// Plans one output folder, then asks the pack that built it which first writes it refuses
// (spec/cli/outputs.md, "Refused first writes").
import type { Pack } from "@ingestron/definitions";
import {
  planGeneration,
  readManifest,
  type OutputFolder,
  type Plan,
  type Problem,
} from "@ingestron/generate";

/**
 * What applying `files`, the output of the pack `name`, to `folder` would change. A pack with
 * `checkFirstWrites` is asked about the paths its folder's manifest does not yet list; each
 * message it gives is a `FIRST_WRITE` problem of the plan, which is then not clean. `products`
 * has no pack. A manifest that cannot be read is the plan's own `BAD_MANIFEST` problem, and
 * the pack is not asked.
 * @example
 * const plan = planOutput(nodeFolder("build/adf"), "adf", files, packs);
 * @public
 */
export function planOutput(
  folder: OutputFolder,
  name: string,
  files: Readonly<Record<string, string>>,
  available: readonly Pack[],
  now: Date = new Date(),
): Plan {
  const plan = planGeneration(folder, files);
  const check = available.find((pack) => pack.id === name)?.checkFirstWrites;
  const manifest = check ? readManifest(folder) : undefined;
  if (!check || !manifest || "problem" in manifest) return plan;
  const messages = check(files, new Set(manifest.files.keys()), now);
  if (messages.length === 0) return plan;
  const problems: Problem[] = messages.map((message) => ({ code: "FIRST_WRITE", message }));
  return { ...plan, problems: [...plan.problems, ...problems], clean: false, upToDate: false };
}
