// Complete mapping keys with the delimiter needed to author a value.
import type { FieldInfo } from "@ingestron/definitions";
import type { Place } from "../navigation/index.js";
import type { Suggestion } from "./suggestion.js";

/** Insert a usable mapping entry; replacing an existing key keeps its delimiter and value. */
export function keyEntry(item: Suggestion, place: Place): Suggestion {
  if (item.snippet || item.insertText || !["field", "setting"].includes(item.kind)) return item;
  const after = place.text.slice(place.before.length);
  if (/^[\w.-]*\s*:/.test(after)) return item;
  return { ...item, insertText: `${item.label}: `, retrigger: true };
}

/** A described field as a key to complete, with its default. */
export function fieldSuggestion(field: FieldInfo): Suggestion {
  const shown = typeof field.default === "string" ? field.default : JSON.stringify(field.default);
  return {
    label: field.name,
    kind: field.placement ? "setting" : "field",
    docs: field.docs,
    ...(field.default !== undefined && { detail: `default: ${shown}` }),
    ...(field.description && { documentation: field.description }),
  };
}
