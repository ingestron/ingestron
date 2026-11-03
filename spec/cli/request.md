# Platform request

`ingestron request` writes, for each environment (or those `--env` names),
what to ask of whoever runs the data platform, as Markdown ready to send. The
editor's Prepare platform request command writes the same text for one
environment.

## Resolving

The definitions are resolved as an editor resolves them, with
`missingEnvvars: information` (definitions specification, section 1): a
`${envvar:…}` whose variable is set nowhere does not stop the request. Any
other error does. Then the request is only the title
`# Platform request (<environment>)` and the note "The definitions have
problems; fix them first.", and no problem is listed; `ingestron plan`
lists them. The command's exit code is 1 when any environment's definitions
have errors, and 0 otherwise, including when the only problems are unset
variables.

## Sections

The title is `# Platform request: <project id> (<environment>)`, with
`default` when no environment is selected. Then, in order, each section that
has something to say:

1. **Values to provide** (below).
2. Who the generated pipelines and jobs run as.
3. **Switched on:** each capability the platform turns on with `manage`,
   what it does and what it needs.
4. **Used by the definitions, but switched off:** each capability the
   definitions use while the platform has it off.
5. **Shared infrastructure:** the platform's settings of the methods the
   environment uses, with their values. A secret is never shown; it reads
   "a secret".
6. Each pack's own sections, such as what must exist before deploying and
   the schedules. Sections of the same title from several packs are joined.
7. **SQL to run once (review first):** the generated `prerequisites.sql`.

## Values to provide

The section lists each environment variable the environment's definitions
reference (configuration specification, section 4.6), once, in the order
first referenced. A project that references none has no such section.

It starts with one sentence on where to set them: in the pipeline that runs
Ingestron for this environment, or in `.env.<environment>` (`.env` when no
environment is selected) on your own computer, kept out of Git. Then one
line per variable gives:

- its name;
- each value it feeds: the field, as the keys of its JSON Pointer joined with
  `.`, and the file. For example `values.landing` in `project.yaml`, or
  `settings.server` in `connections/northwind.yaml`;
- whether it is set, and where from: the environment Ingestron runs in,
  `.env.<environment>` or `.env`; or "not set yet".

The section MUST NOT print a variable's value, whether it came from the host
environment or an environment file. Elsewhere the request shows values as
they resolved, so a value that came from a variable is shown, as a
diagnostic may quote it (configuration specification, section 4.5).

## Values not set yet

Elsewhere in the request, a value that holds an unset reference reads as
written, as `${envvar:NAME}`, so the reader sees what is missing. When any
variable is not set, the section says that the request shows each such
variable as `${envvar:NAME}`, and that what depends on one may be left out.

What cannot be worked out without a value is left out, never guessed. A flow
whose source is not known (definitions specification, section 1) has no
steps, so nothing its tables need is listed. For each such flow the section
says that its source is not known yet, naming the source as written. Files
are never generated from such a table, so the SQL to run once is then left
out, and the section says so.
