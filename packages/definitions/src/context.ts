// What every resolution step reads: the loaded project, the packs the
// standard names (with one combined view), the one standard and platform,
// and the reporter.
import type { DefinitionDocument, Project } from "@ingestron/config";
import type { Reporter } from "./diagnostics.js";
import { kinds, type PlatformDoc, type StandardDoc } from "./documents.js";
import type { Action, PackInfo } from "./pack.js";

/** Shared by the resolution steps. */
export interface Context {
  project: Project;
  /** The packs the standard names, in its order. */
  packs: PackInfo[];
  /** Every pack that could be named, for fixes that add one. */
  available: PackInfo[];
  /** All of them as one: the first pack's defaults, joined rules and methods. */
  pack: PackInfo;
  /** The pack each method belongs to. */
  owner: Map<string, string>;
  /** The selected environment, or `default`. */
  environment: string;
  /** The pack the environment runs on, when it names one the standard lists. */
  runsOn?: PackInfo;
  /** Tables left out because the environment runs on a pack and they land no files. */
  skipped: Set<string>;
  standard: DefinitionDocument<StandardDoc>;
  platform?: DefinitionDocument<PlatformDoc>;
  reporter: Reporter;
}

/** Finds the standard, its packs and the platform, reporting what is missing or too many. */
export function createContext(
  project: Project,
  available: PackInfo[],
  reporter: Reporter,
): Context | undefined {
  const standard = oneStandard(project, available, reporter);
  const packs = standard ? selectPacks(standard, available, reporter) : [];
  const owner = standard ? methodOwners(standard, packs, reporter) : new Map<string, string>();
  const platforms = project.all(kinds.platform);
  if (platforms[1]) {
    const message = `A project has at most one Platform; "${platforms[1].id}" is a second.`;
    reporter.error("MANY_PLATFORMS", message, { document: platforms[1], pointer: "" });
  }
  if (reporter.failed() || !standard) return undefined;
  const environment = project.environment ?? "default";
  return {
    project,
    packs,
    available,
    pack: combine(packs),
    owner,
    environment,
    ...runsOnPack(project, packs),
    skipped: new Set<string>(),
    standard,
    platform: platforms[0],
    reporter,
  };
}

function oneStandard(project: Project, available: PackInfo[], reporter: Reporter) {
  const [standard, extra] = project.all(kinds.standard);
  if (!standard) {
    const names = available.map((pack) => `${pack.id}@${pack.version}`).join(", ");
    reporter.error(
      "NO_STANDARD",
      "The project has no Standard document.",
      undefined,
      `Add one with "packs" from: ${names}.`,
    );
  } else if (extra) {
    reporter.error("MANY_STANDARDS", `A project has one Standard; "${extra.id}" is a second.`, {
      document: extra,
      pointer: "",
    });
  }
  return standard;
}

/** The available packs the standard names, reporting unknown ones and other versions. */
function selectPacks(
  standard: DefinitionDocument<StandardDoc>,
  available: PackInfo[],
  reporter: Reporter,
): PackInfo[] {
  return standard.value.packs.flatMap((reference, index) => {
    const [id, version] = reference.split("@");
    const at = { document: standard, pointer: `/packs/${index}` };
    const pack = available.find((candidate) => candidate.id === id);
    if (!pack) {
      reporter.error(
        "UNKNOWN_PACK",
        `There is no pack "${id}".`,
        at,
        `Available: ${available.map((item) => `${item.id}@${item.version}`).join(", ")}.`,
      );
      return [];
    }
    if (String(pack.version) !== version) {
      reporter.error(
        "WRONG_PACK",
        `This standard is for "${reference}", but the pack is ${pack.id}@${pack.version}.`,
        at,
      );
      return [];
    }
    return [pack];
  });
}

/** Which pack each method belongs to; a name in two packs is a conflict. */
function methodOwners(
  standard: DefinitionDocument<StandardDoc>,
  packs: PackInfo[],
  reporter: Reporter,
): Map<string, string> {
  const owner = new Map<string, string>();
  for (const pack of packs) {
    for (const method of Object.keys(pack.methods)) {
      const earlier = owner.get(method);
      if (earlier)
        reporter.error(
          "METHOD_CONFLICT",
          `Packs ${earlier} and ${pack.id} both have a method "${method}".`,
          { document: standard, pointer: "/packs" },
        );
      else owner.set(method, pack.id);
    }
  }
  return owner;
}

const actions: Action[] = ["ingest", "transform", "store", "serve"];

/** One pack view: the first pack's defaults, every pack's rules in order, all methods. */
function combine(packs: PackInfo[]): PackInfo {
  const [first] = packs as [PackInfo, ...PackInfo[]];
  const rules = Object.fromEntries(
    actions.map((action) => {
      const fallback = packs
        .map((pack) => pack.rules[action]?.default)
        .find((id) => id !== undefined);
      const when = packs.flatMap((pack) => pack.rules[action]?.when ?? []);
      return [action, { ...(fallback && { default: fallback }), when }];
    }),
  ) as PackInfo["rules"];
  const methods = Object.assign({}, ...packs.map((pack) => pack.methods)) as PackInfo["methods"];
  return {
    id: packs.map((pack) => pack.id).join("+"),
    version: first.version,
    defaults: first.defaults,
    rules,
    methods,
  };
}

/** The pack the selected environment runs on, when the standard lists it (else reported at load). */
function runsOnPack(project: Project, packs: PackInfo[]): { runsOn?: PackInfo } {
  const pack = project.runsOn && packs.find((candidate) => candidate.id === project.runsOn);
  return pack ? { runsOn: pack } : {};
}
