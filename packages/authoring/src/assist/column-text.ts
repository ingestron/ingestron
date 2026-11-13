// How a column's name is written where it is inserted: in a check's SQL (Spark SQL, specification
// section 5) and in YAML. The suggestion's label stays the bare name; only the inserted text
// changes, so that the text it goes into stays valid.
import { stringify } from "yaml";

/**
 * Words Spark SQL reserves in its ANSI mode, which cannot stand for a column unquoted. A word
 * quoted that need not be is harmless, so the list errs on the side of more.
 */
const reserved = new Set(
  (
    "all and anti any as authorization both case cast check collate column constraint create cross " +
    "current_date current_time current_timestamp current_user default distinct else end except " +
    "exists false fetch filter for foreign from full grant group having in inner intersect into is " +
    "join lateral leading left like limit minus natural not null offset on only or order outer " +
    "overlaps primary references right select semi session_user some table then to trailing true " +
    "union unique unknown user using when where with"
  ).split(" "),
);

/**
 * The name as Spark SQL reads it: bare when it is a plain identifier that is no reserved word,
 * else in backticks with each backtick inside doubled.
 */
export function sqlName(name: string): string {
  const plain = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !reserved.has(name.toLowerCase());
  return plain ? name : `\`${name.replaceAll("`", "``")}\``;
}

/** The quote that opens the text typed so far, if any. */
export type Quote = '"' | "'" | "";

/** Text written inside a YAML quoted scalar: with `"` its `\` and `"` escaped, with `'` doubled. */
export function inQuote(text: string, quote: Quote): string {
  if (quote === '"') return text.replace(/[\\"]/g, "\\$&");
  if (quote === "'") return text.replaceAll("'", "''");
  return text;
}

/**
 * The name as a YAML scalar: plain when `yaml` writes it plain, so that it still reads as the
 * same string, else double-quoted. In flow style (inside `{ }` or `[ ]`), where `,`, `[`, `]`,
 * `{` and `}` end a plain scalar, a name holding one is double-quoted too.
 */
export function yamlName(name: string, inFlow = false): string {
  const plain =
    stringify(name, { lineWidth: 0 }).slice(0, -1) === name &&
    !/[\u0000-\u001f\u007f]/.test(name) &&
    !(inFlow && /[,[\]{}]/.test(name));
  return plain ? name : JSON.stringify(name);
}
