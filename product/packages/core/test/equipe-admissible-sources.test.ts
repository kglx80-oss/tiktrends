import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Suite de #1128 · UN type pour l'équipe que le noyau lit, `EquipeAdmissible`
 * (src/studios/securite.ts · `{ role; plateformeAdmissible? }`).
 *
 * Côté apps/web, `Session.equipe` est un jeton OPAQUE (`JetonEquipe`, un objet
 * marqué d'un `unique symbol`, sans champ lisible). Le passage STRUCTUREL d'une
 * session au noyau (`roleEffectifAudit({ equipe: null, ...s, roleEspace })`) ne
 * compile pas parce que chaque paramètre `equipe` du noyau EXIGE `role` · le
 * jeton n'en a pas. Sur main ea01a5aa, chacun de ces paramètres répétait son
 * type anonyme (sept copies, plus `EquipeLue`) · un futur paramètre écrit
 * `equipe?: unknown`, `equipe?: object` ou `equipe?: {}` accepterait le jeton,
 * et le passage structurel se rouvrirait EN SILENCE, sans erreur nulle part.
 * (Mesuré · `equipe?: { plateformeAdmissible?: boolean }`, tout optionnel, le
 * refuse déjà · le compilateur détecte un type « faible » sans propriété
 * commune. Une copie anonyme reste une dérive · elle est signalée aussi.)
 *
 * Ce recensement lit chaque fonction du noyau (déclaration, flèche,
 * expression, méthode) · tout paramètre nommé `equipe`, et toute propriété
 * `equipe` du type d'un paramètre, doit
 *  1. REFUSER un jeton opaque (un objet marqué d'un `unique symbol` ·
 *     `isTypeAssignableTo` du compilateur, la même question que la porte
 *     typecheck d'apps/web) ;
 *  2. s'il expose `role` ou `plateformeAdmissible`, être ÉCRIT par
 *     `EquipeAdmissible` (l'alias, seul ou dans une intersection) · une copie
 *     anonyme dérive en silence le jour où on la retouche.
 * Une sonde en mémoire porte les formes qui rouvriraient le passage, et celles
 * qui sont permises.
 */

const CORE = join(__dirname, '..');
const SONDE = join(CORE, 'src', '__sonde-equipe-admissible__.ts');
const CODE_SONDE = `
import type { EquipeAdmissible } from './studios/securite';
declare const MARQUE: unique symbol;
export type JetonDeSonde = { readonly [MARQUE]: true };
export function futurInconnu(p: { roleEspace: string; equipe?: unknown }) { return p; } // SIGNALE unknown
export function futurObjet(equipe?: object | null) { return equipe; } // SIGNALE object
export const futurVide = (p: { equipe?: {} }) => p; // SIGNALE {}
export function futurFaible(p: { equipe?: { plateformeAdmissible?: boolean } }) { return p; } // SIGNALE tout optionnel
export const futurAnonyme = function (p: { equipe?: { role: string; plateformeAdmissible?: boolean } | null }) { return p; }; // SIGNALE copie anonyme
export class Futur { lire(equipe: { role: string } | undefined) { return equipe; } } // SIGNALE méthode, copie anonyme
export function nomme(p: { roleEspace: string; equipe?: EquipeAdmissible | null }) { return p; } // PAS · l'alias
export function nommeEtendu(equipe: (EquipeAdmissible & { inscritEquipe?: boolean }) | null) { return equipe; } // PAS · l'alias étendu
export function booleen(p: { equipe: boolean }) { return p; } // PAS · un booléen n'est pas une équipe
`;

interface Signalement { fichier: string; ligne: number; texte: string; raison: string }
let signalements: Signalement[] = [];
let fonctionsLues = 0;
let erreursSonde: string[] = [];

/** Le type est-il `EquipeAdmissible` (src/studios/securite.ts), seul ou dans une intersection ? */
function estAdmissible(t: ts.Type): boolean {
  const sym = t.aliasSymbol;
  if (sym?.getName() === 'EquipeAdmissible' && !!sym.declarations?.some((d) => /[\\/]src[\\/]studios[\\/]securite\.ts$/.test(d.getSourceFile().fileName))) return true;
  return t.isIntersection() && t.types.some(estAdmissible);
}

function recenser() {
  const lu = ts.readConfigFile(join(CORE, 'tsconfig.json'), ts.sys.readFile);
  const conf = ts.parseJsonConfigFileContent(lu.config, ts.sys, CORE);
  const sources = conf.fileNames.filter((f) => /[\\/]src[\\/]/.test(f) && !f.endsWith('.d.ts'));
  const options: ts.CompilerOptions = { ...conf.options, noEmit: true };
  const hote = ts.createCompilerHost(options);
  const lire = hote.readFile.bind(hote);
  const existe = hote.fileExists.bind(hote);
  const source = hote.getSourceFile.bind(hote);
  hote.readFile = (f) => (f === SONDE ? CODE_SONDE : lire(f));
  hote.fileExists = (f) => f === SONDE || existe(f);
  hote.getSourceFile = (f, v, ...r) => (f === SONDE ? ts.createSourceFile(f, CODE_SONDE, v, true) : source(f, v, ...r));
  const programme = ts.createProgram([...sources, SONDE], options, hote);
  const checker = programme.getTypeChecker();
  const sondeSf = programme.getSourceFile(SONDE)!;
  let jeton: ts.Type | undefined;
  ts.forEachChild(sondeSf, (n) => { if (ts.isTypeAliasDeclaration(n) && n.name.text === 'JetonDeSonde') jeton = checker.getTypeAtLocation(n.name); });
  if (!jeton) throw new Error('la sonde n’a plus son jeton');
  const racines = new Set([...sources, SONDE]);
  const out: Signalement[] = [];
  let n = 0;
  for (const sf of programme.getSourceFiles()) {
    if (!racines.has(sf.fileName)) continue;
    const juger = (ou: ts.Node, t: ts.Type) => {
      const raisons: string[] = [];
      if (checker.isTypeAssignableTo(jeton!, t)) raisons.push('accepte un jeton opaque · le passage structurel d’une session se rouvre');
      const nu = t.getNonNullableType();
      const expose = ['role', 'plateformeAdmissible'].some((p) => (nu.isUnion() ? nu.types : [nu]).some((x) => !!x.getProperty(p)));
      if (expose && !(nu.isUnion() ? nu.types.every(estAdmissible) : estAdmissible(nu))) raisons.push('écrit sans EquipeAdmissible · une copie anonyme du type');
      if (raisons.length) out.push({
        fichier: relative(CORE, sf.fileName).split('\\').join('/'),
        ligne: sf.getLineAndCharacterOfPosition(ou.getStart(sf)).line + 1,
        texte: ou.getText(sf).slice(0, 90),
        raison: raisons.join(' · '),
      });
    };
    const visite = (noeud: ts.Node): void => {
      if (ts.isFunctionLike(noeud) && 'parameters' in noeud) {
        n += 1;
        for (const p of noeud.parameters) {
          const tp = checker.getTypeAtLocation(p);
          if (ts.isIdentifier(p.name) && p.name.text === 'equipe') juger(p, tp);
          for (const x of tp.getNonNullableType().isUnion() ? (tp.getNonNullableType() as ts.UnionType).types : [tp.getNonNullableType()]) {
            const prop = x.getProperty('equipe');
            if (prop) juger(p, checker.getTypeOfSymbolAtLocation(prop, p));
          }
        }
      }
      ts.forEachChild(noeud, visite);
    };
    visite(sf);
  }
  const erreurs = [...programme.getSyntacticDiagnostics(sondeSf), ...programme.getSemanticDiagnostics(sondeSf)]
    .map((d) => `ligne ${sondeSf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1} · ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  return { out, n, erreurs };
}

const SONDE_REL = relative(CORE, SONDE).split('\\').join('/');

describe('EquipeAdmissible · le seul type des paramètres `equipe` du noyau, et il refuse le jeton', () => {
  beforeAll(() => { const r = recenser(); signalements = r.out; fonctionsLues = r.n; erreursSonde = r.erreurs; }, 300_000);

  it('le recensement lit les fonctions du noyau (sinon il ne garde rien), et la sonde compile', () => {
    expect(fonctionsLues, 'aucune fonction du noyau lue').toBeGreaterThan(1000);
    expect(erreursSonde, 'la sonde ne compile pas · elle ne prouve rien').toEqual([]);
  });

  it('chaque forme qui rouvrirait le passage structurel est signalée, et rien d’autre (sonde en mémoire)', () => {
    const lignes = CODE_SONDE.split('\n');
    const vues = signalements.filter((s) => s.fichier === SONDE_REL);
    const attendues = lignes.flatMap((l, i) => (/\/\/ SIGNALE/.test(l) ? [i + 1] : []));
    const jamais = lignes.flatMap((l, i) => (/\/\/ PAS/.test(l) ? [i + 1] : []));
    expect([attendues.length, jamais.length], 'la sonde a perdu ses cas').toEqual([6, 3]);
    for (const l of attendues) expect.soft(vues.some((v) => v.ligne === l), `ligne de sonde ${l} « ${lignes[l - 1]!.trim()} » · un paramètre equipe qui rouvre le passage n’est pas signalé`).toBe(true);
    for (const l of jamais) expect.soft(vues.some((v) => v.ligne === l), `ligne de sonde ${l} « ${lignes[l - 1]!.trim()} » · le recensement crie au loup · ${vues.filter((v) => v.ligne === l).map((v) => v.raison).join(' | ')}`).toBe(false);
    // Les trois premières formes ACCEPTENT le jeton · c'est la réouverture silencieuse elle-même, pas seulement un défaut d'écriture.
    // Mesuré · la quatrième (tout optionnel) le refuse déjà, par la détection des types « faibles » du compilateur · elle n'est signalée que comme copie.
    for (const l of attendues.slice(0, 3)) expect.soft(vues.some((v) => v.ligne === l && /accepte un jeton/.test(v.raison)), `ligne de sonde ${l} · le jeton n’y est plus vu comme accepté`).toBe(true);
  });

  it('aucun paramètre `equipe` du noyau n’accepte le jeton ni ne recopie le type à la main', () => {
    const hors = signalements.filter((s) => s.fichier !== SONDE_REL).map((s) => `${s.fichier}:${s.ligne} · ${s.raison} · ${s.texte}`);
    expect(hors, 'un paramètre equipe du noyau hors de EquipeAdmissible (src/studios/securite.ts) · un type anonyme ou élargi laisserait passer Session.equipe par sa forme. Écris-le `EquipeAdmissible | null | undefined`').toEqual([]);
  });
});
