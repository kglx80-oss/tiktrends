/** Projection de génération uniquement. Le validateur local garde le contrat original. */
export function schemaStructure(schema: Record<string, unknown>): Record<string, unknown> {
  const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const visiter = (s: Record<string, unknown>, refs: readonly string[]): Record<string, unknown> => {
    if (typeof s.$ref === 'string') {
      if (!s.$ref.startsWith('#/') || refs.includes(s.$ref)) throw new Error('Contrat structuré : référence externe ou récursive refusée.');
      let cible: unknown = schema;
      for (const part of s.$ref.slice(2).split('/')) cible = objet(cible) ? cible[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
      if (!objet(cible)) throw new Error('Contrat structuré : référence absente.');
      const { $ref, ...reste } = s;
      return visiter({ ...cible, ...reste }, [...refs, $ref]);
    }
    const r: Record<string, unknown> = {};
    for (const k of ['type', 'enum', 'const', 'title', 'description', 'required']) if (s[k] !== undefined) r[k] = structuredClone(s[k]);
    if (objet(s.properties)) r.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => {
      if (!objet(v)) throw new Error('Contrat structuré : propriété non objet.');
      return [k, visiter(v, refs)];
    }));
    if (s.type === 'object' || s.properties) r.additionalProperties = false;
    if (objet(s.items)) r.items = visiter(s.items, refs);
    for (const k of ['anyOf', 'allOf']) if (Array.isArray(s[k])) {
      // Les conditions métier restent imposées par AJV après réponse, pas par
      // la grammaire API (if/then/else non supportés).
      const branches = s[k].filter((v) => objet(v) && !('if' in v));
      if (branches.length) r[k] = branches.map((v) => visiter(v as Record<string, unknown>, refs));
    }
    if (Array.isArray(s.oneOf) && !s.anyOf) r.anyOf = s.oneOf.map((v) => {
      if (!objet(v)) throw new Error('Contrat structuré : alternative non objet.');
      return visiter(v, refs);
    });
    if (s.minItems === 0 || s.minItems === 1) r.minItems = s.minItems;
    const contraintes = Object.fromEntries(Object.entries(s).filter(([k]) => ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems', 'pattern', 'format'].includes(k) || (k === 'minItems' && s.minItems !== 0 && s.minItems !== 1)));
    if (Object.keys(contraintes).length) r.description = [r.description, `Contraintes du contrat : ${JSON.stringify(contraintes)}`].filter(Boolean).join('\n');
    return r;
  };
  return visiter(schema, []);
}
