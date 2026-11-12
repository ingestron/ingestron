// CSV text as records (RFC 4180), shared by `ingestron contract <sample>` and the source readers.

/** RFC 4180 records: quoted fields may hold the delimiter, line breaks and "" for a quote. */
export function csvRecords(text: string, delimiter: string, limit: number): string[][] {
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
