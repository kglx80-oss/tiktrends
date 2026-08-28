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

/* -------------------------------------------------------------------------- */
/*  Génération (ADSMAP §8.6)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Le parser coupe les jetons sur l'underscore (`[^_]+`). Une valeur qui en
 * contient un casserait donc la relecture du nom qu'on vient d'écrire · c'est
 * le genre de panne qui ne se voit qu'à la synchro suivante, quand plus rien ne
 * se rattache et que personne ne sait pourquoi.
 *
 * On normalise donc AVANT d'écrire : accents retirés, tout ce qui n'est pas
 * alphanumérique devient un tiret, et on borne la longueur pour ne pas dépasser
 * les limites de nommage des régies.
 */
export function slugToken(value: string, maxLength = 28): string {
  const base = value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return 'x';
  // On coupe sur un tiret quand c'est possible, pour ne pas trancher un mot en deux.
  if (base.length <= maxLength) return base;
  const coupe = base.slice(0, maxLength);
  const dernier = coupe.lastIndexOf('-');
  return (dernier > maxLength / 2 ? coupe.slice(0, dernier) : coupe).replace(/-+$/, '');
}

/**
 * Compose le nom attendu côté régie à partir du motif de la marque.
 *
 * C'est l'inverse exact de `parseNaming` : ce que cette fonction écrit, le
 * parser doit savoir le relire. Le rattachement quotidien des métriques en
 * dépend · un nom généré illisible par le parser rend l'ad invisible à la mesure.
 *
 * Un jeton sans valeur devient `x` plutôt que de disparaître : un trou dans le
 * nom décalerait tous les suivants à la relecture.
 */
export function buildName(pattern: string, values: Record<string, string | number | null | undefined>): string {
  return pattern.replace(/\{(\w+)\}/g, (_m, token: string) => {
    const v = values[token];
    return slugToken(v === null || v === undefined ? '' : String(v));
  });
}

/**
 * Les noms d'un lot entier, garantis DISTINCTS.
 *
 * L'unicité est une propriété de l'ensemble, pas d'un nom pris seul · `buildName`
 * ne peut pas la connaître. Et elle n'est pas décorative : deux annonces d'un même
 * lot qui portent le même nom se rattacheraient l'une à l'autre, `matchByName`
 * refuserait de trancher (à raison), et les DEUX resteraient sans mesure.
 *
 * Le cas se produit pour de bon : deux concepts qui portent le même titre sous
 * deux angles différents sont deux concepts distincts en base, mais leur titre,
 * seul jeton qui entre dans le nom, est identique.
 *
 * On suffixe alors le jeton indiqué (`-2`, `-3`…) plutôt que d'inventer un
 * identifiant : le nom reste lisible par un humain dans le gestionnaire de
 * publicités, et relisible par le parser.
 */
export function buildUniqueNames(
  pattern: string,
  rows: Array<Record<string, string | number | null | undefined>>,
  disambiguate = 'concept',
): string[] {
  const vus = new Set<string>();
  return rows.map((values) => {
    let nom = buildName(pattern, values);
    if (!vus.has(nom)) { vus.add(nom); return nom; }

    const base = values[disambiguate];
    const brut = base === null || base === undefined ? '' : String(base);
    // On borne : au-delà, le motif lui-même ne discrimine pas et il vaut mieux
    // s'arrêter que d'allonger indéfiniment un nom que la régie tronquera.
    for (let i = 2; i <= 50; i++) {
      nom = buildName(pattern, { ...values, [disambiguate]: `${brut}-${i}` });
      if (!vus.has(nom)) break;
    }
    vus.add(nom);
    return nom;
  });
}
