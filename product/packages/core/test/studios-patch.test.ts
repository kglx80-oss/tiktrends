import { describe, it, expect } from 'vitest';
import { appliquerPatch, verifierHorsCheminsInchanges, lirePointeur, type ChangementPatch } from '../src/studios/patch';
import { contenuVideo, copie } from './studios-fixtures';

const AUTORISES = ['/shots/byId/*/narration', '/brief'];
const ch = (op: ChangementPatch['op'], path: string, newValue: unknown): ChangementPatch => ({ op, path, newValue, reason: 'test' });

function refuse(base: unknown, changes: unknown, allowed: unknown = AUTORISES) {
  const avant = JSON.stringify(base);
  const r = appliquerPatch(base, changes, allowed);
  expect(JSON.stringify(base), 'la base ne doit jamais être modifiée').toBe(avant);
  expect(r.ok, `patch accepté à tort : ${JSON.stringify(changes)}`).toBe(false);
  return r.ok ? [] : r.violations.map((v) => v.raison).join(' | ');
}

describe('patch · ce qui passe', () => {
  it('replace sur un chemin autorisé, par identifiant · rien d’autre ne bouge', () => {
    const base = contenuVideo();
    const r = appliquerPatch(base, [ch('replace', '/shots/byId/s_fin/narration', 'Essaie-le.')], AUTORISES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultat.shots.byId.s_fin!.narration).toBe('Essaie-le.');
    expect(verifierHorsCheminsInchanges(base, r.resultat, AUTORISES)).toEqual([]);
    expect(base.shots.byId.s_fin!.narration).toBe('');
  });

  it('replace avec null pose la VALEUR null (ce n’est pas une suppression)', () => {
    const r = appliquerPatch(contenuVideo(), [ch('replace', '/brief', null)], AUTORISES);
    expect(r.ok && r.resultat.brief).toBe(null);
    expect(r.ok && 'brief' in r.resultat).toBe(true);
  });

  it('remove avec newValue null retire la clé', () => {
    const r = appliquerPatch(contenuVideo(), [ch('remove', '/brief/hypothese', null)], AUTORISES);
    expect(r.ok && r.resultat.brief && 'hypothese' in r.resultat.brief).toBe(false);
  });

  it('échappements RFC 6901 · « ~1 » vaut « / », « ~0 » vaut « ~ »', () => {
    expect(lirePointeur('/brief/a~1b~0c')).toEqual({ ok: true, segments: ['brief', 'a/b~c'] });
  });
});

describe('patch · ce qui est refusé (rien n’est appliqué)', () => {
  it('chemin hors allowedPaths', () => {
    expect(refuse(contenuVideo(), [ch('replace', '/shots/byId/s_fin/camera', 'drone')])).toMatch(/hors allowedPaths/);
  });

  it('segments __proto__, constructor, prototype · dans le chemin', () => {
    for (const p of ['/brief/constructor', '/brief/prototype/x', '/__proto__/x']) {
      expect(refuse(contenuVideo(), [ch('add', p, 1)], ['/brief'])).toMatch(/interdit/);
    }
  });

  it('clé __proto__ cachée dans la VALEUR', () => {
    const val = JSON.parse('{"ok":1,"__proto__":{"admin":true}}');
    expect(refuse(contenuVideo(), [ch('replace', '/brief', val)])).toMatch(/clé interdite/);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('indice positionnel comme identité (« /shots/order/0 », « /- »)', () => {
    expect(refuse(contenuVideo(), [ch('replace', '/shots/order/0', 's_fin')], ['/shots'])).toMatch(/positionnel/);
    expect(refuse(contenuVideo(), [ch('add', '/shots/order/-', 's_x')], ['/shots'])).toMatch(/positionnel/);
  });

  it('remove avec une newValue non nulle', () => {
    expect(refuse(contenuVideo(), [ch('remove', '/brief/hypothese', 'x')])).toMatch(/remove exige newValue null/);
  });

  it('add sur une cible existante, replace sur une cible absente', () => {
    expect(refuse(contenuVideo(), [ch('add', '/brief/objectif', 'x')])).toMatch(/existante/);
    expect(refuse(contenuVideo(), [ch('replace', '/shots/byId/s_absent/narration', 'x')])).toMatch(/absent/);
  });

  it('tout ou rien · un changement fautif annule les autres', () => {
    expect(refuse(contenuVideo(), [ch('replace', '/brief', {}), ch('replace', '/timeline', null)])).toMatch(/hors allowedPaths/);
  });

  it('allowedPaths vide ou avec un indice · refusé, jamais « tout permis »', () => {
    expect(refuse(contenuVideo(), [ch('replace', '/brief', {})], [])).toMatch(/1 à 100 chemins/);
    expect(refuse(contenuVideo(), [ch('replace', '/brief', {})], ['/shots/order/1'])).toMatch(/positionnel/);
  });
});

describe('vérification indépendante · tout champ hors allowedPaths reste égal', () => {
  it('un résultat fabriqué ailleurs qui touche un champ non autorisé est détecté', () => {
    const avant = contenuVideo();
    const apres = copie(avant);
    apres.shots.byId.s_fin!.narration = 'permis';
    apres.shots.byId.s_produit!.camera = 'drone'; // NON autorisé
    expect(verifierHorsCheminsInchanges(avant, apres, AUTORISES)).toEqual([{ chemin: '/shots/byId/s_produit/camera', raison: 'champ hors allowedPaths modifié' }]);
  });

  it('remplacer un parent entier n’est pas couvert par un motif enfant', () => {
    const avant = contenuVideo();
    const apres = copie(avant);
    apres.shots.byId.s_fin = { ...apres.shots.byId.s_fin!, narration: 'x', camera: 'y' };
    expect(verifierHorsCheminsInchanges(avant, apres, ['/shots/byId/s_fin/narration']).map((v) => v.chemin)).toEqual(['/shots/byId/s_fin/camera']);
  });
});
