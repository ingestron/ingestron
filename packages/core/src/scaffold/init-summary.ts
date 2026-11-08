// What `init` prints after the plan: how many values are still REPLACE_ME, counted by name as
// README.md's rows are. When the folder's README.md is kept, init prints what it would have
// listed: each value with where to find it, the values to check and the secrets to create.
import type { Generated } from "../generation/index.js";
import { checkRows, replaceRows, secretRows } from "./init-rows.js";
import type { Content } from "./scaffold.js";

/** The lines after the plan. */
export function stillToReplace(
  files: Record<string, Content>,
  generated: Generated,
  kept: boolean,
): string {
  const rows = replaceRows(files, generated);
  if (rows.length === 0 && !kept) return "Nothing to replace: the project runs as written.\n";
  const values = rows.length === 1 ? "1 value is" : `${rows.length} values are`;
  if (!kept) return `${values} still REPLACE_ME: README.md lists each one and where to find it.\n`;
  const place = ({ file, line }: { file: string; line: number }) => `${file}:${line}`;
  const lines = [
    rows.length === 0
      ? "Nothing to replace: the project runs as written."
      : `${values} still REPLACE_ME (README.md was already there, so it is kept):`,
    ...rows.map(
      (row) =>
        `  ${row.name}  ${row.places.map(place).join(", ")}  ${row.what}\n    Where to find it: ${row.find}`,
    ),
    ...section(
      "Values to check, the example's own:",
      checkRows(files, generated).map(
        (row) =>
          `  ${row.name}  ${place(row.place)}  ${row.what}\n    Where to find it: ${row.find}`,
      ),
    ),
    ...section(
      "Secrets to create in the Key Vault:",
      secretRows(files).map((row) => `  ${row.name}  ${row.holds}`),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function section(heading: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [heading, ...lines];
}
