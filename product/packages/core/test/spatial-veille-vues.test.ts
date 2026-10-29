import { describe, expect, it } from 'vitest';
import {
  LONGUEUR_MAX_NOM_VUE_VEILLE, PARAMS_VUE_VEILLE, PLAFOND_VUES_VEILLE, adresseVueVeille, ajouterVueVeille, confirmationSuppressionVueVeille, libellesVueVeille,
  lireCriteresVeille, lireVuesVeilleStockees, paramsVueVeille, renommerVueVeille, retirerVueVeille, validerNomVueVeille, validerParamsVueVeille, vueActiveVeille,
  type VueVeilleEnregistree,
} from '../src';

/**
 * Veille · vues enregistrées · les règles PURES (nom, liste blanche des
 * paramètres d'adresse, plafond, doublons). On lit les valeurs RENDUES · la
 * liste obtenue, la raison du refus, l'adresse rouverte.
 */
const vue = (id: string, nom: string, params: Record<string, string>): VueVeilleEnregistree => ({ id, nom, params, creeLe: '2026-10-29T10:00:00.000Z' });
const ajout = (vues: VueVeilleEnregistree[], nom: unknown, params: unknown, id = 'n') => ajouterVueVeille(vues, { id, nom, params, creeLe: '2026-10-29T11:00:00.000Z' });

describe('Veille · vues · le nom', () => {
  it('espaces resserrés et bornes · vide, trop long, caractère de contrôle refusés', () => {
    expect(validerNomVueVeille('  Sérums   vidéo  ')).toEqual({ ok: true, nom: 'Sérums vidéo' });
    expect(validerNomVueVeille('   ')).toEqual({ ok: false, raison: 'Donne un nom à la vue.' });
    expect(validerNomVueVeille(42).ok).toBe(false);
    expect(validerNomVueVeille('x'.repeat(LONGUEUR_MAX_NOM_VUE_VEILLE)).ok).toBe(true);
    expect(validerNomVueVeille('x'.repeat(LONGUEUR_MAX_NOM_VUE_VEILLE + 1))).toEqual({ ok: false, raison: `Nom trop long (${LONGUEUR_MAX_NOM_VUE_VEILLE} caractères au plus).` });
    expect(validerNomVueVeille('a\u0007b').ok).toBe(false);
  });
});

describe('Veille · vues · liste blanche des paramètres d’adresse', () => {
  it('les paramètres gardés sont exactement ceux que l’explorateur relit, page exceptée', () => {
    // Chaque clé gardée doit être relue par `lireCriteresVeille` · sinon la vue rouvrirait autre chose.
    const relu = lireCriteresVeille({ j: 'phrase', q: 'sérum', p: 'meta', searchIn: 'brand', media: 'video', sort: 'reach', status: 'active', country: 'BE', vue: 'tendance', cpm: '12', page: '3' });
    expect(Object.keys(relu).filter((k) => k !== 'page').sort()).toEqual([...PARAMS_VUE_VEILLE].sort());
  });

  it('une clé hors liste est REFUSÉE, jamais ignorée en silence', () => {
    for (const cle of ['page', 'rv', 'refresh', 'jarvis', 'workspaceId', 'userId']) {
      const r = validerParamsVueVeille({ q: 'sérum', [cle]: '2' });
      expect(r, `${cle} passerait`).toEqual({ ok: false, raison: `Le paramètre « ${cle} » n’est pas gardé dans une vue.` });
    }
  });

  it('une valeur que l’explorateur ne lirait pas est refusée', () => {
    expect(validerParamsVueVeille({ p: 'snapchat' })).toEqual({ ok: false, raison: 'Valeur refusée pour « p ».' });
    expect(validerParamsVueVeille({ cpm: '7' })).toEqual({ ok: false, raison: 'Valeur refusée pour « cpm ».' });
    expect(validerParamsVueVeille({ country: 'FRA' }).ok).toBe(false);
    expect(validerParamsVueVeille({ q: 3 }).ok).toBe(false);
    expect(validerParamsVueVeille(['q']).ok).toBe(false);
    expect(validerParamsVueVeille(null).ok).toBe(false);
  });

  it('canonique · défauts retirés, pays en capitales, ordre de l’explorateur · l’adresse rouvre la même vue', () => {
    const r = validerParamsVueVeille({ country: 'be', vue: 'tout', cpm: '9', q: 'sérum', media: 'video' });
    expect(r).toEqual({ ok: true, params: { q: 'sérum', media: 'video', country: 'BE' }, adresse: '/veille?q=s%C3%A9rum&media=video&country=BE' });
  });

  it('sans aucun filtre · refusé (c’est déjà « Toutes les pubs »)', () => {
    expect(validerParamsVueVeille({ vue: 'tout', cpm: '9' })).toEqual({ ok: false, raison: 'Aucun filtre à garder · sans critère, c’est déjà « Toutes les pubs ».' });
  });

  it('depuis les critères de l’écran · la page n’est jamais gardée', () => {
    expect(paramsVueVeille({ q: 'café', page: 4, vue: 'tendance' })).toEqual({ q: 'café', vue: 'tendance' });
  });
});

describe('Veille · vues · ajout, plafond, doublons', () => {
  it('ajoute une vue valide, avec ses paramètres canoniques', () => {
    const r = ajout([], ' Belgique vidéo ', { country: 'BE', media: 'video' });
    expect(r.ok && r.vues).toEqual([{ id: 'n', nom: 'Belgique vidéo', params: { media: 'video', country: 'BE' }, creeLe: '2026-10-29T11:00:00.000Z' }]);
  });

  it(`plafond · la ${PLAFOND_VUES_VEILLE + 1}e vue est refusée, la ${PLAFOND_VUES_VEILLE}e passe`, () => {
    const pays = ['FR', 'BE', 'CH', 'LU', 'CA', 'DE', 'ES', 'IT', 'GB', 'NL', 'PT', 'US'];
    let vues: VueVeilleEnregistree[] = [];
    for (let i = 0; i < PLAFOND_VUES_VEILLE; i++) {
      const r = ajout(vues, `Vue ${i}`, { country: pays[i]! }, `v${i}`);
      expect(r.ok, `la vue ${i + 1} est refusée`).toBe(true);
      if (r.ok) vues = r.vues;
    }
    expect(ajout(vues, 'Une de trop', { q: 'neuf' })).toEqual({ ok: false, raison: `Tu gardes déjà ${PLAFOND_VUES_VEILLE} vues · supprimes-en une pour en garder une nouvelle.` });
  });

  it('dédoublonnage · même nom (casse et accents ignorés), mêmes filtres (ordre et défauts ignorés)', () => {
    const vues = [vue('a', 'Sérums', { q: 'sérum', country: 'BE' })];
    expect(ajout(vues, 'SERUMS', { q: 'autre' })).toEqual({ ok: false, raison: 'Une vue s’appelle déjà « Sérums ».' });
    expect(ajout(vues, 'Autre nom', { country: 'be', cpm: '9', q: 'sérum' })).toEqual({ ok: false, raison: 'Ces filtres sont déjà gardés dans la vue « Sérums ».' });
    expect(ajout(vues, 'Autre nom', { country: 'BE', q: 'sérum', media: 'video' }).ok).toBe(true);
  });

  it('un refus de nom ou de paramètres remonte tel quel', () => {
    expect(ajout([], '', { q: 'x' })).toEqual({ ok: false, raison: 'Donne un nom à la vue.' });
    expect(ajout([], 'Ok', { page: '2' }).ok).toBe(false);
  });
});

describe('Veille · vues · renommer, retirer, vue active, relecture', () => {
  const vues = [vue('a', 'Sérums', { q: 'sérum' }), vue('b', 'Belgique', { country: 'BE' })];

  it('renommer · nom validé, jamais celui d’une autre vue · retirer · introuvable se dit', () => {
    expect(renommerVueVeille(vues, 'a', 'Sérums FR')).toEqual({ ok: true, vues: [{ ...vues[0], nom: 'Sérums FR' }, vues[1]] });
    expect(renommerVueVeille(vues, 'a', 'belgique')).toEqual({ ok: false, raison: 'Une vue s’appelle déjà « Belgique ».' });
    expect(renommerVueVeille(vues, 'z', 'X').ok).toBe(false);
    expect(retirerVueVeille(vues, 'a')).toEqual({ ok: true, vues: [vues[1]] });
    expect(retirerVueVeille(vues, 'z')).toEqual({ ok: false, raison: 'Vue introuvable · recharge la page.' });
  });

  it('la vue active est celle dont l’adresse est celle de l’écran (page ignorée)', () => {
    expect(vueActiveVeille(vues, { country: 'BE', page: 3 })).toBe('b');
    expect(vueActiveVeille(vues, { country: 'BE', media: 'video' })).toBeNull();
    expect(vueActiveVeille(vues, {})).toBeNull();
    expect(adresseVueVeille(vues[1]!.params)).toBe('/veille?country=BE');
  });

  it('relecture défensive · entrée invalide, doublon d’identifiant, clé hors liste écartés · bornée au plafond', () => {
    const brut = [vues[0], { ...vues[1], id: 'a' }, { id: 'c', nom: '', params: { q: 'x' } }, { id: 'd', nom: 'Hors liste', params: { rv: 'x' } }, 'n’importe quoi', vue('e', 'Vidéo', { media: 'video' })];
    expect(lireVuesVeilleStockees(brut).map((v) => v.id)).toEqual(['a', 'e']);
    expect(lireVuesVeilleStockees({}).length).toBe(0);
    const trop = Array.from({ length: PLAFOND_VUES_VEILLE + 3 }, (_, i) => vue(`x${i}`, `V${i}`, { q: `t${i}` }));
    expect(lireVuesVeilleStockees(trop).length).toBe(PLAFOND_VUES_VEILLE);
  });

  it('ce que garde une vue, en mots · et la question avant suppression', () => {
    expect(libellesVueVeille({ vue: 'tendance', q: 'sérum', p: 'meta', country: 'BE', sort: 'reach', cpm: '12' })).toEqual(['Tendance', '« sérum »', 'Meta', 'Belgique', 'Tri : Portée (UE)', 'CPM 12 €']);
    expect(confirmationSuppressionVueVeille('Sérums')).toBe('Supprimer la vue « Sérums » ? Les annonces ne changent pas · seul ce raccourci disparaît.');
  });
});
