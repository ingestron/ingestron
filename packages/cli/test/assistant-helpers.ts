// What the assistant command tests share: a temporary folder, the CLI run in it with a scripted
// terminal, a small project and the files under a folder.
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { run } from "../src/index.js";

export const temp = () => mkdtempSync(join(tmpdir(), "ingestron-assistant-"));

/** Runs the CLI in `cwd`; `answers` are the replies of a terminal. */
export function ingestron(cwd: string, args: string[], answers?: string[]) {
  let output = "";
  const asked: string[] = [];
  const queue = answers && [...answers];
  const code = run(args, {
    cwd,
    write: (text) => (output += text),
    now: () => new Date("2026-11-13T09:00:00Z"),
    ...(queue && {
      ask: (question: string) => {
        asked.push(question);
        return queue.shift();
      },
    }),
  });
  return { code, output, asked };
}

export const files = {
  "project.yaml": "id: local\nenvironments: { dev: {} }\nimports: ['*.yaml']\n",
  "standard.yaml": "apiVersion: ingestron.io/v1\nkind: Standard\nid: defaults\npacks: [duckdb@2]\n",
};

/** A project folder with the files above and any more. */
export function project(more: Record<string, string> = {}): string {
  const folder = temp();
  for (const [path, text] of Object.entries({ ...files, ...more })) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

export const read = (folder: string, path: string) => readFileSync(join(folder, path), "utf8");

/** Every file under a folder, as paths relative to it. */
export function listed(folder: string, under = folder): string[] {
  return readdirSync(under).flatMap((entry) => {
    const path = join(under, entry);
    return statSync(path).isDirectory() ? listed(folder, path) : [relative(folder, path)];
  });
}
