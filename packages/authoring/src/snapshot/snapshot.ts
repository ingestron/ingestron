// A project as the editor sees it at one moment, with everything an editor asks
// of it as methods. Each method gives what the function of the same job gives;
// what they work out is kept once per snapshot by the modules that do the work.
import type { FileSource } from "@ingestron/config";
import {
  annotationsIn,
  generatedLenses,
  type Annotation,
  type GeneratedLens,
} from "../annotations/index.js";
import {
  completionsAt,
  fixAll,
  moveSetting,
  quickFixes,
  type QuickFix,
  type Suggestion,
} from "../assist/index.js";
import { problems, type Problem } from "../diagnostics/index.js";
import {
  compareEnvironments,
  generatedFiles,
  platformRequest,
  type Files,
} from "../generation/index.js";
import { hoverAt, replaceMeHelp, type HoverOptions, type ReplaceMeHelp } from "../hover/index.js";
import {
  definitionAt,
  fileMoveEdits,
  projectSymbols,
  referencesAt,
  renameAt,
  renameProblem,
  type ProjectSymbol,
  type TextPlace,
} from "../navigation/index.js";
import { openProject, type Position, type Project } from "../project/index.js";
import { referenceAt, referenceForDocs, type ReferenceEntry } from "../reference/index.js";

/**
 * An Ingestron project as an editor sees it at one moment: the folder with project.yaml, its
 * files with open editors read before the disk, and its environments. Open a new snapshot
 * after any edit or change on disk; a snapshot never changes, so what it works out, such as
 * the problems for an environment, is worked out once and kept.
 *
 * File paths are relative to the project folder, with forward slashes; offsets are into the
 * file's text as the editor holds it. `environment` is one the project declares, or undefined
 * for a project that declares none.
 * @example
 * const snapshot = ProjectSnapshot.open(folder, openTexts);
 * for (const problem of snapshot.problems("dev")) console.log(problem.file, problem.message);
 * @public
 */
export class ProjectSnapshot {
  /** The project's folder, which holds project.yaml. */
  readonly folder: string;
  /** The project's files, open editors first. */
  readonly files: FileSource;
  /** The environments project.yaml declares, in order; empty when it declares none. */
  readonly environments: string[];

  private constructor(project: Project) {
    this.folder = project.folder;
    this.files = project.files;
    this.environments = project.environments;
  }

  /** The project in `folder`, with `open` (absolute path → text) read before the disk. */
  static open(folder: string, open: ReadonlyMap<string, string> = new Map()): ProjectSnapshot {
    return new ProjectSnapshot(openProject(folder, open));
  }

  /** Every problem for the environment. */
  problems(environment: string | undefined): Problem[] {
    return problems(this, environment);
  }

  /** Suggestions for the cursor at `offset` in `text`, the open text of `file`. */
  completionsAt(
    file: string,
    text: string,
    offset: number,
    environment: string | undefined,
  ): Suggestion[] {
    return completionsAt(this, file, text, offset, environment);
  }

  /** The fixes for the problems in `file` whose lines meet `at`. */
  quickFixes(
    environment: string | undefined,
    file: string,
    at: { start: Position; end: Position },
  ): QuickFix[] {
    return quickFixes(this, environment, file, at);
  }

  /** One fix for every problem with `code` that has a fix, when there are two or more. */
  fixAll(environment: string | undefined, code: string): QuickFix[] {
    return fixAll(this, environment, code);
  }

  /** The move for the setting whose key is at `offset`, when it is written outside where it belongs. */
  moveSetting(
    file: string,
    text: string,
    offset: number,
    environment: string | undefined,
  ): QuickFix[] {
    return moveSetting(this, file, text, offset, environment);
  }

  /** Markdown for the hover at `offset` in `text`, the open text of `file`, or undefined. */
  hoverAt(
    file: string,
    text: string,
    offset: number,
    environment: string | undefined,
    options: HoverOptions = {},
  ): string | undefined {
    return hoverAt(this, file, text, offset, environment, options);
  }

  /**
   * What the `REPLACE_ME` at `pointer` (a JSON Pointer) in `file` stands for: the field it fills,
   * where to find the value and a suggestion; undefined when no field describes it.
   */
  replaceMeHelp(
    file: string,
    pointer: string,
    environment: string | undefined,
  ): ReplaceMeHelp | undefined {
    return replaceMeHelp(this, file, pointer, environment);
  }

  /** Where the id or reference at the offset is defined. */
  definitionAt(file: string, offset: number): TextPlace | undefined {
    return definitionAt(this, file, offset);
  }

  /**
   * Every place that defines or uses what is at the offset. A transform's id names both the
   * transform and its table, so both are followed.
   */
  referencesAt(file: string, offset: number): TextPlace[] {
    return referencesAt(this, file, offset);
  }

  /** The edits that rename the id at the offset everywhere, by file. */
  renameAt(
    file: string,
    offset: number,
    name: string,
  ): Record<string, { range: [number, number]; text: string }[]> | undefined {
    return renameAt(this, file, offset, name);
  }

  /**
   * Why the id at the offset cannot be renamed to `name`, or undefined when it can: a blank
   * name, or one that another table or document of the same kind already has.
   */
  renameProblem(file: string, offset: number, name: string): string | undefined {
    return renameProblem(this, file, offset, name);
  }

  /**
   * The edits that keep every `${file:…}` pointing at the same file when the file or folder
   * `from` moves to `to` (project paths with "/"), by file as it is now.
   */
  fileMoveEdits(
    from: string,
    to: string,
  ): Record<string, { range: [number, number]; text: string }[]> {
    return fileMoveEdits(this, from, to);
  }

  /** Every definition in the project, a transform named once (as a transform, not also as its table). */
  symbols(): ProjectSymbol[] {
    return projectSymbols(this);
  }

  /** What differs between environments `a` and `b`, as `ingestron compare` prints it. */
  compare(a: string, b: string): string {
    return compareEnvironments(this, a, b);
  }

  /** The request as Markdown for the environment, as `ingestron request` prints it. */
  request(environment: string | undefined): string {
    return platformRequest(this, environment);
  }

  /** Every file apply writes that the environment uses, at its path under build/, or what stops plan. */
  generatedFiles(environment: string | undefined): Files {
    return generatedFiles(this, environment);
  }

  /** Values of `${…}` references and each table's name and methods, for the environment. */
  annotationsIn(file: string, text: string, environment: string | undefined): Annotation[] {
    return annotationsIn(this, file, text, environment);
  }

  /** For each table in a flow, transform or contract, the files generated for it. */
  generatedLenses(file: string, text: string, environment: string | undefined): GeneratedLens[] {
    return generatedLenses(this, file, text, environment);
  }

  /** The entry for `offset` in `text`, the open text of `file`; undefined outside definitions. */
  referenceAt(
    file: string,
    text: string,
    offset: number,
    environment: string | undefined,
  ): ReferenceEntry | undefined {
    return referenceAt(this, file, text, offset, environment);
  }

  /** The entry for a docs path such as `/docs/reference/packs/adf#adf-copy`, else undefined. */
  referenceForDocs(path: string, environment: string | undefined): ReferenceEntry | undefined {
    return referenceForDocs(this, path, environment);
  }
}
