import { describe, it, expect } from 'vitest';
import {
  adLancee, lienAdsmapCarte, etatApresSuivi, presentationTest, lireLienProfondAdsmap, bucketPerfCarte, RETOUR_STUDIO,
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
    expect(RETOUR_STUDIO.href).toBe('/studio/projets');
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

describe('presentationTest · le panneau dit l’état RÉEL du test (recette I1 #1)', () => {
  const base = { status: 'draft', launchedAt: null, computed: null, verdictStatus: null, batchNumber: null, apprentissages: 0 } as const;
  const admin = { peutPreparer: true, peutMesurer: true };

  it('à lancer · ni « Mesurer maintenant » ni arbitrage vide ni règle gagnante/perdante', () => {
    const p = presentationTest(base, admin);
    expect(p.phase).toBe('a_lancer');
    expect(p.resultatVide, 'un test jamais diffusé est invité à « Mesurer maintenant »').not.toMatch(/Mesurer maintenant/);
    expect(p.resultatVide).toContain('Pas encore lancée');
    expect(p.arbitrageVisible, 'la section d’arbitrage vide s’affiche pour un test à lancer').toBe(false);
    expect(p.suiteApresVerdict, 'la règle gagnante/perdante s’affiche sans verdict').toBe(false);
    expect(p.suiteAttente).toContain('rien à décider');
  });

  it('à lancer · la prochaine étape est l’EXISTANT (lots de test), lien seulement si le rôle le permet', () => {
    expect(presentationTest(base, admin).prochaineEtape!.lien).toEqual({ href: '/adsmap/lots', libelle: 'Préparer un test' });
    const membre = presentationTest(base, { peutPreparer: false, peutMesurer: false }).prochaineEtape!;
    expect(membre.lien, 'un lien vers les lots est offert à qui ne peut pas y entrer').toBeNull();
    expect(membre.texte).toContain('administrateur');
  });

  it('à lancer · dit où en est le lot quand l’ad y est déjà', () => {
    expect(presentationTest({ ...base, status: 'ready', batchNumber: 3 }, admin).prochaineEtape!.texte).toContain('Prête dans le lot 3');
    expect(presentationTest({ ...base, batchNumber: 3 }, admin).prochaineEtape!.texte).toContain('Dans le lot 3');
  });

  it('lancée sans verdict · en mesure, « Mesurer maintenant » pour qui peut mesurer, pas d’arbitrage vide', () => {
    const p = presentationTest({ ...base, status: 'live', launchedAt: '2026-09-01' }, admin);
    expect(p.phase).toBe('en_mesure');
    expect(p.resultatVide).toContain('Lancée');
    expect(p.resultatVide).toContain('Mesurer maintenant');
    expect(presentationTest({ ...base, status: 'live' }, { peutPreparer: false, peutMesurer: false }).resultatVide, 'un bouton réservé est promis à un membre').not.toContain('Mesurer maintenant');
    expect(p.arbitrageVisible).toBe(false);
    expect(p.prochaineEtape).toBeNull();
  });

  it('un verdict calculé ou arbitré rend le panneau complet · comportement inchangé', () => {
    for (const t of [{ ...base, status: 'live', computed: 'loser' }, { ...base, verdictStatus: 'validated' as const }]) {
      const p = presentationTest(t, admin);
      expect(p.phase).toBe('mesure');
      expect(p.resultatVide).toBeNull();
      expect(p.arbitrageVisible).toBe(true);
      expect(p.suiteApresVerdict).toBe(true);
    }
  });

  it('des apprentissages existants restent visibles, même sans verdict', () => {
    expect(presentationTest({ ...base, apprentissages: 1 }, admin).arbitrageVisible).toBe(true);
  });
});
