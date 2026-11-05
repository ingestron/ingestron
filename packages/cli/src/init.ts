// ingestron init: a new project from a connection or a template. It asks only what picks the
// project; every value it cannot know is REPLACE_ME, and README.md says what to write
// (spec/cli/projects.md). Without a terminal a missing choice is an error that names the flag.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { memoryFiles } from "@ingestron/config";
import { isMap, isScalar, parse } from "yaml";
import type { Options } from "./args.js";
import { generateAll, type Generated } from "./build-outputs.js";
import { generate, replaceMeCount } from "./generate.js";
import { chooseProject } from "./init-choice.js";
import { composeRecipe, type RecipeFacts } from "./init-compose.js";
import { projectReadme, replaceRows } from "./init-readme.js";
import { applySet } from "./init-set.js";
import { startToday } from "./init-platform.js";
import { editYaml } from "./init-yaml.js";
import type { Io } from "./io.js";
import { packs } from "./packs.js";
import { environmentReportsText } from "./reports.js";
import {
  ignoredText,
  nameProblem,
  projectId,
  scaffoldFiles,
  writeScaffold,
  type Answers,
  type Content,
} from "./scaffold.js";
import { standardSource, templateSource } from "./sources.js";
import type { Template } from "./templates.js";

/** Asks one question; `check` explains an answer that is not valid, and the question is asked again. */
type Ask = (
  question: string,
  flag: string,
  fallback: string,
  check?: (answer: string) => string | undefined,
) => string;

/** Where the project comes from: a template, or a recipe with what composing it needs. */
interface Source {
  template: Template;
  done(): void;
  files?: Record<string, Content>;
  facts?: RecipeFacts;
}

/** Creates the project and shows its plan. Returns the exit code. */
export function init(options: Options, io: Io): number {
  const cleanups: (() => void)[] = [];
  try {
    checkFlags(options);
    const target = resolve(io.cwd, options.init.folder);
    const source: Source = options.init.template
      ? templateSource(options.init.template, io.cwd)
      : chooseProject(options.init, asker(options, io));
    cleanups.push(source.done);
    const answers = gather(options, io, source.template, target, cleanups);
    return create(options, io, target, source, answers);
  } catch (error) {
    io.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
}

/** The name, environments and standard: flags, else the defaults; nothing is asked. */
function gather(
  options: Options,
  io: Io,
  template: Template,
  target: string,
  cleanups: (() => void)[],
): Answers {
  const { init: flags } = options;
  const name = flags.name ?? projectId(basename(target));
  const environments =
    options.environments.length > 0
      ? options.environments
      : flags.template
        ? templateEnvironments(template)
        : ["dev", "prod"];
  // A template's own questions are never asked: --set answers them, else the default is written.
  const values = Object.fromEntries(
    template.questions.map((question) => [
      question.value,
      flags.set[question.value] ?? question.default,
    ]),
  );
  const answers: Answers = { name, environments, values };
  if (flags.standard) {
    const found = standardSource(flags.standard, io.cwd);
    cleanups.push(found.done);
    answers.standard = { file: found.file, source: found.source };
  }
  return answers;
}

/** The answer from the terminal, else the default with --yes, else an error naming the flag. */
function asker(options: Options, io: Io): Ask {
  return (question, flag, fallback, check) => {
    if (options.init.yes) return fallback;
    if (!io.ask) throw new Error(`Missing ${flag}. Pass it, or --yes to take the defaults.`);
    let prompt = question;
    for (;;) {
      const answer = io.ask(prompt)?.trim() || fallback;
      const problem = check?.(answer);
      if (!problem) return answer;
      prompt = `${problem}\n${question}`;
    }
  };
}

/** The project's files: the template's, composed, with the answers given as --set. */
function projectFiles(
  source: Source,
  answers: Answers,
  set: Options["init"]["set"],
  today: string,
) {
  const files = scaffoldFiles(source.template, answers, source.files);
  if (source.facts) {
    const { title } = source.template;
    composeRecipe(files, source.facts, { ...answers, project: answers.name, today });
    editYaml(files, "project.yaml", (document) => {
      const first = isMap(document.contents) ? document.contents.items[0]?.key : undefined;
      if (isScalar(first)) first.commentBefore = ` ${title}. README.md lists what to fill in.`;
    });
  }
  startToday(files, today);
  const asked = source.template.questions.map((question) => question.value);
  applySet(files, set, answers.environments, asked);
  return files;
}

/** The project's files and README.md, unless one is there, and every environment generated. */
function prepare(options: Options, io: Io, target: string, source: Source, answers: Answers) {
  const today = (io.now?.() ?? new Date()).toISOString().slice(0, 10);
  const files = projectFiles(source, answers, options.init.set, today);
  const generated = generateAll(memoryFiles(textOf(files)), packs, process.env);
  if (!generated.resolved)
    throw new Error(
      `The project does not resolve; nothing written.\n${environmentReportsText(generated.environmentReports)}`,
    );
  // README.md is the user's: one already there is kept, and the values are printed instead.
  const kept = existsSync(join(target, "README.md"));
  if (!kept) {
    const { title, summary } = source.template;
    const facts = { project: answers.name, title, summary, today, files, generated };
    files["README.md"] = projectReadme(facts);
  }
  return { files, generated, kept };
}

/** Writes the project, unless a file is in the way, then shows its plan. */
function create(
  options: Options,
  io: Io,
  target: string,
  source: Source,
  answers: Answers,
): number {
  const { files, generated, kept } = prepare(options, io, target, source, answers);
  const result = writeScaffold(target, files);
  const shown = relative(io.cwd, target) || ".";
  if ("clashes" in result) {
    const listed = result.clashes.map((path) => `  ${path}\n`).join("");
    io.write(`Nothing written: these files already exist in ${shown}:\n${listed}`);
    return 1;
  }
  const from = `${options.init.template ? "the template " : ""}${source.template.name}`;
  io.write(
    `Created ${shown} from ${from} (${result.written.length} files)${ignoredText(result.ignored)}.\n\n`,
  );
  const plan = { command: "plan" as const, environments: [], diffs: false };
  const where = { definitions: target, out: join(target, "build") };
  const code = generate({ ...options, ...plan, ...where }, io, packs, generated);
  io.write(stillToReplace(files, generated, kept));
  return code;
}

/** After the plan: how many values are still REPLACE_ME, and where they are listed. */
function stillToReplace(
  files: Record<string, Content>,
  generated: Generated,
  kept: boolean,
): string {
  const count = replaceMeCount(generated.environmentReports);
  if (count === 0) return "Nothing to replace: the project runs as written.\n";
  const values = count === 1 ? "1 value is" : `${count} values are`;
  if (!kept) return `${values} still REPLACE_ME: README.md lists each one and where to find it.\n`;
  const rows = replaceRows(files, generated).map(
    (row) =>
      `  ${row.name}  ${row.places.map((place) => `${place.file}:${place.line}`).join(", ")}${row.what ? `  ${row.what}` : ""}\n`,
  );
  return `${values} still REPLACE_ME (README.md was already there, so it is kept):\n${rows.join("")}`;
}

function textOf(files: Record<string, Content>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, content.toString()]),
  );
}

/** Names given as flags are checked before anything else happens. */
function checkFlags(options: Options): void {
  if (
    options.init.template &&
    (options.init.connector || options.init.via || options.init.connectivity)
  )
    throw new Error("Choose connection options or --template, not both.");
  const problem =
    (options.init.name !== undefined ? nameProblem(options.init.name, "project") : undefined) ??
    options.environments.map((name) => nameProblem(name, "environment")).find(Boolean);
  if (problem) throw new Error(problem);
}

function templateEnvironments(template: Template): string[] {
  const project = parse(readFileSync(join(template.folder, "project.yaml"), "utf8")) as {
    environments?: object;
  };
  return Object.keys(project.environments ?? { dev: {} });
}
