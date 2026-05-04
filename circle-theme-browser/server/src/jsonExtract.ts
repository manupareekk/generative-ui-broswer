/**
 * Extract the first complete `{ ... }` object by brace depth, respecting strings
 * (so `}` inside `"..."` does not end the object). Avoids `lastIndexOf("}")`
 * truncating or attaching to the wrong closing brace.
 */
export function sliceFirstBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function extractJsonObject(text: string): unknown {
  const raw = text.trim();
  if (!raw) throw new Error("No JSON object found");

  // Strip optional ```json ... ``` fence
  let body = raw;
  const fence = body.indexOf("```");
  if (fence !== -1) {
    const after = body.slice(fence + 3);
    const nl = after.indexOf("\n");
    const inner = nl === -1 ? after : after.slice(nl + 1);
    const close = inner.indexOf("```");
    if (close !== -1) body = inner.slice(0, close).trim();
  }

  const slice = sliceFirstBalancedJson(body);
  if (!slice) throw new Error("Incomplete or missing JSON object in model output");

  try {
    return JSON.parse(slice) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse error";
    throw new Error(`Invalid JSON from model: ${msg}`);
  }
}
