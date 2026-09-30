import { describe, it, expect } from 'vitest';
import {
  adLancee, lienAdsmapCarte, etatApresSuivi, lireLienProfondAdsmap, bucketPerfCarte, RETOUR_STUDIO,
  filtrerTriGalerie, CRITERES_DEFAUT, type EtatVerdictCarte,
} from '../src/index';

/**
 * I1 · le passage Studio → Adsmap. On vérifie ce qui SORT · la cible du lien, son
 * libellé selon ce que la destination montre, la lecture du lien profond, et le
 * rangement dans les filtres.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('adLancee · diffusée ou non', () => {
  it('un brouillon, une proposition, une ad prête ne sont PAS lancés', () => {
    for (const status of ['draft', 'proposed', 'ready']) {
      expect(adLancee({ status, launchedAt: null }), `${status} compté comme lancé`).toBe(false);
    }
  });
  it('une date de lancement ou un statut de diffusion suffit', () => {
    expect(adLancee({ status: 'draft', launchedAt: '2026-09-01' })).toBe(true);
    for (const status of ['live', 'paused', 'done']) expect(adLancee({ status, launchedAt: null }), status).toBe(true);
  });
});

describe('lienAdsmapCarte · la carte mène au BON test, libellé selon la destination', () => {
  it('vise le panneau du test de CETTE créa, avec le retour Studio', () => {
    const l = lienAdsmapCarte({ adsmapAdId: AD, etat: 'perdante', acces: true })!;
    expect(l.href, 'le lien ne vise pas le test de la carte').toBe(`/adsmap?ad=${AD}&depuis=studio`);
    const lu = lireLienProfondAdsmap(Object.fromEntries(new URL(l.href, 'http://x').searchParams));
    expect(lu, 'Adsmap ne relit pas le lien que le Studio écrit').toEqual({ adId: AD, depuisStudio: true });
  });

  it('« Voir le verdict » seulement quand un verdict existe', () => {
    const avec: EtatVerdictCarte[] = ['gagnante_relative', 'perdante', 'non_concluant', 'diffusion_faible'];
    for (const etat of avec) expect(lienAdsmapCarte({ adsmapAdId: AD, etat, acces: true })!.libelle, etat).toBe('Voir le verdict');
    for (const etat of ['en_mesure', 'a_lancer'] as EtatVerdictCarte[]) {
      const l = lienAdsmapCarte({ adsmapAdId: AD, etat, acces: true })!;
      expect(l.libelle, `${etat} promet un verdict absent`).toBe('Ouvrir le test');
      expect(l.libelle.toLowerCase()).not.toMatch(/verdict|résultat/);
    }
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'a_lancer', acces: true })!.titre, 'l’infobulle d’un test non lancé laisse croire à des chiffres').toContain('aucun chiffre');
  });

  it('l’itération n’est promise que pour une gagnante arbitrée (le panneau la propose alors)', () => {
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'gagnante', acces: true })!.libelle).toBe('Voir le verdict · itérer');
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'petite_gagnante', acces: true })!.libelle).toBe('Voir le verdict · itérer');
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'gagnante_relative', acces: true })!.libelle, 'une prometteuse relative promet l’itération').not.toContain('itérer');
  });

  it('aucun lien · non suivie, test introuvable, ou sans accès Adsmap (droits préservés)', () => {
    expect(lienAdsmapCarte({ adsmapAdId: null, etat: null, acces: true }), 'une créa non suivie reçoit un lien').toBeNull();
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'introuvable', acces: true }), 'un test introuvable reçoit un lien').toBeNull();
    expect(lienAdsmapCarte({ adsmapAdId: AD, etat: 'gagnante', acces: false }), 'un lien est posé sans accès à Adsmap').toBeNull();
  });
});

describe('lireLienProfondAdsmap · on ne transmet qu’un identifiant bien formé', () => {
  it('ignore un identifiant mal formé ou absent', () => {
    expect(lireLienProfondAdsmap({ ad: 'x; drop' }).adId).toBeNull();
    expect(lireLienProfondAdsmap({}).adId).toBeNull();
    expect(lireLienProfondAdsmap({ ad: [AD, 'autre'] }).adId).toBe(AD);
  });
  it('le retour Studio n’est offert que depuis le Studio', () => {
    expect(lireLienProfondAdsmap({ ad: AD }).depuisStudio).toBe(false);
    expect(RETOUR_STUDIO.href).toBe('/studio/ads');
  });
});

describe('bucketPerfCarte · les filtres ne rangent pas un brouillon « en mesure »', () => {
  it('à lancer a son propre filtre, introuvable tombe dans « autre »', () => {
    expect(bucketPerfCarte('a_lancer'), 'un brouillon filtré avec les tests en mesure').toBe('a_lancer');
    expect(bucketPerfCarte('en_mesure')).toBe('en_mesure');
    expect(bucketPerfCarte('introuvable')).toBe('autre');
    expect(bucketPerfCarte(null)).toBe('inconnue');
    expect(bucketPerfCarte('petite_gagnante')).toBe('gagnante');
  });
  it('le filtre « à lancer » retient exactement les créas à lancer', () => {
    const items = (['a_lancer', 'en_mesure', 'gagnante', null] as (EtatVerdictCarte | null)[]).map((v, i) => ({
      id: String(i), titre: `t${i}`, format: 'f', date: `2026-09-0${i + 1}`, qualite: 'prete' as const, performance: bucketPerfCarte(v),
    }));
    expect(filtrerTriGalerie(items, { ...CRITERES_DEFAUT, performance: 'a_lancer' }).map((x) => x.id)).toEqual(['0']);
    expect(filtrerTriGalerie(items, { ...CRITERES_DEFAUT, performance: 'en_mesure' }).map((x) => x.id)).toEqual(['1']);
  });
});

describe('etatApresSuivi · juste après « Suivre », rien ne se mesure encore', () => {
  it('une créa qu’on vient de suivre est « à lancer », jamais « en mesure »', () => {
    expect(etatApresSuivi(null), 'une créa tout juste suivie est annoncée en mesure').toBe('a_lancer');
  });
  it('un état déjà connu n’est pas écrasé', () => {
    expect(etatApresSuivi('perdante')).toBe('perdante');
    expect(etatApresSuivi('introuvable')).toBe('introuvable');
  });
});
