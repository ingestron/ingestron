// Content digests, as written in the manifest.
import { createHash } from "node:crypto";

/**
 * The digest of `content`: `sha256:` and the hex SHA-256 of its UTF-8 bytes.
 * @example
 * digestOf("a\n"); // "sha256:87428fc5…"
 */
export function digestOf(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}
