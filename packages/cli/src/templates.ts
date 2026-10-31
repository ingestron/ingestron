// Project templates: an ordinary project folder plus template.yaml, which
// says what to ask. Built-in templates are the samples' starters.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { templatesFolder } from "./samples.js";

/** One question; the answer becomes `values.<value>` in project.yaml. */
export interface Question {
  value: string;
  ask: string;
  default: string;
}

/** A template folder and what it asks. */
export interface Template {
  name: string;
  folder: string;
  title: string;
  summary: string;
  questions: Question[];
}

/** template.yaml's schema, for editors; `readTemplate` checks the same rules. */
export const templateSchema = {
  title: "Ingestron template",
  type: "object",
  additionalProperties: false,
  required: ["title", "summary"],
  properties: {
    title: { type: "string", description: "The template's name, as `ingestron init` lists it." },
    summary: { type: "string", description: "One sentence on what the template sets up." },
    questions: {
      type: "array",
      description:
        "What `ingestron init` asks; each answer becomes values.<value> in project.yaml.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "ask", "default"],
        properties: {
          value: {
            type: "string",
            pattern: "^[a-z_][a-z0-9_]*$",
            description: "The key in project.yaml values.",
          },
          ask: { type: "string", description: "The question, as the user sees it." },
          default: {
            type: "string",
            description: "The answer used with --yes or an empty answer.",
          },
        },
      },
    },
  },
};

/** Where this package's built-ins are. */
export const builtInFolder = templatesFolder;

/** Built-in templates: the starters, each named by its folder. */
export function builtInTemplates(): Template[] {
  return readdirSync(builtInFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(builtInFolder, entry.name, "template.yaml")))
    .map((entry) => readTemplate(join(builtInFolder, entry.name), entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads and checks `<folder>/template.yaml`; throws an Error with the reason. */
export function readTemplate(folder: string, name: string): Template {
  for (const required of ["template.yaml", "project.yaml"]) {
    const stat = lstatSync(join(folder, required), { throwIfNoEntry: false });
    if (!stat) throw new Error(`Template "${name}" has no ${required}.`);
    if (!stat.isFile()) throw new Error(`Template "${name}": ${required} is not a regular file.`);
  }
  return parseTemplate(readFileSync(join(folder, "template.yaml"), "utf8"), name, folder);
}

/** Checks template.yaml's text; throws an Error with the reason. */
export function parseTemplate(text: string, name: string, folder: string): Template {
  const data = parse(text) as Record<string, unknown>;
  const unknown = Object.keys(data ?? {}).find(
    (key) => !["title", "summary", "questions"].includes(key),
  );
  if (unknown) throw new Error(`template.yaml: unknown key "${unknown}".`);
  return {
    name,
    folder,
    title: String(data.title ?? name),
    summary: String(data.summary ?? ""),
    questions: questionsOf(data.questions),
  };
}

function questionsOf(value: unknown): Question[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("template.yaml: questions must be a list.");
  return value.map((item: Record<string, unknown>, index) => {
    const keys = ["value", "ask", "default"];
    if (!keys.every((key) => typeof item?.[key] === "string"))
      throw new Error(`template.yaml: question ${index + 1} needs "value", "ask" and "default".`);
    if (!/^[a-z_][a-z0-9_]*$/.test(String(item.value)))
      throw new Error(
        `template.yaml: question ${index + 1}'s value "${String(item.value)}" is not a valid name.`,
      );
    return { value: String(item.value), ask: String(item.ask), default: String(item.default) };
  });
}
