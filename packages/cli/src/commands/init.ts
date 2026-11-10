// ingestron init: a new project from a connection, a template or a kit. It asks only what picks
// the project; every value it cannot know is REPLACE_ME, and README.md says what to write
// (spec/cli/projects.md). Without a terminal a missing choice is an error that names the flag.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import type { Options } from "../terminal/index.js";
import { generate } from "./generate.js";
import { chooseProject } from "./init-choice.js";
import { resolvedFiles, type Source } from "@ingestron/core/internal";
import { projectReadme } from "@ingestron/core/internal";
import { stillToReplace } from "@ingestron/core/internal";
import type { Io } from "../terminal/index.js";
import { packs } from "@ingestron/core";
import { environmentReportsText } from "@ingestron/core/internal";
import { nameProblem, projectId } from "@ingestron/core";
import { ignoredText, writeScaffold, type Answers } from "@ingestron/core/internal";
import { kitFiles, kitTemplate } from "@ingestron/core/internal";
import { kitSource, refuseNewer, standardSource, templateSource } from "./sources.js";

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
    const target = resolve(io.cwd, options.init.folder);
    const source: Source = options.init.kit
      ? kitProject(options, io, cleanups)
      : options.init.template
        ? templateSource(options.init.template, io.cwd)
        : chooseProject(options.init, asker(options, io));
    cleanups.push(source.done);
    const answers = gather(options, io, source, target, cleanups);
    return create(options, io, target, source, answers);
  } catch (error) {
    io.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
}

/**
 * The kit, and with connection options the route composed under it (spec/cli/projects.md,
 * "Kits"). Refuses a kit that needs another version of the CLI, or a route whose packs the kit
 * does not use.
 */
function kitProject(options: Options, io: Io, cleanups: (() => void)[]): Source {
  const { kit, done } = kitSource(options.init.kit!, io.cwd);
  cleanups.push(done);
  refuseNewer(kit);
  const { connector, via, connectivity } = options.init;
  if (!connector && !via && !connectivity)
    return { template: kitTemplate(kit), files: kitFiles(kit), kit, done: () => undefined };
  const recipe = chooseProject(options.init, asker(options, io));
  const needs = recipe.facts.route.packs;
  if (needs.some((pack) => !kit.packs.includes(pack)))
    throw new Error(
      `The kit ${kit.id} uses ${kit.packs.join(", ")}; the route ${recipe.facts.route.via} needs ${needs.join(", ")}.`,
    );
  const template = { ...recipe.template, summary: kit.summary };
  return { ...recipe, template, kit };
}

/** The name, environments and standard: flags, else the defaults; nothing is asked. */
function gather(
  options: Options,
  io: Io,
  source: Source,
  target: string,
  cleanups: (() => void)[],
): Answers {
  const { init: flags } = options;
  const { template } = source;
  const name = flags.name ?? projectId(basename(target));
  const environments =
    options.environments.length > 0
      ? options.environments
      : source.kit
        ? folderEnvironments(source.kit.folder)
        : flags.template
          ? folderEnvironments(template.folder)
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

/** The project's files and README.md, unless one is there, and every environment generated. */
function prepare(options: Options, io: Io, target: string, source: Source, answers: Answers) {
  const today = (io.now?.() ?? new Date()).toISOString().slice(0, 10);
  // README.md is the user's: one already there is kept, and the values are printed instead.
  const kept = existsSync(join(target, "README.md"));
  // A source option given with --set is written, so the answer has a place.
  const given = Object.keys(options.init.set).filter((name) => name.startsWith("option_"));
  const writing = { today, kept, keep: new Set(given.map((name) => name.slice("option_".length))) };
  const { files, generated } = resolvedFiles(options.init.set, source, answers, writing);
  if (!generated.resolved)
    throw new Error(
      `The project does not resolve; nothing written.\n${environmentReportsText(generated.environmentReports)}`,
    );
  if (!kept) {
    const { title, summary } = source.template;
    const kit = source.kit && `${source.kit.id}@${source.kit.version}`;
    const facts = { project: answers.name, title, summary, today, files, generated, kit };
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
  const from = createdFrom(options, source);
  io.write(
    `Created ${shown} from ${from} (${result.written.length} files)${ignoredText(result.ignored)}.\n\n`,
  );
  const plan = { command: "plan" as const, environments: [], diffs: false };
  const where = { definitions: target, out: join(target, "build") };
  const code = generate({ ...options, ...plan, ...where }, io, packs, generated);
  io.write(stillToReplace(files, generated, kept, source.kit !== undefined));
  return code;
}

/** What the project was created from, as `init` says it. */
function createdFrom(options: Options, source: Source): string {
  if (source.kit) {
    const kit = `the kit ${source.kit.id}@${source.kit.version}`;
    return source.facts ? `${kit} and ${source.template.name}` : kit;
  }
  return `${options.init.template ? "the template " : ""}${source.template.name}`;
}

/** Names given as flags are checked before anything else happens. */
function checkFlags(options: Options): void {
  checkSources(options.init);
  const problem =
    (options.init.name !== undefined ? nameProblem(options.init.name, "project") : undefined) ??
    options.environments.map((name) => nameProblem(name, "environment")).find(Boolean);
  if (problem) throw new Error(problem);
}

/** One of --kit, --template and --standard at most, and no connection options with --template. */
function checkSources({ kit, template, standard, connector, via, connectivity }: Options["init"]) {
  if (kit !== undefined && (template !== undefined || standard !== undefined))
    throw new Error("Choose --kit, --template or --standard, not two.");
  if (template && (connector || via || connectivity))
    throw new Error("Choose connection options or --template, not both.");
}

/** The environments of the project.yaml in a template's or a kit's folder. */
function folderEnvironments(folder: string): string[] {
  const project = parse(readFileSync(join(folder, "project.yaml"), "utf8")) as {
    environments?: object;
  };
  return Object.keys(project.environments ?? { dev: {} });
}
