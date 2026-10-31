# Security

## Report a vulnerability

Email security@ingestron.io. Do not open a public issue. Include the Ingestron
version (CLI package or extension), the command or editor action, and the smallest definitions that reproduce the problem. We acknowledge
reports within five working days and agree a disclosure date with you.

## Supported versions

Security fixes go into the latest `1.x` release.

## Design

Ingestron turns definitions into files. It is designed so that:

- generation reads only the definitions folder and writes only the output
  folder: paths cannot leave it, and links that lead outside are refused;
- a file edited by hand, or never generated, is never overwritten or deleted;
- a half-written file is never left behind (temporary file and rename), and a
  manifest that lists paths outside the folder is rejected (`BAD_MANIFEST`);
- generation makes no network calls and runs no code from the definitions;
- the only network access is `init --template <git-url>` and `--standard <git-url>`,
  which run your own `git clone` (shallow, with hooks and submodules disabled)
  and read files from the clone; nothing from it is run;
- secrets stay references (`${secret:…}`) and are never written into output.

Dependencies are pinned exactly and updated one reviewed change at a time;
`pnpm validate` checks their licences.
