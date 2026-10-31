// Runs `ingestron plan` on the retail example from an empty temporary folder.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@ingestron/cli";

const definitions = join(import.meta.dirname, "../../../../samples/starters/retail");
const cwd = mkdtempSync(join(tmpdir(), "ingestron-example-"));
const write = (text: string) => process.stdout.write(text);
run(["plan", "--env", "prod", "--no-diff", "--definitions", definitions], { cwd, write });
