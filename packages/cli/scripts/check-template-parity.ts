// Renders every SQL file of every example with liquidjs and with
// python-liquid, and fails when any differs, so a Python implementation of
// this pack can use the same templates. Needs a Python with python-liquid:
//   PYTHON_LIQUID=/path/to/python pnpm check:parity
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { sqlFile, tableSql, templatesFolder } from "@ingestron/pack-databricks/sql";
import { exampleModels } from "./examples.js";

const python = process.env.PYTHON_LIQUID;
if (!python) {
  console.log("✗ set PYTHON_LIQUID to a Python interpreter with python-liquid installed");
  process.exit(1);
}
let differences = 0;
const script = join(import.meta.dirname, "render_templates.py");
for (const { name, model } of exampleModels()) {
  // Tables written by managed connectors have no SQL file.
  const tables = model.tables.filter((table) => table.store);
  const files = tables.map((table) => sqlFile(table, `header for ${table.name}`));
  const output = JSON.parse(
    execFileSync(python, ["-I", script, templatesFolder], {
      input: JSON.stringify(files),
      encoding: "utf8",
    }),
  ) as string[];
  tables.forEach((table, index) => {
    const same = tableSql(table, `header for ${table.name}`) === output[index];
    if (!same) differences += 1;
    console.log(`${same ? "✓" : "✗"} ${name} ${table.name} (${files[index]?.template})`);
  });
}
process.exit(differences === 0 ? 0 : 1);
