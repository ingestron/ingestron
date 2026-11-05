// A new project's files before they are written: the template's, composed with REPLACE_ME,
// the defaults and the secret names, and the --set answers; resolved until it resolves
// (spec/cli/projects.md).
import { memoryFiles } from "@ingestron/config";
import { isMap, isScalar } from "yaml";
import type { Options } from "./args.js";
import { generateAll } from "./build-outputs.js";
import { composeRecipe, type RecipeFacts } from "./init-compose.js";
import { startToday } from "./init-platform.js";
import { applySet } from "./init-set.js";
import { editYaml } from "./init-yaml.js";
import { packs } from "./packs.js";
import { scaffoldFiles, type Answers, type Content } from "./scaffold.js";
import type { Template } from "./templates.js";

/** Where the project comes from: a template, or a recipe with what composing it needs. */
export interface Source {
  template: Template;
  done(): void;
  files?: Record<string, Content>;
  facts?: RecipeFacts;
}

/** What `init` writes, and how: the day, whether README.md is kept, the options to keep. */
export interface Writing {
  today: string;
  kept: boolean;
  keep: ReadonlySet<string>;
}

/** The project's files, the template's composed, with --set; and the text options left out. */
function projectFiles(
  source: Source,
  answers: Answers,
  set: Options["init"]["set"],
  writing: Writing,
) {
  const files = scaffoldFiles(source.template, answers, source.files);
  let leftOut: string[] = [];
  if (source.facts) {
    const { today, keep, kept } = writing;
    leftOut = composeRecipe(files, source.facts, {
      ...answers,
      project: answers.name,
      today,
      keep,
    });
    const title = `${source.template.title}.${kept ? "" : " README.md lists what to fill in."}`;
    editYaml(files, "project.yaml", (document) => {
      const first = isMap(document.contents) ? document.contents.items[0]?.key : undefined;
      if (isScalar(first)) first.commentBefore = ` ${title}`;
    });
  }
  startToday(files, writing.today);
  const asked = source.template.questions.map((question) => question.value);
  applySet(files, set, answers.environments, asked);
  return { files, leftOut };
}

/**
 * The project's files and every environment generated. A text source option is left out
 * unless the project does not resolve without it: then each, in turn, is written as
 * REPLACE_ME, until it resolves (spec/cli/projects.md).
 */
export function resolvedFiles(
  options: Options,
  source: Source,
  answers: Answers,
  writing: Writing,
) {
  let keep = writing.keep;
  for (;;) {
    const { files, leftOut } = projectFiles(source, answers, options.init.set, {
      ...writing,
      keep,
    });
    const generated = generateAll(memoryFiles(textOf(files)), packs, process.env);
    const next = leftOut.find((key) => !keep.has(key));
    if (generated.resolved || next === undefined) return { files, generated };
    keep = new Set([...keep, next]);
  }
}

function textOf(files: Record<string, Content>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, content.toString()]),
  );
}
