import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { accesTotalAdmissible, privilegesEquipe, roleEffectifAudit, voitDepensePlateforme, type EquipeAdmissible } from '@tiktrends/core';
import type { Session } from '../lib/auth';
import type { EquipeSession } from '../lib/equipe-plateforme';
import { equipeAuthentique } from '../lib/registre-equipe-session';
import { effectiveAccess } from '../lib/access';
import { contexteDepuisSession } from '../lib/studios/garde';
import { session, idsStudios } from './studios-semis';
import { compilerSondes, sondesDuFichier, type ErreurDeSonde } from './helpers/sondes-de-type';

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
 * (1) à (3) ne COMPILENT plus dès qu'elles NOMMENT un champ de l'équipe
 * (`role`, `plateformeAdmissible`) · pas sous un type élargi (PASSE (5), plus
 * bas).
 *
 * Ce fichier est sa propre sonde · `sondes` (plus bas) n'est jamais appelée.
 * Chaque ligne sous un `@ts-expect-error` doit être refusée par le compilateur
 * (`tsc --noEmit`, la porte typecheck, échoue sinon sur « Unused
 * '@ts-expect-error' directive »). Le premier cas de vitest compile ce même
 * fichier, directives retirées (test/helpers/sondes-de-type.ts), et vérifie
 * plus fort · chaque sonde échoue sur l'OPACITÉ (le message cite
 * `JetonEquipe`), jamais sur une faute de frappe, et aucune autre ligne n'a
 * d'erreur.
 *
 * Mesuré, et dit tel quel · sur main, `roleEffectifAudit({ ...s, roleEspace })`
 * écrit littéralement était DÉJÀ refusé, par hasard · `Session.equipe` est
 * optionnel, le paramètre du noyau est requis. Il suffisait de poser un défaut
 * (`{ equipe: null, ...s }`) pour qu'il compile · ce sont ces formes que les
 * sondes (1) portent. Depuis suite de #1128, chaque paramètre `equipe` du noyau
 * est écrit `EquipeAdmissible` (`role` requis) · la sonde « futur paramètre
 * OPTIONNEL » prouve qu'un `equipe?:` ne rouvre rien, et le recensement du
 * noyau (packages/core/test/equipe-admissible-sources.test.ts) refuse tout
 * paramètre `equipe` qui accepterait le jeton (`unknown`, `object`, `{}`).
 * `Reflect.get(s, 'equipe')` à clé LITTÉRALE est typé depuis TypeScript 5 · il
 * rendait l'`EquipeSession` sur main, il rend le jeton ici. Un nom calculé
 * (`s[k]`, `k` typé `string` ou `any`) est refusé sur main comme ici par
 * `noImplicitAny` (TS7053).
 *
 * Ce que le type ne ferme PAS (à dire, pas à taire) · les lignes « PASSE »
 * COMPILENT.
 *  · PASSE (4) · `Reflect.get` à clé non littérale, `Object.values` et
 *    `Object.entries` rendent `any`, un nom calculé au prix d'un `any` aussi,
 *    et `Object.assign` intersecte le jeton avec une équipe forgée. Un cast
 *    (`as unknown as`) aussi, toujours.
 *  · PASSE (5) · trouvé par la relecture de #1128 · le jeton est assignable à
 *    `unknown`, `object` et `{}`, et `in` rétrécit · un paramètre `(x: {
 *    equipe?: unknown })` lit `plateformeAdmissible` sans cast ni `any`. Sur
 *    main ea01a5aa, l'en-tête disait les formes (2) « fermées quelle que soit
 *    leur écriture » · c'était faux pour celles-ci.
 * Ces formes, le RECENSEMENT `secu-equipe-authentique-sources` les refuse en
 * production (lecture de `.equipe` sur tout objet qui a reçu une session, quel
 * que soit son type local · `Reflect.get`, `Object.entries`, `Object.values`,
 * `Object.assign` · les casts qui exposent l'équipe) · sa sonde en mémoire
 * porte chacune. Ce qu'il ne suit pas (une session rendue sous `unknown` par
 * une fonction, rangée dans un tableau élargi, un `.js`), la barrière est à
 * l'EXÉCUTION · le registre. Le second cas l'éprouve au résultat · une équipe
 * ainsi forgée (dont celle du semis `{ authentique: false }`) n'a ni face
 * équipe, ni portée plateforme, ni rôle « equipe: » en audit. Ce que le
 * registre ne rattrape pas · un lecteur qui DÉCIDERAIT lui-même sur la valeur
 * lue sans passer par `equipeAuthentique`.
 */

// ── Les sondes · jamais appelées, lues par le compilateur. Une sonde par ligne.
type EquipeLocale = { equipe?: { role: string; plateformeAdmissible?: boolean } | null };
const lireLocale = (x: EquipeLocale) => x.equipe?.plateformeAdmissible === true;
/** Un FUTUR paramètre optionnel du noyau, écrit comme le noyau l'exige · `EquipeAdmissible`, jamais un type anonyme. */
const futurDuNoyau = (p: { roleEspace: string; equipe?: EquipeAdmissible | null }) => p.equipe?.plateformeAdmissible === true;
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
    // @ts-expect-error (1) un futur paramètre OPTIONNEL du noyau, typé EquipeAdmissible · le passage structurel reste fermé
    futurDuNoyau({ ...s, roleEspace: 'member' }),
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
    ((x: { equipe?: unknown }) => { const e = x.equipe; return typeof e === 'object' && e !== null && 'plateformeAdmissible' in e && e.plateformeAdmissible === true; })(s), // PASSE (5) · unknown + in
    ((x: { equipe?: object | null }) => { const e = x.equipe; return !!e && 'plateformeAdmissible' in e && e.plateformeAdmissible === true; })(s), // PASSE (5) · object + in
    ((x: { equipe?: {} | null }) => { const e = x.equipe; return typeof e === 'object' && e !== null && 'plateformeAdmissible' in e && e.plateformeAdmissible === true; })(s), // PASSE (5) · {} + in
    equipe, brute, // TÉMOIN · les variables des sondes (3)
  ];
}

const ICI = join(__dirname, 'secu-equipe-opaque.types.test.ts');
const SONDES_ATTENDUES = 15;

let erreurs: ErreurDeSonde[] = [];
let lignes: string[] = [];

describe('Session.equipe opaque · le compilateur refuse les formes (1) à (3), le recensement et le registre rattrapent les formes (4) et (5)', () => {
  beforeAll(() => { erreurs = compilerSondes(ICI); lignes = readFileSync(ICI, 'utf8').split('\n'); }, 300_000);

  it('chaque sonde (1) à (3) et chaque forge échoue À LA COMPILATION, sur l’opacité · aucune autre ligne n’a d’erreur', () => {
    const sondes = sondesDuFichier(lignes);
    expect(sondes.length, 'la sonde a perdu ses cas').toBe(SONDES_ATTENDUES);
    for (const s of sondes) {
      const siennes = erreurs.filter((e) => e.ligne === s.ligne);
      expect(siennes.length, `${s.quoi} · ligne ${s.ligne} « ${lignes[s.ligne - 1]!.trim()} » COMPILE · une équipe de session se lit sans l’accesseur`).toBeGreaterThan(0);
      expect(siennes.some((e) => /JetonEquipe/.test(e.message)), `${s.quoi} · ligne ${s.ligne} refusée pour une autre raison que l’opacité · ${siennes.map((e) => e.message).join(' | ')}`).toBe(true);
    }
    const ailleurs = erreurs.filter((e) => !sondes.some((s) => s.ligne === e.ligne)).map((e) => `ligne ${e.ligne} · ${e.message}`);
    expect(ailleurs, 'une erreur hors des sondes · le témoin (l’accesseur) ou une forme (4) ne compile plus, ou le fichier est cassé').toEqual([]);
    const passe = (n: number) => lignes.filter((l) => new RegExp(`// PASSE \\(${n}\\)`).test(l)).length;
    expect(passe(4), 'les formes (4) que le type laisse passer ne sont plus toutes dites').toBe(5);
    expect(passe(5), 'les formes (5) (unknown, object, {} rétrécis par in) que le type laisse passer ne sont plus toutes dites').toBe(3);
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
