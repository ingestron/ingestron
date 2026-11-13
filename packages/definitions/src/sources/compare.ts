// Comparing a table's columns with a source metadata table (specification section 12.6).
import type { SourceCode } from "../diagnostics/index.js";
import type { SourceColumnDoc, SourceTableDoc } from "../documents/index.js";
import { judgeType, typeText, type TypeOf } from "./fits.js";

/**
 * One difference found between a table's columns and the source's.
 * @public
 */
export interface SourceDifference {
  /** What differs. */
  code: SourceCode;
  /** `breaking` fails by default; `compatible` is information. */
  kind: "breaking" | "compatible";
  /**
   * The column, as the contract (`before`) names it, or the metadata for a new column; none for
   * the key.
   */
  column?: string;
  /** What the table had: a type, `required`, or the key's columns joined with `, `. */
  before?: string;
  /** What the metadata has, in the same form. */
  after?: string;
}

/**
 * A column of the table being compared: a contract's, or an earlier source table's.
 * @public
 */
export interface SourceColumnBefore {
  /** The name the table uses; reported for the column. */
  name: string;
  /** The column's name at the source when it differs; a column is matched by it before `name`. */
  physicalName?: string;
  /** The column's logical type; none when it is not compared. */
  logicalType?: string;
  /** Its `precision`, `scale` and `maxLength`, when given. */
  logicalTypeOptions?: Record<string, unknown>;
  /** `true` when the column cannot be null. */
  required?: boolean;
}

/**
 * The table's columns and primary key, as `compareSourceColumns` takes them.
 * @public
 */
export interface SourceBefore {
  /** The columns, in order. */
  columns: SourceColumnBefore[];
  /** The names of the key's columns, in order, written as the metadata names them. */
  primaryKey: string[];
}

/**
 * Compares the columns of `before`, a contract's, with the source table `after`: a column
 * missing from either, a type, `required` and the primary key. Columns are matched by
 * `physicalName`, else `name`, with case when `caseSensitive`. With `namesOnly` (a table read
 * from a sample or an assistant's columns file) only the columns that are new or gone are
 * reported. A key is compared only when `after` gives one. Differences come in the order of
 * `before`'s columns, then the new columns, then the key.
 * @example compareSourceColumns({ columns: [{ name: "id" }], primaryKey: [] }, table, { namesOnly: false, caseSensitive: false })
 * @public
 */
export function compareSourceColumns(
  before: SourceBefore,
  after: SourceTableDoc,
  options: { namesOnly: boolean; caseSensitive: boolean },
): SourceDifference[] {
  const same = options.caseSensitive
    ? (left: string, right: string) => left === right
    : (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  const found: SourceDifference[] = [];
  const matched = new Set<SourceColumnDoc>();
  for (const column of before.columns) {
    const theirs = after.columns.find((other) =>
      same(column.physicalName ?? column.name, other.name),
    );
    if (!theirs) {
      found.push({ code: "SOURCE_COLUMN_GONE", kind: "breaking", column: column.name });
      continue;
    }
    matched.add(theirs);
    if (!options.namesOnly) found.push(...columnDifferences(column, theirs));
  }
  for (const column of after.columns)
    if (!matched.has(column))
      found.push({ code: "SOURCE_COLUMN_NEW", kind: "compatible", column: column.name });
  if (!options.namesOnly) found.push(...keyDifference(before.primaryKey, after, same));
  return found;
}

/** The type and nullability differences of one matched column. */
function columnDifferences(
  column: SourceColumnBefore,
  theirs: SourceColumnDoc,
): SourceDifference[] {
  const found: SourceDifference[] = [];
  if (column.logicalType !== undefined) {
    const contract: TypeOf = {
      logicalType: column.logicalType,
      options: column.logicalTypeOptions,
    };
    const source: TypeOf = { logicalType: theirs.logicalType, options: theirs.logicalTypeOptions };
    const { fits, differs } = judgeType(source, contract);
    if (differs)
      found.push({
        code: fits ? "SOURCE_TYPE_FITS" : "SOURCE_TYPE_CHANGED",
        kind: fits ? "compatible" : "breaking",
        column: column.name,
        before: typeText(contract),
        after: typeText(source),
      });
  }
  if (column.required === true && !theirs.required)
    found.push({
      code: "SOURCE_NULLABLE",
      kind: "breaking",
      column: column.name,
      before: "required",
      after: "nullable",
    });
  return found;
}

/** A different primary key; none when either the contract or the source's table gives no key. */
function keyDifference(
  key: string[],
  after: SourceTableDoc,
  same: (left: string, right: string) => boolean,
): SourceDifference[] {
  const theirs = after.columns
    .filter((column) => column.primaryKeyPosition !== undefined)
    .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
    .map((column) => column.name);
  if (key.length === 0 || theirs.length === 0) return [];
  if (key.length === theirs.length && key.every((name, index) => same(name, theirs[index]!)))
    return [];
  return [
    {
      code: "SOURCE_KEY_CHANGED",
      kind: "breaking",
      before: key.join(", "),
      after: theirs.join(", "),
    },
  ];
}
