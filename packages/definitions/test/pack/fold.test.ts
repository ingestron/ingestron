// Deploy-time values in a text, and checking a fold (specification section 2.1): the
// helpers every pack that builds environments together uses in its tests.
import { describe, expect, it } from "vitest";
import {
  checkFold,
  splitDeployText,
  type Pack,
  type PackNotice,
  type ResolvedModel,
} from "../../src/index.js";
import { modelsOf, paths, project, test } from "../targets.js";

describe("splitDeployText", () => {
  it("splits a text into its literal parts and the deploy-time values in it", () => {
    const account = { name: "ACCOUNT", text: "${envvar:ACCOUNT}", uses: [] };
    const path = { name: "PATH", text: "${envvar:PATH}", uses: [] };
    expect(
      splitDeployText("abfss://x@${envvar:ACCOUNT}.dfs/${envvar:PATH}", [path, account]),
    ).toEqual(["abfss://x@", account, ".dfs/", path]);
    expect(splitDeployText("plain", [account])).toEqual(["plain"]);
  });
});

/** A toy pack: one file with the shop's path, folded into a placeholder and a file per target. */
function toyPack(fold: (models: Record<string, ResolvedModel>) => Record<string, string>): Pack {
  return {
    ...test,
    build: (model) => ({ "path.txt": `${pathOf(model)}\n` }),
    buildEnvironments: (models) => ({
      files: fold(models as Record<string, ResolvedModel>),
      deployValues: [],
      problems: [],
    }),
  };
}

const pathOf = (model: ResolvedModel) => String(model.tables[0]?.ingest?.connection.settings.path);
const view = (files: Readonly<Record<string, string>>, target: string) => ({
  "path.txt": files["path.txt"]!.replace("{{path}}", files[`values/${target}.txt`] ?? ""),
});

/** A fold with a placeholder in the file and each target's value beside it. */
const setsEachTarget = (models: Record<string, ResolvedModel>) => ({
  "path.txt": "{{path}}\n",
  ...Object.fromEntries(
    Object.entries(models).map(([name, model]) => [`values/${name}.txt`, pathOf(model)]),
  ),
});

describe("checkFold", () => {
  it("holds for a fold that sets each target's value, for one, two and three targets", () => {
    const pack = toyPack(setsEachTarget);
    expect(checkFold(pack, modelsOf(project(paths), true), { view })).toEqual([]);
  });

  it("counts a notice as a warning, whatever severity a pack written in JavaScript gives it", () => {
    const folding = toyPack(setsEachTarget);
    const notice = { code: "PACK_NOTICE", severity: "error", message: "A.", hint: "B." };
    const pack: Pack = {
      ...folding,
      buildEnvironments: (models) => ({
        ...folding.buildEnvironments!(models),
        problems: [notice as unknown as PackNotice],
      }),
    };
    expect(checkFold(pack, modelsOf(project(paths), true), { view })).toEqual([]);
  });

  it("names each target whose view is not its render", () => {
    const pack = toyPack((models) => ({ "path.txt": `${pathOf(Object.values(models)[0]!)}\n` }));
    expect(
      checkFold(pack, modelsOf(project(paths), true), { view: (files) => ({ ...files }) }),
    ).toEqual([
      "With dev, test, for test: path.txt differs from the render.",
      "With dev, test, prod, for test: path.txt differs from the render.",
      "With dev, test, prod, for prod: path.txt differs from the render.",
    ]);
  });

  it("refuses models resolved without deployTime, which would leave nothing to check", () => {
    const pack = toyPack(() => ({}));
    expect(checkFold(pack, modelsOf(project(paths)), { view })).toEqual([
      "The models of dev, test, prod were resolved without deployTime.",
    ]);
  });

  it("refuses a deploy-time value's text in the folded files, and one not listed in deployValues", () => {
    const pack = toyPack(() => ({ "path.txt": "${envvar:SHOP}\n" }));
    const models = modelsOf(project({ dev: "${envvar:SHOP}" }), true);
    expect(checkFold(pack, models, { view: (files) => ({ ...files }) })).toEqual([
      "With dev: path.txt holds ${envvar:SHOP}.",
      "With dev: ${envvar:SHOP} is in the render of dev but not in deployValues with a name to supply it under.",
    ]);
  });
});
