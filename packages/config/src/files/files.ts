/**
 * Read access to the files of one project. Paths are relative to the
 * project root and use "/". The loader never touches the file system
 * directly, so the same code runs in Node, a browser or a test.
 */
export interface FileSource {
  /** Every file path in the project. */
  list(): string[];
  /** The file's text, or `undefined` when there is no such file. */
  read(path: string): string | undefined;
  /**
   * Optional: the file's size in bytes, so the loader can refuse a file that
   * is too large without reading it into memory.
   */
  size?(path: string): number | undefined;
}

/**
 * A project held in memory, for tests, browsers and editors.
 * @example
 * memoryFiles({ "project.yaml": "id: demo\nimports: ['*.yaml']\n" })
 */
export function memoryFiles(files: Readonly<Record<string, string>>): FileSource {
  return {
    list: () => Object.keys(files).sort(),
    read: (path) => (Object.hasOwn(files, path) ? files[path] : undefined),
  };
}
