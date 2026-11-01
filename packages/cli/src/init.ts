// ingestron init: a new project from a connection or explicit template. Every answer comes from a
// flag, else the default with --yes, else a question; without a terminal a
// missing answer is an error that names the flag, never a wait.
import { readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import type { Options } from "./args.js";
import { chooseProject } from "./init-choice.js";
import { projectProblem } from "./init-preflight.js";
import type { Content } from "./scaffold.js";
import { generate } from "./generate.js";
import type { Io } from "./io.js";
import { nameProblem, projectId, scaffoldFiles, writeScaffold, type Answers } from "./scaffold.js";
import { standardSource, templateSource } from "./sources.js";
import { type Question, type Template } from "./templates.js";

/** Asks one question; `check` explains an answer that is not valid, and the question is asked again. */
type Ask = (
  question: string,
  flag: string,
  fallback: string,
  check?: (answer: string) => string | undefined,
) => string;

/** Creates the project and shows its plan. Returns the exit code. */
export function init(options: Options, io: Io): number {
  const cleanups: (() => void)[] = [];
  try {
    checkFlags(options);
    const ask = asker(options, io);
    const target = resolve(io.cwd, options.init.folder);
    const source: { template: Template; done(): void; files?: Record<string, Content> } = options
      .init.template
      ? templateSource(options.init.template, io.cwd)
      : chooseProject(options.init, ask);
    cleanups.push(source.done);
    const answers = gather(options, io, ask, source.template, target, cleanups);
    return create(options, io, target, source.template, answers, source.files);
  } catch (error) {
    io.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
}

function gather(
  options: Options,
  io: Io,
  ask: Ask,
  template: Template,
  target: string,
  cleanups: (() => void)[],
): Answers {
  const { init: flags } = options;
  const suggested = projectId(basename(target));
  const name =
    flags.name ??
    ask(`Project name [${suggested}]: `, "--name", suggested, (answer) =>
      nameProblem(answer, "project"),
    );
  const known = (flags.template ? templateEnvironments(template) : ["dev", "prod"]).join(", ");
  const environments =
    options.environments.length > 0
      ? options.environments
      : list(ask(`Environments [${known}]: `, "--env", known, environmentsProblem));
  // Optional: keeping the template's standard needs no answer.
  const standard =
    flags.standard ??
    (io.ask && !flags.yes
      ? ask(
          "Standard: a path or Git URL, or Enter to keep the supplied default: ",
          "--standard",
          "",
        )
      : "");
  const answers: Answers = { name, environments, values: {} };
  if (standard) {
    const found = standardSource(standard, io.cwd);
    cleanups.push(found.done);
    answers.standard = { file: found.file, source: found.source };
  }
  answers.values = values(flags.set, template, ask);
  return answers;
}

function values(set: Record<string, string>, template: Template, ask: Ask): Record<string, string> {
  const asked = template.questions.map((question) => question.value);
  const unknown = Object.keys(set).find((key) => !asked.includes(key));
  if (unknown)
    throw new Error(
      `The template asks no "${unknown}". It asks: ${asked.join(", ") || "nothing"}.`,
    );
  const answers: Record<string, string> = Object.fromEntries(
    template.questions.map((question) => [
      question.value,
      set[question.value] ??
        ask(
          `${question.ask} [${question.default}]: `,
          `--set ${question.value}=…`,
          question.default,
        ),
    ]),
  );
  return followed(template.questions, answers);
}

/** Answers left at their default that follow another answer's storage account. */
function followed(questions: Question[], answers: Record<string, string>): Record<string, string> {
  for (const question of questions) {
    const from =
      question.follows && questions.find((item) => item.value === question.follows!.from);
    if (!from || answers[question.value] !== question.default) continue;
    const root = /^abfss:\/\/([^@/]+)@([^/]+)/.exec(answers[from.value] ?? "");
    if (!root || answers[from.value] === from.default) continue;
    answers[question.value] = `abfss://${question.follows!.fileSystem ?? root[1]}@${root[2]}`;
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

/** Writes the project, unless a file is in the way, then shows its plan. */
function create(
  options: Options,
  io: Io,
  target: string,
  template: Template,
  answers: Answers,
  prepared?: Record<string, Content>,
): number {
  const files = scaffoldFiles(template, answers, prepared);
  const problem = projectProblem(files);
  if (problem) throw new Error(problem);
  const result = writeScaffold(target, files);
  const shown = relative(io.cwd, target) || ".";
  if ("clashes" in result) {
    const listed = result.clashes.map((path) => `  ${path}\n`).join("");
    io.write(`Nothing written: these files already exist in ${shown}:\n${listed}`);
    return 1;
  }
  io.write(
    `Created ${shown} from ${options.init.template ? "the template " : ""}${template.name} (${result.written.length} files).\n\n`,
  );
  const plan = {
    command: "plan" as const,
    environments: [],
    definitions: target,
    out: join(target, "build"),
    diffs: false,
  };
  return generate({ ...options, ...plan }, io);
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

function environmentsProblem(answer: string): string | undefined {
  return list(answer)
    .map((name) => nameProblem(name, "environment"))
    .find(Boolean);
}

function templateEnvironments(template: Template): string[] {
  const project = parse(readFileSync(join(template.folder, "project.yaml"), "utf8")) as {
    environments?: object;
  };
  return Object.keys(project.environments ?? { dev: {} });
}

function list(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
