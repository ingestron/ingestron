// Bundles the extension and the Ingestron packages into dist/extension.js,
// and copies the data folders the packages read beside it: the definitions'
// schemas, the Databricks pack's SQL templates and the built-in project
// templates. In the bundle, import.meta.url is the bundle's own file, so
// "../schemas" and "../templates" resolve to these copies.
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { thirdPartyNotices } from "../../../scripts/release/third-party-notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repository = join(root, "../..");

rmSync(join(root, "dist"), { recursive: true, force: true });
const { metafile } = await build({
  entryPoints: [join(root, "src/extension.ts")],
  outfile: join(root, "dist/extension.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["vscode"],
  define: { "import.meta.url": "__importMetaUrl" },
  banner: { js: 'var __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  metafile: true,
  absWorkingDir: root,
  logLevel: "warning",
});
writeFileSync(join(root, "THIRD_PARTY_NOTICES"), thirdPartyNotices(metafile, root));

function copy(from, to, filter) {
  rmSync(join(root, to), { recursive: true, force: true });
  cpSync(join(repository, from), join(root, to), { recursive: true, filter });
}
copy("packages/definitions/schemas", "schemas");
for (const file of ["LICENSE", "NOTICE"]) cpSync(join(repository, file), join(root, file));
copy("packages/pack-databricks/templates", "templates");
copy(
  "samples/guides/adf-native-connectors",
  "project-recipes/adf",
  (path) => !/\/(build|\.generated\.json)(\/|$)/.test(path),
);
rmSync(join(root, "project-templates"), { recursive: true, force: true });
// The starters are the built-in templates.
for (const name of readdirSync(join(repository, "samples/starters"))) {
  if (!existsSync(join(repository, "samples/starters", name, "template.yaml"))) continue;
  cpSync(join(repository, "samples/starters", name), join(root, "project-templates", name), {
    recursive: true,
    filter: (path) => !/\/(build|\.generated\.json)(\/|$)/.test(path),
  });
}
console.log("✓ dist/extension.cjs and data folders");
