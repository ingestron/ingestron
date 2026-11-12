// Packs the `ingestron` npm package: the CLI bundled into one ESM file, with the
// data folders the packages read beside it, so it installs with no dependencies.
// In the bundle, import.meta.url is dist/main.js, so "../schemas" and
// "../templates" resolve to the copies at the package root. The bundle cannot
// resolve @ingestron/standards, so its kits are copied to "../kits" too, and its source
// recipes to "../source-recipes" ("../recipes" holds the ADF pack's project recipes).
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { thirdPartyNotices } from "./third-party-notices.mjs";

const repository = join(import.meta.dirname, "../..");
const notGenerated = (path) => !/\/(build|\.generated\.json)(\/|$)/.test(path);

const standardsRecipes = "packages/core/node_modules/@ingestron/standards/recipes";

const folders = [
  ["packages/definitions/schemas", "schemas"],
  ["packages/core/node_modules/@ingestron/pack-databricks/templates", "templates"],
  ["packages/core/project-templates", "project-templates"],
  ["packages/core/node_modules/@ingestron/pack-adf/recipes", "recipes"],
  ["packages/core/node_modules/@ingestron/standards/kits", "kits"],
  [standardsRecipes, "source-recipes"],
];

/**
 * Resolves `@ingestron/*` imports to the TypeScript source behind each package's
 * export, so packing needs no earlier build and never bundles a stale `dist/`.
 */
function workspaceSource() {
  const packages = new Map(
    readdirSync(join(repository, "packages")).map((folder) => {
      const dir = join(repository, "packages", folder);
      const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return [json.name, { dir, exports: json.exports ?? {} }];
    }),
  );
  return {
    name: "workspace-source",
    setup(build) {
      build.onResolve({ filter: /^@ingestron\// }, ({ path }) => {
        const [, name, subpath = ""] = /^(@ingestron\/[^/]+)(\/.*)?$/.exec(path);
        const target = packages.get(name)?.exports[`.${subpath}`]?.import;
        if (!target) return undefined;
        const source = target.replace(/^\.\/dist\/(.*)\.js$/, "src/$1.ts");
        return { path: join(packages.get(name).dir, source) };
      });
    },
  };
}

function manifest(version) {
  return {
    name: "ingestron",
    version,
    description:
      "Declare data ingestion in reviewed YAML definitions and generate Databricks, Azure Data Factory, Synapse serverless SQL and DuckDB files under your standards.",
    keywords: [
      "ingestion",
      "databricks",
      "azure-data-factory",
      "azure-synapse",
      "duckdb",
      "data-engineering",
      "yaml",
      "cli",
    ],
    homepage: "https://docs.ingestron.io",
    repository: {
      type: "git",
      url: "git+https://github.com/ingestron/ingestron.git",
      directory: "packages/cli",
    },
    bugs: { url: "https://github.com/ingestron/ingestron/issues", email: "hello@ingestron.io" },
    author: "Ingestron <hello@ingestron.io>",
    license: "Apache-2.0",
    type: "module",
    bin: { ingestron: "dist/main.js" },
    engines: { node: ">=22.13.0" },
    files: [
      "dist",
      ...folders.map(([, to]) => to.split("/")[0]),
      "LICENSE",
      "NOTICE",
      "THIRD_PARTY_NOTICES",
      "README.md",
    ],
  };
}

/**
 * Builds and packs the package; returns the tarball's absolute path. The standards package's
 * recipes folder is required; `recipes` names another (an absolute path), for a test while the
 * installed package has none.
 */
export async function packCli({ outDir = join(repository, ".release"), recipes } = {}) {
  const stage = join(outDir, "ingestron");
  rmSync(stage, { recursive: true, force: true });
  // The CLI's version is a constant written from its package.json; refresh it before bundling.
  execFileSync(process.execPath, [join(repository, "packages/cli/scripts/write-version.mjs")]);
  mkdirSync(stage, { recursive: true });
  const { metafile } = await build({
    entryPoints: [join(repository, "packages/cli/src/main.ts")],
    outfile: join(stage, "dist/main.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    banner: {
      js: 'import { createRequire as __ingestronRequire } from "node:module";\nconst require = __ingestronRequire(import.meta.url);',
    },
    metafile: true,
    plugins: [workspaceSource()],
    absWorkingDir: repository,
    logLevel: "warning",
  });
  writeFileSync(join(stage, "THIRD_PARTY_NOTICES"), thirdPartyNotices(metafile, repository));
  for (const [from, to] of folders)
    cpSync(
      from === standardsRecipes && recipes ? recipes : join(repository, from),
      join(stage, to),
      {
        recursive: true,
        filter: notGenerated,
      },
    );
  for (const file of ["LICENSE", "NOTICE"]) cpSync(join(repository, file), join(stage, file));
  cpSync(join(import.meta.dirname, "cli-readme.md"), join(stage, "README.md"));
  const { version } = JSON.parse(
    readFileSync(join(repository, "packages/cli/package.json"), "utf8"),
  );
  writeFileSync(join(stage, "package.json"), JSON.stringify(manifest(version), null, 2) + "\n");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const name = execFileSync(npm, ["pack", "--silent", "--pack-destination", outDir], {
    cwd: stage,
    encoding: "utf8",
  }).trim();
  return join(outDir, name);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await packCli());
