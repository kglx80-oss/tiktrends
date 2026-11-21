import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { accesTotalAdmissible, privilegesEquipe, roleEffectifAudit, voitDepensePlateforme } from '@tiktrends/core';
import type { Session } from '../lib/auth';
import type { EquipeSession } from '../lib/equipe-plateforme';
import { equipeAuthentique } from '../lib/registre-equipe-session';
import { effectiveAccess } from '../lib/access';
import { contexteDepuisSession } from '../lib/studios/garde';
import { session, idsStudios } from './studios-semis';

/**
 * Suite de #1125 · `Session.equipe` est OPAQUE au niveau du type.
 *
 * Le recensement `secu-equipe-authentique-sources` refusait toute lecture
 * `.equipe` dont le type portait `EquipeSession`. Une relecture indépendante a
 * montré quatre formes qu'il laissait passer, de bonne foi · (1) un passage
 * STRUCTUREL vers le noyau (`roleEffectifAudit({ ...s, roleEspace })`,
 * `voitDepensePlateforme({ ...s, fondateurCode })`) · aucun `.equipe` n'est
 * écrit dans apps/web, le noyau le lit sur un type anonyme ; (2) un type local
 * ou un utilitaire (`(x: { equipe?: {...} })`, `Readonly<EquipeSession>`,
 * `Pick<EquipeSession, …>`) ; (3) une affectation déstructurante
 * (`({ equipe } = s)`) ; (4) un nom calculé, `Reflect.get`, `Object.entries`.
 *
 * Désormais `Session.equipe` est un `JetonEquipe` (lib/registre-equipe-session.ts) ·
 * un objet marqué d'un `unique symbol`, sans aucun champ lisible. Seul
 * `equipeAuthentique` rend une `EquipeSession`, après le registre. Les formes
 * (1) à (3) ne COMPILENT plus, quelle que soit leur écriture.
 *
 * Ce fichier est sa propre sonde · `sondes` (plus bas) n'est jamais appelée.
 * Chaque ligne sous un `@ts-expect-error` doit être refusée par le compilateur
 * (`tsc --noEmit`, la porte typecheck, échoue sinon sur « Unused
 * '@ts-expect-error' directive »). Le premier cas de vitest compile ce même
 * fichier, directives retirées, et vérifie plus fort · chaque sonde échoue sur
 * l'OPACITÉ (le message cite `JetonEquipe`), jamais sur une faute de frappe, et
 * aucune autre ligne n'a d'erreur.
 *
 * Mesuré, et dit tel quel · sur main, `roleEffectifAudit({ ...s, roleEspace })`
 * écrit littéralement était DÉJÀ refusé, par hasard · `Session.equipe` est
 * optionnel, le paramètre du noyau est requis. Il suffisait de poser un défaut
 * (`{ equipe: null, ...s }`) pour qu'il compile · ce sont ces formes que les
 * sondes (1) portent. `Reflect.get(s, 'equipe')` à clé LITTÉRALE est typé
 * depuis TypeScript 5 · il rendait l'`EquipeSession` sur main, il rend le jeton
 * ici. Un nom calculé (`s[k]`, `k` typé `string` ou `any`) est refusé sur main
 * comme ici par `noImplicitAny` (TS7053).
 *
 * Ce que le type ne ferme PAS (forme 4, à dire, pas à taire) · les lignes
 * « PASSE (4) » compilent · `Reflect.get` à clé non littérale, `Object.values`
 * et `Object.entries` rendent `any`, un nom calculé au prix d'un `any` aussi,
 * et `Object.assign` intersecte le jeton avec une équipe forgée. Un cast
 * (`as unknown as`) aussi, toujours. Là, la barrière est à l'EXÉCUTION · le
 * registre. Le second cas l'éprouve au résultat · une équipe ainsi forgée
 * (dont celle du semis `{ authentique: false }`) n'a ni face équipe, ni portée
 * plateforme, ni rôle « equipe: » en audit. Ce que le registre ne rattrape
 * pas · un lecteur qui DÉCIDERAIT lui-même sur une valeur lue en `any` sans
 * passer par `equipeAuthentique` · le recensement
 * `secu-equipe-authentique-sources` en refuse les formes qu'il voit.
 */

// ── Les sondes · jamais appelées, lues par le compilateur. Une sonde par ligne.
type EquipeLocale = { equipe?: { role: string; plateformeAdmissible?: boolean } | null };
const lireLocale = (x: EquipeLocale) => x.equipe?.plateformeAdmissible === true;
declare const cleAny: any;
declare const cleTexte: string;
declare const forgee: EquipeSession;
export function sondes(s: Session): unknown[] {
  let equipe: EquipeSession | null | undefined;
  let brute: Session['equipe'];
  return [
    // @ts-expect-error (1) passage structurel · le noyau lirait equipe.plateformeAdmissible
    roleEffectifAudit({ equipe: null, ...s, roleEspace: 'member' }),
    // @ts-expect-error (1) passage structurel · la dépense de la plateforme
    voitDepensePlateforme({ equipe: null, ...s, fondateurCode: false }),
    // @ts-expect-error (1) passage structurel · les privilèges d'équipe
    privilegesEquipe({ equipe: null, ...s, fondateurCode: false }),
    // @ts-expect-error (1) passage direct du champ au noyau
    accesTotalAdmissible(s.equipe),
    // @ts-expect-error (2) type local nommé
    lireLocale(s),
    // @ts-expect-error (2) type local en paramètre
    ((x: { equipe?: { plateformeAdmissible?: boolean } | null }) => x.equipe?.plateformeAdmissible)(s),
    // @ts-expect-error (2) utilitaire Readonly
    ((r: Readonly<EquipeSession> | null | undefined) => r?.plateformeAdmissible)(s.equipe),
    // @ts-expect-error (2) utilitaire Pick
    ((p: Pick<EquipeSession, 'role' | 'plateformeAdmissible'> | null | undefined) => p?.plateformeAdmissible)(s.equipe),
    // @ts-expect-error (2) lecture directe d'un champ
    s.equipe?.plateformeAdmissible,
    // @ts-expect-error (3) affectation déstructurante vers un type d'équipe
    ({ equipe } = s),
    // @ts-expect-error (3) affectation déstructurante, puis lecture
    (({ equipe: brute } = s), brute?.role),
    // @ts-expect-error (4) Reflect.get, clé littérale · typé depuis TypeScript 5, il rend le jeton
    Reflect.get(s, 'equipe')?.plateformeAdmissible,
    // @ts-expect-error (forge) une session reconstruite à la main
    ((f: Session) => f)({ ...s, equipe: { role: 'admin', matrice: {}, plateformeAdmissible: true } }),
    // @ts-expect-error (forge) un cast simple vers une équipe
    (s.equipe as EquipeSession).plateformeAdmissible,
    roleEffectifAudit({ roleEspace: 'member', equipe: equipeAuthentique(s) }), // TÉMOIN · l'accesseur compile
    Reflect.get(s, cleTexte)?.plateformeAdmissible, // PASSE (4) · Reflect.get, clé non littérale, rend any
    Object.values(s).map((v) => v?.plateformeAdmissible), // PASSE (4) · Object.values rend any[]
    Object.entries(s).map(([, v]) => v?.plateformeAdmissible), // PASSE (4) · Object.entries rend [string, any][]
    (s as any)[cleAny]?.plateformeAdmissible, // PASSE (4) · nom calculé, au prix d'un any
    Object.assign({}, s, { equipe: forgee }).equipe.plateformeAdmissible, // PASSE (4) · Object.assign intersecte
    equipe, brute, // TÉMOIN · les variables des sondes (3)
  ];
}

const WEB = join(__dirname, '..');
const ICI = join(__dirname, 'secu-equipe-opaque.types.test.ts');
const SONDES_ATTENDUES = 14;

interface Erreur { ligne: number; message: string }
let erreurs: Erreur[] = [];
let lignes: string[] = [];

/** Ce fichier, directives retirées, compilé avec les options de apps/web · les erreurs qu'il porte, par ligne. */
function compiler(): Erreur[] {
  const lu = ts.readConfigFile(join(WEB, 'tsconfig.json'), ts.sys.readFile);
  const conf = ts.parseJsonConfigFileContent(lu.config, ts.sys, WEB);
  const options: ts.CompilerOptions = { ...conf.options, incremental: false, noEmit: true };
  const code = readFileSync(ICI, 'utf8').replace(/@ts-expect-error/g, '@sonde');
  const hote = ts.createCompilerHost(options);
  const source = hote.getSourceFile.bind(hote);
  hote.getSourceFile = (f, v, ...r) => (f === ICI ? ts.createSourceFile(f, code, v, true) : source(f, v, ...r));
  const programme = ts.createProgram([ICI], options, hote);
  const sf = programme.getSourceFile(ICI)!;
  return [...programme.getSyntacticDiagnostics(sf), ...programme.getSemanticDiagnostics(sf)].map((d) => ({
    ligne: sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
}

describe('Session.equipe opaque · le compilateur refuse les formes (1) à (3), le registre rattrape la forme (4)', () => {
  beforeAll(() => { erreurs = compiler(); lignes = readFileSync(ICI, 'utf8').split('\n'); }, 300_000);

  it('chaque sonde (1) à (3) et chaque forge échoue À LA COMPILATION, sur l’opacité · aucune autre ligne n’a d’erreur', () => {
    const sondes = lignes.flatMap((l, i) => (/^\s*\/\/ @ts-expect-error/.test(l) ? [{ ligne: i + 2, quoi: l.trim().replace('// @ts-expect-error ', '') }] : []));
    expect(sondes.length, 'la sonde a perdu ses cas').toBe(SONDES_ATTENDUES);
    for (const s of sondes) {
      const siennes = erreurs.filter((e) => e.ligne === s.ligne);
      expect(siennes.length, `${s.quoi} · ligne ${s.ligne} « ${lignes[s.ligne - 1]!.trim()} » COMPILE · une équipe de session se lit sans l’accesseur`).toBeGreaterThan(0);
      expect(siennes.some((e) => /JetonEquipe/.test(e.message)), `${s.quoi} · ligne ${s.ligne} refusée pour une autre raison que l’opacité · ${siennes.map((e) => e.message).join(' | ')}`).toBe(true);
    }
    const ailleurs = erreurs.filter((e) => !sondes.some((s) => s.ligne === e.ligne)).map((e) => `ligne ${e.ligne} · ${e.message}`);
    expect(ailleurs, 'une erreur hors des sondes · le témoin (l’accesseur) ou une forme (4) ne compile plus, ou le fichier est cassé').toEqual([]);
    const passe = lignes.filter((l) => /\/\/ PASSE \(4\)/.test(l)).length;
    expect(passe, 'les formes (4) que le type laisse passer ne sont plus toutes dites').toBe(5);
  });

  it('forme (4) · une équipe forgée sans le compilateur (Object.assign, Reflect.set, nom calculé, copie) n’a AUCUN accès · le registre la rattrape', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ids = idsStudios();
    const ADMISSIBLE = { role: 'adminplus' as const, matrice: {}, plateformeAdmissible: true };
    // Le témoin · la même équipe, authentifiée (le registre que remplit equipeDeSession) · elle ouvre tout.
    const vraie = session(ids, 'ua', { equipe: ADMISSIBLE });
    const ctxVrai = contexteDepuisSession(vraie, [], [], 'st_temoin');
    expect(equipeAuthentique(vraie), 'le témoin n’a pas d’équipe · le cas ne prouve rien').not.toBeNull();
    expect(effectiveAccess(vraie).equipe, 'le témoin n’a pas de face équipe').toBeDefined();
    expect(ctxVrai.permissions.plateforme.size, 'le témoin n’a pas de portée plateforme').toBeGreaterThan(0);
    expect(ctxVrai.roleEffectif).toBe('equipe:adminplus/espace:member');

    const cliente = session(ids, 'ua');
    const cle: any = ['equi', 'pe'].join('');
    const parReflect = { ...cliente };
    Reflect.set(parReflect, 'equipe', { ...ADMISSIBLE });
    const parCle = { ...cliente };
    parCle[cle as 'equipe'] = { ...ADMISSIBLE } as any;
    const forgees: Record<string, Session> = {
      'semis { authentique: false }': session(ids, 'ua', { equipe: ADMISSIBLE }, { authentique: false }),
      'Object.assign': Object.assign({}, cliente, { equipe: { ...ADMISSIBLE } }),
      'Reflect.set': parReflect,
      'nom calculé': parCle,
      'copie de Reflect.get': Object.assign({}, vraie, { equipe: { ...Reflect.get(vraie, 'equipe') } }),
      'Object.fromEntries(Object.entries)': Object.fromEntries(Object.entries(vraie).map(([k, v]) => [k, k === 'equipe' ? { ...(v as object) } : v])) as unknown as Session,
    };
    for (const [forme, s] of Object.entries(forgees)) {
      expect(Reflect.get(s, 'equipe'), `${forme} · la forge n’a rien posé · le cas ne prouve rien`).toMatchObject({ plateformeAdmissible: true });
      expect(equipeAuthentique(s), `${forme} · equipeAuthentique rend une équipe forgée`).toBeNull();
      const acces = effectiveAccess(s);
      expect(acces.equipe, `${forme} · une équipe forgée obtient la face équipe`).toBeUndefined();
      expect(acces.plan, `${forme} · une équipe forgée obtient la formule Business`).toBe('core');
      const ctx = contexteDepuisSession(s, [], [], 'st_forge');
      expect([...ctx.permissions.plateforme], `${forme} · une équipe forgée obtient la portée plateforme du studio`).toEqual([]);
      expect(ctx.roleEffectif, `${forme} · une équipe forgée est tracée « equipe: » en audit`).toBe('espace:member');
    }
  });
});
