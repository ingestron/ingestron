# The project guide for coding assistants

A project can carry a guide that tells a coding assistant how to work in it:
what the project is, what it may and may not change, and which commands to
run. `ingestron init --assistant` and `ingestron assistant add` write it, and
`plan` and `apply` keep it current. The guide is Markdown that Ingestron
writes from the project's own files. It runs on this computer, calls no
service and never reads a secret.

This page says:

1. the names a person gives, and the mistakes they can make;
2. which files each name writes;
3. the section Ingestron owns in `AGENTS.md`, and how a file's state is told;
4. the guide's text, and the facts it is written from;
5. writing the files (`init` and `assistant add`);
6. how `plan` and `apply` keep the section current;
7. the conformance cases.

The key words MUST, MUST NOT and MAY are used as in RFC 2119. Every path on
this page is relative to the project's folder: the folder `--definitions`
names, or the folder `init` creates.

## 1. Names

The names are `copilot`, `claude`, `codex`, `cursor`, `agents` and `none`.
`none` is the default.

- `--assistant` takes a comma-separated list, or is repeated. `assistant add`
  takes one or more names, each argument comma-separated.
- An unknown name is a usage mistake (exit 2):
  `Unknown assistant "<name>". Choose from copilot, claude, codex, cursor, agents or none.`
- `none` with another name is a usage mistake (exit 2):
  `"none" cannot be given with another assistant.`
- `assistant add` with no names, or with `none`, is a usage mistake (exit 2):
  `assistant add needs one or more of copilot, claude, codex, cursor or agents.`
- `assistant` with no sub-command is a usage mistake (exit 2):
  `assistant needs add <names>.`
- Duplicates are kept once. The names are taken in the order of the first
  paragraph of this section.

## 2. Files per name

Every name writes `AGENTS.md`, which holds the guide (section 3). Some names
write one more file:

| Name      | Files                             | Why                                                                          |
| --------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `copilot` | `.github/copilot-instructions.md` | Some tools read this file and not `AGENTS.md`.                               |
| `claude`  | `CLAUDE.md`                       | It imports `AGENTS.md`, so the guide is read whatever else the folder holds. |
| `codex`   | none more                         | `AGENTS.md` is read where it is.                                             |
| `cursor`  | none more                         | `AGENTS.md` is read where it is.                                             |
| `agents`  | none more                         | Any other tool that reads `AGENTS.md`.                                       |

`CLAUDE.md` holds exactly this text, two lines, each ending in LF:

```text
<!-- Ingestron: the project guide is in AGENTS.md. -->
@AGENTS.md
```

`.github/copilot-instructions.md` holds exactly this text, each line ending in
LF. It holds no fact about the project, and names no folder or command option,
so it never goes stale and never conflicts with `AGENTS.md`:

```text
See [AGENTS.md](../AGENTS.md) for this Ingestron project.

- Change the definitions, never the generated files: Ingestron reports a hand edit there as a conflict.
- After a change, follow AGENTS.md: run its plan command, fix every problem it reports, and show the user the plan before applying. Its check command must then pass.
- Never write a password, token, key or connection string in any file. Use `${secret:name}` for a credential.
```

No other file is written: no rules, prompts or skills folder, and
`.gitignore` is unchanged, so every file is committed and the team shares it.

## 3. The section

Ingestron owns one section of `AGENTS.md`. The rest of the file is the user's.

The section starts with the begin-marker line

```text
<!-- ingestron:begin guide 1. Ingestron writes this section and `ingestron apply` keeps it current. Write your own notes outside it, or delete both markers to make it yours. -->
```

and ends with the end-marker line

```text
<!-- ingestron:end sha256:<hex> -->
```

`<hex>` is the lower-case SHA-256 of the section from the start of the
begin-marker line to the end of the line before the end marker, with CRLF read
as LF, in UTF-8. The end of that last line is its LF. The hash of the text
written is the hash recorded; it is never a hash of anything else.

**The state of a file.** A marker line is a line that starts
`<!-- ingestron:begin` or `<!-- ingestron:end`, read without a trailing CR. A
file is in one of these states:

- **The user's**: it has no marker line.
- **Holding an Ingestron section**: it has exactly one marker line that starts
  `<!-- ingestron:begin guide `, and, after it, exactly one marker line that
  matches `^<!-- ingestron:end sha256:[0-9a-f]{64} -->$`, and no other marker
  line.
- **Edited by hand**: any other arrangement of either marker (two begin
  markers, an end marker before the begin marker, an end marker without a
  hash, or a begin marker alone), or a section whose recorded hash is not the
  hash of its text.

A file that holds a section is **current** when the hash matches and its text
is the section this page says is written now, **stale** when the hash matches
and the text differs, and edited by hand when the hash does not match. The text
of a section is always hashed and compared with CRLF read as LF, so a file's
line endings never make a section stale.

**Line endings.** A file's line ending is decided by its first line: CRLF when
the first line ends with CRLF, else LF (and LF for a file with no line ending).
Whatever Ingestron appends or rewrites in a file is written in that line
ending. The guide itself (section 4) is generated with LF.

## 4. The guide's text

The section is LF-only Markdown with no hard wrapping. Its parts, in this
order, are below. Text in `<…>` is filled in; a part marked as conditional is
left out, with its blank line, when its condition is not met.

<!-- prettier-ignore -->
````markdown
<!-- ingestron:begin guide 1. Ingestron writes this section and `ingestron apply` keeps it current. Write your own notes outside it, or delete both markers to make it yours. -->
# Working on this Ingestron project

This folder holds Ingestron definitions: YAML that generates the files the data platform deploys. Ingestron runs on this computer; it never connects to a source or a cloud.

## This project

- Project `<id>`. Environments: `<a>`, `<b>` (`project.yaml`).
- Standard `<id>` in `<file>`<origin>. Packs: `<pack>`, `<pack>`.
- Definitions: the files `project.yaml` imports: `<pattern>`, `<pattern>`.
- Generated, one folder per pack: `<out>/<pack>/` (every environment together), `<out>/<pack>/` (a folder per environment).

## Rules

1. Change the definitions, never `<out>/`. Ingestron records each generated file in `.generated.json` and reports a hand edit as a conflict.
2. After a change, run `ingestron plan`. Fix every problem it reports, then show the user the plan before running `ingestron apply`. Then `ingestron check` must pass; CI should run it.
3. Work inside the standard. Do not edit `<standard file>` to clear a problem; tell the user what the platform team would need to change.
   - `<action>` allows `<m>`, `<m>`.
   - `<action>` fixes, for `<method>`: `<key>: <value>`, `<key>: <value>`.
   - Fixed for every table: `<key>`, `<key>`.
4. A value written `REPLACE_ME` is one only a person can give. Ask the user for it; never invent one. `ingestron check` fails while any is left.
5. Look settings up; do not guess. Each method's settings, types and defaults: https://docs.ingestron.io/docs/reference/packs, or run `ingestron schemas` and read `.ingestron/schemas/`. Error codes: https://docs.ingestron.io/docs/reference/errors.
6. Never write a password, token, key or connection string in any file. Use `${secret:name}` for a credential.
7. Values written `${envvar:NAME}` are not secrets.<deploy><duckdb> Do not read, print or commit `.env` files. `ingestron request` lists the values each environment needs. This project uses: `<NAME>`, `<NAME>`.
8. Environments differ only in values, under `environments.<name>.values` in `project.yaml`<, and in `runs-on`>. `plan`, `apply` and `check` always cover every environment; `ingestron compare --env <a> --env <b>` shows what differs.

## Source metadata

- Connections: `<id>`, `<id>`. Each one's source tables are described in `sources/<connection>.yaml`, which `ingestron source import` writes. Never edit that file: import again to replace it.
- `ingestron source request` says what to run or export at each source, and where to save it under `sources/`.
- A flow table needs a contract only where a person must say something the source cannot. `ingestron contract --from-metadata --needed` drafts the missing ones, for the user to review.

When the user gives you material no reader takes (a vendor's data dictionary, a spreadsheet, a PDF, inconsistent or deeply nested API responses, a description in an email), turn it into a columns file saved as `sources/<connection>.assistant.csv`:

- One row for each column, with these fields in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key).
- Keep every table and column the material shows, custom ones included.
- Write a type you are unsure of as `string`, and never invent a key.
- Never copy a value from a row of data.
- Run `ingestron source import <connection> sources/<connection>.assistant.csv --dry-run` and fix what it reports before saying you are done.

## Commands

- `ingestron plan`: problems and changes, with diffs. Writes nothing.
- `ingestron apply`: writes `<out>/`; never overwrites a hand edit.
- `ingestron check`: fails when `<out>/` is out of date. Writes nothing.
- `ingestron compare --env <a> --env <b>`: what differs after resolving.
- `ingestron request --env <name>`: what the platform team must provide.
- `ingestron contract <sample>`: drafts a contract from a CSV or JSON sample.
- `ingestron source request`: what to ask each source's owners for.
- `ingestron source import <connection> <file> --dry-run`: what a file of source metadata would change.
<!-- ingestron:end sha256:<hex> -->
````

`## Source metadata` and the last two items of `## Commands` are conditional:
they are there only when at least one `Connection` document is imported.
Blocks are separated by one blank line, a list's items are on consecutive
lines, and the end marker follows the last line with no blank line between.
The numbered rules and the items under rule 3 are written as shown, with the
items indented three spaces.

Some `<…>` stay literal in the guide, as written above: in rule 8, `<a>`,
`<b>` and `<name>`; in `## Commands`, `<a>`, `<b>`, `<name>`, `<sample>`,
`<connection>` and `<file>`; and in `## Source metadata`, `<connection>`. Every
other `<…>` is filled in.

### This project

- **Environments.** The environments of `project.yaml`, in its order, each
  written `` `<name>` `` (a number name as the file writes it). An environment
  with `runs-on` is written `` `<name>` (runs on `<pack>`) ``, with the pack
  as `project.yaml` gives it. With no environments the line is
  ``- Project `<id>`. Environments: none (`project.yaml`).``
- **The standard line.** The standard is the first `Standard` document among
  the imported files. The files are the union of those the patterns of
  `imports` match, each once, in the order of a JavaScript string sort of their
  paths (UTF-16 code units, which is code-point order except for characters
  outside the Basic Multilingual Plane), as the definitions loader orders them
  (config specification, section 2), whatever the order of the patterns. Its
  line is
  ``- Standard `<id>` in `<file>`<origin>. Packs: `<pack>`, `<pack>`.``, with
  `<file>` its path, and the packs as its `packs` field writes them.
  `<origin>` is, in this order of preference:
  - when the standard has `origin`, ``, from the published standard `<origin.standard>@<origin.version>` ``,
    then, when the project has a `STANDARD.md`,
    `; STANDARD.md explains its choices`;
  - else, when the first line of the standard's file starts `# From `, `, from `
    and the rest of that line, with its surrounding spaces removed;
  - else nothing.

  When the standard lists no packs the line ends `Packs: none.`. Without a
  standard document the line is
  `- No standard was found in the files project.yaml imports.`

- **Definitions.** The patterns of `imports`, as written, in order. With none,
  ``- Definitions: the files `project.yaml` imports: none.``
- **Generated.** The packs are the standard's `packs`, then any `runs-on` pack
  not already among them. The second part matters only for a project the
  definitions reject, since a `runs-on` pack MUST be one of the standard's
  packs (`UNKNOWN_PACK`) and the guide is read without resolving. A pack's id is
  what precedes `@`. For each pack, in that order, an item is written
  `` `<out>/<pack id>/` ``, followed by
  ` (every environment together)` for a pack that builds environments
  together (the pack has `buildEnvironments`: `databricks`, `adf` and `synapse`
  do) or ` (a folder per environment)` for one that does not (`duckdb` does
  not). A pack the CLI does not have is written
  `` `<out>/<pack id>/` `` with no parenthesis. When the project imports a
  `DataProduct` document, `` `<out>/products/` (data product passports)``
  follows the packs. The items are joined with `, `. With no item the line
  reads `- Generated, one folder per pack: none yet.`

### The rules

Rule 3 is written as the first two sentences alone when the project has no
standard document, and with the items when it has. With no standard it reads
exactly:

```text
3. Work inside the standard. Do not edit the standard file to clear a problem; tell the user what the platform team would need to change.
```

The items are, in this order:

1. ``- `<action>` allows `<m>`, `<m>`.`` for each action of the standard that
   has `allowed`, with each method as written. The actions are exactly
   `ingest`, `transform`, `store` and `serve`, in that order: no other top-level
   key of the standard counts as an action, even with `allowed` or `fixed`. The
   methods of an action are in the order the standard writes them.
2. ``- `<action>` fixes, for `<method>`: `<key>: <value>`, `<key>: <value>`.``
   for each `<action>.fixed.<method>` that has keys, the actions in the order
   of item 1 and the methods in the order the standard writes them, a key as
   written (a number key as the file writes it: `1.0`, `0x10`). A value is
   written as YAML flow text, on one line: a number as the file writes it
   (`1.50`, `1e3` and `0x1F` stay as they are), `true`, `false` and `null` as
   they are, a string bare when it is made of letters, digits and
   `_ . / @ : -`, starts with a letter or digit and is not read as another
   type (`true`, `false`, `null`, `~`, a number) and otherwise as a JSON
   string, a list `[a, b]`, and a mapping `{ key: value, key: value }`, with
   `[]` and `{}` for an empty one. A key of a mapping inside a value is
   written as a value is, so a number key stays a number and a mapping key is
   written as a mapping. When
   the standard fixes more than eight settings in total, counting each key of
   each `<action>.fixed.<method>`, every such item lists keys only:
   ``- `<action>` fixes, for `<method>`: `<key>`, `<key>`.``
3. ``- Fixed for every table: `<key>`, `<key>`.`` for the keys of the
   standard's top-level `fixed`, when it has any.

Rule 8 has one sentence that depends on the environments: when at least one
environment has `runs-on`, its first sentence reads ``Environments differ only
in values, under `environments.<name>.values` in `project.yaml`, and in
`runs-on`.``; otherwise it is as shown above. The part of the template
written ``<, and in `runs-on`>`` is that part.

Rule 7 has two sentences that depend on the packs:

- When any pack of the generated list other than `duckdb` is used, the
  `<deploy>` is
  `` The `<pack>@<v>` and `<pack>@<v>` output keeps them as values the deploying pipeline supplies.``,
  with a space before `The`. It names those packs as the standard writes them
  (`<id>@<version>`), or by id for a `runs-on` pack the standard does not
  list. One pack is written alone, and three or more as `` `a`, `b` and `c` ``.
- When `duckdb` is used, as a pack or through `runs-on`, the `<duckdb>` is
  `` DuckDB reads them from the environment or the project's `.env` files when it runs.``,
  with a space before `DuckDB`.

With neither, both are left out. The names at the end of rule 7 are the
`${envvar:…}` names the project's files hold (below); with none, the sentence
is `This project uses none.`

### Lists, and where the facts come from

- The lists of connections and of `${envvar:…}` names are in code-point
  order, at most 20 each. A longer list is cut after 20 and ends
  `, and <n> more`, with `<n>` the number left out: `` `a`, `b`, and 3 more``.
- `<out>` is the output folder relative to the project folder, with `/`
  separators: `build` unless `--out` names another. When `<out>` is not
  `build`, every `ingestron plan`, `ingestron apply` and `ingestron check` the
  guide writes (in rule 2 and in `## Commands`) gains ` --out <out>` directly
  after the command word, such as `ingestron plan --out dist`. With `build`
  the text is as shown above. A `<out>` that holds anything but letters,
  digits and `_ . / @ % + = : , -` is written in single quotes, each `'` in
  it as `'\''`, so the command still runs in a shell, such as
  `ingestron plan --out 'my out'`. Wherever the guide names the folder as a
  place (`` `my out/` ``) it is written as it is, with no quotes.
- Facts are made safe before they are written. Each CR, LF or other control
  character (U+0000 to U+001F, U+007F) in a fact is replaced by a space. A
  fact that holds a backtick is written as a CommonMark code span whose
  delimiter is a run of backticks one longer than the longest run of
  backticks in the fact, with a space on each side: ``` `` a`b `` ``` for one
  backtick, and ` ``` a``b ``` ` for two in a row. So a fact never
  starts a line, never ends a code span early and never makes a marker line.
- The facts are read from `project.yaml` and the files its `imports` match,
  as YAML, without resolving. A file that does not parse is skipped. The
  `${envvar:NAME}` names are found in the text of those files, as the
  pattern `\$\{envvar:([A-Za-z_][A-Za-z0-9_]*)\}` matches them, each once.
  No other file is read: in particular a `.env` file is never read, and no
  value from the environment or from one appears in any file written.
- When `project.yaml` does not parse as YAML, is not a mapping, cannot be
  read, or has no `id` that is a string, there is no guide (section 5 gives the
  two messages). A folder of the project that cannot be listed is as if
  `project.yaml` could not be read.
- The same facts always give the same bytes. The lists of connections and
  names are capped, and fixed settings are listed by key alone above eight, so
  that the section stays small; this is not a limit the text promises.
- No tool is named in the guide, so one text serves every name.

## 5. Writing

`init` and `assistant add` write the files of section 2 for the names given,
in the order `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`.
Nothing else is ever replaced. `.gitignore` is unchanged. Each file prints one
line, from this closed set:

| Line                                                                                                                                                     | When                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<file>: written`                                                                                                                                        | The file is new (or empty, and holds only the new text).                                                                                                  |
| `AGENTS.md: added the Ingestron section`                                                                                                                 | `AGENTS.md` exists and is the user's.                                                                                                                     |
| `AGENTS.md: updated the Ingestron section`                                                                                                               | `AGENTS.md` holds a stale section.                                                                                                                        |
| `<file>: up to date`                                                                                                                                     | The file already has what would be written.                                                                                                               |
| `CLAUDE.md: added @AGENTS.md`                                                                                                                            | `CLAUDE.md` exists and has no line `@AGENTS.md`.                                                                                                          |
| `.github/copilot-instructions.md: added the link to AGENTS.md`                                                                                           | `.github/copilot-instructions.md` exists and has no line equal to the first line of its text (section 2).                                                 |
| `AGENTS.md: the Ingestron section was edited by hand, so it was not updated. Move your notes outside it, or delete both markers to keep it as your own.` | `AGENTS.md` is edited by hand.                                                                                                                            |
| `<file>: not a regular file, so nothing was written to it.`                                                                                              | The path is a symbolic link, a folder or anything else that is not a regular file, or a parent of it is not a folder, or the file went missing meanwhile. |
| `<file>: could not be read (<code>), so nothing was written to it.`                                                                                      | The file cannot be read (a mode that denies it, say). `<code>` is the error's `code`, such as `EACCES`, or `error` when it has none.                      |
| `<file>: could not be written (<code>).`                                                                                                                 | The file or its folder cannot be written, with `<code>` as above. The original is left as it was.                                                         |
| `No guide: project.yaml cannot be read.`                                                                                                                 | `project.yaml` does not parse as YAML, is not a mapping, or cannot be read; nothing is written.                                                           |
| `No guide: project.yaml has no id.`                                                                                                                      | `project.yaml` parses but has no `id` that is a string; nothing is written.                                                                               |

- A new section is appended to an existing user's `AGENTS.md` after one blank
  line, in the file's line ending (section 3: decided by its first line). A
  file that does not end with a line ending gets one first. Everything
  already in the file stays byte for byte. A stale section is replaced in
  place, from the start of its begin-marker line to the end of its end-marker
  line, in the file's line ending, and the rest of the file stays byte for
  byte.
- `CLAUDE.md` gets its two lines appended, each on a line of its own, in the
  file's line endings. `.github/copilot-instructions.md` gets its whole text
  appended after one blank line. A new `.github` folder is made only when
  there is none.
- An `AGENTS.md` that is edited by hand is left as it is, and the line says
  so. The other files are still written.
- A file that is not a regular file is left as it is, and the other files are
  still written.
- Each file's line is printed as soon as that file is done, in the order
  above, so a failure on a later file never hides an earlier line.
- A file that cannot be read or written prints its line (`could not be read`
  or `could not be written`) and the command moves on to the next file.
  Nothing is thrown out of the command. `<code>` is the error's `code`, or
  `error` when it has none.
- An existing file is rewritten safely: the new text is written to a
  temporary file in the same folder, named `.<name>.<random>.tmp` and created
  with `O_CREAT|O_EXCL`, which is given the original file's mode and renamed
  over the target. Just before the rename the target is looked at again
  without following a link, and it is replaced only if it is still a regular
  file. A file the user cannot write to is not replaced. A write that fails
  leaves the original as it was and removes the temporary file. A new file is
  created with `O_CREAT|O_EXCL` directly.

**`init`.** `init --assistant <names>` writes the files after the project's
files and before its plan: it prints each file's line directly after its
`Created …` line, before the blank line that precedes the plan. None of these lines changes
`init`'s exit code. With a terminal, and neither `--assistant` nor `--yes`, it
asks last, after every other question:

```text
AI assistant files (copilot, claude, codex, cursor, agents or none) [none]:
```

with a space after the colon. An empty answer is `none`. A wrong answer is
asked again, after the mistake's text (section 1). Without a terminal, or
with `--yes`, and without `--assistant`, nothing is written and nothing is
asked.

**`assistant add <names>`.** It takes `--definitions <dir>`, the project's
folder (default `.`), and `--out <dir>`, the output folder (default `build`),
resolved against the working folder as `plan` resolves it. It needs
`project.yaml` in the project folder: without it, `No project.yaml in <folder>.`
and exit 1, with `<folder>` the project folder relative to the working folder,
with `/` separators, and `.` when it is the working folder. It prints each
file's line. It exits 1 when there is no guide (nothing is written, and the
line says why), when any file was not a regular file, or when any file printed
`could not be read` or `could not be written`, and 0 otherwise, an edited
section included. It is idempotent: run again, it prints
`<file>: up to date` for every file it wrote.

`<out>` in the guide (section 4) is the folder `--out` names, written relative
to the project folder with `/` separators.

## 6. Keeping it current

`plan` and `apply` look at `AGENTS.md` after their output folders: after
everything they print for those folders, including the closing lines, and as
the last lines. The section they compare with is the one section 4 writes
from the project as it is now, with `<out>` the folder given by `--out`.

- `plan` prints `AGENTS.md: the Ingestron section would change` when the
  section is stale. When it is edited by hand it prints
  `AGENTS.md: the Ingestron section was edited by hand, so apply will not update it. Move your notes outside it, or delete both markers to keep it as your own.`
  It writes nothing.
- `apply` rewrites a stale section (`AGENTS.md: updated the Ingestron section`),
  and prints the line of section 5 for an edited one. It rewrites nothing else
  in the file.
- Both say nothing when there is no `AGENTS.md`, when the file is the user's,
  when it is not a regular file, when the section is current, or when there is
  no guide.
- They act whether the definitions resolve or not, as the guide reads its
  facts without resolving. A pack that cannot be loaded comes first: as for
  every command ([output folders](outputs.md), section 4), `PACK_LOAD` is the
  whole output, nothing is read or written, and the exit code is 2.
- A section is current, stale or edited by the rules of section 3, so a file
  with CRLF line endings that holds a current section is neither reported nor
  rewritten.
- The guide never changes either command's exit code.
- `check` never looks at it: neither a build nor CI fails over a guide.
- Neither `CLAUDE.md` nor `.github/copilot-instructions.md` is read or
  rewritten: they hold no facts.

The source request offers one more alternative when the project's `AGENTS.md`
holds an Ingestron section that has the `## Source metadata` part: the
[source metadata specification](sources.md), section 4, gives the rule and the
item's text.

## 7. Conformance

Each case in [conformance/assistants/](conformance/assistants/) is a YAML file,
in the format of the [output folder cases](outputs.md#8-conformance), with these
changes:

```yaml
description: What the case shows
files: # the project, path → text; a stand-in for the files already there
  project.yaml: |
    …
envvars: { NAME: value } # optional; the host environment
command: assistant # init, assistant, plan, apply or check
args: [add, agents] # optional; more arguments
expect:
  exit: 0
  lines: # optional; lines the output has, in this order, others between them allowed
    - "AGENTS.md: written"
  contains: # optional; path → texts the file has after the command
    AGENTS.md:
      - "- Project `retail`."
  absent: # optional; path → texts the file does not have, or ~: the file does not exist
    CLAUDE.md: ~
  block: # optional; lines the output has one directly after another, in this order
    - "Created local from the template duckdb (12 files)."
    - "AGENTS.md: written"
  absentLines: # optional; texts that no line of the output contains
    - "AGENTS.md"
  unchanged: # optional; paths whose bytes are as `files` gave them
    - AGENTS.md
```

Every case runs in a folder that is both the working folder and the project
folder: the case's `files` are written there first, and the command runs with
`--definitions .`, and `--out build` for the commands that take it. A case with
the command `assistant` or `init` uses the CLI's real packs (`databricks`, `adf`,
`synapse` and `duckdb`). A case with the command `plan`, `apply` or `check`
uses the data-only packs and stand-in builds of the output folder cases, so that
`fold` builds environments together and `local` does not. For `assistant`,
`args` follow `assistant`. For `init`, the case's `files` are left out, the
command runs in an empty folder, `args` are the arguments of `init` (the first
is the folder it creates, which is then the project folder), and the paths of
`contains` and `absent` are relative to the working folder, so start with that
folder's name.

In a case, `AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md`
appear only as keys of the YAML: no such file is in this repository. A section
in `files` is stale, not edited, unless the case says it is edited: its
end-marker hash is the true hash of its text, made by the command in a comment
above it. A case of an edited section has a hash that does not match its text.
