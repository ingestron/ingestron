// Reading a kit folder and checking every rule of spec/cli/kits.md.
import { relative, sep } from "node:path";
import { checkRange, featuresOf, idOf, packsOf, rangeOf, replacesOf, versionOf } from "./fields.js";
import { kitFiles, list, load, mapping, text, type Data } from "./files.js";
import { kitSchema, type Kit } from "./kit.js";

const keys = Object.keys(kitSchema.properties);

function checkKeys(data: Data): void {
  const unknown = Object.keys(data).find((key) => !keys.includes(key));
  if (unknown)
    throw new Error(`kit.yaml: unknown key "${unknown}". Check its spelling or remove it.`);
  for (const key of kitSchema.required) {
    if (data[key] !== undefined && data[key] !== null) continue;
    throw new Error(
      key === "requires"
        ? 'kit.yaml: "requires" is missing. Add it, such as requires: { ingestron: ">=2.4.0" }.'
        : `kit.yaml: "${key}" is missing. Add it.`,
    );
  }
}

function checkStandard(folder: string, kit: Pick<Kit, "id" | "version" | "packs">): void {
  const standard = mapping(load(folder, "standard.yaml"), "standard.yaml", "packs: and origin:");
  const packs = Array.isArray(standard.packs) ? standard.packs.map(String) : [];
  if (packs.length !== kit.packs.length || packs.some((pack, index) => pack !== kit.packs[index]))
    throw new Error(
      `standard.yaml: packs is [${packs.join(", ")}], but kit.yaml says [${kit.packs.join(", ")}]. Make the two lists the same.`,
    );
  const origin = standard.origin as Data | undefined | null;
  if (origin?.standard !== kit.id || origin?.version !== kit.version)
    throw new Error(
      `standard.yaml: origin must say standard: ${kit.id} and version: ${kit.version}, the same as kit.yaml. ${origin ? "Correct" : "Add"} it.`,
    );
}

function checkPlace(folder: string, root: string, kit: Pick<Kit, "id" | "version">): void {
  const place = relative(root, folder).split(sep).join("/");
  if (place !== `${kit.id}/${kit.version}`)
    throw new Error(
      `The kit is in ${place}, but kit.yaml says ${kit.id}/${kit.version}. Move the folder to ${kit.id}/${kit.version}, or correct id and version.`,
    );
}

/**
 * Reads and checks a kit folder; throws an Error naming the file and the rule broken. With
 * `root`, the folder is a version folder of a catalogue and its path below `root` must be
 * `<id>/<version>`; without it the folder is checked on its own contents only.
 * @public
 */
export function readKit(folder: string, root?: string): Kit {
  const data = mapping(load(folder, "kit.yaml"), "kit.yaml", "id: and version:");
  checkKeys(data);
  const title = text(data, "title");
  const summary = text(data, "summary");
  const notes = data.notes === undefined ? "" : text(data, "notes");
  const packs = packsOf(data);
  const maintainers =
    data.maintainers === undefined ? [] : list(data, "maintainers", "names, such as [ingestron]");
  const ingestron = rangeOf(data);
  const id = idOf(data, packs);
  const version = versionOf(data);
  const features = featuresOf(data, version);
  checkRange(ingestron);
  const replaces = replacesOf(data, version);
  for (const name of kitFiles.slice(1)) load(folder, name);
  checkStandard(folder, { id, version, packs });
  if (root !== undefined) checkPlace(folder, root, { id, version });
  const requires = { ingestron };
  return {
    id,
    version,
    title,
    summary,
    packs,
    features,
    requires,
    maintainers,
    replaces,
    notes,
    folder,
  };
}
