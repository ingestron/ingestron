// Hides the project's .env files from a loader, so what it resolves never holds their values.
import type { FileSource } from "@ingestron/config";

const envFile = /^\.env(\..*)?$/;

/** The files without `.env` and `.env.<name>`: a variable they set is then unset. */
export function withoutEnvFiles(files: FileSource): FileSource {
  return {
    list: () => files.list().filter((path) => !envFile.test(path)),
    read: (path) => (envFile.test(path) ? undefined : files.read(path)),
    ...(files.size && { size: (path) => (envFile.test(path) ? undefined : files.size!(path)) }),
  };
}
