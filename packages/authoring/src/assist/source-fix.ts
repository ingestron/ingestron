// The fix for CONTRACT_NEEDED when the table has an entry in its connection's source metadata:
// draft the contract from the entry (core's drafting, so the file is what the CLI would write)
// and name it with `contract`; or, when that file exists already, only name it.
import { draftContracts } from "@ingestron/core";
import { parse } from "yaml";
import type { Problem } from "../diagnostics/index.js";
import { offsetAt, rangeOf, resolved, type Project } from "../project/index.js";
import { positioned, type QuickFix } from "./fixes.js";

/** The fix for a CONTRACT_NEEDED problem whose table has a metadata entry; none for any other. */
export function draftContractFixes(
  project: Project,
  environment: string | undefined,
  problem: Problem,
): QuickFix[] {
  if (problem.code !== "CONTRACT_NEEDED") return [];
  const found = tableAtProblem(project, environment, problem);
  if (!found?.entry) return [];
  const { flow, table, connection } = found;
  const id = `${connection}.${table}`;
  const nameIt = positioned(project, {
    title: "",
    edits: [{ file: problem.file, pointer: `/tables/${table}/contract`, set: id }],
  });
  const at = { code: problem.code, line: problem.range.start.line };
  const path = `contracts/${id}.yaml`;
  if (project.files.read(path) !== undefined)
    return nameIt.length > 0 ? [{ title: `Use ${path}`, problem: at, edits: nameIt }] : [];
  const { drafts } = draftContracts(project.files, {
    tables: [`${flow}.${table}`],
    ...(environment !== undefined && { environment }),
  });
  const draft = drafts.find((item) => item.path === path);
  return draft && nameIt.length > 0
    ? [
        {
          title: "Draft a contract from the source metadata",
          problem: at,
          edits: nameIt,
          create: { file: draft.path, text: draft.text },
        },
      ]
    : [];
}

/**
 * The flow table, as the resolved project lists it, whose entry in the file holds the problem's
 * start: the problem is at the table, which the definitions place at its first key.
 */
function tableAtProblem(project: Project, environment: string | undefined, problem: Problem) {
  const text = project.files.read(problem.file) ?? "";
  const start = offsetAt(text, problem.range.start);
  const flow = flowIdOf(text);
  return resolved(project, environment).sourceTables?.find((item) => {
    if (item.flow !== flow || item.contract !== undefined) return false;
    const key = rangeOf(text, `/tables/${item.table}`, "key");
    const value = rangeOf(text, `/tables/${item.table}`);
    return key !== undefined && value !== undefined && key[0] <= start && start <= value[1];
  });
}

function flowIdOf(text: string): unknown {
  try {
    return (parse(text) as { id?: unknown } | null)?.id;
  } catch {
    return undefined;
  }
}
