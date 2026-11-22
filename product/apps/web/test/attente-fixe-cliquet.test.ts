import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CLIQUET des attentes FIXES dans les tests de `apps/web` (suite de #1129).
 *
 * Une attente fixe (« 400 ms puis on lit la base ») parie sur la vitesse de la machine · au repos
 * elle passe, sous charge elle perd une fois de temps en temps, et une route ralentie au-delà de
 * sa durée la rend aveugle (une course de verrou qui ne se produit plus passe au vert). Un test
 * attend un ÉTAT · `attendreEtat` (un état qu'on attend de voir venir) ou `attendreAbsence` (une
 * absence tenue dans la durée), `test/helpers/attendre-etat.ts`.
 *
 * Ce qu'on compte · dans `apps/web/test` (tous les `.ts` / `.tsx`, sous-dossiers compris), chaque
 * PROMESSE DE SOMMEIL · `new Promise((r) => setTimeout(r, N))` dont le délai N n'est pas `0`, sous
 * toutes ses écritures courantes (détail sur `SOMMEIL`) · résolveur entre parenthèses ou non, typé
 * (`(r: () => void)`), suivi d'un second paramètre (`(r, _j)`), `async (r)`, ou en `function (r) {`
 * · minuteur nu ou `globalThis.setTimeout`, gardé (`const t = setTimeout(…)`, `t = …`) ou jeté
 * (`void setTimeout(…)`) · rappel qui est le résolveur, transtypé ou non (`r`, `r as () => void`),
 * ou qui l'appelle avec RIEN (`() => r()`, `r(undefined)`, `r(void 0)`) ou avec une valeur JETÉE
 * (`await new Promise((r) => setTimeout(() => r(true), 400));` en tête d'instruction · le résultat
 * ne va nulle part, il ne reste que la durée). Un délai écrit par une variable (`ms`,
 * `faux.latenceMs`) compte aussi, il n'est pas 0 par construction. Comptent encore · le même
 * sommeil en deux instructions (`Promise.withResolvers()` puis `setTimeout(resolve, N)`), chaque
 * APPEL de `pasDansAct(N)` à délai non nul (le sommeil qu'exporte l'utilitaire exclu ci-dessous ·
 * `{ pas: pasDansAct }` n'en est pas un) et chaque import de `timers/promises` (le même sommeil,
 * sous un autre nom). Ne comptent PAS · le tour de boucle `setTimeout(r, 0)` (ou sans délai), une
 * valeur rendue, affectée ou passée (`mockImplementation(() => new Promise((r) => setTimeout(() =>
 * r(v), 10)))`, un faux qui RÉPOND après une latence · `const v = await …`, `Promise.race([…])`),
 * un délai de garde qui REJETTE (`setTimeout(() => rej(…))`).
 *
 * C'est plus large que « un sommeil suivi d'un `expect` » · une attente cachée dans une AIDE
 * (`const laisser = (ms = 400) => … setTimeout(r, ms) …`, puis `await laisser(); expect(…)`) est le
 * même pari. Le sommeil ne s'écrit qu'une fois, dans la définition · c'est l'APPEL qui attend. Une
 * aide est la définition nommée la plus proche qui englobe un sommeil (`const X = (…) =>`,
 * `function X(`, une propriété `X: () =>`, une méthode `X() {`), puis, de proche en proche, celle
 * qui appelle une aide (`cliquer` qui appelle `attendre`). Ses appels dans le fichier sont COMPTÉS
 * et FIGÉS (`appels`) au même titre que les sommeils · un appel `X(`, ou l'aide passée en VALEUR en
 * argument (`.then(X)`, `act(X)`, `.map(X)`, `beforeEach(X)` · hors `{ pas: X }`, le pas d'un
 * sondage) · une aide sans compte figé vaut 0 appel. Le comptage de proche en proche termine sur un
 * cycle (`a` ↔ `b`, une récursion) · chaque aide n'est relevée qu'une fois. Le cas légitime (un
 * faux qui simule une latence, un `dormir` injecté au code testé) se DÉCLARE ici, avec sa raison.
 *
 * Exclus · `helpers/attendre-etat.ts` (le seul sommeil légitime · le pas entre deux sondages) et
 * ce fichier (il décrit les formes qu'il cherche).
 *
 * Les EXEMPTIONS ci-dessous sont l'état mesuré de main (d959ff37, 21/11/2026) · 49 promesses de
 * sommeil dans 41 fichiers, après la migration de ce lot (les boucles maison de `boucle-fiche-test`,
 * `boucle-preuve`, `notes-iterer`, `commentaire-iterer`, `dans-les-tests`, `gagnante-clavier`,
 * `gagnante-partout`, et les 400 ms de `e2-controle-vision-pg` et `fd-revocation-pg`). Chacune porte
 * son COMPTE EXACT · un fichier qui en gagne une tombe (une nouvelle attente fixe), un fichier qui
 * en perd une tombe aussi (l'exemption est périmée · abaisse le compte, ou retire la ligne à 0) ·
 * le cliquet ne descend que par une décision écrite. Les `appels` figés sont l'état mesuré de main
 * (b86d4762) · 46 aides dans 25 fichiers. Les formes élargies (rappel `() => r()`, `function (r)`,
 * résolveur typé ou à deux paramètres, `globalThis.setTimeout`, `pasDansAct(N)`) n'y trouvent
 * AUCUN usage de plus · aucune exemption nouvelle (`parcours-image-focus-course`, ligne ~119, rend
 * une VALEUR en différé · `() => r({ ok, vue })` · ce n'est pas un sommeil). Les formes de la suite
 * (valeur rien ou jetée, transtypage, minuteur gardé ou `void`, `async (r)`, `withResolvers`, aide
 * passée en valeur) mesurées sur tout `apps/web/test` (main 28856104) · AUCUN compte ne bouge, ni
 * sommeil ni appel · le seul rappel à valeur du dépôt reste `parcours-image-focus-course` (~119),
 * dont la valeur est RENDUE au code testé, pas jetée.
 *
 * Les LIMITES · ce cliquet protège contre l'ERREUR (on recopie une attente fixe voisine, on
 * rappelle l'aide du fichier), pas contre la MALVEILLANCE · il lit le texte, il n'exécute rien.
 * Il ne voit pas · `promisify(setTimeout)` ; une boucle de `setTimeout(r, 0)` (chaque tour est un
 * tour de boucle, la somme est une durée) ; un nom calculé ou un alias (`globalThis['set' +
 * 'Timeout']`, `const st = setTimeout`, `import { pasDansAct as p }`, `const encore = laisser`) ;
 * une aide rangée dans un objet (`{ onFin: laisser }`) ou appelée par un autre nom ; une valeur
 * constante GARDÉE (`const v = await new Promise((r) => setTimeout(() => r(1), N))` · on la croit
 * utile) ; une promesse à valeur attendue plus loin (`const p = new Promise(… r(v) …); await p`) ;
 * un second minuteur sur un `withResolvers` (seul le premier qui le résout est lu) ; un
 * `differe()` maison résolu par un minuteur ; une valeur imbriquée sur plus de deux niveaux de
 * parenthèses ; un appel d'aide caché par un littéral d'expression régulière qui contient une
 * apostrophe ou `//` (le relevé des appels blanchit commentaires et textes, pas les expressions
 * régulières).
 */

const RACINE = __dirname;
const EXCLUS = new Set(['helpers/attendre-etat.ts', 'attente-fixe-cliquet.test.ts']);

/* Les raisons, par nature · chaque exemption en nomme une. */
const INJECTE = 'le `dormir` injecté au code testé (son propre sondage, borné par `attente`) · pas une attente du test';
const LATENCE = 'latence simulée dans un faux (fournisseur, fetch, verrou, processus enfant) · le test provoque un chevauchement, il n’attend pas un état';
const SONDAGE = 'boucle de sondage maison, bornée, sur la condition vraie · même forme que celles migrées par ce lot, à passer par `attendreEtat`';
const FIXE = 'attente fixe avant constat (montage, action serveur, focus) · dette à migrer vers `attendreEtat` / `attendreMontageStable`';
const FEU = 'laisse partir le « fire and forget » avant de lire l’espion · une absence, à passer par `attendreAbsence`';
const VERROU = 'course de verrou Postgres à délai fixe (`pause(400)`) · même cas que `e2-controle-vision-pg` et `fd-revocation-pg`, à passer par `pg_blocking_pids`';

interface Exemption {
  /** Les sommeils écrits dans le fichier. */
  n: number;
  /** Les appels de chaque aide à attente fixe du fichier · une aide absente d'ici vaut 0. */
  appels?: Readonly<Record<string, number>>;
  raison: string;
}

const EXEMPTIONS: Readonly<Record<string, Exemption>> = {
  // Le code testé reçoit son sommeil · c'est SA boucle, bornée par `attente`.
  'r6-pas1-interrupteurs.test.ts': { n: 1, raison: INJECTE },
  'e2-pas1-registre.test.ts': { n: 1, raison: INJECTE },
  'e-pas1-recette.test.ts': { n: 1, raison: INJECTE },
  'e4-pas1-reprise-vision.test.ts': { n: 1, raison: INJECTE },
  // Un faux qui prend du temps · la course est le sujet.
  'e3-enfant-registre.ts': { n: 1, appels: { dormir: 2, course: 1 }, raison: LATENCE },
  'logos-charte-etat.test.ts': { n: 1, raison: LATENCE },
  'adsmap-import-verrou-db.test.ts': { n: 1, raison: LATENCE },
  'fa-course-mixte-pg.test.ts': { n: 3, appels: { create: 2, vague: 2 }, raison: `${LATENCE} · et le départ synchronisé des deux vagues de la course (rendez-vous, échelonnement)` },
  // Le même défaut que celui réparé ici, hors du périmètre de ce lot.
  'l2-revocation-course-pg.test.ts': { n: 1, appels: { pause: 1 }, raison: VERROU },
  'fa-reservation-commune.test.ts': { n: 1, raison: SONDAGE },
  'l3-worker.test.ts': { n: 1, raison: SONDAGE },
  'import-lot-db.test.tsx': { n: 1, raison: SONDAGE },
  'fin-prevue-import-db.test.tsx': { n: 1, raison: SONDAGE },
  'iterer-gagnante-db.test.tsx': { n: 1, raison: SONDAGE },
  'lot9-personas-db.test.tsx': { n: 2, raison: SONDAGE },
  'lot9bis-offres-db.test.tsx': { n: 1, appels: { attendreQue: 4 }, raison: SONDAGE },
  'l0-api-ad.test.ts': { n: 1, raison: FEU },
  'l0-jalons.test.ts': { n: 1, raison: FEU },
  // Les aides `attendre` / `laisser` / `monter` à durée fixe.
  'analyse-crea-marque-db.test.tsx': { n: 1, appels: { laisser: 1, attendre: 2 }, raison: FIXE },
  'boucles-hypothese-db.test.tsx': { n: 1, appels: { cliquer: 11 }, raison: FIXE },
  'commentaire-boucle-mentions-db.test.tsx': { n: 2, appels: { monter: 1, ficheMontee: 4, attendre: 5 }, raison: FIXE },
  'lot6-veille-tags-db.test.tsx': { n: 1, appels: { attendre: 2, monter: 12, cliquer: 16 }, raison: FIXE },
  'lot6bis-sauvegardes-hypothese-db.test.tsx': { n: 1, appels: { attendre: 5, monter: 11, cliquer: 4 }, raison: FIXE },
  'lot7-veille-filtres-liste.test.tsx': { n: 1, appels: { apresFocus: 3 }, raison: FIXE },
  'lot8-studios-db.test.tsx': { n: 1, appels: { attendre: 3, cliquer: 10 }, raison: FIXE },
  'lot10-activite-db.test.tsx': { n: 1, appels: { attendre: 2, cliquer: 8 }, raison: FIXE },
  'lot11-notes-lignee-db.test.tsx': { n: 1, appels: { attendre: 1, cliquer: 8 }, raison: FIXE },
  'lot12-bibliotheque-db.test.tsx': { n: 1, appels: { attendre: 6, attendreQue: 7, monter: 9, cliquer: 11, choisir: 8, touche: 5, ouvrirComplet: 7 }, raison: FIXE },
  'lot13-raccourcis-rendu.test.tsx': { n: 1, appels: { attendre: 10 }, raison: FIXE },
  'lot13b-raccourcis-lot-db.test.tsx': { n: 1, appels: { monter: 4 }, raison: FIXE },
  'lot13b-raccourcis-suite-rendu.test.tsx': { n: 1, appels: { attendre: 4 }, raison: FIXE },
  'lot13t-raccourcis-test-db.test.tsx': { n: 1, appels: { monter: 4 }, raison: FIXE },
  'lot13t-raccourcis-visibles-rendu.test.tsx': { n: 1, appels: { monter: 1, coquille: 13 }, raison: FIXE },
  'mes-mentions-db.test.tsx': { n: 2, appels: { monter: 4, attendre: 3 }, raison: FIXE },
  'notes-iterer-db.test.tsx': { n: 1, appels: { attendre: 5 }, raison: `${FIXE} (l’aide \`attendre\` · la boucle de création, elle, est migrée)` },
  'spatial-editeur-gestes.test.tsx': { n: 4, raison: FIXE },
  'spatial-editeur-zoom.test.tsx': { n: 1, raison: FIXE },
  'studios-ateliers-brique-design.test.tsx': { n: 1, appels: { laisser: 9 }, raison: FIXE },
  'studios-editeur-ecran-design.test.tsx': { n: 1, appels: { laisser: 9, ouvrirVersions: 5 }, raison: FIXE },
  'studios-fiche-projet-ecran-design.test.tsx': { n: 1, appels: { laisser: 5 }, raison: FIXE },
  'studios-video-ecran-design.test.tsx': { n: 1, appels: { laisser: 7 }, raison: FIXE },
};

const NOM = String.raw`[A-Za-z_$][\w$]*`;
/** L'annotation d'un paramètre · `: number`, `: () => void`, `: (v: unknown) => void`. */
const TYPE = String.raw`(?:\s*:\s*(?:\([^()]*\)\s*=>\s*[\w$.<>\[\]| ]+?|[\w$.<>\[\]| ]+?))?`;
/** Un transtypage · `as () => void`, `as never`, `as unknown as () => void`. */
const CAST = String.raw`(?:\s+as\s+(?:\([^()]*\)\s*=>\s*[\w$.<>\[\]| ]+?|[\w$.<>\[\]| ]+?))*`;
/** Le MINUTEUR · `setTimeout`, ou `globalThis.` / `window.` / `global.` / `self.setTimeout`, précédé ou non de `void`, `const t =`, `t =`. */
const MINUTEUR = String.raw`(?:(?:(?:const|let|var)\s+${NOM}${TYPE}\s*=(?!=)|${NOM}(?:\s*\.\s*${NOM})*\s*=(?!=)|void)\s*)?`
  + String.raw`(?:(?:globalThis|window|global|self)\s*\.\s*)?setTimeout\s*\(\s*`;
/** La valeur passée au résolveur · des parenthèses imbriquées sur deux niveaux (`r({ vue: vueImage({…}) })`). */
const VALEUR = String.raw`\s*(?<val>(?:[^()]|\((?:[^()]|\([^()]*\))*\))*?)\s*`;
/**
 * Le RAPPEL du minuteur, pour un résolveur `res` (un motif) · le résolveur LUI-MÊME, transtypé ou
 * non (`r`, `r as () => void`), ou un rappel qui l'appelle (`() => r(…)`, `() => { r(…); }`,
 * `function () { r(…); }`) · puis le délai. Groupes · `val` (la valeur, absente pour le résolveur
 * lui-même) · `delai`.
 */
const rappel = (res: string) => String.raw`(?:${res}${CAST}|\(\s*\)\s*=>\s*(?:\{\s*)?${res}\s*\(${VALEUR}\)\s*;?\s*\}?|function\s*\(\s*\)\s*\{\s*${res}\s*\(${VALEUR.replace('?<val>', '?<val2>')}\)\s*;?\s*\})`
  + String.raw`\s*(?:,\s*(?<delai>[^)]*?)\s*)?\)`;
/**
 * Une promesse de sommeil · `[await] new Promise[<T>](RÉSOLVEUR => [{] MINUTEUR(RAPPEL[, délai])` où
 *  · RÉSOLVEUR · `(r)`, `r`, `async (r)`, `(r: () => void)`, `(r, _j)`, ou `function [nom](r) {` ;
 *  · MINUTEUR, RAPPEL · ci-dessus.
 * Un rappel qui rend une VALEUR (`() => r(v)`) est un sommeil quand la valeur est RIEN (`r()`,
 * `r(undefined)`, `r(void 0)`) ou quand elle est JETÉE · la promesse est attendue en tête
 * d'instruction (`; await new Promise(…)`, `{ await …`), son résultat ne va nulle part, il ne reste
 * que la durée. Une valeur rendue, affectée ou passée (`mockImplementation(() => new Promise((r) =>
 * setTimeout(() => r({ ok, vue }), 10)))`, une latence simulée qui RÉPOND) n'en est pas un.
 * Groupes · `jete` (la promesse est attendue en tête d'instruction) · `res` · `val` / `val2` · `delai`.
 */
const SOMMEIL = new RegExp(
  String.raw`(?:(?<=(?:^|[;{})])[ \t]*)(?<jete>await)\s+)?`
  + String.raw`new\s+Promise\s*(?:<[^>]*>)?\s*\(\s*(?:async\s+)?(?:function\s*(?:${NOM}\s*)?)?\(?\s*(?<res>${NOM})${TYPE}\s*(?:,\s*${NOM}${TYPE}\s*)?\)?\s*(?:=>)?\s*\{?\s*`
  + MINUTEUR + rappel(String.raw`\k<res>`),
  'gm',
);
/**
 * `Promise.withResolvers()` · `const { promise, resolve } = Promise.withResolvers()` (ou `resolve: r`,
 * ou `const d = …` puis `d.resolve`) suivi d'un MINUTEUR qui appelle son résolveur · le même sommeil,
 * écrit en deux instructions. On lit le premier minuteur qui suit, avant le `withResolvers` suivant.
 */
const AVEC_RESOLVEURS = new RegExp(String.raw`(?:const|let|var)\s+(?:\{(?<champs>[^{}]*)\}|(?<objet>${NOM}))\s*(?::[^=;]+)?=\s*Promise\s*\.\s*withResolvers\s*(?:<[^>]*>)?\s*\(\s*\)`, 'g');
const TIMERS_PROMESSES = /from\s+['"](?:node:)?timers\/promises['"]|require\(\s*['"](?:node:)?timers\/promises['"]\s*\)/g;
/**
 * `pasDansAct(ms)` · le sommeil (dans `act`) qu'exporte l'utilitaire exclu · un APPEL à délai non
 * nul est une attente fixe. Le passer en option (`{ pas: pasDansAct }`) n'en est pas un ·
 * `attendreEtat` s'en sert entre deux sondages.
 */
const PAS_DANS_ACT = /(?<![\w$.])pasDansAct\s*\(\s*([^)]*?)\s*\)/g;

const delaiNul = (d: string | undefined) => { const t = (d ?? '').trim(); return t === '' || /^0+$/.test(t); };
/** Une valeur qui n'en est pas une · `r()`, `r(undefined)`, `r(void 0)`. */
const rien = (v: string | undefined) => v === undefined || /^(?:|undefined|void\s+0)$/.test(v.trim());

/** Les sommeils à délai non nul d'un source · leur position (promesses, `withResolvers`, appels de `pasDansAct`). */
function sommeils(source: string): number[] {
  const out: number[] = [];
  for (const m of source.matchAll(SOMMEIL)) {
    const g = m.groups!;
    if (!delaiNul(g.delai) && (rien(g.val ?? g.val2) || g.jete)) out.push(m.index!);
  }
  const bornes = [...source.matchAll(AVEC_RESOLVEURS)];
  bornes.forEach((m, k) => {
    const g = m.groups!;
    // Le nom du résolveur · `d.resolve`, `resolve`, ou l'alias de `resolve: fin`.
    const champ = g.objet ? null : new RegExp(String.raw`\bresolve\b(?:\s*:\s*(${NOM}))?`).exec(g.champs!);
    if (!g.objet && !champ) return;
    const nom = g.objet ? String.raw`${g.objet.replace(/\$/g, '\\$')}\s*\.\s*resolve` : (champ![1] ?? 'resolve').replace(/\$/g, '\\$');
    const fin = bornes[k + 1]?.index ?? source.length;
    const t = new RegExp(String.raw`(?<![\w$.])` + MINUTEUR + rappel(nom), 'g');
    t.lastIndex = m.index! + m[0].length;
    const u = t.exec(source);
    if (u && u.index < fin && !delaiNul(u.groups!.delai) && rien(u.groups!.val ?? u.groups!.val2)) out.push(u.index);
  });
  for (const m of source.matchAll(PAS_DANS_ACT)) if (!delaiNul(m[1])) out.push(m.index!);
  return out;
}

const ligneDe = (source: string, i: number) => source.slice(0, i).split('\n').length;

/** Les attentes fixes d'un source · leurs lignes (1 = première). */
function attentesFixes(source: string): number[] {
  const lignes = sommeils(source).map((i) => ligneDe(source, i));
  for (const m of source.matchAll(TIMERS_PROMESSES)) lignes.push(ligneDe(source, m.index!));
  return lignes.sort((a, b) => a - b);
}

/* ─────────── Les AIDES · une attente fixe définie une fois, appelée ailleurs dans le fichier ─────────── */

/**
 * Le source, commentaires et textes blanchis (positions et retours à la ligne gardés) · un appel
 * cité dans un commentaire ne compte pas, une accolade dans un texte ne fausse pas la profondeur.
 * Un texte `'…'` / `"…"` s'arrête à la fin de sa ligne (l'apostrophe d'un texte JSX n'ouvre rien
 * au-delà) · un gabarit `` `…` `` est blanchi en entier.
 */
function masquer(s: string): string {
  const o = s.split('');
  const blanc = (a: number, b: number) => { for (let k = a; k < b; k++) if (o[k] !== '\n') o[k] = ' '; };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '/' && s[i + 1] === '/') { const f = s.indexOf('\n', i); const e = f < 0 ? s.length : f; blanc(i, e); i = e; continue; }
    if (c === '/' && s[i + 1] === '*') { const f = s.indexOf('*/', i + 2); const e = f < 0 ? s.length : f + 2; blanc(i, e); i = e; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c && (c === '`' || s[j] !== '\n')) j += s[j] === '\\' ? 2 : 1;
      if (j < s.length && s[j] === c) { blanc(i + 1, j); i = j + 1; continue; }
    }
    i += 1;
  }
  return o.join('');
}

/**
 * Une définition NOMMÉE dont la valeur est une fonction · `const|let|var X = [async] (…) =>` (ou
 * `function`), `function X(`, une propriété `X: [async] (…) =>`, une méthode `X(…) {` en tête de ligne.
 */
const VALEUR_FONCTION = String.raw`(?=(?:async\s+)?(?:function\b|\(|${NOM}\s*=>))`;
const DEFINITION = new RegExp([
  String.raw`\b(?:const|let|var)\s+(${NOM})\s*(?::[^=;\n]+)?=\s*${VALEUR_FONCTION}`,
  String.raw`\bfunction\s*\*?\s*(${NOM})\s*\(`,
  String.raw`(?<![\w$.?])(${NOM})\s*:\s*${VALEUR_FONCTION}`,
  String.raw`^[ \t]*(?:async\s+)?(${NOM})\s*\([^()]*\)\s*(?::[^{;\n]+)?\{`,
].join('|'), 'gm');
const MOTS_CLES = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function']);

/**
 * Fin de l'étendue d'une définition (source masqué) · un `bloc` (fonction, méthode) finit à
 * l'accolade qui referme son corps · une valeur finit au `;` ou à la `,` de même profondeur, ou
 * au retour à la ligne qui ne la prolonge pas (une ligne finie par `=>`, `=`, `,`, `(`… continue).
 */
function finDefinition(s: string, debut: number, bloc: boolean): number {
  let prof = 0;
  let dernier = '';
  for (let k = debut; k < s.length; k++) {
    const c = s[k]!;
    if (c === '(' || c === '[' || c === '{') prof += 1;
    else if (c === ')' || c === ']' || c === '}') {
      prof -= 1;
      if (prof < 0) return k;
      if (bloc && prof === 0 && c === '}') return k + 1;
    } else if (!bloc && prof === 0 && (c === ';' || c === ',')) return k;
    else if (!bloc && prof === 0 && c === '\n' && !/[=>,(?:|&+]$/.test(dernier)) return k;
    if (!/\s/.test(c)) dernier = c;
  }
  return s.length;
}

interface Aide {
  nom: string;
  /** La ligne de sa définition. */
  ligne: number;
  /** Ses appels dans le fichier. */
  appels: number;
  /** L'aide qu'elle appelle, si elle n'est une attente fixe que par elle. */
  via?: string;
}

/**
 * Les AIDES d'un source · la définition nommée la plus proche qui englobe un sommeil · puis, de
 * proche en proche, celle qui englobe l'APPEL d'une aide (`cliquer` qui appelle `attendre` est la
 * même attente fixe, sous un autre nom). Chacune avec le nombre de ses appels dans le fichier
 * (`X(`, hors sa propre définition, hors commentaires et textes) · pour une variable ou une
 * fonction, `obj.X(` est un autre nom · pour une propriété ou une méthode, `obj.X(` est bien elle.
 */
function aides(source: string): Aide[] {
  const s = masquer(source);
  const defs: { nom: string; at: number; debut: number; fin: number; membre: boolean }[] = [];
  for (const m of s.matchAll(DEFINITION)) {
    const nom = m[1] ?? m[2] ?? m[3] ?? m[4]!;
    if (MOTS_CLES.has(nom)) continue;
    // Un bloc se lit depuis sa parenthèse (`function X(`) ou son accolade (`X(…) {`) · une valeur, après `=` ou `:`.
    const bloc = m[2] !== undefined || m[4] !== undefined;
    const fin = finDefinition(s, m.index! + m[0].length - (bloc ? 1 : 0), bloc);
    defs.push({ nom, at: m.index! + m[0].indexOf(nom), debut: m.index!, fin, membre: m[3] !== undefined || m[4] !== undefined });
  }
  const englobante = (i: number, sauf?: string) => defs.filter((x) => x.debut <= i && i < x.fin && x.nom !== sauf).sort((a, b) => b.debut - a.debut)[0];
  const parNom = new Map<string, Aide & { sites: number[] }>();
  const ajouter = (d: (typeof defs)[number], via?: string) => {
    if (parNom.has(d.nom)) return;
    const nom = String.raw`(?<![\w$${d.membre ? '' : '.'}])${d.nom.replace(/\$/g, '\\$')}`;
    // Un appel `X(` · ou l'aide passée en VALEUR, en argument (`.then(X)`, `act(X)`, `beforeEach(X)`), hors `{ pas: X }`.
    const appel = new RegExp(String.raw`${nom}\s*\(|(?<!\bpas\s*:\s*)${nom}(?=\s*[,)])`, 'g');
    const propres = defs.filter((x) => x.nom === d.nom).map((x) => x.at);
    const sites = [...s.matchAll(appel)].map((m) => m.index!).filter((i) => !propres.includes(i));
    parNom.set(d.nom, { nom: d.nom, ligne: ligneDe(source, d.at), appels: sites.length, sites, ...(via ? { via } : {}) });
    for (const i of sites) { const e = englobante(i, d.nom); if (e) ajouter(e, d.nom); }
  };
  for (const i of sommeils(source)) { const d = englobante(i); if (d) ajouter(d); }
  return [...parNom.values()].map(({ sites: _, ...a }) => a);
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(nom)) out.push(relative(RACINE, p).split('\\').join('/'));
  }
  return out.sort();
}

const ETAT = 'attendre un ÉTAT, jamais une durée · passe par `attendreEtat` (un état qu’on attend de voir venir) ou `attendreAbsence` (une absence tenue dans la durée), `test/helpers/attendre-etat.ts`';
const VERS = `${ETAT} · ou, pour une latence simulée ou un \`dormir\` injecté, déclare-la dans \`EXEMPTIONS\` de \`test/attente-fixe-cliquet.test.ts\` avec sa raison`;

/**
 * Les fautes d'un fichier sur ses AIDES · chaque aide trouvée comparée à son compte figé. Un appel de
 * plus nomme le CHAMP à écrire (`appels.X: N` à l'entrée du fichier) · un renommage d'aide arrive
 * ici, et « déclare-la dans EXEMPTIONS » seul ne dit pas quoi écrire.
 */
function fautesAides(f: string, texte: string, figes: Readonly<Record<string, number>>): string[] {
  const fautes: string[] = [];
  const trouvees = aides(texte);
  for (const a of trouvees) {
    const fige = figes[a.nom] ?? 0;
    const quoi = `${f} · l’aide \`${a.nom}\` (ligne ${a.ligne}, ${a.via ? `elle appelle \`${a.via}\`` : 'une attente fixe'}) est appelée ${a.appels} fois pour ${fige} figé(s)`;
    if (a.appels > fige) fautes.push(`${quoi} · un appel de plus est une attente fixe nouvelle · ${ETAT} · ou, si c’est un renommage ou une latence légitime, ajoute \`appels.${a.nom}: ${a.appels}\` à l’entrée de \`${f}\` dans \`EXEMPTIONS\``);
    if (a.appels < fige) fautes.push(`${quoi} · compte périmé, abaisse \`appels.${a.nom}\` à ${a.appels}${a.appels === 0 ? ' (retire-la)' : ''}`);
  }
  for (const nom of Object.keys(figes)) {
    if (!trouvees.some((a) => a.nom === nom)) fautes.push(`${f} · appels figés pour \`${nom}\`, qui n’est plus une aide à attente fixe · retire \`appels.${nom}\``);
  }
  return fautes;
}

describe('le détecteur · il voit chaque forme de sommeil, et seulement elles', () => {
  const Z = 'setTime' + 'out';
  it.each([
    ['inline, résolveur r', `await new Promise((r) => ${Z}(r, 20));`],
    ['résolveur ok, sans parenthèses', `await new Promise(ok => ${Z}(ok, 400));`],
    ['typée, à accolades, délai variable', `const dormir = (ms: number) => new Promise<void>((r) => { ${Z}(r, ms); });`],
    ['sur deux lignes', `await new Promise((r) =>\n  ${Z}(r, 50));`],
    ['dans act', `await act(async () => { await new Promise((r) => ${Z}(r, 5)); });`],
    ['timers/promises', `import { ${Z} as dormir } from 'node:timers/promises';`],
    ['un rappel qui résout sans valeur', `await new Promise((r) => ${Z}(() => r(), 400));`],
    ['un rappel à accolades qui résout sans valeur', `await new Promise((r) => ${Z}(() => { r(); }, 400));`],
    ['un résolveur en `function`', `await new Promise(function (r) { ${Z}(r, 400); });`],
    ['un résolveur typé par une signature', `await new Promise((r: () => void) => ${Z}(r, 400));`],
    ['deux paramètres', `await new Promise((r, _j) => ${Z}(r, 400));`],
    ['le minuteur de `globalThis`', `await new Promise((r) => globalThis.${Z}(r, 400));`],
    ['tout à la fois', `await new Promise<void>(function attendre(r: (v?: unknown) => void, _j: unknown) { globalThis.${Z}(function () { r(); }, 400); });`],
    ['un appel de `pasDansAct` à délai non nul', 'await pasDansAct(400);'],
    // Une valeur RIEN, ou une valeur JETÉE · le sommeil reste un sommeil.
    ['une valeur jetée · attendue en tête d’instruction', `await new Promise((r) => ${Z}(() => r(true), 400));`],
    ['une valeur jetée · dans un bloc (`{ await …`)', `await act(async () => { await new Promise((r) => ${Z}(() => r(1), 5)); });`],
    ['une valeur jetée · rappel `function`', `await new Promise(function (r) { ${Z}(function () { r(true); }, 400); });`],
    ['une valeur jetée · des parenthèses sur deux niveaux', `await new Promise((r) => ${Z}(() => r(lire(a, f(b))), 400));`],
    ['`r(undefined)`, promesse gardée', `const p = new Promise((r) => ${Z}(() => r(undefined), 400));`],
    ['`r(void 0)`, promesse gardée', `const p = new Promise((r) => ${Z}(() => { r(void 0); }, 400));`],
    // Le résolveur transtypé, le minuteur affecté ou jeté, le résolveur `async`.
    ['un résolveur transtypé', `await new Promise((resolve) => ${Z}(resolve as () => void, 400));`],
    ['un résolveur transtypé deux fois', `await new Promise((resolve) => ${Z}(resolve as unknown as () => void, 400));`],
    ['un minuteur gardé dans une constante', `await new Promise((r) => { const t = ${Z}(r, 400); void t; });`],
    ['un minuteur gardé dans une variable', `await new Promise((r) => { minuteur = ${Z}(r, 400); });`],
    ['un minuteur jeté par `void`', `await new Promise((r) => void ${Z}(r, 400));`],
    ['un résolveur `async`', `await new Promise(async (r) => { ${Z}(r, 400); });`],
    // `Promise.withResolvers()` · le même sommeil, en deux instructions.
    ['`withResolvers` déstructuré', `const { promise, resolve } = Promise.withResolvers<void>();\n${Z}(resolve, 400);\nawait promise;`],
    ['`withResolvers` déstructuré sous un alias', `const { promise: p, resolve: fin } = Promise.withResolvers();\n${Z}(() => fin(), 400);\nawait p;`],
    ['`withResolvers` gardé dans un objet', `const d = Promise.withResolvers();\n${Z}(d.resolve, 400);\nawait d.promise;`],
    ['deux `withResolvers`, un seul minuteur · compté une fois', `it('a', async () => { const { promise, resolve } = Promise.withResolvers(); resolve(); await promise; });\nit('b', async () => { const { promise, resolve } = Promise.withResolvers(); ${Z}(resolve, 400); await promise; });`],
  ])('compte · %s', (_, src) => {
    expect(attentesFixes(src), `le détecteur ne voit pas « ${src} »`).toHaveLength(1);
  });
  it.each([
    ['un tour de boucle (0)', `await new Promise((r) => ${Z}(r, 0));`],
    ['sans délai', `await new Promise((r) => ${Z}(r));`],
    ['une valeur différée', `new Promise((r) => ${Z}(() => r({ ok: true }), 10));`],
    ['une valeur différée par `globalThis`', `new Promise((r) => globalThis.${Z}(() => r(1), 10));`],
    ['un délai de garde qui rejette', `new Promise((_, rej) => { t = ${Z}(() => rej(new Error('DELAI')), 500); });`],
    ['deux paramètres, le minuteur rejette', `new Promise((r, j) => ${Z}(j, 400));`],
    ['un minuteur nu', `${Z}(() => champ.focus(), 50);`],
    ['`pasDansAct` passé en option à `attendreEtat`', "await attendreEtat('x', () => ok, { pas: pasDansAct });"],
    ['`pasDansAct(0)`', 'await pasDansAct(0);'],
    // Une valeur RENDUE, affectée ou passée · une latence simulée qui répond (`parcours-image-focus-course`).
    ['une valeur rendue par un faux', `m.lire.mockImplementation(() => new Promise((r) => ${Z}(() => r({ ok: true, vue: vueImage({ devis: D as never }) }), 10)));`],
    ['une valeur gardée · affectée', `const vue = await new Promise((r) => ${Z}(() => r(lire()), 10));`],
    ['une valeur gardée · rendue', `return await new Promise((r) => ${Z}(() => r(lire()), 10));`],
    ['une valeur gardée · garde de course', `const v = await Promise.race([travail(), new Promise((r) => ${Z}(() => r('DELAI'), 500))]);`],
    ['un minuteur jeté par `void`, tour de boucle', `await new Promise((r) => void ${Z}(r, 0));`],
    ['`withResolvers`, tour de boucle', `const { promise, resolve } = Promise.withResolvers();\n${Z}(resolve, 0);\nawait promise;`],
    ['`withResolvers`, le minuteur rejette', `const { promise, reject } = Promise.withResolvers();\n${Z}(reject, 400);\nawait promise;`],
    ['`withResolvers`, une valeur rendue', `const { promise, resolve } = Promise.withResolvers();\n${Z}(() => resolve(lire()), 10);\nreturn promise;`],
  ])('ne compte pas · %s', (_, src) => {
    expect(attentesFixes(src), `le détecteur compte « ${src} »`).toEqual([]);
  });
});

describe('les aides · une attente fixe définie une fois est comptée à chaque appel', () => {
  const Z = 'setTime' + 'out';
  it.each([
    ['une variable à paramètre par défaut', `const laisser = async (ms = 400) => act(async () => { await new Promise((r) => ${Z}(r, ms)); });\nawait laisser();\nawait laisser(50);`, [{ nom: 'laisser', appels: 2 }]],
    ['une fonction sur plusieurs lignes', `async function monter(el) {\n  rendre(el);\n  await act(async () => { await new Promise((r) => ${Z}(r, 50)); });\n}\nawait monter(a);\nawait monter(b);\nawait monter(c);`, [{ nom: 'monter', appels: 3 }]],
    ['une aide qui en appelle une autre', `const attendre = async () => { await act(async () => { await new Promise((r) => ${Z}(r, 20)); }); };\nasync function cliquer(e) {\n  e.click();\n  await attendre();\n}\nawait cliquer(a);\nawait cliquer(b);`, [{ nom: 'attendre', appels: 1 }, { nom: 'cliquer', appels: 2, via: 'attendre' }]],
    ['un appel cité en commentaire ou dans un texte ne compte pas', `const pause = (ms) => new Promise((r) => ${Z}(r, ms));\n// await pause(400) ici\nconst t = 'pause(1)';\nawait pause(400);`, [{ nom: 'pause', appels: 1 }]],
    ['`obj.X(` est un autre nom qu’une variable `X`', `const attendre = () => new Promise((r) => ${Z}(r, 30));\nawait w.attendre((l) => l === 'PRET');\nawait attendre();`, [{ nom: 'attendre', appels: 1 }]],
    ['une propriété d’un faux · appelée par `obj.X(`', `const faux = { create: async () => { await new Promise((r) => ${Z}(r, 40)); } };\nawait faux.create();`, [{ nom: 'create', appels: 1 }]],
    ['un `pasDansAct` dans une aide', 'const souffler = () => pasDansAct(400);\nawait souffler();', [{ nom: 'souffler', appels: 1 }]],
    ['un sommeil hors de toute définition nommée · aucune aide', `it('x', async () => {\n  await new Promise((r) => ${Z}(r, 40));\n});`, []],
    // Une aide passée en VALEUR · l'appel a lieu ailleurs, la durée est la même.
    ['passée à `.then`', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait charger().then(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    ['passée à `act`, en premier de deux arguments', `const laisser = async () => { await new Promise((r) => ${Z}(r, 30)); };\nawait act(laisser, 1);`, [{ nom: 'laisser', appels: 1 }]],
    ['passée à `.map`, puis à `beforeEach`', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait Promise.all(lignes.map(laisser));\nbeforeEach(laisser);`, [{ nom: 'laisser', appels: 2 }]],
    ['passée en valeur DANS une aide · celle-ci en hérite', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nconst cliquer = async (e) => { e.click(); await act(laisser); };\nawait cliquer(a);`, [{ nom: 'laisser', appels: 1 }, { nom: 'cliquer', appels: 1, via: 'laisser' }]],
    ['passée en option `{ pas: X }` · ne compte pas', `const souffler = () => new Promise((r) => ${Z}(r, 5));\nawait attendreEtat('x', () => ok, { pas: souffler });`, [{ nom: 'souffler', appels: 0 }]],
    ['passée en option `{ pas: X, … }` · ne compte pas', `const souffler = () => new Promise((r) => ${Z}(r, 5));\nawait attendreEtat('x', () => ok, { pas: souffler, borneMs: 50 });`, [{ nom: 'souffler', appels: 0 }]],
    ['lue hors argument (`typeof X`, `X.name`) · ne compte pas', `const laisser = () => new Promise((r) => ${Z}(r, 30));\ntype L = ReturnType<typeof laisser>;\nconst n = laisser.name;`, [{ nom: 'laisser', appels: 0 }]],
    ['`obj.X` en valeur est un autre nom qu’une variable `X`', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait p.then(w.laisser);`, [{ nom: 'laisser', appels: 0 }]],
    // Les CYCLES · le comptage transitif termine, chaque aide comptée une fois.
    ['cycle · `a` ↔ `b`', `const a = async () => { await new Promise((r) => ${Z}(r, 10)); await b(); };\nconst b = async () => { await a(); };\nawait b();`, [{ nom: 'a', appels: 1 }, { nom: 'b', appels: 2, via: 'a' }]],
    ['cycle · une récursion', `async function boucle(n) {\n  await new Promise((r) => ${Z}(r, 10));\n  if (n > 0) await boucle(n - 1);\n}\nawait boucle(3);`, [{ nom: 'boucle', appels: 2 }]],
  ])('%s', (_, src, attendu) => {
    expect(aides(src).map(({ nom, appels, via }) => ({ nom, appels, ...(via ? { via } : {}) })), `les aides de « ${src} »`).toEqual(attendu);
  });

  it('un appel de plus nomme le champ à écrire · `appels.X: N` à l’entrée du fichier', () => {
    const src = `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait laisser();\nawait laisser();`;
    const [faute, ...reste] = fautesAides('x-ecran.test.tsx', src, { laisser: 1 });
    expect(reste).toEqual([]);
    expect(faute).toContain('l’aide `laisser` (ligne 1, une attente fixe) est appelée 2 fois pour 1 figé(s)');
    expect(faute).toMatch(/ou, si c’est un renommage ou une latence légitime, ajoute `appels\.laisser: 2` à l’entrée de `x-ecran\.test\.tsx` dans `EXEMPTIONS`$/);
  });
});

describe('cliquet · aucune attente fixe nouvelle dans les tests de apps/web', () => {
  const fichiers = sources(RACINE).filter((f) => !EXCLUS.has(f));
  const textes = new Map(fichiers.map((f) => [f, readFileSync(join(RACINE, f), 'utf8')] as const));
  const releve = new Map([...textes].map(([f, t]) => [f, attentesFixes(t)] as const));

  it('préalable · le relevé lit les tests (et l’utilitaire exclu existe, avec le nom que le cliquet cherche)', () => {
    expect(fichiers.length, 'préalable · aucun fichier de test relevé').toBeGreaterThan(100);
    expect(existsSync(join(RACINE, 'helpers/attendre-etat.ts')), 'préalable · l’utilitaire commun a bougé').toBe(true);
    expect(readFileSync(join(RACINE, 'helpers/attendre-etat.ts'), 'utf8'), 'préalable · `pasDansAct` a changé de nom · le cliquet ne verrait plus ses appels').toMatch(/export const pasDansAct\b/);
    expect(fichiers, 'préalable · le relevé ne descend pas dans les sous-dossiers').toContain('helpers/pg-memoire.ts');
  });

  it('un fichier hors exemptions ne porte AUCUNE attente fixe', () => {
    const fautes = [...releve].filter(([f, l]) => l.length > 0 && !EXEMPTIONS[f])
      .map(([f, l]) => `${f} · ${l.length} attente(s) fixe(s), ligne(s) ${l.join(', ')} · ${VERS}`);
    expect(fautes).toEqual([]);
  });

  it('un fichier exempté garde EXACTEMENT son compte · une de plus est une attente nouvelle, une de moins une exemption périmée', () => {
    const fautes: string[] = [];
    for (const [f, e] of Object.entries(EXEMPTIONS)) {
      expect(e.raison.trim(), `${f} · une exemption sans raison`).not.toBe('');
      const l = releve.get(f);
      if (!l) { fautes.push(`${f} · exemption d’un fichier absent · retire-la`); continue; }
      if (l.length > e.n) fautes.push(`${f} · ${l.length} attente(s) fixe(s) pour ${e.n} exemptée(s), ligne(s) ${l.join(', ')} · ${VERS}`);
      if (l.length < e.n) fautes.push(`${f} · ${l.length} attente(s) fixe(s) pour ${e.n} exemptée(s) · exemption périmée, abaisse son compte à ${l.length}${l.length === 0 ? ' (retire la ligne)' : ''}`);
    }
    expect(fautes).toEqual([]);
  });

  it('une aide à attente fixe garde EXACTEMENT ses appels · un appel de plus est une attente nouvelle, un de moins un compte périmé', () => {
    const fautes = [...textes].flatMap(([f, t]) => fautesAides(f, t, EXEMPTIONS[f]?.appels ?? {}));
    expect(fautes).toEqual([]);
  });
});
