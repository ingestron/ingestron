/**
 * True when a project path matches a glob pattern.
 * `*` matches any characters except "/", `**` matches any number of
 * folders, and `?` matches one character except "/".
 * @example
 * matchesGlob("pipelines/orders.yaml", "pipelines/*.yaml") // true
 * matchesGlob("a/b/orders.yaml", "a/**")                 // true
 */
export function matchesGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  let index = 0;
  while (index < pattern.length) {
    if (pattern.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 3;
    } else if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 2;
    } else {
      source += translateCharacter(pattern[index] ?? "");
      index += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

function translateCharacter(character: string): string {
  if (character === "*") return "[^/]*";
  if (character === "?") return "[^/]";
  return character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}
