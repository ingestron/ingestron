// An environment's runs-on must name one of the standard's packs
// (`UNKNOWN_PACK`, reported at runs-on in project.yaml).
import type { AnyDiagnostic, FileSource, Fix, Location, Project } from "@ingestron/config";
import { isNode, LineCounter, parseDocument } from "yaml";
import { kinds } from "./documents.js";
import type { PackInfo } from "./pack.js";

/** `UNKNOWN_PACK` when the selected environment runs on a pack the standard does not list. */
export function runsOnProblems(
  files: FileSource,
  project: Project,
  available: PackInfo[],
): AnyDiagnostic[] {
  const id = project.runsOn;
  const standard = project.all(kinds.standard)[0];
  if (!id || !project.environment || !standard) return [];
  if (standard.value.packs.some((reference) => reference.split("@")[0] === id)) return [];
  const add = available.find((pack) => pack.id === id);
  const fixes: Fix[] = add
    ? [
        {
          title: `Add the "${id}" pack`,
          edits: [{ file: standard.file, pointer: "/packs/-", set: `${id}@${add.version}` }],
        },
      ]
    : [];
  const location = runsOnLocation(files, project.environment);
  return [
    {
      code: "UNKNOWN_PACK",
      severity: "error",
      message: `Environment "${project.environment}" runs on "${id}", which the standard's packs do not list.`,
      hint: add
        ? `Add ${id}@${add.version} to the standard's packs.`
        : "Name one of the standard's packs.",
      ...(location && { location }),
      ...(fixes.length > 0 && { fixes }),
    },
  ];
}

/** Where project.yaml writes the environment's runs-on. */
function runsOnLocation(files: FileSource, environment: string): Location | undefined {
  const text = files.read("project.yaml");
  if (text === undefined) return undefined;
  const lines = new LineCounter();
  const node = parseDocument(text, { lineCounter: lines }).getIn(
    ["environments", environment, "runs-on"],
    true,
  );
  const offset = isNode(node) ? node.range?.[0] : undefined;
  if (offset === undefined) return undefined;
  const { line, col } = lines.linePos(offset);
  return { file: "project.yaml", line, column: col };
}
