import { beforeAll, describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Suite de #1124 · recensement des LECTEURS de `Session.equipe`.
 *
 * Une `equipe` reconstruite à la main (littéral, copie, JSON) porte le
 * `plateformeAdmissible` que l'appelant veut. Seule l'équipe produite par
 * `equipeDeSession` (gelée, inscrite au registre) doit compter · c'est ce que
 * rend `equipeAuthentique` (lib/registre-equipe-session.ts), l'accesseur
 * unique.
 *
 * ── Ce que le TYPE ferme (suite de #1125) ────────────────────────────────────
 * `Session.equipe` est un `JetonEquipe` opaque, sans champ lisible. Une lecture
 * d'un champ du jeton, un passage structurel vers le noyau (`roleEffectifAudit({
 * equipe: null, ...s, roleEspace })`, et tout paramètre `equipe` du noyau, typé
 * `EquipeAdmissible`), un type local qui NOMME un champ (`{ equipe?: { role }
 * }`), un utilitaire (`Readonly<EquipeSession>`, `Pick<…>`), une affectation
 * déstructurante vers une équipe ou une forge ne COMPILENT pas · éprouvé ligne à
 * ligne par `secu-equipe-opaque.types.test.ts`.
 *
 * ── Ce que le type laisse compiler, et que CE recensement refuse (suite de #1128)
 * Le jeton est assignable à `unknown`, `object` et `{}`, et `in` rétrécit le
 * type · `const lire = (x: { equipe?: unknown }) => { const e = x.equipe;
 * return typeof e === 'object' && e !== null && 'plateformeAdmissible' in e &&
 * e.plateformeAdmissible === true }; lire(s)` compile, sans cast ni `any`.
 * Sur main ea01a5aa, ni les sondes de type ni ce recensement ne la voyaient.
 * Le recensement refuse désormais, hors de l'accesseur ·
 *  · `lecture` · tout `.equipe` lu (point, crochets, déstructuration) sur un
 *    objet dont le type porte le jeton ou l'équipe en clair, sur un `any`, OU
 *    sur un objet qui a REÇU une session, quel que soit son type local
 *    (`unknown`, `object`, `{}`, `{ equipe?: unknown }`, générique). Le flot
 *    suit une session posée dans un paramètre (appel direct, rappel
 *    `xs.map((x: …) => …)`), une variable, une affectation, une propriété
 *    d'objet ou de JSX et une déstructuration, de proche en proche jusqu'au
 *    point fixe (`relais(s)` → `lire(x)`) ;
 *  · `reflexe` · sur un tel objet, `Reflect.get` à clé non littérale (ou
 *    `'equipe'`), `Reflect.getOwnPropertyDescriptor`, `Object.entries`,
 *    `Object.values`, `Object.assign`, `Object.getOwnPropertyDescriptor(s)`,
 *    et un nom calculé (`s[k]`, `k: keyof Session`) ;
 *  · `cast` · tout transtypage vers un type qui porte `EquipeSession` (où que
 *    ce soit · union, propriété, argument de type), et tout transtypage d'un
 *    tel objet (ou du jeton) vers un type qui ne garde pas le jeton
 *    (`as any`, `as unknown as { equipe: { plateformeAdmissible } }`,
 *    `as Record<string, { role }>`).
 * Les autres `.equipe` du dépôt (`Access.equipe`, la face · un message de
 * ticket `m.equipe` booléen · une prop) ne sont pas des sessions et passent.
 * Passer le jeton TEL QUEL à un lecteur qui l'authentifie (`effectiveAccess({
 * ...s, role, plan })`) n'est pas une lecture · c'est le chemin voulu.
 *
 * Mesuré sur main ea01a5aa · 49 501 arêtes de flot, 224 cibles de production
 * reçoivent une session, et AUCUN signalement de production hors de
 * l'accesseur · aucun faux positif, donc aucune exemption ajoutée.
 *
 * ── Ce qui reste (à dire, pas à taire) ───────────────────────────────────────
 * Le flot ne suit pas une session RENDUE par une fonction puis lue sous un type
 * élargi (`const x: unknown = f(); …` où `f` rend `s` sous `unknown`), ni une
 * session rangée dans un tableau ou un `Map` élargi, ni un `.js` sans types, ni
 * `Object.defineProperty`, `structuredClone` ou `for…in`. Là, la barrière est à
 * l'exécution · le registre (`equipeAuthentique` → null pour toute copie), éprouvé
 * au résultat par `secu-equipe-opaque.types.test.ts` (forme 4) et
 * `secu-equipe-authentique-db.test.tsx`. Ce que le registre ne rattrape pas ·
 * un lecteur de production qui DÉCIDERAIT lui-même sur la valeur lue par l'une
 * de ces formes sans passer par `equipeAuthentique`.
 *
 * La règle ESLint `tiktrends/face-equipe-forcee` (eslint-rules/face-equipe.mjs)
 * ne regarde pas la session · elle garde la face (`Access`) contre la FORGE
 * (cast, `any`, générique, prédicat, surcharge, `Object.assign` sur un
 * `Access`). Le suivi d'une session d'un fichier à l'autre demande le
 * programme entier · il vit ici.
 */

const WEB = join(__dirname, '..');
/** L'accesseur · le seul fichier qui lit `.equipe` d'une session. */
const EXEMPTIONS: Record<string, string> = {
  'lib/registre-equipe-session.ts': 'définit `equipeAuthentique`, l’accesseur qui ne rend l’équipe que si `equipeDeSession` l’a produite · il lit `s?.equipe` et le transtype en `EquipeSession` APRÈS le registre (mesuré · ses deux seuls signalements)',
};
/**
 * Hors exemption, par décision · `effectiveAccess` (lib/access.ts) passe lui
 * aussi par l'accesseur (le filet `[rbac]` est dit au même endroit), et
 * `equipeDeSession` (lib/equipe-plateforme.ts) PRODUIT l'équipe sans lire
 * celle d'une session. Une exemption qui ne sert pas serait une porte.
 */
const SANS_EXEMPTION = ['lib/access.ts', 'lib/equipe-plateforme.ts'];

/** Fichiers sondes, en mémoire · chaque forme de lecture, et ce qui n'en est pas une. */
const SONDE = join(WEB, 'lib', '__sonde-equipe-authentique__.ts');
const CODE_SONDE = `
import type { Session } from './auth';
import type { Access } from './rbac';
import type { EquipeSession } from './equipe-plateforme';
import type { JetonEquipe } from './registre-equipe-session';
type SessionMaison = { user: { email: string }; equipe?: EquipeSession | null };
type JetonMaison = { equipe: JetonEquipe };
declare const cle: string;
declare const cleSession: keyof Session;
const lireInconnu = (x: { equipe?: unknown }) => { const e = x.equipe; return typeof e === 'object' && e !== null && 'plateformeAdmissible' in e && e.plateformeAdmissible === true; }; // LECTURE unknown + in
const lireObjet = (x: { equipe?: object | null }) => x.equipe; // LECTURE object
const lireVide = (x: { equipe?: {} | null }) => x['equipe']; // LECTURE {} crochets
const lireEntiere = (x: unknown) => typeof x === 'object' && x !== null && 'equipe' in x && x.equipe; // LECTURE la session entière en unknown, par un relais
const relais = (x: object) => lireEntiere(x);
function lireDestructure({ equipe }: { equipe?: unknown }) { return equipe; } // LECTURE déstructuration d'un paramètre élargi
const lireGenerique = <T extends { equipe?: unknown }>(x: T) => x.equipe; // LECTURE générique élargi
const lirePropriete = (p: { session: { equipe?: unknown } }) => p.session.equipe; // LECTURE propriété élargie
const lireRappel = (xs: Session[]) => xs.map((x: { equipe?: unknown }) => x.equipe); // LECTURE paramètre d'un rappel
const lireAutre = (x: { equipe?: unknown }) => x.equipe; // PAS une session · jamais appelée avec une session
export function sonde(s: Session, p: Pick<Session, 'equipe'>, m: SessionMaison, a: Access, x: any, t: { equipe: boolean }, j: JetonMaison) {
  const l1 = s.equipe; // LECTURE point
  const l2 = p?.equipe; // LECTURE optionnelle
  const l3 = m['equipe']; // LECTURE crochets
  const { equipe: l4 } = s; // LECTURE déstructuration renommée
  const { equipe } = m; // LECTURE déstructuration
  const l5 = (s as any).equipe; // LECTURE any
  const l6 = x.equipe; // LECTURE any
  const f = ({ equipe: e }: Session) => e; // LECTURE paramètre
  const l7 = j.equipe as unknown as EquipeSession; // LECTURE jeton puis cast
  const v1: { equipe?: unknown } = s;
  const l8 = v1.equipe; // LECTURE variable élargie
  const r1 = Reflect.get(s, cle); // REFLEXE Reflect.get, clé non littérale
  const r2 = Reflect.get(s, 'equipe'); // REFLEXE Reflect.get, clé littérale equipe
  const r3 = Object.entries(s); // REFLEXE Object.entries
  const r4 = Object.values({ ...s }); // REFLEXE Object.values d'une copie
  const r5 = Object.assign({}, s, { role: 'member' }); // REFLEXE Object.assign
  const r6 = s[cleSession]; // REFLEXE nom calculé typé keyof
  const r7 = Object.getOwnPropertyDescriptor(s, cle); // REFLEXE descripteur
  const c1 = (s as unknown as { user: unknown; equipe: { plateformeAdmissible: boolean } }).user; // CAST session vers une équipe lisible
  const c2 = x as EquipeSession; // CAST vers EquipeSession
  const c3 = s as unknown as Record<string, { role: string }>; // CAST session vers un index lisible
  const c4 = JSON.parse('{}') as { equipe: EquipeSession }; // CAST vers un type qui porte EquipeSession
  const n1 = a.equipe; // PAS une session · la face
  const n2 = t.equipe; // PAS une session · un booléen
  const n3 = { equipe: null }; // PAS une lecture · une écriture
  const n4 = Object.entries(t); // PAS une session · Object.entries d'un autre objet
  const n5 = x as { role: string }; // PAS une session · un any qui n'en vient pas
  const n6 = Reflect.get(s, 'user'); // PAS l'équipe · Reflect.get, autre clé littérale
  const n7 = lireAutre({ equipe: true }); // PAS une session · l'argument n'en est pas une
  const n8 = s as Session; // PAS un élargissement · le cast garde le jeton
  const n9 = Object.assign({}, t); // PAS une session · Object.assign d'un autre objet
  const appels = [lireInconnu(s), lireObjet(s), lireVide(s), relais(s), lireDestructure(s), lireGenerique(s), lirePropriete({ session: s }), lireRappel([s])];
  return [l1, l2, l3, l4, equipe, l5, l6, f, l7, l8, r1, r2, r3, r4, r5, r6, r7, c1, c2, c3, c4, n1, n2, n3, n4, n5, n6, n7, n8, n9, appels];
}
`;

/**
 * Ce que le recensement relève · `lecture` (un `.equipe` lu, directement ou par
 * déstructuration), `reflexe` (un lecteur réflexif qui parcourt la session ·
 * `Reflect.get`, `Object.entries`…), `cast` (un transtypage qui expose l'équipe).
 */
type Forme = 'lecture' | 'reflexe' | 'cast';
interface Lecture { fichier: string; ligne: number; texte: string; forme: Forme; quoi: string }

let lectures: Lecture[] = [];
let fichiersLus = 0;
let erreursSonde: string[] = [];
let ciblesProduction = 0;

/** Les types d'une équipe de session · le jeton opaque, et l'équipe en clair (chacun dans SON fichier, pas un homonyme). */
const TYPES_EQUIPE: Array<[string, RegExp]> = [
  ['JetonEquipe', /[\\/]lib[\\/]registre-equipe-session\.ts$/],
  ['EquipeSession', /[\\/]lib[\\/]equipe-plateforme\.ts$/],
];
const estType = (t: ts.Type, noms: readonly string[]) => {
  const sym = t.aliasSymbol ?? t.getSymbol();
  return TYPES_EQUIPE.some(([nom, fichier]) => noms.includes(nom) && sym?.getName() === nom && !!sym.declarations?.some((d) => fichier.test(d.getSourceFile().fileName)));
};
/** Le type porte-t-il le jeton ou l'équipe en clair, directement ou dans une union ? */
function porteEquipe(t: ts.Type, noms: readonly string[] = ['JetonEquipe', 'EquipeSession'], prof = 0): boolean {
  if (prof > 5) return false;
  if (estType(t, noms)) return true;
  return t.isUnionOrIntersection() && t.types.some((x) => porteEquipe(x, noms, prof + 1));
}
const HORS_DEPOT = /[\\/]node_modules[\\/]|[\\/]typescript[\\/]lib[\\/]/;
const MUTATIONS = new Set(['assign', 'entries', 'values', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors']);
const REFLEXES = new Set(['get', 'getOwnPropertyDescriptor']);

/** `x as T`, `<T>x`, `(x)`, `x!`, `x satisfies T` · l'expression nue dessous. */
function nue(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

type Cible = ts.Symbol | ts.BindingPattern;
/** Une arête du flot · une valeur (expression, ou symbole d'une propriété) posée dans une cible (paramètre, variable, propriété, motif). */
interface Arete { parType: boolean; symbole?: ts.Symbol; vers: Cible }

function recenser(): { lectures: Lecture[]; fichiers: number; erreursSonde: string[]; cibles: number } {
  const lu = ts.readConfigFile(join(WEB, 'tsconfig.json'), ts.sys.readFile);
  const conf = ts.parseJsonConfigFileContent(lu.config, ts.sys, WEB);
  const production = conf.fileNames.filter((f) => !/[\\/](test|\.next|node_modules)[\\/]/.test(f) && !/\.test\.[cm]?[tj]sx?$/.test(f) && !f.endsWith('.d.ts'));
  const options: ts.CompilerOptions = { ...conf.options, incremental: false, noEmit: true };
  const hote = ts.createCompilerHost(options);
  const lire = hote.readFile.bind(hote);
  const existe = hote.fileExists.bind(hote);
  const source = hote.getSourceFile.bind(hote);
  hote.readFile = (f) => (f === SONDE ? CODE_SONDE : lire(f));
  hote.fileExists = (f) => f === SONDE || existe(f);
  hote.getSourceFile = (f, v, ...r) => (f === SONDE ? ts.createSourceFile(f, CODE_SONDE, v, true) : source(f, v, ...r));
  const programme = ts.createProgram([...production, SONDE], options, hote);
  const checker = programme.getTypeChecker();
  const racines = new Set([...production, SONDE]);
  const fichiers = programme.getSourceFiles().filter((sf) => racines.has(sf.fileName));

  /** Une session · un objet dont la propriété `equipe` porte le jeton ou l'équipe en clair (union comprise). */
  const porteSession = (t: ts.Type): boolean => {
    if (t.isUnion()) return t.types.some(porteSession);
    const p = t.getProperty('equipe');
    return !!p && porteEquipe(checker.getTypeOfSymbol(p));
  };
  const sessionParType = (t: ts.Type) => porteSession(t) || porteEquipe(t);
  /** Le type porte-t-il une équipe EN CLAIR quelque part (union, argument de type, propriété d'un type du dépôt, index) ? */
  const porteEquipeClaire = (t: ts.Type, vus = new Set<ts.Type>(), prof = 0): boolean => {
    if (prof > 5 || vus.has(t)) return false;
    vus.add(t);
    if (porteEquipe(t, ['EquipeSession'])) return true;
    const fils: ts.Type[] = [...(t.aliasTypeArguments ?? [])];
    if (t.isUnionOrIntersection()) fils.push(...t.types);
    if (t.flags & ts.TypeFlags.Object && (t as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) fils.push(...checker.getTypeArguments(t as ts.TypeReference));
    if (fils.some((f) => porteEquipeClaire(f, vus, prof + 1))) return true;
    if (!(t.flags & ts.TypeFlags.Object)) return false;
    const proprietes = checker.getPropertiesOfType(t).filter((p) => !p.declarations?.every((d) => HORS_DEPOT.test(d.getSourceFile().fileName)));
    const index = checker.getIndexTypeOfType(t, ts.IndexKind.String);
    return [...proprietes.map((p) => checker.getTypeOfSymbol(p)), ...(index ? [index] : [])].some((f) => porteEquipeClaire(f, vus, prof + 1));
  };
  const symboleDe = (e: ts.Expression): ts.Symbol | undefined => {
    const n = nue(e);
    if (ts.isIdentifier(n)) return ts.isShorthandPropertyAssignment(n.parent) ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n);
    if (ts.isPropertyAccessExpression(n)) return checker.getSymbolAtLocation(n.name);
    return undefined;
  };
  const duDepot = (sym: ts.Symbol | undefined) => !!sym?.declarations?.some((d) => racines.has(d.getSourceFile().fileName));
  const cibleDeNom = (nom: ts.BindingName): Cible | undefined => (ts.isIdentifier(nom) ? checker.getSymbolAtLocation(nom) : nom);

  // ── 1 · Le flot · où une session (ou ce qui en a reçu une) est posée ─────────
  const aretes: Arete[] = [];
  const recues = new Set<Cible>();
  const poser = (de: ts.Expression, vers: Cible | undefined) => {
    if (!vers) return;
    if ('getName' in vers && !duDepot(vers)) return;
    aretes.push({ parType: sessionParType(checker.getTypeAtLocation(nue(de))), symbole: symboleDe(de), vers });
  };
  for (const sf of fichiers) {
    const visite = (n: ts.Node): void => {
      if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && n.arguments?.length) {
        const decl = checker.getResolvedSignature(n)?.getDeclaration();
        const params = decl && 'parameters' in decl ? decl.parameters : undefined;
        if (params?.length && racines.has(decl!.getSourceFile().fileName)) {
          n.arguments.forEach((arg, i) => {
            const p = params[i] ?? (params[params.length - 1]?.dotDotDotToken ? params[params.length - 1] : undefined);
            if (p && !ts.isSpreadElement(arg)) poser(arg, cibleDeNom(p.name));
          });
        }
      } else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parameters.length) {
        // Un rappel · ses paramètres reçoivent ce que la signature attendue leur donne (`sessions.map((x: { equipe?: unknown }) => …)`).
        const attendu = checker.getContextualType(n);
        const signatures = attendu ? checker.getSignaturesOfType(attendu, ts.SignatureKind.Call) : [];
        n.parameters.forEach((p, i) => {
          const cible = cibleDeNom(p.name);
          if (cible && signatures.some((sig) => { const q = sig.parameters[i]; return !!q && sessionParType(checker.getTypeOfSymbolAtLocation(q, n)); })) recues.add(cible);
        });
      } else if (ts.isVariableDeclaration(n) && n.initializer) poser(n.initializer, cibleDeNom(n.name));
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && !ts.isObjectLiteralExpression(n.left) && !ts.isArrayLiteralExpression(n.left)) poser(n.right, symboleDe(n.left));
      else if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && ts.isObjectLiteralExpression(n.parent) && ts.isIdentifier(n.name)) {
        const attendu = checker.getContextualType(n.parent);
        const prop = attendu && checker.getPropertyOfType(attendu, n.name.text);
        poser(ts.isPropertyAssignment(n) ? n.initializer : n.name, prop);
      } else if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) poser(n.initializer.expression, checker.getSymbolAtLocation(n.name));
      else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
        const cle = n.propertyName ?? n.name;
        const prop = (ts.isIdentifier(cle) || ts.isStringLiteralLike(cle)) ? checker.getTypeAtLocation(n.parent).getProperty(cle.text) : undefined;
        const vers = cibleDeNom(n.name);
        if (prop && vers && duDepot(prop)) aretes.push({ parType: false, symbole: prop, vers });
      }
      ts.forEachChild(n, visite);
    };
    visite(sf);
  }
  // Jusqu'au point fixe · une cible qui a reçu une session la transmet à son tour (`relais(s)` → `lire(x)`).
  for (let change = true, tours = 0; change && tours < 30; tours += 1) {
    change = false;
    for (const a of aretes) {
      if (recues.has(a.vers)) continue;
      if (a.parType || (a.symbole && recues.has(a.symbole))) { recues.add(a.vers); change = true; }
    }
  }
  /** L'expression porte-t-elle une session · par son type (sous un cast éventuel), ou parce qu'elle en a reçu une ? */
  const recoit = (e: ts.Expression): boolean => {
    if (sessionParType(checker.getTypeAtLocation(nue(e)))) return true;
    const sym = symboleDe(e);
    return !!sym && recues.has(sym);
  };
  const motifRecoit = (m: ts.ObjectBindingPattern): boolean => {
    if (recues.has(m)) return true;
    const p = m.parent;
    return (ts.isVariableDeclaration(p) && !!p.initializer && recoit(p.initializer)) || (ts.isParameter(p) && sessionParType(checker.getTypeAtLocation(p)));
  };

  // ── 2 · Les lectures, les lecteurs réflexifs, les casts ──────────────────────
  const out: Lecture[] = [];
  for (const sf of fichiers) {
    const estSession = (t: ts.Type) => !!(t.flags & ts.TypeFlags.Any) || porteEquipe(t);
    const noter = (noeud: ts.Node, forme: Forme, quoi: string) => out.push({
      fichier: relative(WEB, sf.fileName).split('\\').join('/'),
      ligne: sf.getLineAndCharacterOfPosition(noeud.getStart(sf)).line + 1,
      texte: noeud.getText(sf).slice(0, 80),
      forme,
      quoi,
    });
    const visite = (noeud: ts.Node): void => {
      if (ts.isPropertyAccessExpression(noeud) && noeud.name.text === 'equipe') {
        if (estSession(checker.getTypeAtLocation(noeud)) || recoit(noeud.expression)) noter(noeud, 'lecture', 'lecture de .equipe');
      } else if (ts.isElementAccessExpression(noeud)) {
        const cle = noeud.argumentExpression;
        if (ts.isStringLiteralLike(cle) && cle.text === 'equipe') {
          if (estSession(checker.getTypeAtLocation(noeud)) || recoit(noeud.expression)) noter(noeud, 'lecture', 'lecture de [\'equipe\']');
        } else if (!ts.isStringLiteralLike(cle) && !ts.isNumericLiteral(cle) && recoit(noeud.expression) && !ts.isArrayLiteralExpression(nue(noeud.expression))) noter(noeud, 'reflexe', 'nom calculé sur une session');
      } else if (ts.isBindingElement(noeud) && ts.isObjectBindingPattern(noeud.parent)) {
        const cle = noeud.propertyName ?? noeud.name;
        if ((ts.isIdentifier(cle) || ts.isStringLiteralLike(cle)) && cle.text === 'equipe' && (estSession(checker.getTypeAtLocation(noeud.name)) || motifRecoit(noeud.parent))) noter(noeud, 'lecture', 'déstructuration de equipe');
      } else if (ts.isCallExpression(noeud) && ts.isPropertyAccessExpression(noeud.expression) && ts.isIdentifier(noeud.expression.expression)) {
        const objet = noeud.expression.expression.text;
        const methode = noeud.expression.name.text;
        const [cible, cle] = noeud.arguments;
        if (objet === 'Object' && MUTATIONS.has(methode) && noeud.arguments.some((a) => !ts.isSpreadElement(a) && recoit(a))) noter(noeud, 'reflexe', `Object.${methode}`);
        if (objet === 'Reflect' && REFLEXES.has(methode) && cible && recoit(cible) && (!cle || !ts.isStringLiteralLike(cle) || cle.text === 'equipe')) noter(noeud, 'reflexe', `Reflect.${methode}`);
      } else if ((ts.isAsExpression(noeud) || ts.isTypeAssertionExpression(noeud)) && !ts.isAsExpression(nue(noeud.parent as ts.Expression)) && !(ts.isTypeReferenceNode(noeud.type) && noeud.type.getText(sf) === 'const')) {
        // Le cast le plus extérieur d'une chaîne (`s as unknown as X`) · sa cible contre l'expression nue.
        let haut: ts.Node = noeud;
        while (ts.isParenthesizedExpression(haut.parent)) haut = haut.parent;
        if (!(ts.isAsExpression(haut.parent) || ts.isTypeAssertionExpression(haut.parent))) {
          const cibleT = checker.getTypeFromTypeNode(noeud.type);
          const nueE = nue(noeud);
          const tSource = checker.getTypeAtLocation(nueE);
          if (porteEquipeClaire(cibleT)) noter(noeud, 'cast', 'cast vers EquipeSession');
          else if (recoit(nueE)) {
            const garde = porteEquipe(tSource) && !porteSession(tSource) ? porteEquipe(cibleT) : porteSession(cibleT);
            if (!garde) noter(noeud, 'cast', 'cast qui retire le jeton');
          }
        }
      }
      ts.forEachChild(noeud, visite);
    };
    visite(sf);
  }
  const sondeSf = programme.getSourceFile(SONDE)!;
  const erreurs = [...programme.getSyntacticDiagnostics(sondeSf), ...programme.getSemanticDiagnostics(sondeSf)]
    .map((d) => `ligne ${sondeSf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1} · ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  const cibles = [...recues].filter((c) => ('getName' in c ? c.declarations ?? [] : [c]).some((d) => d.getSourceFile().fileName !== SONDE)).length;
  return { lectures: out, fichiers: fichiers.length, erreursSonde: erreurs, cibles };
}

const SONDE_REL = relative(WEB, SONDE).split('\\').join('/');

describe('Session d’équipe · une seule lecture de `.equipe`, l’accesseur authentifiant', () => {
  beforeAll(() => { const r = recenser(); lectures = r.lectures; fichiersLus = r.fichiers; erreursSonde = r.erreursSonde; ciblesProduction = r.cibles; }, 300_000);

  it('le recensement lit le code de production (sinon il ne garde rien), et le flot y suit les sessions', () => {
    expect(fichiersLus, 'aucun fichier de production lu').toBeGreaterThan(300);
    // Mesuré sur main ea01a5aa · 224 cibles de production (paramètres, variables, propriétés) reçoivent une session. Seuil à moins de la moitié.
    expect(ciblesProduction, 'le flot ne suit plus les sessions de production · une lecture élargie passerait sans être vue').toBeGreaterThan(100);
  });

  it('la sonde compile · chaque forme qu’elle porte est du code que le compilateur accepte', () => {
    expect(erreursSonde, 'la sonde ne compile pas · elle ne prouve rien sur du code réel').toEqual([]);
  });

  it('le lecteur voit chaque forme de lecture d’une session, et rien d’autre (sonde en mémoire)', () => {
    const vues = lectures.filter((l) => l.fichier === SONDE_REL);
    const lignes = CODE_SONDE.split('\n');
    const attendues = lignes.flatMap((l, i) => (/\/\/ (LECTURE|REFLEXE|CAST)/.test(l) ? [i + 1] : []));
    const jamais = lignes.flatMap((l, i) => (/\/\/ PAS/.test(l) ? [i + 1] : []));
    expect(attendues.length, 'la sonde a perdu ses cas').toBe(29);
    expect(jamais.length, 'la sonde a perdu ses témoins').toBe(10);
    const FORME: Record<string, Forme> = { LECTURE: 'lecture', REFLEXE: 'reflexe', CAST: 'cast' };
    for (const ligne of attendues) {
      const forme = FORME[/\/\/ (LECTURE|REFLEXE|CAST)/.exec(lignes[ligne - 1]!)![1]!]!;
      expect.soft(vues.some((v) => v.ligne === ligne && v.forme === forme), `ligne de sonde ${ligne} « ${lignes[ligne - 1]!.trim()} » · une ${forme} de session passe le recensement`).toBe(true);
    }
    for (const ligne of jamais) expect.soft(vues.some((v) => v.ligne === ligne), `ligne de sonde ${ligne} « ${lignes[ligne - 1]!.trim()} » · le recensement crie au loup`).toBe(false);
  });

  it('chaque exemption lit vraiment une session (sinon c’est une porte inutile), et lib/access.ts n’en a pas besoin', () => {
    for (const fichier of Object.keys(EXEMPTIONS)) {
      expect(lectures.some((l) => l.fichier === fichier), `${fichier} ne lit plus \`.equipe\` d’une session · l’exemption ne sert plus, retire-la`).toBe(true);
    }
    for (const fichier of SANS_EXEMPTION) expect(Object.keys(EXEMPTIONS), `${fichier} · exempté`).not.toContain(fichier);
  });

  it('aucune autre lecture de `.equipe` d’une session dans le code de production · ni directe, ni élargie, ni réflexive, ni par cast', () => {
    const hors = lectures
      .filter((l) => l.fichier !== SONDE_REL && !(l.fichier in EXEMPTIONS))
      .map((l) => `${l.fichier}:${l.ligne} · ${l.quoi} · ${l.texte}`);
    expect(hors, 'une lecture de `.equipe` d’une session hors de l’accesseur (directe, élargie à unknown/object/{}, réflexive ou par cast) · une équipe reconstruite à la main y serait crue (plateformeAdmissible fourni par l’appelant). Lis equipeAuthentique(s) (lib/registre-equipe-session.ts)').toEqual([]);
  });
});
