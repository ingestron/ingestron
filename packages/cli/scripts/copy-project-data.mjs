// Keep built-in definition recipes available in an installed CLI, without a checkout.
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const repository = join(root, "../..");
const filter = (path) => !/\/(build|\.generated\.json)(\/|$)/.test(path);
for (const [source, target] of [
  ["samples/starters", "project-templates"],
  ["samples/guides/adf-native-connectors", "project-recipes/adf"],
]) {
  const destination = join(root, target);
  rmSync(destination, { recursive: true, force: true });
  cpSync(join(repository, source), destination, { recursive: true, filter });
}
