// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Suite de #1122 · la reconnaissance de la face équipe est VISIBLE et son
 * entrée AUTHENTIFIÉE.
 *
 * 1. Le filet de journal · une face posée dans `Access.equipe` que le registre
 *    ne reconnaît pas n'arrive jamais en code légitime. Si elle arrive, c'est
 *    soit une face forgée, soit DEUX instances de lib/rbac.ts (chacune son
 *    registre) · dans ce second cas, chaque membre d'équipe légitime retombe
 *    sans bruit sur la face client. `faceEquipeReconnue` le dit, UNE fois par
 *    processus, sans donnée personnelle.
 *
 * 2. L'entrée de `effectiveAccess` · il faisait confiance au
 *    `equipe.plateformeAdmissible` de l'appelant. Une session reconstruite à la
 *    main (`{ ...s, equipe: { role: 'admin', matrice: {}, plateformeAdmissible:
 *    true } }`) obtenait une face RECONNUE. Désormais seule une `EquipeSession`
 *    produite par `equipeDeSession` (marquée au registre des sessions) compte ·
 *    toute autre vaut absente, face client.
 *
 * On lit le RÉSULTAT · les avertissements émis, l'accès rendu.
 */

const ADMISSIBLE = { role: 'admin' as const, matrice: {}, plateformeAdmissible: true };
const base = { role: 'member' as const, plan: 'starter' as const, user: { email: 'membre-equipe@tiktrends.invalid' } };

/** Les modules frais · le filet est unique PAR PROCESSUS, chaque cas repart d'un module neuf. */
async function modules() {
  vi.resetModules();
  const rbac = await import('../lib/rbac');
  const { effectiveAccess } = await import('../lib/access');
  const { faceEquipeTest } = await import('./helpers/face-equipe');
  const avert = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return { rbac, effectiveAccess, faceEquipeTest, avert };
}
afterEach(() => { vi.restoreAllMocks(); });

const VEILLE = { key: 'inspo' } as const;

describe('Filet de journal · une face équipe non reconnue le dit, une fois', () => {
  it('une vraie face (effectiveAccess) · reconnue, AUCUN avertissement', async () => {
    const { rbac, faceEquipeTest, avert } = await modules();
    const vraie = faceEquipeTest('admin');
    for (let i = 0; i < 3; i++) expect(rbac.faceEquipeReconnue({ role: 'member', plan: 'starter', equipe: vraie })).not.toBeNull();
    expect(avert, 'une face légitime fait parler le filet · il crierait à chaque requête').not.toHaveBeenCalled();
  });

  it('une face forgée (copie d’une vraie) · face client, et EXACTEMENT un avertissement sur plusieurs appels', async () => {
    const { rbac, faceEquipeTest, avert } = await modules();
    const forgee = structuredClone(faceEquipeTest('admin'));
    for (let i = 0; i < 4; i++) expect(rbac.faceEquipeReconnue({ role: 'member', plan: 'starter', equipe: forgee })).toBeNull();
    expect(avert, 'une face non reconnue passe sans bruit · une double instance de rbac fermerait l’équipe en silence').toHaveBeenCalledTimes(1);
    const message = String(avert.mock.calls[0]![0]);
    expect(message.startsWith('[rbac] face équipe non reconnue'), message).toBe(true);
    expect(message, 'le filet nomme le compte · aucune donnée personnelle au journal').not.toMatch(/@|tiktrends\.invalid/);
  });

  it('pas d’équipe · ni face ni avertissement (le filet ne parle que d’un objet posé)', async () => {
    const { rbac, avert } = await modules();
    expect(rbac.faceEquipeReconnue({ role: 'member', plan: 'starter' })).toBeNull();
    expect(rbac.faceEquipeReconnue({ role: 'member', plan: 'starter', equipe: undefined })).toBeNull();
    expect(avert).not.toHaveBeenCalled();
  });
});

describe('Entrée de effectiveAccess · une session d’équipe reconstruite à la main vaut face client', () => {
  it('une equipe littérale « admissible » · aucune face, formule réelle, et un avertissement sans donnée personnelle', async () => {
    const { rbac, effectiveAccess, avert } = await modules();
    for (let i = 0; i < 3; i++) {
      const a = effectiveAccess({ ...base, equipe: { ...ADMISSIBLE } });
      expect(a.equipe, 'une session reconstruite à la main obtient la face équipe · effectiveAccess croit le plateformeAdmissible de l’appelant').toBeUndefined();
      expect(a.plan, 'une session reconstruite à la main passe en Business').toBe('starter');
      expect(rbac.canAccess(a, rbac.FEATURES.find((f) => f.key === VEILLE.key)!)).toBe(false);
    }
    expect(avert).toHaveBeenCalledTimes(1);
    const message = String(avert.mock.calls[0]![0]);
    expect(message.startsWith('[rbac] session d’équipe non authentifiée'), message).toBe(true);
    expect(message).not.toMatch(/@|tiktrends\.invalid/);
  });

  it('une session d’équipe AUTHENTIFIÉE (helper de test, même registre que equipeDeSession) · face reconnue, sans avertissement', async () => {
    const { rbac, effectiveAccess, avert } = await modules();
    const { sessionEquipeTest } = await import('./helpers/face-equipe');
    const a = effectiveAccess({ ...base, equipe: sessionEquipeTest(ADMISSIBLE) });
    expect(rbac.faceEquipeReconnue(a)).not.toBeNull();
    expect(a.plan).toBe('business');
    expect(avert).not.toHaveBeenCalled();
  });

  it('une copie d’une session authentifiée · face client (seul l’objet produit compte, pas sa forme)', async () => {
    const { effectiveAccess } = await modules();
    const { sessionEquipeTest } = await import('./helpers/face-equipe');
    const vraie = sessionEquipeTest(ADMISSIBLE);
    expect(effectiveAccess({ ...base, equipe: vraie }).equipe).toBeDefined();
    for (const copie of [{ ...vraie }, structuredClone(vraie), JSON.parse(JSON.stringify(vraie)), Object.create(vraie)]) {
      expect(effectiveAccess({ ...base, equipe: copie }).equipe).toBeUndefined();
    }
  });

  it('une session authentifiée NON admissible ne s’élargit pas après coup · elle est gelée', async () => {
    const { effectiveAccess } = await modules();
    const { sessionEquipeTest } = await import('./helpers/face-equipe');
    const s = sessionEquipeTest({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible: false });
    expect(() => { (s as { plateformeAdmissible?: boolean }).plateformeAdmissible = true; }, 'la session authentifiée se mute · on la rendrait admissible après coup').toThrow(TypeError);
    expect(() => { (s.matrice.membre as string[]).push('adsmap'); }).toThrow(TypeError);
    expect(effectiveAccess({ ...base, equipe: s }).equipe).toBeUndefined();
  });
});
