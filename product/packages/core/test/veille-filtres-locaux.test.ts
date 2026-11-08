import { describe, expect, it } from 'vitest';
import {
  FILTRES_LOCAUX_VIDES, SANS_CTA, affichageCookieString, affichageDepuisCookie, compteLocal, controlesLocaux, ecrireFiltresLocaux,
  filtrerLocal, ligneListeVeille, lireFiltresLocaux, pucesLocales, retirerFiltreLocal, saisieSuiviMarque, toucheNavigationDetail, voisinsDetail,
  lienVeille, lireCriteresVeille, type FiltresLocaux, type PubLocale,
} from '../src';

/**
 * Lot 7 V5 · les règles des filtres LOCAUX de la Veille, de la vue liste, de
 * précédente / suivante et du suivi libre · pures. Chaque garde lit un
 * RÉSULTAT (la liste filtrée, l'adresse écrite, la voisine rendue).
 */
type Pub = PubLocale & { id: string };
const PUBS: Pub[] = [
  { id: 'a', cta: 'Acheter', sauvee: false, plateforme: 'meta', pays: 'FR', jours: 3, suivie: false },
  { id: 'b', cta: 'En savoir plus', sauvee: true, plateforme: 'meta', pays: 'FR', jours: 40, suivie: true },
  { id: 'c', cta: null, sauvee: false, plateforme: 'tiktok', pays: null, jours: 15, suivie: false },
  { id: 'd', cta: 'Acheter', sauvee: true, plateforme: 'google', pays: 'BE', jours: 70, suivie: false },
  { id: 'e', cta: ' Acheter ', sauvee: false, plateforme: 'meta', pays: 'fr', jours: null, suivie: true },
];
const f = (o: Partial<FiltresLocaux>): FiltresLocaux => ({ ...FILTRES_LOCAUX_VIDES, ...o });
const ids = (o: Partial<FiltresLocaux>) => filtrerLocal(PUBS, f(o), (p) => p).map((p) => p.id);

describe('filtres locaux · seules les pubs attendues, dans l’ordre lu', () => {
  it('sans filtre · toutes, même ordre', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('appel à l’action exact (espaces ignorés) et « sans appel à l’action »', () => {
    expect(ids({ cta: 'Acheter' })).toEqual(['a', 'd', 'e']);
    expect(ids({ cta: SANS_CTA })).toEqual(['c']);
  });
  it('masquer déjà sauvegardées', () => {
    expect(ids({ masquerSauvees: true })).toEqual(['a', 'c', 'e']);
  });
  it('plateforme, pays (casse ignorée), diffusion minimale (durée inconnue exclue), marques suivies', () => {
    expect(ids({ plateforme: 'meta' })).toEqual(['a', 'b', 'e']);
    expect(ids({ pays: 'FR' })).toEqual(['a', 'b', 'e']);
    expect(ids({ diffusionMin: 14 })).toEqual(['b', 'c', 'd']);
    expect(ids({ suiviesSeulement: true })).toEqual(['b', 'e']);
  });
  it('les filtres se cumulent', () => {
    expect(ids({ cta: 'Acheter', masquerSauvees: true })).toEqual(['a', 'e']);
    expect(ids({ cta: 'Acheter', masquerSauvees: true, suiviesSeulement: true })).toEqual(['e']);
  });
});

describe('contrôles · ouverts seulement s’ils séparent la liste, sinon fermés avec leur raison', () => {
  it('sur une liste variée · tout est ouvert, avec les effectifs', () => {
    const c = controlesLocaux(PUBS);
    expect(c.cta.ouvert).toBe(true);
    expect(c.cta.options).toEqual([
      { valeur: 'Acheter', libelle: 'Acheter', n: 3 },
      { valeur: 'En savoir plus', libelle: 'En savoir plus', n: 1 },
      { valeur: SANS_CTA, libelle: 'Sans appel à l’action', n: 1 },
    ]);
    expect(c.sauvees).toEqual({ ouvert: true, raison: null, options: [{ valeur: '1', libelle: 'Masquer déjà sauvegardées', n: 2 }] });
    expect(c.diffusion.options.map((o) => o.valeur)).toEqual(['7', '14', '30', '60']);
    expect(c.suivies.ouvert).toBe(true);
  });
  it('un même appel à l’action partout, aucun, aucune sauvegarde · fermés, raison écrite', () => {
    const memes = [{ cta: 'Acheter' }, { cta: 'Acheter' }];
    expect(controlesLocaux(memes).cta).toMatchObject({ ouvert: false, raison: 'Toutes ces pubs ont le même appel à l’action · « Acheter »' });
    expect(controlesLocaux([{ cta: null }, {}]).cta).toEqual({ ouvert: false, raison: 'La source ne donne aucun appel à l’action pour ces pubs', options: [] });
    expect(controlesLocaux(memes).sauvees).toEqual({ ouvert: false, raison: 'Aucune de ces pubs n’est dans tes sauvegardes', options: [] });
  });
  it('un seul pays connu parmi des pubs sans pays · la raison ne prétend pas « toutes »', () => {
    expect(controlesLocaux([{ pays: 'FR' }, { pays: null }]).pays.raison).toBe('Un seul pays connu parmi ces pubs · FR');
    expect(controlesLocaux([{ pays: 'FR' }, { pays: 'fr' }]).pays.raison).toBe('Toutes ces pubs ont le même pays · FR');
  });
  it('diffusion · aucun palier qui sépare, ou aucune durée · fermée', () => {
    expect(controlesLocaux([{ jours: 90 }, { jours: 80 }]).diffusion.ouvert).toBe(false);
    expect(controlesLocaux([{}, {}]).diffusion.raison).toBe('La source ne donne pas la durée de diffusion de ces pubs');
  });
});

describe('état visible · puces, retrait, compteur', () => {
  it('une puce par filtre posé · retirer l’un garde les autres', () => {
    const x = f({ cta: 'Acheter', masquerSauvees: true });
    expect(pucesLocales(x).map((p) => p.libelle)).toEqual(['Appel à l’action · Acheter', 'Sans les pubs déjà sauvegardées']);
    expect(retirerFiltreLocal(x, 'cta')).toEqual(f({ masquerSauvees: true }));
  });
  it('le compteur dit combien passent, sur combien de pubs CHARGÉES', () => {
    expect(compteLocal(3, 24, 1)).toBe('3 sur 24 pubs chargées');
    expect(compteLocal(1, 1, 0)).toBe('1 pub chargée');
  });
});

describe('adresse · les filtres locaux y vivent sans toucher aux critères de la source', () => {
  it('écrire puis relire rend les mêmes filtres · les autres paramètres sont gardés', () => {
    const x = f({ cta: 'Acheter maintenant', masquerSauvees: true, diffusionMin: 30, plateforme: 'tiktok', pays: 'BE', suiviesSeulement: true });
    const qs = ecrireFiltresLocaux('?q=piscine&p=meta', x);
    expect(qs).toContain('q=piscine');
    expect(lireFiltresLocaux(Object.fromEntries(new URLSearchParams(qs.slice(1))))).toEqual(x);
    expect(ecrireFiltresLocaux(qs, FILTRES_LOCAUX_VIDES)).toBe('?q=piscine&p=meta');
  });
  it('une valeur inconnue est ignorée', () => {
    expect(lireFiltresLocaux({ diffusion: '5', plateforme: 'snap', pays: 'FRA', masquer: 'oui', cta: 'x'.repeat(61) })).toEqual(FILTRES_LOCAUX_VIDES);
  });
  it('aucune clé locale n’entre dans les critères envoyés à la source (pas de nouvelle requête)', () => {
    const c = lireCriteresVeille({ q: 'piscine', cta: 'Acheter', masquer: 'sauvees' });
    expect(lienVeille(c)).toBe('/veille?q=piscine');
  });
});

describe('vue liste · préférence et colonnes', () => {
  it('seule « liste » vaut liste · le cookie le dit', () => {
    expect(affichageDepuisCookie('liste')).toBe('liste');
    expect(affichageDepuisCookie(undefined)).toBe('grille');
    expect(affichageDepuisCookie('autre')).toBe('grille');
    expect(affichageCookieString('liste')).toMatch(/^tt_veille_affichage=liste; path=\/; max-age=\d+; samesite=lax$/);
  });
  it('une ligne · plateforme, format, diffusion lues sur l’annonce', () => {
    expect(ligneListeVeille({ platform: 'tiktok', mediaType: 'VIDEO', daysRunning: 12, status: 'ACTIVE' })).toEqual({ plateforme: 'TikTok', format: 'Vidéo', diffusion: '12 j · active' });
    expect(ligneListeVeille({ platform: 'meta' })).toEqual({ plateforme: 'Meta', format: 'Non précisé', diffusion: 'Durée inconnue' });
  });
});

describe('précédente / suivante · la liste courante, arrêt aux bornes avec la raison', () => {
  const L = ['b', 'd', 'e'];
  it('au milieu · les deux voisines', () => {
    expect(voisinsDetail(L, 'd')).toMatchObject({ position: 2, total: 3, precedente: 'b', suivante: 'e', raisonPrecedente: null, raisonSuivante: null, libelle: 'Pub 2 sur 3' });
  });
  it('aux bornes · fermée, raison dite · jamais de boucle', () => {
    expect(voisinsDetail(L, 'b')).toMatchObject({ precedente: null, suivante: 'd', raisonPrecedente: 'Première pub de la liste' });
    expect(voisinsDetail(L, 'e')).toMatchObject({ precedente: 'd', suivante: null, raisonSuivante: 'Dernière pub de la liste' });
    expect(voisinsDetail(['x'], 'x')).toMatchObject({ precedente: null, suivante: null, raisonPrecedente: 'Seule pub de la liste' });
  });
  it('une pub hors de la liste filtrée · rien à parcourir', () => {
    expect(voisinsDetail(L, 'a')).toMatchObject({ position: 0, precedente: null, suivante: null });
  });
});

describe('flèches · jamais dans un champ de saisie', () => {
  it('← → hors champ · précédente, suivante', () => {
    expect(toucheNavigationDetail({ key: 'ArrowLeft', cible: { tagName: 'BUTTON' } })).toBe('precedente');
    expect(toucheNavigationDetail({ key: 'ArrowRight', cible: { tagName: 'DIV' } })).toBe('suivante');
  });
  it('dans un champ, un menu, une zone éditable, le lecteur vidéo, ou avec une touche de modification · ignorées', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'input']) expect(toucheNavigationDetail({ key: 'ArrowRight', cible: { tagName } })).toBeNull();
    expect(toucheNavigationDetail({ key: 'ArrowRight', cible: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
    expect(toucheNavigationDetail({ key: 'ArrowRight', altKey: true, cible: { tagName: 'DIV' } })).toBeNull();
    expect(toucheNavigationDetail({ key: 'Enter', cible: { tagName: 'DIV' } })).toBeNull();
  });
});

describe('suivre une marque en saisie libre', () => {
  it('un nom · gardé tel quel (espaces resserrés)', () => {
    expect(saisieSuiviMarque('  Maison   Typology ', 'meta')).toEqual({ ok: true, nom: 'Maison Typology', plateforme: 'meta', domaine: null });
  });
  it('un domaine ou une adresse · le domaine nu, gardé comme nom et domaine', () => {
    expect(saisieSuiviMarque('https://www.Typology.com/fr/x', 'tiktok')).toEqual({ ok: true, nom: 'typology.com', plateforme: 'tiktok', domaine: 'typology.com' });
  });
  it('vide, trop long, plateforme inconnue · refusé, raison dite', () => {
    expect(saisieSuiviMarque(' a ', 'meta')).toMatchObject({ ok: false });
    expect(saisieSuiviMarque('x'.repeat(81), 'meta')).toMatchObject({ ok: false });
    expect(saisieSuiviMarque('Typology', 'snapchat')).toEqual({ ok: false, raison: 'Choisis une plateforme · Meta, TikTok ou Google.' });
  });
});
