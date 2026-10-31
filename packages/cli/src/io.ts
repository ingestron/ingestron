// Where the CLI runs and writes, so tests can run it without a terminal.

/** The working folder, the output stream, and questions when there is a terminal. */
export interface Io {
  cwd: string;
  write(text: string): void;
  /** Shows the question and returns one line of answer; absent without a terminal. */
  ask?(question: string): string | undefined;
}
