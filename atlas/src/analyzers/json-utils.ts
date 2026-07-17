/** Parse LLM output as JSON, tolerating a wrapping markdown code fence. */
export function parseJsonContent(content: string): unknown {
  const stripped = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(stripped);
  } catch {
    throw new Error(`LLM response was not valid JSON: ${content.slice(0, 200)}`);
  }
}
