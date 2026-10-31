// Text from the code's descriptions, with `code` and [links](/docs/…) shown as such.
import type { ReactNode } from "react";

/** One sentence or two, as the packages write them. */
export function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index));
    parts.push(
      match[1] !== undefined ? (
        <code key={match.index}>{match[1]}</code>
      ) : (
        <a key={match.index} href={match[3]}>
          {match[2]}
        </a>
      ),
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
