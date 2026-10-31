// Rows of a sample file: CSV (comma, semicolon or tab, with quotes) or JSON
// (an array of objects, or one object per line). At most `limit` rows.

/** The column names in order, and each row's values by name. */
export interface Sample {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Reads `text` as CSV, or as JSON when the file name ends in .json, .jsonl or .ndjson. */
export function readSample(text: string, file: string, limit = 1000): Sample {
  return /\.(json|jsonl|ndjson)$/i.test(file) ? jsonSample(text, limit) : csvSample(text, limit);
}

function jsonSample(text: string, limit: number): Sample {
  const trimmed = text.trim();
  const items: unknown[] = trimmed.startsWith("[")
    ? (JSON.parse(trimmed) as unknown[])
    : trimmed
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, limit)
        .map((line) => JSON.parse(line) as unknown);
  const rows = items
    .slice(0, limit)
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return { columns, rows };
}

function csvSample(text: string, limit: number): Sample {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
  const [header = [], ...records] = csvRecords(text, delimiter, limit + 1);
  const rows = records
    .filter((record) => record.some((value) => value !== ""))
    .map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ""])));
  return { columns: header, rows };
}

/** RFC 4180 records: quoted fields may hold the delimiter, line breaks and "" for a quote. */
function csvRecords(text: string, delimiter: string, limit: number): string[][] {
  const reader = new CsvReader(delimiter);
  for (let at = 0; at < text.length && reader.records.length < limit; at += 1)
    at += reader.read(text[at]!, text[at + 1]);
  reader.end(limit);
  return reader.records;
}

/** Reads one character at a time; `read` returns how many extra characters it used. */
class CsvReader {
  records: string[][] = [];
  private record: string[] = [];
  private field = "";
  private quoted = false;

  constructor(private readonly delimiter: string) {}

  read(char: string, next: string | undefined): number {
    if (this.quoted) return this.inQuotes(char, next);
    if (char === '"') this.quoted = true;
    else if (char === this.delimiter) this.endField();
    else if (char === "\n" || char === "\r") return this.endRecord(char, next);
    else this.field += char;
    return 0;
  }

  /** The last record, when the text does not end with a line break. */
  end(limit: number): void {
    if ((this.field !== "" || this.record.length > 0) && this.records.length < limit)
      this.endRecord("\n", undefined);
  }

  private inQuotes(char: string, next: string | undefined): number {
    if (char === '"' && next === '"') {
      this.field += '"';
      return 1;
    }
    if (char === '"') this.quoted = false;
    else this.field += char;
    return 0;
  }

  private endField(): void {
    this.record.push(this.field);
    this.field = "";
  }

  private endRecord(char: string, next: string | undefined): number {
    this.endField();
    this.records.push(this.record);
    this.record = [];
    return char === "\r" && next === "\n" ? 1 : 0;
  }
}
