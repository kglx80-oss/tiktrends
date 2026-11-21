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
 * ── Ce que le TYPE ferme désormais (suite de #1125) ─────────────────────────
 * `Session.equipe` est un `JetonEquipe` opaque, sans champ lisible. Une lecture
 * brute d'un champ, un passage structurel vers le noyau
 * (`roleEffectifAudit({ equipe: null, ...s, roleEspace })`), un type local ou
 * un utilitaire (`Readonly<EquipeSession>`, `Pick<…>`), une affectation
 * déstructurante ou une forge ne COMPILENT plus · éprouvé ligne à ligne par
 * `secu-equipe-opaque.types.test.ts`. Ce recensement n'en est plus le filet.
 *
 * ── Ce qui reste ici ─────────────────────────────────────────────────────────
 * Le jeton lui-même se lit sans erreur (`const j = s.equipe`), et la suite
 * naturelle d'une telle lecture est un cast (`j as unknown as EquipeSession`,
 * une affectation à `any`), que le compilateur laisse passer. Ce test refuse
 * donc toujours toute lecture `.equipe` d'une session hors de l'accesseur · est
 * une « session » tout objet dont la propriété `equipe` porte `JetonEquipe`
 * (le jeton) ou `EquipeSession` (une équipe en clair dans un type écrit à la
 * main · elle peut venir d'un cast), et toute lecture sur une valeur `any`.
 * Les autres `.equipe` du dépôt (`Access.equipe`, la face · un message de
 * ticket `m.equipe` booléen · une prop) ne sont pas des sessions et passent.
 * Passer le jeton TEL QUEL à un lecteur qui l'authentifie (`effectiveAccess({
 * ...s, role, plan })`) n'est pas une lecture · c'est le chemin voulu.
 *
 * Formes vues · `s.equipe`, `s?.equipe`, `s['equipe']`, la déstructuration
 * (`const { equipe } = s`, renommée, en paramètre). Formes NON vues (à dire,
 * pas à taire) · `Reflect.get` à clé non littérale, `Object.entries(s)`,
 * `Object.assign`, un `.js` sans types. Là, la barrière est à l'exécution ·
 * le registre, éprouvé au résultat par `secu-equipe-opaque.types.test.ts`
 * (forme 4) et `secu-equipe-authentique-db.test.tsx`.
 */

const WEB = join(__dirname, '..');
/** L'accesseur · le seul fichier qui lit `.equipe` d'une session. */
const EXEMPTIONS: Record<string, string> = {
  'lib/registre-equipe-session.ts': 'définit `equipeAuthentique`, l’accesseur qui ne rend l’équipe que si `equipeDeSession` l’a produite',
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
  const n1 = a.equipe; // PAS une session · la face
  const n2 = t.equipe; // PAS une session · un booléen
  const n3 = { equipe: null }; // PAS une lecture · une écriture
  return [l1, l2, l3, l4, equipe, l5, l6, f, l7, n1, n2, n3];
}
`;

interface Lecture { fichier: string; ligne: number; texte: string }

let lectures: Lecture[] = [];
let fichiersLus = 0;

/** Les types d'une équipe de session · le jeton opaque, et l'équipe en clair (chacun dans SON fichier, pas un homonyme). */
const TYPES_EQUIPE: Array<[string, RegExp]> = [
  ['JetonEquipe', /[\\/]lib[\\/]registre-equipe-session\.ts$/],
  ['EquipeSession', /[\\/]lib[\\/]equipe-plateforme\.ts$/],
];
/** Le type porte-t-il le jeton ou l'équipe en clair, directement ou dans une union ? */
function porteEquipeSession(t: ts.Type, prof = 0): boolean {
  if (prof > 5) return false;
  const sym = t.aliasSymbol ?? t.getSymbol();
  if (TYPES_EQUIPE.some(([nom, fichier]) => sym?.getName() === nom && sym.declarations?.some((d) => fichier.test(d.getSourceFile().fileName)))) return true;
  return t.isUnionOrIntersection() && t.types.some((x) => porteEquipeSession(x, prof + 1));
}

function recenser(): { lectures: Lecture[]; fichiers: number } {
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
  const out: Lecture[] = [];
  let n = 0;
  for (const sf of programme.getSourceFiles()) {
    if (!racines.has(sf.fileName)) continue;
    n += 1;
    const estSession = (t: ts.Type) => !!(t.flags & ts.TypeFlags.Any) || porteEquipeSession(t);
    const noter = (noeud: ts.Node) => out.push({
      fichier: relative(WEB, sf.fileName).split('\\').join('/'),
      ligne: sf.getLineAndCharacterOfPosition(noeud.getStart(sf)).line + 1,
      texte: noeud.getText(sf).slice(0, 80),
    });
    const visite = (noeud: ts.Node): void => {
      if (ts.isPropertyAccessExpression(noeud) && noeud.name.text === 'equipe' && estSession(checker.getTypeAtLocation(noeud))) noter(noeud);
      else if (ts.isElementAccessExpression(noeud) && ts.isStringLiteralLike(noeud.argumentExpression) && noeud.argumentExpression.text === 'equipe' && estSession(checker.getTypeAtLocation(noeud))) noter(noeud);
      else if (ts.isBindingElement(noeud) && ts.isObjectBindingPattern(noeud.parent)) {
        const cle = noeud.propertyName ?? noeud.name;
        if ((ts.isIdentifier(cle) || ts.isStringLiteralLike(cle)) && cle.text === 'equipe' && estSession(checker.getTypeAtLocation(noeud.name))) noter(noeud);
      }
      ts.forEachChild(noeud, visite);
    };
    visite(sf);
  }
  return { lectures: out, fichiers: n };
}

const SONDE_REL = relative(WEB, SONDE).split('\\').join('/');

describe('Session d’équipe · une seule lecture de `.equipe`, l’accesseur authentifiant', () => {
  beforeAll(() => { const r = recenser(); lectures = r.lectures; fichiersLus = r.fichiers; }, 300_000);

  it('le recensement lit le code de production (sinon il ne garde rien)', () => {
    expect(fichiersLus, 'aucun fichier de production lu').toBeGreaterThan(300);
  });

  it('le lecteur voit chaque forme de lecture d’une session, et rien d’autre (sonde en mémoire)', () => {
    const vues = lectures.filter((l) => l.fichier === SONDE_REL);
    const lignes = CODE_SONDE.split('\n');
    const attendues = lignes.flatMap((l, i) => (/\/\/ LECTURE/.test(l) ? [i + 1] : []));
    const jamais = lignes.flatMap((l, i) => (/\/\/ PAS/.test(l) ? [i + 1] : []));
    expect(attendues.length, 'la sonde a perdu ses cas').toBe(9);
    for (const ligne of attendues) expect(vues.some((v) => v.ligne === ligne), `ligne de sonde ${ligne} « ${lignes[ligne - 1]!.trim()} » · une lecture de session passe le recensement`).toBe(true);
    for (const ligne of jamais) expect(vues.some((v) => v.ligne === ligne), `ligne de sonde ${ligne} « ${lignes[ligne - 1]!.trim()} » · le recensement crie au loup`).toBe(false);
  });

  it('chaque exemption lit vraiment une session (sinon c’est une porte inutile), et lib/access.ts n’en a pas besoin', () => {
    for (const fichier of Object.keys(EXEMPTIONS)) {
      expect(lectures.some((l) => l.fichier === fichier), `${fichier} ne lit plus \`.equipe\` d’une session · l’exemption ne sert plus, retire-la`).toBe(true);
    }
    for (const fichier of SANS_EXEMPTION) expect(Object.keys(EXEMPTIONS), `${fichier} · exempté`).not.toContain(fichier);
  });

  it('aucune autre lecture de `.equipe` d’une session dans le code de production', () => {
    const hors = lectures
      .filter((l) => l.fichier !== SONDE_REL && !(l.fichier in EXEMPTIONS))
      .map((l) => `${l.fichier}:${l.ligne} · ${l.texte}`);
    expect(hors, 'une lecture de `.equipe` d’une session hors de l’accesseur · une équipe reconstruite à la main y serait crue (plateformeAdmissible fourni par l’appelant). Lis equipeAuthentique(s) (lib/registre-equipe-session.ts)').toEqual([]);
  });
});
