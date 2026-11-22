import { describe, expect, it } from 'vitest';
import ts from 'typescript';
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
 * La LECTURE · chaque fichier est lu par le parseur TypeScript (`ts.createSourceFile`), plus aucune
 * expression régulière sur le source · commentaires, textes, gabarits et expressions régulières ne
 * sont que des jetons (un backtick ou une parenthèse dans `/…/` ne déborde plus), la grammaire dit
 * où finit une instruction (`else`, sans point-virgule). Les NOMS des aides sont résolus par le
 * vérificateur de TypeScript sur ce seul fichier (sans bibliothèque ni import) · ses vraies portées
 * (paramètre, `const`/`let`/`var`, déstructuration, en-tête de `for`, `catch`, fonction hissée).
 *
 * Ce qu'on compte · dans `apps/web/test` (tous les `.ts` / `.tsx`, sous-dossiers compris), chaque
 * PROMESSE DE SOMMEIL · `new Promise(EXÉCUTEUR)` dont l'exécuteur (flèche ou `function`, `async`
 * ou non, résolveur typé ou non, un second paramètre ou non) arme un MINUTEUR à délai non nul ·
 * `setTimeout`, `globalThis.` / `window.` / `global.` / `self.setTimeout`, ou un alias (`const st =
 * setTimeout`, `import { setTimeout as st } from 'node:timers'`), gardé (`const t = …`), jeté
 * (`void …`) ou rangé n'importe où dans l'exécuteur (`{ const ms = N; setTimeout(r, ms); }`) · dont
 * le RAPPEL est le résolveur, transtypé ou non (`r`, `r as () => void`), ou une fonction qui l'appelle
 * dans une de ses instructions (`() => r()`, `() => void r()`, `() => { fini = true; r(); }`) avec
 * RIEN (`r()`, `r(undefined)`, `r(void 0)`) ou avec une valeur JETÉE (`await new Promise((r) =>
 * setTimeout(() => r(true), 400));` en tête d'instruction · le résultat ne va nulle part, il ne
 * reste que la durée). Un délai écrit par une variable (`ms`, `faux.latenceMs`) compte aussi, il
 * n'est pas 0 par construction. Comptent encore · le même sommeil en deux instructions
 * (`Promise.withResolvers()` puis CHAQUE minuteur qui appelle son résolveur, dans la portée de la
 * déclaration), chaque APPEL de `pasDansAct(N)` à délai non nul (le sommeil qu'exporte l'utilitaire
 * exclu ci-dessous, ou son alias `import { pasDansAct as p }` · `{ pas: pasDansAct }` n'en est pas
 * un) et chaque import de `timers/promises` (le même sommeil, sous un autre nom). Ne comptent PAS ·
 * le tour de boucle `setTimeout(r, 0)` (ou sans délai), une valeur rendue, affectée ou passée
 * (`mockImplementation(() => new Promise((r) => setTimeout(() => r(v), 10)))`, un faux qui RÉPOND
 * après une latence · `const v = await …`, `Promise.race([…])`, `.then(use)`), un délai de garde qui
 * REJETTE (`setTimeout(() => rej(…))`), une COURSE · le résolveur part aussi ailleurs (`em.once('pret',
 * r); setTimeout(r, 1000)` · un état, avec un délai de secours).
 *
 * C'est plus large que « un sommeil suivi d'un `expect` » · une attente cachée dans une AIDE
 * (`const laisser = (ms = 400) => … setTimeout(r, ms) …`, puis `await laisser(); expect(…)`) est le
 * même pari. Le sommeil ne s'écrit qu'une fois, dans la définition · c'est l'APPEL qui attend. Une
 * aide est la définition nommée la plus proche qui englobe un sommeil (`const X = (…) =>`,
 * `function X(` ou `function X<T>(`, une propriété `X: () =>`, une méthode `X() {`, un champ de classe
 * `X = () =>`), puis, de proche en proche, celle qui appelle une aide (`cliquer` qui appelle
 * `attendre`). Ses appels dans le fichier sont COMPTÉS et FIGÉS (`appels`) au même titre que les
 * sommeils · un appel `X(` (`X<T>(`, `X?.(`, `new X(`), ou l'aide passée en VALEUR en argument d'un
 * appel (`.then(X)`, `act(X)`, `.map(X)`, `beforeEach(X)`, `act(c ? x : X)`) · par son nom ou par un
 * ALIAS (`const encore = laisser`, puis `encore()`) · une aide sans compte figé vaut 0 appel. N'est
 * PAS l'aide · un nom dans un tableau, un objet ou une déstructuration (`[X, y]`, `{ X, y }`, `{ pas:
 * X }` · le pas d'un sondage), ce qu'on lit sans l'appeler (`expect(X)`, `X.name`, `typeof X`), et un
 * HOMONYME, appelé ou passé · un paramètre (`(nom, X) =>`, `({ X }) =>`, `it.each(…)('…', (X) => …)`),
 * une variable d'un autre bloc (`const [X, setX] = useState()`, `for (const X of l)`). Pour une
 * propriété ou une méthode, `obj.X` est bien elle (quel que soit `obj`) et un `X` nu un homonyme. Le
 * comptage de proche en proche termine sur un cycle (`a` ↔ `b`, une récursion) · chaque aide n'est
 * relevée qu'une fois. Le cas légitime (un faux qui simule une latence, un `dormir` injecté au code
 * testé) se DÉCLARE ici, avec sa raison.
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
 * dont la valeur est RENDUE au code testé, pas jetée. Le tour 2 (homonymes écartés, tête
 * d'instruction lue sans `m`, source masqué, valeur sans retour arrière, `indices`) mesuré sur les
 * 680 fichiers de main 513df40a · relevé IDENTIQUE à celui de main. Le tour 3 (union des lectures
 * brute et masquée, `act<void>(X)`, `f?.(X)`, clé de déstructuration) · relevé IDENTIQUE. Le tour 4
 * (l'AST, les vraies portées, les alias, le ternaire) mesuré sur les 680 fichiers de main 1c1ee457 ·
 * sommeils IDENTIQUES (49 dans 41 fichiers, mêmes lignes), aides et appels IDENTIQUES (46 dans 25
 * fichiers, mêmes lignes) À DEUX ÉCARTS PRÈS, deux faux négatifs des regex, figés ici avec leur
 * raison · `sousEspion<T>(` (`l0-api-ad` ~94, 7 appels · `l0-jalons` ~54, 1 appel) · son paramètre de
 * type cachait la définition à `function X\s*\(`, chaque appel attend 30 ms.
 *
 * Les LIMITES · ce cliquet protège contre l'ERREUR (on recopie une attente fixe voisine, on
 * rappelle l'aide du fichier), pas contre la MALVEILLANCE · il lit le source, il n'exécute rien et
 * ne type rien. Il ne voit pas · `promisify(setTimeout)` ; une boucle de `setTimeout(r, 0)` (chaque
 * tour est un tour de boucle, la somme est une durée) ; un nom calculé (`globalThis['set' +
 * 'Timeout']`) ; une aide rangée dans un objet ou un tableau (`{ onFin: laisser }`, `[laisser,
 * x].forEach(…)`), passée à `expect`, ou dont l'alias passe par une affectation (`let a; a =
 * laisser`) ou une déstructuration ; une valeur constante GARDÉE (`const v = await new Promise((r) =>
 * setTimeout(() => r(1), N))` · on la croit utile) ; une promesse à valeur attendue plus loin (`const
 * p = new Promise(… r(v) …); await p`) ; un `differe()` maison (`{ p, resoudre }` rendu par une
 * fonction) résolu par un minuteur ; un résolveur passé par une autre fonction avant le minuteur. Un
 * membre se reconnaît à son NOM · `autre.X(` compte pour la propriété `X` de n'importe quel objet (sans
 * types, l'objet n'est pas résolu). Le résolveur d'un `withResolvers` et celui d'un exécuteur se
 * reconnaissent à leur nom dans leur portée, sans résolution · un homonyme qui l'y masque se lit
 * comme lui.
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
  // `sousEspion<T>(` · le paramètre de type cachait la définition aux regex (tour 4, AST) · chaque appel attend 30 ms.
  'l0-api-ad.test.ts': { n: 1, appels: { sousEspion: 7 }, raison: FEU },
  'l0-jalons.test.ts': { n: 1, appels: { sousEspion: 1 }, raison: FEU },
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

/* ─────────── La LECTURE · le parseur TypeScript, jamais une expression régulière ─────────── */

interface Lu {
  sf: ts.SourceFile;
  /** Le vérificateur, créé à la première résolution de nom (seuls les fichiers à sommeil en ont besoin). */
  verif?: ts.TypeChecker;
  /** Ses sommeils, relevés une fois. */
  sommeils?: Sommeil[];
}
const LUS = new Map<string, Lu>();

/**
 * Le source lu par le parseur TypeScript (`.tsx` en JSX), une fois par texte · le relevé lit chaque
 * fichier deux fois (sommeils, puis aides). Commentaires, textes, gabarits et expressions régulières
 * ne sont plus que des jetons · plus rien à blanchir.
 */
function lire(source: string, fichier: string): Lu {
  const cle = `${fichier}\n${source}`;
  let lu = LUS.get(cle);
  if (!lu) {
    lu = { sf: ts.createSourceFile(`/${fichier}`, source, ts.ScriptTarget.Latest, true, fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
    LUS.set(cle, lu);
  }
  return lu;
}

/**
 * Le vérificateur d'un seul fichier, sans bibliothèque ni import résolu · il ne type rien, il
 * RÉSOUT les noms par leurs vraies portées (paramètre, `const`/`let`/`var`, déstructuration, en-tête
 * de `for`, `catch`, fonction hissée). Un nom qu'il ne résout pas est un global.
 */
function verificateur(lu: Lu): ts.TypeChecker {
  if (lu.verif) return lu.verif;
  const { sf } = lu;
  const hote: ts.CompilerHost = {
    getSourceFile: (n) => (n === sf.fileName ? sf : undefined),
    getDefaultLibFileName: () => '/lib.d.ts',
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (n) => n === sf.fileName,
    readFile: () => undefined,
  };
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve };
  lu.verif = ts.createProgram({ rootNames: [sf.fileName], options, host: hote }).getTypeChecker();
  return lu.verif;
}

/** Sans ces trois mots, un fichier n'a aucun sommeil (un alias s'écrit avec le nom qu'il renomme) · il n'est pas parsé. */
const PEUT_DORMIR = /setTimeout|pasDansAct|timers\/promises/;

const ligne = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

/** L'expression sous ses parenthèses et transtypages · `(r)`, `r as () => void`, `r!`, `r satisfies T`. */
function nu(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}
/** Le premier parent qui n'est ni une parenthèse ni un transtypage. */
function parentNu(n: ts.Node): ts.Node {
  let p = n.parent;
  while (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isTypeAssertionExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p)) p = p.parent;
  return p;
}
const estFonction = (e: ts.Expression): e is ts.ArrowFunction | ts.FunctionExpression => ts.isArrowFunction(e) || ts.isFunctionExpression(e);

function visiter(n: ts.Node, f: (n: ts.Node) => void): void {
  f(n);
  ts.forEachChild(n, (c) => visiter(c, f));
}

const GLOBAUX = new Set(['globalThis', 'window', 'global', 'self']);
const estGlobalMinuteur = (e: ts.Expression) => ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && GLOBAUX.has(e.expression.text) && e.name.text === 'setTimeout';

/**
 * Les noms locaux du minuteur et de `pasDansAct` · le nom lui-même, puis ses ALIAS ·
 * `const st = setTimeout` (ou `globalThis.setTimeout`), `import { setTimeout as st } from 'node:timers'`,
 * `import { pasDansAct as p }`, `const p = pasDansAct`, de proche en proche.
 */
function nomsDormeurs(sf: ts.SourceFile): { minuteurs: Set<string>; pas: Set<string> } {
  const minuteurs = new Set(['setTimeout']);
  const pas = new Set(['pasDansAct']);
  const liens: [string, ts.Expression][] = [];
  visiter(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) liens.push([n.name.text, nu(n.initializer)]);
    if (ts.isImportSpecifier(n)) {
      const origine = (n.propertyName ?? n.name).text;
      if (origine === 'setTimeout') minuteurs.add(n.name.text);
      if (origine === 'pasDansAct') pas.add(n.name.text);
    }
  });
  for (let change = true; change;) {
    change = false;
    for (const [nom, v] of liens) {
      const cible = ts.isIdentifier(v) && (minuteurs.has(v.text) ? minuteurs : pas.has(v.text) ? pas : null);
      const ens = estGlobalMinuteur(v) ? minuteurs : cible || null;
      if (ens && !ens.has(nom)) { ens.add(nom); change = true; }
    }
  }
  return { minuteurs, pas };
}

/** Un délai NUL · absent (`setTimeout(r)`) ou écrit `0` · un tour de boucle, pas une durée. */
const delaiNul = (d: ts.Expression | undefined) => d === undefined || (ts.isNumericLiteral(d) && /^0+$/.test(d.getText()));
/** Une valeur qui n'en est pas une · `r()`, `r(undefined)`, `r(void …)`. */
const rien = (v: ts.Expression | undefined) => v === undefined || (ts.isIdentifier(nu(v)) && (nu(v) as ts.Identifier).text === 'undefined') || ts.isVoidExpression(nu(v));

/**
 * Le RAPPEL du minuteur résout-il, et avec quoi · le résolveur LUI-MÊME (`r`, `r as () => void`) ·
 * ou une fonction qui l'appelle (`() => r(v)`, `() => void r()`, `function () { r(v); }`, `() => {
 * fini = true; r(); }` · une instruction de son corps). `null` · le rappel ne résout pas.
 */
function resolution(rappel: ts.Expression, estRes: (e: ts.Expression) => boolean): { valeur?: ts.Expression } | null {
  const e = nu(rappel);
  if (estRes(e)) return {};
  if (!estFonction(e)) return null;
  const appel = (x: ts.Expression) => {
    let y = nu(x);
    if (ts.isVoidExpression(y)) y = nu(y.expression);
    return ts.isCallExpression(y) && estRes(nu(y.expression)) ? { valeur: y.arguments[0] } : null;
  };
  if (!ts.isBlock(e.body)) return appel(e.body);
  for (const st of e.body.statements) {
    const r = ts.isExpressionStatement(st) ? appel(st.expression) : null;
    if (r) return r;
  }
  return null;
}

/** Les minuteurs de `racine` dont le rappel résout `estRes` · la valeur qu'ils rendent, et si leur délai est nul. */
function minuteursResolvant(racine: ts.Node, estRes: (e: ts.Expression) => boolean, minuteurs: Set<string>, apres = -1): { appel: ts.CallExpression; valeur?: ts.Expression; nul: boolean }[] {
  const out: { appel: ts.CallExpression; valeur?: ts.Expression; nul: boolean }[] = [];
  visiter(racine, (n) => {
    if (!ts.isCallExpression(n) || n.pos < apres || n.arguments.length === 0) return;
    const c = nu(n.expression);
    if (!(ts.isIdentifier(c) && minuteurs.has(c.text)) && !estGlobalMinuteur(c)) return;
    const r = resolution(n.arguments[0]!, estRes);
    if (r) out.push({ appel: n, valeur: r.valeur, nul: delaiNul(n.arguments[1]) });
  });
  return out;
}

/**
 * Le résolveur ne part-il QUE dans des minuteurs · s'il part aussi ailleurs (`em.once('pret', r);
 * setTimeout(r, 1000)`), c'est une course entre un état et un délai de secours, pas un sommeil.
 */
function seulementPar(racine: ts.Node, estRes: (e: ts.Expression) => boolean, appels: ts.CallExpression[], apres = -1): boolean {
  let seul = true;
  visiter(racine, (n) => {
    if (!seul || n.pos < apres || !(ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) || !estRes(n)) return;
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return;
    seul = appels.some((a) => a.arguments[0]!.pos <= n.pos && n.end <= a.arguments[0]!.end);
  });
  return seul;
}

/**
 * La promesse est-elle attendue en TÊTE D'INSTRUCTION · `await new Promise(…);` seul, son résultat ne
 * va nulle part (après `;`, `{`, `else`, sans point-virgule au-dessus · la grammaire le dit, pas le
 * caractère d'avant). `.then(use)`, `const v = await …`, `return await …`, `expect(await …)` la lisent.
 */
function jetee(promesse: ts.NewExpression): boolean {
  const a = parentNu(promesse);
  return ts.isAwaitExpression(a) && ts.isExpressionStatement(parentNu(a));
}

interface Sommeil {
  noeud: ts.Node;
  /** La position lue pour la ligne · la parenthèse du `Promise`, le minuteur, l'appel. */
  pos: number;
}

/**
 * Les sommeils à délai non nul d'un source · une PROMESSE `new Promise(EXÉCUTEUR)` dont l'exécuteur
 * (flèche ou `function`, `async` ou non, résolveur typé ou non, un second paramètre ou non) arme un
 * minuteur qui résout avec RIEN, ou avec une valeur JETÉE · le minuteur d'un `Promise.withResolvers()`
 * qui résout avec rien, dans la portée de sa déclaration · un appel de `pasDansAct(N)`.
 */
function sommeils(lu: Lu): Sommeil[] {
  const { sf } = lu;
  if (lu.sommeils) return lu.sommeils;
  const { minuteurs, pas } = nomsDormeurs(sf);
  const out: Sommeil[] = [];
  const vus = new Set<ts.Node>();
  visiter(sf, (n) => {
    // La promesse · le résolveur est le PREMIER paramètre, un nom.
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Promise' && n.arguments?.length) {
      const ex = nu(n.arguments[0]!);
      if (!estFonction(ex)) return;
      const res = ex.parameters[0]?.name;
      if (!res || !ts.isIdentifier(res)) return;
      const estRes = (e: ts.Expression) => ts.isIdentifier(e) && e.text === res.text;
      const tous = minuteursResolvant(ex.body, estRes, minuteurs);
      const trouves = tous.filter((t) => !t.nul);
      if (trouves.length === 0 || !seulementPar(ex.body, estRes, tous.map((t) => t.appel))) return;
      if (trouves.some((t) => rien(t.valeur)) || jetee(n)) out.push({ noeud: n, pos: n.arguments.pos - 1 });
    }
    // `Promise.withResolvers()` · `{ resolve }`, `{ resolve: fin }`, ou `d` puis `d.resolve`.
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const i = nu(n.initializer);
      if (!ts.isCallExpression(i)) return;
      const c = nu(i.expression);
      if (!ts.isPropertyAccessExpression(c) || !ts.isIdentifier(c.expression) || c.expression.text !== 'Promise' || c.name.text !== 'withResolvers') return;
      let estRes: ((e: ts.Expression) => boolean) | null = null;
      if (ts.isIdentifier(n.name)) {
        const d = n.name.text;
        estRes = (e) => ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === d && e.name.text === 'resolve';
      } else if (ts.isObjectBindingPattern(n.name)) {
        const el = n.name.elements.find((b) => ((b.propertyName && ts.isIdentifier(b.propertyName) ? b.propertyName : b.name) as ts.Node).getText() === 'resolve');
        if (el && ts.isIdentifier(el.name)) { const r = el.name.text; estRes = (e) => ts.isIdentifier(e) && e.text === r; }
      }
      if (!estRes) return;
      // La portée · le bloc (ou le fichier) qui porte la déclaration, après elle · CHAQUE minuteur qui la résout.
      const portee = n.parent.parent.parent;
      const tous = minuteursResolvant(portee, estRes, minuteurs, n.end);
      if (!seulementPar(portee, estRes, tous.map((t) => t.appel), n.end)) return;
      for (const t of tous) {
        if (!t.nul && rien(t.valeur) && !vus.has(t.appel)) { vus.add(t.appel); out.push({ noeud: t.appel, pos: t.appel.getStart() }); }
      }
    }
    // `pasDansAct(N)` à délai non nul · le passer en valeur (`{ pas: pasDansAct }`) n'est pas un appel.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && pas.has(n.expression.text) && !delaiNul(n.arguments[0])) out.push({ noeud: n, pos: n.getStart() });
  });
  lu.sommeils = out.sort((a, b) => a.pos - b.pos);
  return lu.sommeils;
}

/** `timers/promises` · un import, un `export … from`, un `require(…)`, un `import(…)`. */
const TIMERS_PROMESSES = /^(?:node:)?timers\/promises$/;
function importsTimers(sf: ts.SourceFile): number[] {
  const out: number[] = [];
  if (!sf.text.includes('timers/promises')) return out;
  visiter(sf, (n) => {
    const spec = (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) ? n.moduleSpecifier
      : ts.isExternalModuleReference(n) ? n.expression
        : ts.isCallExpression(n) && ((ts.isIdentifier(n.expression) && n.expression.text === 'require') || n.expression.kind === ts.SyntaxKind.ImportKeyword) ? n.arguments[0]
          : undefined;
    if (spec && ts.isStringLiteralLike(spec) && TIMERS_PROMESSES.test(spec.text)) out.push(ligne(sf, spec.getStart()));
  });
  return out;
}

/** Les attentes fixes d'un source · leurs lignes (1 = première). */
function attentesFixes(source: string, fichier = 'cas.ts'): number[] {
  if (!PEUT_DORMIR.test(source)) return [];
  const lu = lire(source, fichier);
  return [...sommeils(lu).map((s) => ligne(lu.sf, s.pos)), ...importsTimers(lu.sf)].sort((a, b) => a - b);
}

/* ─────────── Les AIDES · une attente fixe définie une fois, appelée ailleurs dans le fichier ─────────── */

/**
 * Une définition NOMMÉE dont la valeur est une fonction · `const|let|var X = [async] (…) =>` (ou
 * `function`), `function X(` (déclarée ou nommée en expression), une propriété `X: () =>`, une
 * méthode `X() {`, un champ de classe `X = () =>` · les trois derniers sont des MEMBRES.
 */
function definition(n: ts.Node): { nom: ts.Identifier; membre: boolean } | null {
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && estFonction(nu(n.initializer))) return { nom: n.name, membre: false };
  if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) return { nom: n.name, membre: false };
  if ((ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n)) && ts.isIdentifier(n.name) && n.initializer && estFonction(nu(n.initializer))) return { nom: n.name, membre: true };
  if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name) && n.body) return { nom: n.name, membre: true };
  return null;
}

/** La définition nommée la plus proche qui englobe `n` · hors celles qui s'appellent `sauf` (une récursion remonte au-dessus). */
function englobante(n: ts.Node, sauf?: string): { noeud: ts.Node; nom: ts.Identifier; membre: boolean } | null {
  for (let p = n.parent; p; p = p.parent) {
    const d = definition(p);
    if (d && d.nom.text !== sauf) return { noeud: p, ...d };
  }
  return null;
}

/**
 * Le rôle d'un nom (`X`, ou `obj.X`) · `appel` (`X(`, `X<T>(`, `X?.(`, `new X(`) · `valeur` (passé
 * en ARGUMENT d'un appel, `.then(X)`, `act<void>(X)`, `f?.(X)`, entre parenthèses ou dans une
 * branche de ternaire, `act(c ? x : X)` · sauf à `expect`, qui lit sans appeler) · `null` sinon (un
 * tableau, un objet, une affectation, `X.name`, `X + 1`, `typeof X`).
 */
function role(e: ts.Expression): 'appel' | 'valeur' | null {
  const p = e.parent;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === e) return 'appel';
  let x: ts.Node = e;
  while (ts.isParenthesizedExpression(x.parent) || (ts.isConditionalExpression(x.parent) && x.parent.condition !== x)) x = x.parent;
  const a = x.parent;
  if (!(ts.isCallExpression(a) || ts.isNewExpression(a)) || !a.arguments?.some((y) => y === x)) return null;
  const c = nu(a.expression);
  const nomAppele = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
  return nomAppele === 'expect' ? null : 'valeur';
}

interface Aide {
  nom: string;
  /** La ligne de sa définition. */
  ligne: number;
  /** Ses appels dans le fichier. */
  appels: number;
  /** Les lignes de ces appels. */
  lignes: number[];
  /** L'aide qu'elle appelle, si elle n'est une attente fixe que par elle. */
  via?: string;
}

/**
 * Les AIDES d'un source · la définition nommée la plus proche qui englobe un sommeil · puis, de
 * proche en proche, celle qui englobe l'APPEL d'une aide (`cliquer` qui appelle `attendre` est la
 * même attente fixe, sous un autre nom). Chacune avec le nombre de ses appels dans le fichier.
 * Pour une variable ou une fonction, un nom compte quand il DÉSIGNE l'aide · le vérificateur le
 * résout (un paramètre, une variable, une déstructuration homonymes désignent autre chose), à
 * travers ses alias (`const encore = laisser`) · `obj.X` est un autre nom. Pour une propriété ou une
 * méthode, `obj.X` est bien elle (sans types, l'objet n'est pas lu) · un `X` nu est un homonyme.
 */
function aides(source: string, fichier = 'cas.ts'): Aide[] {
  if (!PEUT_DORMIR.test(source)) return [];
  const lu = lire(source, fichier);
  const { sf } = lu;
  const dormeurs = sommeils(lu);
  if (dormeurs.length === 0) return [];
  const verif = verificateur(lu);
  // Un nom, à travers ses alias · `const encore = laisser` désigne `laisser`.
  const cible = (s: ts.Symbol | undefined): ts.Symbol | undefined => {
    for (let k = 0; s && k < 20; k++) {
      const d = s.valueDeclaration;
      const v = d && ts.isVariableDeclaration(d) && d.initializer ? nu(d.initializer) : undefined;
      const t = v && ts.isIdentifier(v) ? verif.getSymbolAtLocation(v) : undefined;
      if (!t || t === s) return s;
      s = t;
    }
    return s;
  };
  // Les noms qui ont un rôle · relevés une fois.
  const usages: { e: ts.Identifier | ts.PropertyAccessExpression; nom: ts.Identifier; role: 'appel' | 'valeur' }[] = [];
  visiter(sf, (n) => {
    if (!ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name))) return;
    if (ts.isIdentifier(n) && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return;
    const r = role(n);
    if (r) usages.push({ e: n, nom: ts.isIdentifier(n) ? n : (n.name as ts.Identifier), role: r });
  });
  const parNom = new Map<string, { aide: Aide; symboles: Set<ts.Symbol>; membre: boolean; sites: Map<number, number> }>();
  const ajouter = (d: { nom: ts.Identifier; membre: boolean }, via?: string) => {
    const nom = d.nom.text;
    const sym = d.membre ? undefined : verif.getSymbolAtLocation(d.nom);
    let a = parNom.get(nom);
    if (a && (d.membre ? a.membre : !sym || a.symboles.has(sym))) return;
    if (!a) {
      a = { aide: { nom, ligne: ligne(sf, d.nom.getStart()), appels: 0, lignes: [], ...(via ? { via } : {}) }, symboles: new Set(), membre: false, sites: new Map() };
      parNom.set(nom, a);
    }
    if (d.membre) a.membre = true;
    else if (sym) a.symboles.add(sym);
    const nouveaux: ts.Node[] = [];
    for (const u of usages) {
      if (u.nom.text !== nom && !ts.isIdentifier(u.e)) continue;
      const pos = u.nom.getStart();
      if (a.sites.has(pos)) continue;
      const sy = ts.isIdentifier(u.e) && a.symboles.size > 0 ? cible(verif.getSymbolAtLocation(u.e)) : undefined;
      const designe = ts.isIdentifier(u.e) ? sy !== undefined && a.symboles.has(sy) : a.membre;
      if (!designe) continue;
      a.sites.set(pos, ligne(sf, pos));
      nouveaux.push(u.e);
    }
    for (const e of nouveaux) { const en = englobante(e, nom); if (en) ajouter(en, nom); }
  };
  for (const s of dormeurs) { const d = englobante(s.noeud); if (d) ajouter(d); }
  return [...parNom.values()].map(({ aide, sites }) => {
    const pos = [...sites.keys()].sort((x, y) => x - y);
    return { ...aide, appels: pos.length, lignes: pos.map((p) => sites.get(p)!) };
  });
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
  const trouvees = aides(texte, f);
  for (const a of trouvees) {
    const fige = figes[a.nom] ?? 0;
    const quoi = `${f} · l’aide \`${a.nom}\` (ligne ${a.ligne}, ${a.via ? `elle appelle \`${a.via}\`` : 'une attente fixe'}) est appelée ${a.appels} fois pour ${fige} figé(s)${a.lignes.length ? `, ligne(s) ${a.lignes.join(', ')}` : ''}`;
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
    // Un commentaire n'est qu'un jeton · il ne cache pas le minuteur.
    ['un commentaire avant le minuteur', `await new Promise((r) => { /* le montage */ ${Z}(r, 400); });`],
    ['un commentaire de ligne avant le minuteur', `await new Promise((r) => { // le montage\n  ${Z}(r, 400);\n});`],
    ['`withResolvers`, un commentaire dans le minuteur', `const { promise, resolve } = Promise.withResolvers();\n${Z}(/* fin */ resolve, 400);\nawait promise;`],
    // Un commentaire au-dessus ne dédouble pas l'attente (les regex lisaient deux fois, le brut et le masque).
    ['un commentaire en fin de ligne au-dessus · compté une fois', `charger(); // la suite\nawait new Promise((r) => ${Z}(r, 30));`],
    // Un backtick dans une expression régulière est un jeton de l'expression · il n'ouvre aucun gabarit.
    // (Trois backticks · le masque des regex y ouvrait un faux gabarit que refermait celui d'en dessous.)
    ['un backtick dans une expression régulière, au-dessus', `const CODE = /\`([^\`]+)\`/g;\nawait new Promise((r) => ${Z}(r, 400));\nexpect(md).toContain(\`fin\`);`],
    ['`withResolvers`, un backtick dans une expression régulière au-dessus', `const CODE = /\`([^\`]+)\`/g;\nconst { promise, resolve } = Promise.withResolvers();\n${Z}(resolve, 400);\nawait promise;\nexpect(md).toContain(\`fin\`);`],
    // La tête d'instruction se lit par-dessus les retours à la ligne.
    ['une valeur jetée · après un retour à la ligne', `charger();\n  await new Promise((r) => ${Z}(() => r(1), 10));`],
    ['deux `withResolvers`, un seul minuteur · compté une fois', `it('a', async () => { const { promise, resolve } = Promise.withResolvers(); resolve(); await promise; });\nit('b', async () => { const { promise, resolve } = Promise.withResolvers(); ${Z}(resolve, 400); await promise; });`],
    // Les LIMITES des regex que la lecture par l'AST ferme · une par limite.
    ['une valeur jetée · après `else`', `if (pret) lire(); else await new Promise((r) => ${Z}(() => r(1), 10));`],
    ['une valeur jetée · sans point-virgule au-dessus', `charge = true\nawait new Promise((r) => ${Z}(() => r(1), 10))`],
    ['un rappel `() => void r()`', `await new Promise((r) => ${Z}(() => void r(), 400));`],
    ['un rappel qui fait autre chose avant de résoudre', `await new Promise((r) => ${Z}(() => { fini = true; r(); }, 400));`],
    ['un délai rangé dans le corps', `await new Promise((r) => { const ms = 400; ${Z}(r, ms); });`],
    ['une valeur jetée · imbriquée sur trois niveaux de parenthèses', `await new Promise((r) => ${Z}(() => r(f(g(h(1)))), 400));`],
    ['`withResolvers` · le second minuteur (le premier est un tour de boucle)', `const { promise, resolve } = Promise.withResolvers();\n${Z}(resolve, 0);\n${Z}(resolve, 400);\nawait promise;`],
    ['un alias du minuteur · `const st = setTimeout`', `const st = ${Z};\nawait new Promise((r) => st(r, 400));`],
    ['un alias du minuteur · importé de `node:timers`', `import { ${Z} as st } from 'node:timers';\nawait new Promise((r) => st(r, 400));`],
    ['un alias de `pasDansAct` · `import { pasDansAct as p }`', "import { pasDansAct as p } from './helpers/attendre-etat';\nawait p(400);"],
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
    // Une ligne qui prolonge l'instruction d'au-dessus n'est pas une tête d'instruction · la grammaire le dit.
    ['une valeur gardée · `const v =` puis retour à la ligne', `const vue =\n    await new Promise((r) => ${Z}(() => r(lire()), 10));`],
    ['une valeur gardée · `expect(` puis retour à la ligne', `expect(\n  await new Promise((r) => ${Z}(() => r(lire()), 10)),\n).toBe(1);`],
    ['une valeur gardée · lue par `.then(use)` à la ligne', `await new Promise((r) => ${Z}(() => r(lire()), 10))\n  .then(use);`],
    ['un sommeil cité en commentaire', `// await new Promise((r) => ${Z}(r, 400));\nconst x = 1;`],
    ['un sommeil cité en commentaire de bloc', `/* await new Promise((r) => ${Z}(r, 400)); */\nconst x = 1;`],
    ['un `withResolvers` cité en commentaire', `/*\nconst { promise, resolve } = Promise.withResolvers();\n${Z}(resolve, 400);\n*/`],
    // Le minuteur se cherche dans tout l'exécuteur · un résolveur qui part AUSSI ailleurs est une course, pas un sommeil.
    ['une course · le résolveur part aussi sur un événement', `await new Promise((r) => { em.once('pret', r); ${Z}(r, 1000); });`],
    ['une course · `withResolvers` résolu aussi par un événement', `const { promise, resolve } = Promise.withResolvers();\nem.once('pret', resolve);\n${Z}(resolve, 1000);\nawait promise;`],
  ])('ne compte pas · %s', (_, src) => {
    expect(attentesFixes(src), `le détecteur compte « ${src} »`).toEqual([]);
  });
  it.each([
    ['un rappel', (b: string) => `await new Promise((r) => ${Z}(() => r(${b}`],
    ['un rappel `function`', (b: string) => `await new Promise(function (r) { ${Z}(function () { r(${b}`],
    ['`withResolvers`', (b: string) => `const { promise, resolve } = Promise.withResolvers();\n${Z}(() => resolve(${b}`],
  ])('une valeur faite de blancs, jamais fermée · %s · se lit sous 50 ms (ni retour arrière, ni regard en arrière à chaque blanc)', (_, src) => {
    // Le meilleur de trois lectures · un ramasse-miettes ne fait pas tomber le cas. Mesuré · 2000 blancs
    // 0,2 ms (5,5 s avec `\s*` autour de la valeur) · 20000 blancs 1 à 4 ms (530 à 790 ms quand le
    // regard en arrière précède `await`).
    for (const n of [2000, 20000]) {
      const texte = src(' '.repeat(n));
      let meilleur = Infinity;
      for (let k = 0; k < 3 && meilleur >= 50; k++) {
        const t0 = performance.now();
        attentesFixes(texte);
        aides(texte);
        meilleur = Math.min(meilleur, performance.now() - t0);
      }
      expect(meilleur, `${n} blancs · le détecteur revient en arrière`).toBeLessThan(50);
    }
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
    // Un HOMONYME, un paramètre, un tableau, un objet, `expect(X)` · le nom ne désigne pas l'aide passée en valeur.
    ['`it.each(…)(…, (touche) => …)` · un paramètre homonyme · ne compte pas', `const touche = async (k) => { await new Promise((r) => ${Z}(r, 30)); };\nawait touche('a');\nit.each(['ArrowRight', 'ArrowLeft'])('la touche %s', (touche) => { expect(touche).toBeTruthy(); appuyer(touche); });`, [{ nom: 'touche', appels: 1 }]],
    ['`(nom, X) =>` · un paramètre · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nconst f = (nom, pause) => lire(nom, pause);`, [{ nom: 'pause', appels: 0 }]],
    ['`X =>` · un paramètre seul · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nlignes.forEach(async pause => { await lire(pause); });`, [{ nom: 'pause', appels: 0 }]],
    ['`function f(a, X)` · un paramètre · ne compte pas, `f` n’en hérite pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nfunction f(a, pause) { return lire(a, pause); }\nf(1);`, [{ nom: 'pause', appels: 0 }]],
    ['une méthode `m(a, X): T {` · un paramètre · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nclass C {\n  m(a, pause): number {\n    return lire(pause);\n  }\n}`, [{ nom: 'pause', appels: 0 }]],
    ['`[x, X, y]` · au milieu d’un tableau passé à un appel · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nlire([x, pause, y]);`, [{ nom: 'pause', appels: 0 }]],
    ['`[X, y]` · un tableau · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nconst l = [pause, x];\nconst m = [x, pause];\nconst n = [x, pause, y];`, [{ nom: 'pause', appels: 0 }]],
    ['`{ X, y }` · un objet · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nconst o = { pause, x };\nconst p = { x, pause };\nconst q = lire({ x, pause, y });`, [{ nom: 'pause', appels: 0 }]],
    ['`const [X, setX] = useState()` · une déstructuration, puis l’homonyme passé · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nfunction Ecran() {\n  const [pause, setPause] = useState(false);\n  return basculer(pause, setPause);\n}`, [{ nom: 'pause', appels: 0 }]],
    ['`const X = …` dans un bloc, puis l’homonyme passé · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nit('x', () => {\n  const pause = 'p';\n  appuyer(pause);\n});`, [{ nom: 'pause', appels: 0 }]],
    ['`(X)` · une parenthèse de groupement, pas un appel · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nconst encore = (pause);\nconst deux = (0, pause);`, [{ nom: 'pause', appels: 0 }]],
    ['`act(X.name)`, `lire(X + 1)` · lue en argument, pas passée · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nact(pause.name);\nlire(pause + 1);`, [{ nom: 'pause', appels: 0 }]],
    ['`expect(X)` · lue, pas appelée · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nexpect(pause).toBeTypeOf('function');`, [{ nom: 'pause', appels: 0 }]],
    ['`expect(autre.X)` pour une aide membre · ne compte pas', `const faux = { create: async () => { await new Promise((r) => ${Z}(r, 40)); } };\nawait faux.create();\nexpect(autre.create).toHaveBeenCalled();`, [{ nom: 'create', appels: 1 }]],
    ['une aide membre passée en valeur (`.then(faux.X)`) · compte', `const faux = { create: async () => { await new Promise((r) => ${Z}(r, 40)); } };\nawait p.then(faux.create);`, [{ nom: 'create', appels: 1 }]],
    ['`act<void>(X)` · un argument de type · compte', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait act<void>(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    ['`f?.(X)` · un appel facultatif · compte', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait rappel?.(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    ['`() => (X)` · un groupement après une flèche · ne compte pas', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nconst encore = () => (laisser);`, [{ nom: 'laisser', appels: 0 }]],
    ['`const { X: l } = …` · une clé, pas un homonyme · l’aide passée dans le bloc compte', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nit('x', async () => {\n  const { laisser: l } = o;\n  await act(laisser);\n});`, [{ nom: 'laisser', appels: 1 }]],
    ['`const { x: X } = …` · la valeur, un homonyme · ne compte pas', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nit('x', async () => {\n  const { x: laisser } = o;\n  await act(laisser);\n});`, [{ nom: 'laisser', appels: 0 }]],
    ['`if (X) {` · une condition, pas des paramètres · l’aide passée dans le bloc compte', `const pause = () => new Promise((r) => ${Z}(r, 30));\nif (pause) { await act(pause); }`, [{ nom: 'pause', appels: 1 }]],
    ['hors de la portée de l’homonyme, l’aide passée compte', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nit.each([1])('%s', (laisser) => { lire(laisser); });\nawait act(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    // `indices` · le nom n'est pas cherché dans le texte du mot-clé.
    ['`async function n()` · le nom contenu dans `function`', `async function n() { await new Promise((r) => ${Z}(r, 10)); }\nawait n();`, [{ nom: 'n', appels: 1 }]],
    ['`const c = …` · le nom contenu dans `const`', `const c = () => new Promise((r) => ${Z}(r, 10));\nawait c();`, [{ nom: 'c', appels: 1 }]],
    // Les CYCLES · le comptage transitif termine, chaque aide comptée une fois.
    ['cycle · `a` ↔ `b`', `const a = async () => { await new Promise((r) => ${Z}(r, 10)); await b(); };\nconst b = async () => { await a(); };\nawait b();`, [{ nom: 'a', appels: 1 }, { nom: 'b', appels: 2, via: 'a' }]],
    ['cycle · une récursion', `async function boucle(n) {\n  await new Promise((r) => ${Z}(r, 10));\n  if (n > 0) await boucle(n - 1);\n}\nawait boucle(3);`, [{ nom: 'boucle', appels: 2 }]],
    // Les LIMITES des regex que la lecture par l'AST ferme · une par limite.
    ['`function X<T>(` · un paramètre de type (faux négatif des regex, `l0-api-ad` ~94)', `async function sousEspion<T>(f: () => Promise<T>) {\n  const r = await f();\n  await new Promise((ok) => ${Z}(ok, 30));\n  return r;\n}\nawait sousEspion(lire);`, [{ nom: 'sousEspion', appels: 1 }]],
    ['un homonyme APPELÉ · un paramètre `X(` · ne compte pas', `const pause = () => new Promise((r) => ${Z}(r, 30));\nconst f = (pause) => pause();\nit('x', () => { const pause = vi.fn(); pause(); });`, [{ nom: 'pause', appels: 0 }]],
    ['un homonyme APPELÉ · un `X(` nu pour une aide membre · ne compte pas', `const faux = { create: async () => { await new Promise((r) => ${Z}(r, 40)); } };\nawait faux.create();\nconst create = vi.fn();\ncreate();`, [{ nom: 'create', appels: 1 }]],
    ['un homonyme dans l’en-tête d’un `for` · sa portée est le corps · ne compte pas', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nfor (const laisser of lignes) lire(laisser);\nawait act(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    ['un homonyme par déstructuration de paramètre · `({ X }) =>` · ne compte pas', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nconst f = ({ laisser }) => act(laisser);`, [{ nom: 'laisser', appels: 0 }]],
    ['un alias · `const encore = X` puis `encore()` · compte pour l’aide', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nconst encore = laisser;\nconst plus = (encore);\nawait encore();\nawait act(plus);`, [{ nom: 'laisser', appels: 2 }]],
    ['une branche de ternaire en argument · `act(c ? x : X)` · compte', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait act(vite ? rien : laisser);\nawait act(vite ? laisser : rien);\nawait act(laisser ? x : y);`, [{ nom: 'laisser', appels: 2 }]],
    ['une parenthèse orpheline dans une expression régulière · la portée de l’homonyme ne déborde plus', `const laisser = () => new Promise((r) => ${Z}(r, 30));\nfunction f(laisser) { return lire(/\\(/, laisser); }\nawait act(laisser);`, [{ nom: 'laisser', appels: 1 }]],
    ['un backtick dans une expression régulière · la définition et l’appel restent lus', `const CODE = /\`([^\`]+)\`/g;\nconst laisser = () => new Promise((r) => ${Z}(r, 30));\nawait laisser();\nexpect(md).toContain(\`fin\`);`, [{ nom: 'laisser', appels: 1 }]],
  ])('%s', (_, src, attendu) => {
    expect(aides(src).map(({ nom, appels, via }) => ({ nom, appels, ...(via ? { via } : {}) })), `les aides de « ${src} »`).toEqual(attendu);
  });

  it('un appel de plus nomme le champ à écrire · `appels.X: N` à l’entrée du fichier', () => {
    const src = `const laisser = () => new Promise((r) => ${Z}(r, 30));\nawait laisser();\nawait laisser();`;
    const [faute, ...reste] = fautesAides('x-ecran.test.tsx', src, { laisser: 1 });
    expect(reste).toEqual([]);
    expect(faute).toContain('l’aide `laisser` (ligne 1, une attente fixe) est appelée 2 fois pour 1 figé(s), ligne(s) 2, 3 ·');
    expect(faute).toMatch(/ou, si c’est un renommage ou une latence légitime, ajoute `appels\.laisser: 2` à l’entrée de `x-ecran\.test\.tsx` dans `EXEMPTIONS`$/);
  });
});

describe('cliquet · aucune attente fixe nouvelle dans les tests de apps/web', () => {
  const fichiers = sources(RACINE).filter((f) => !EXCLUS.has(f));
  const textes = new Map(fichiers.map((f) => [f, readFileSync(join(RACINE, f), 'utf8')] as const));
  const releve = new Map([...textes].map(([f, t]) => [f, attentesFixes(t, f)] as const));

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
