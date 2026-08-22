/** Parser de convention de nommage configurable (CDC §F2). */
export interface NamingPattern { regex: RegExp; tokens: string[]; }

export function buildNamingRegex(pattern: string): NamingPattern {
  const tokens: string[] = [];
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = escaped.replace(/\\\{(\w+)\\\}/g, (_m, name: string) => {
    tokens.push(name);
    return '([^_]+)';
  });
  return { regex: new RegExp('^' + body + '$'), tokens };
}

export function parseNaming(name: string, pattern: string): Record<string, string> | null {
  const { regex, tokens } = buildNamingRegex(pattern);
  const m = regex.exec(name);
  if (!m) return null;
  const out: Record<string, string> = {};
  tokens.forEach((t, i) => { out[t] = m[i + 1] ?? ''; });
  return out;
}
