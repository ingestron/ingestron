// The glob rules of the manifest's `imports` (configuration specification, section 2): `*`
// matches any characters except `/`, `**` matches any number of folders, `?` matches one
// character except `/`. The same rules as the loader's, so a pattern means the same in both.

/** True when the project path matches the glob pattern. */
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
