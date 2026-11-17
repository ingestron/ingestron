// The pipeline parameters a piece of text refers to, as `{{ parameters.<name> }}`
// (specification section 5.1).

const reference = /\{\{\s*parameters\.([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * The names in the `{{ parameters.<name> }}` references of `text`, in the order written, each
 * use giving its name. Spaces inside the braces are allowed.
 * @example parameterReferences("d >= {{ parameters.min_date }}") // ["min_date"]
 * @public
 */
export function parameterReferences(text: string): string[] {
  return [...text.matchAll(reference)].map((match) => match[1]!);
}
