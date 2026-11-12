// The fix for CONTRACT_NEEDED when the table has an entry in its connection's source metadata:
// draft the contract from the entry (core's drafting, so the file, its path and its id are what
// the CLI would write) and name it with `contract`; or, when that file exists already, only name it.
import { draftContracts, type ContractDraft } from "@ingestron/core";
import { isMap, isScalar, parseDocument, type Node, type Pair } from "yaml";
import type { Problem } from "../diagnostics/index.js";
import { offsetAt, pointerOf, type Project } from "../project/index.js";
import { positioned, type QuickFix } from "./quick-fix.js";

/**
 * The fix for a CONTRACT_NEEDED problem whose table has a metadata entry; none for any other.
 * It is offered where the problem is: the definitions place it at the table's first key, such
 * as `object`, not at the table's own key line.
 */
export function draftContractFixes(
  project: Project,
  environment: string | undefined,
  problem: Problem,
): QuickFix[] {
  if (problem.code !== "CONTRACT_NEEDED") return [];
  const found = tableAtProblem(project.files.read(problem.file) ?? "", problem);
  const draft = found && draftsOf(project, environment).get(`${found.flow}.${found.table}`);
  if (!found || !draft) return [];
  const nameIt = positioned(project, {
    title: "",
    edits: [
      {
        file: problem.file,
        pointer: pointerOf(["tables", found.table, "contract"]),
        set: draft.id,
      },
    ],
  });
  if (nameIt.length === 0) return [];
  const at = { code: problem.code, line: problem.range.start.line };
  if (project.files.read(draft.path) !== undefined)
    return [{ title: `Use ${draft.path}`, problem: at, edits: nameIt }];
  return [
    {
      title: "Draft a contract from the source metadata",
      problem: at,
      edits: nameIt,
      create: { file: draft.path, text: draft.text },
    },
  ];
}

const drafted = new WeakMap<Project, Map<string, Map<string, ContractDraft>>>();

/**
 * The draft of every flow table that needs a contract, names none and has a metadata entry, by
 * `<flow>.<table>`: one resolution per project snapshot and environment, however many tables.
 */
function draftsOf(project: Project, environment: string | undefined): Map<string, ContractDraft> {
  let byEnvironment = drafted.get(project);
  if (!byEnvironment) drafted.set(project, (byEnvironment = new Map()));
  const key = environment ?? "";
  let drafts = byEnvironment.get(key);
  if (!drafts) {
    const found = draftContracts(project.files, {
      needed: true,
      ...(environment !== undefined && { environment }),
    });
    drafts = new Map(found.drafts.map((draft) => [draft.table, draft]));
    byEnvironment.set(key, drafts);
  }
  return drafts;
}

/**
 * The flow's id and the key of the table whose entry in the file, from its key to the end of its
 * value, holds the problem's start; the file is parsed once, whatever the number of tables.
 */
function tableAtProblem(
  text: string,
  problem: Problem,
): { flow: string; table: string } | undefined {
  const document = parseDocument(text);
  if (document.errors.length > 0 || !isMap(document.contents)) return undefined;
  const flow = document.get("id");
  const tables = document.get("tables");
  if (typeof flow !== "string" || !isMap(tables)) return undefined;
  const start = offsetAt(text, problem.range.start);
  const pair = (tables.items as Pair<Node, Node>[]).find(
    ({ key, value }) =>
      isScalar(key) &&
      key.range != null &&
      value?.range != null &&
      key.range[0] <= start &&
      start <= value.range[1],
  );
  return pair ? { flow, table: String((pair.key as { value: unknown }).value) } : undefined;
}
