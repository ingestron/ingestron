// The guide's text (spec/cli/assistants.md, section 4): Markdown with LF line endings, made from the
// facts alone, so the same facts always give the same bytes.
import type { GuideFacts, GuideStandard } from "./facts.js";
import { columnsFileFields, sourceGuideHeading } from "../source-text.js";
import { beginMarker, endMarker } from "./markers.js";

/** The most names a list shows. */
const listed = 20;
/** The most fixed settings a standard has before the guide lists keys only. */
const valuesUpTo = 8;

/** A fact with each line ending and other control character (U+0000 to U+001F, U+007F) as a space. */
const safe = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, " ");

/**
 * A fact as a code span: with single backticks, or, when it holds a backtick, with a run of
 * backticks one longer than its longest run and a space on each side (CommonMark). A fact never
 * starts a line or ends the span early.
 */
const ticks = (text: string): string => {
  const fact = safe(text);
  if (!fact.includes("`")) return `\`${fact}\``;
  const longest = (fact.match(/`+/g) ?? []).reduce((most, run) => Math.max(most, run.length), 0);
  const fence = "`".repeat(longest + 1);
  return `${fence} ${fact} ${fence}`;
};

/** `` `a`, `b` ``, cut after 20 names with `, and <n> more`. */
function names(all: readonly string[]): string {
  const shown = all.slice(0, listed).map(ticks).join(", ");
  return all.length > listed ? `${shown}, and ${all.length - listed} more` : shown;
}

/** `` `a` ``, `` `a` and `b` ``, `` `a`, `b` and `c` ``. */
function joined(all: readonly string[]): string {
  const marked = all.map(ticks);
  if (marked.length <= 1) return marked.join("");
  return `${marked.slice(0, -1).join(", ")} and ${marked.at(-1)}`;
}

/**
 * The whole section for a project: both markers, LF line endings, ending in a line ending, with
 * the hash of its text in the end marker.
 * @internal
 */
export function guideSection(facts: GuideFacts): string {
  const connected = facts.connections.length > 0;
  const body = [
    beginMarker,
    "# Working on this Ingestron project",
    "",
    "This folder holds Ingestron definitions: YAML that generates the files the data platform deploys. Ingestron runs on this computer; it never connects to a source or a cloud.",
    "",
    "## This project",
    "",
    ...project(facts),
    "",
    "## Rules",
    "",
    ...rules(facts),
    "",
    ...(connected ? [...sourceMetadata(facts), ""] : []),
    "## Commands",
    "",
    ...commands(facts, connected),
  ];
  const text = body.join("\n") + "\n";
  return `${text}${endMarker(text)}\n`;
}

function project(facts: GuideFacts): string[] {
  const environments =
    facts.environments.length === 0
      ? "none"
      : facts.environments
          .map(({ name, runsOn }) =>
            runsOn === undefined ? ticks(name) : `${ticks(name)} (runs on ${ticks(runsOn)})`,
          )
          .join(", ");
  const { standard } = facts;
  const definitions = facts.imports.length === 0 ? "none" : facts.imports.map(ticks).join(", ");
  return [
    `- Project ${ticks(facts.project)}. Environments: ${environments} (\`project.yaml\`).`,
    standard === undefined
      ? "- No standard was found in the files project.yaml imports."
      : `- Standard ${ticks(standard.id)} in ${ticks(standard.file)}${origin(standard)}. Packs: ${standard.packs.length === 0 ? "none" : standard.packs.map(ticks).join(", ")}.`,
    `- Definitions: the files \`project.yaml\` imports: ${definitions}.`,
    `- Generated, one folder per pack: ${generated(facts)}.`,
  ];
}

/** What the standard says of where it came from, to follow its file. */
function origin(standard: GuideStandard): string {
  if (standard.origin !== undefined)
    return `, from the published standard ${ticks(standard.origin)}${standard.explained ? "; STANDARD.md explains its choices" : ""}`;
  return standard.from === undefined ? "" : `, from ${safe(standard.from)}`;
}

function generated(facts: GuideFacts): string {
  const items = [
    ...facts.outputs.map(({ folder, together }) => {
      if (together === undefined) return ticks(folder);
      return `${ticks(folder)} (${together ? "every environment together" : "a folder per environment"})`;
    }),
    ...(facts.products ? [`${ticks(`${facts.out}/products/`)} (data product passports)`] : []),
  ];
  return items.length === 0 ? "none yet" : items.join(", ");
}

/** A folder as a shell word: as it is when plain, else in single quotes. */
const shellWord = (text: string): string =>
  /^[A-Za-z0-9_./@%+=:,-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;

/** An `ingestron <word>` command as a code span, with `--out <out>` after the word unless `out` is `build`. */
function command(facts: GuideFacts, word: string): string {
  return ticks(
    facts.out === "build" ? `ingestron ${word}` : `ingestron ${word} --out ${shellWord(facts.out)}`,
  );
}

function rules(facts: GuideFacts): string[] {
  const out = `${facts.out}/`;
  const { standard } = facts;
  const runsOn = facts.environments.some((environment) => environment.runsOn !== undefined);
  return [
    `1. Change the definitions, never ${ticks(out)}. Ingestron records each generated file in \`.generated.json\` and reports a hand edit as a conflict.`,
    `2. After a change, run ${command(facts, "plan")}. Fix every problem it reports, then show the user the plan before running ${command(facts, "apply")}. Then ${command(facts, "check")} must pass; CI should run it.`,
    `3. Work inside the standard. Do not edit ${standard === undefined ? "the standard file" : ticks(standard.file)} to clear a problem; tell the user what the platform team would need to change.`,
    ...(standard === undefined ? [] : standardItems(standard)),
    "4. A value written `REPLACE_ME` is one only a person can give. Ask the user for it; never invent one. `ingestron check` fails while any is left.",
    "5. Look settings up; do not guess. Each method's settings, types and defaults: https://docs.ingestron.io/docs/reference/packs, or run `ingestron schemas` and read `.ingestron/schemas/`. Error codes: https://docs.ingestron.io/docs/reference/errors.",
    "6. Never write a password, token, key or connection string in any file. Use `${secret:name}` for a credential.",
    envvarRule(facts),
    `8. Environments differ only in values, under \`environments.<name>.values\` in \`project.yaml\`${runsOn ? ", and in `runs-on`" : ""}. \`plan\`, \`apply\` and \`check\` always cover every environment; \`ingestron compare --env <a> --env <b>\` shows what differs.`,
  ];
}

/** The items under rule 3: what the standard allows and fixes. */
function standardItems(standard: GuideStandard): string[] {
  const count = standard.fixed.reduce((total, { settings }) => total + settings.length, 0);
  const keysOnly = count > valuesUpTo;
  return [
    ...standard.allowed.map(
      ({ action, methods }) => `   - ${ticks(action)} allows ${methods.map(ticks).join(", ")}.`,
    ),
    ...standard.fixed.map(({ action, method, settings }) => {
      const items = settings.map(([key, value]) => ticks(keysOnly ? key : `${key}: ${value}`));
      return `   - ${ticks(action)} fixes, for ${ticks(method)}: ${items.join(", ")}.`;
    }),
    ...(standard.fixedIntent.length === 0
      ? []
      : [`   - Fixed for every table: ${standard.fixedIntent.map(ticks).join(", ")}.`]),
  ];
}

/** Rule 7: what the `${envvar:…}` references are, and which this project uses. */
function envvarRule(facts: GuideFacts): string {
  const deployed = facts.outputs.filter(({ id }) => id !== "duckdb").map(({ name }) => name);
  const duckdb = facts.outputs.some(({ id }) => id === "duckdb");
  const deploy =
    deployed.length === 0
      ? ""
      : ` The ${joined(deployed)} output keeps them as values the deploying pipeline supplies.`;
  const local = duckdb
    ? " DuckDB reads them from the environment or the project's `.env` files when it runs."
    : "";
  const used = facts.envvars.length === 0 ? " none" : `: ${names(facts.envvars)}`;
  return `7. Values written \`\${envvar:NAME}\` are not secrets.${deploy}${local} Do not read, print or commit \`.env\` files. \`ingestron request\` lists the values each environment needs. This project uses${used}.`;
}

function sourceMetadata(facts: GuideFacts): string[] {
  return [
    sourceGuideHeading,
    "",
    `- Connections: ${names(facts.connections)}. Each one's source tables are described in \`sources/<connection>.yaml\`, which \`ingestron source import\` writes. Never edit that file: import again to replace it.`,
    "- `ingestron source request` says what to run or export at each source, and where to save it under `sources/`.",
    "- A flow table needs a contract only where a person must say something the source cannot. `ingestron contract --from-metadata --needed` drafts the missing ones, for the user to review.",
    "",
    "When the user gives you material no reader takes (a vendor's data dictionary, a spreadsheet, a PDF, inconsistent or deeply nested API responses, a description in an email), turn it into a columns file saved as `sources/<connection>.assistant.csv`:",
    "",
    `- One row for each column, with these fields in order: ${columnsFileFields}.`,
    "- Keep every table and column the material shows, custom ones included.",
    "- Write a type you are unsure of as `string`, and never invent a key.",
    "- Never copy a value from a row of data.",
    "- Run `ingestron source import <connection> sources/<connection>.assistant.csv --dry-run` and fix what it reports before saying you are done.",
  ];
}

function commands(facts: GuideFacts, connected: boolean): string[] {
  const out = ticks(`${facts.out}/`);
  return [
    `- ${command(facts, "plan")}: problems and changes, with diffs. Writes nothing.`,
    `- ${command(facts, "apply")}: writes ${out}; never overwrites a hand edit.`,
    `- ${command(facts, "check")}: fails when ${out} is out of date. Writes nothing.`,
    "- `ingestron compare --env <a> --env <b>`: what differs after resolving.",
    "- `ingestron request --env <name>`: what the platform team must provide.",
    "- `ingestron contract <sample>`: drafts a contract from a CSV or JSON sample.",
    ...(connected
      ? [
          "- `ingestron source request`: what to ask each source's owners for.",
          "- `ingestron source import <connection> <file> --dry-run`: what a file of source metadata would change.",
        ]
      : []),
  ];
}
