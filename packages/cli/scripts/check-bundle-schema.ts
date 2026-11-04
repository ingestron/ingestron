// Validates every example's bundle, build/databricks with a target per
// environment, against the bundle schema of the Databricks CLI you deploy
// with. The schema is not stored here because it belongs to the CLI version
// in use:
//   databricks bundle schema > bundle-schema.json
//   pnpm check:bundle bundle-schema.json
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { parse } from "yaml";
import { exampleOutputs } from "./examples.js";

const schemaPath = process.argv[2];
if (!schemaPath) {
  console.log("✗ usage: pnpm check:bundle <bundle-schema.json from `databricks bundle schema`>");
  process.exit(1);
}
const validate = new Ajv({ strict: false, allErrors: true }).compile(
  JSON.parse(readFileSync(schemaPath, "utf8")),
);
let failures = 0;
// Only examples whose standard lists the Databricks pack generate a bundle: build/databricks.
for (const { name, outputs } of exampleOutputs()) {
  const bundle = outputs.find((output) => output.name === "databricks");
  for (const [path, text] of Object.entries(bundle?.files ?? {}).filter(([path]) =>
    path.endsWith(".yml"),
  )) {
    const valid = validate(parse(text));
    if (!valid) failures += 1;
    console.log(
      `${valid ? "✓" : "✗"} ${name} ${path}${valid ? "" : `\n  ${JSON.stringify(validate.errors)}`}`,
    );
  }
}
process.exit(failures === 0 ? 0 : 1);
