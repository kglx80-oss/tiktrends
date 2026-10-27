import { describe, expect, it } from 'vitest';
import {
  carteConfigurationMarque, etapesConfigurationMarque, lignesConfigurationMarque, pastilleConfigurationMarque,
  lignesACompleter, morceauxTexte, listePropre, statutFicheProduit, resumeProduits, sourcesJarvisMarque, manquantesLibelle,
  retourActionMarque, messagesRetourMarque, citationsPersona, statutPersona, teinteAvatar,
  lireReglesMarque, reglesParType, ajouterRegleMarque, retirerRegleMarque, LONGUEUR_MAX_REGLES,
  ecranSpatial, type EtatConfigurationMarque, type FicheMarqueLue,
} from '../src';

const ETAT: EtatConfigurationMarque = { manquesFiche: 5, metaConnecte: false, concurrentsSuivis: 0, concurrentsRenseignes: 0, sauvegardes: 0, lotsLances: 0, personnes: 1 };
const TOUT: EtatConfigurationMarque = { manquesFiche: 0, metaConnecte: true, concurrentsSuivis: 3, concurrentsRenseignes: 3, sauvegardes: 5, lotsLances: 1, personnes: 2 };

describe('Spatial · Marque · la configuration et la pastille du rail', () => {
  it('huit étapes · les deux premières sont faites par construction, le reste se lit en base', () => {
    const e = etapesConfigurationMarque(ETAT, 'b1');
    expect(e).toHaveLength(8);
    expect(e.filter((x) => x.faite).map((x) => x.cle)).toEqual(['espace', 'marque']);
    expect(e.find((x) => x.cle === 'fiche')!.detail).toBe('5 éléments manquants · Jarvis peut la préremplir');
    expect(e.find((x) => x.cle === 'fiche')!.href).toBe('/brands/b1#a-completer');
  });

  it('chaque seuil tombe sur sa donnée réelle (et pas avant)', () => {
    const faite = (o: Partial<EtatConfigurationMarque>, cle: string) => etapesConfigurationMarque({ ...ETAT, ...o }, 'b1').find((x) => x.cle === cle)!.faite;
    expect(faite({ manquesFiche: 1 }, 'fiche')).toBe(false);
    expect(faite({ manquesFiche: 0 }, 'fiche')).toBe(true);
    expect(faite({ concurrentsSuivis: 2 }, 'concurrents')).toBe(false);
    expect(faite({ concurrentsSuivis: 3 }, 'concurrents')).toBe(true);
    expect(faite({ sauvegardes: 4 }, 'veille')).toBe(false);
    expect(faite({ sauvegardes: 5 }, 'veille')).toBe(true);
    expect(faite({ lotsLances: 1 }, 'test')).toBe(true);
    expect(faite({ personnes: 1 }, 'equipe')).toBe(false);
    expect(faite({ personnes: 2 }, 'equipe')).toBe(true);
    expect(faite({ metaConnecte: true }, 'meta')).toBe(true);
  });

  it('la carte · part entière, et une étape faite ne porte ni bouton ni sous-titre', () => {
    const c = carteConfigurationMarque(ETAT, 'b1');
    expect([c.faites, c.total, c.part, c.restantes]).toEqual([2, 8, 25, 6]);
    for (const x of c.etapes.filter((y) => y.faite)) expect([x.detail, x.href, x.action]).toEqual([null, null, null]);
  });

  it('repliée · les trois prochaines étapes, la première en principal · dépliée · toutes', () => {
    const c = carteConfigurationMarque(ETAT, 'b1');
    const r = lignesConfigurationMarque(c.etapes, false);
    expect(r.map((x) => x.cle)).toEqual(['fiche', 'meta', 'concurrents']);
    expect(r.map((x) => x.principale)).toEqual([true, false, false]);
    expect(lignesConfigurationMarque(c.etapes, true)).toHaveLength(8);
  });

  it('la pastille compte EXACTEMENT les étapes restantes de la carte · rien quand tout est fait', () => {
    expect(pastilleConfigurationMarque(ETAT, 'b1')).toEqual({ classe: 'rbadge', valeur: '6', libelle: '6 étapes à compléter' });
    expect(pastilleConfigurationMarque({ ...TOUT, personnes: 1 }, 'b1')).toEqual({ classe: 'rbadge', valeur: '1', libelle: '1 étape à compléter' });
    expect(pastilleConfigurationMarque(TOUT, 'b1')).toBeNull();
  });
});

const FICHE: FicheMarqueLue = { description: 'd', usp: 'u', audience: 'a', category: 'c', categoryNeeds: 'n', tone: 't', industryTags: 1, colors: 1, scenarios: 1, personas: 1, produits: 1, concurrents: 1 };

describe('Spatial · Marque · ce qui reste à compléter', () => {
  it('fiche complète · aucune ligne', () => {
    expect(lignesACompleter(FICHE, 'b1')).toEqual([]);
  });
  it('un champ texte vide · édition en place ; un compte vide · lien vers l’écran qui le remplit', () => {
    const l = lignesACompleter({ ...FICHE, usp: '  ', produits: 0, personas: 0, concurrents: 0 }, 'b1');
    expect(l.map((x) => x.cle)).toEqual(['usp', 'personas', 'produits', 'concurrents']);
    expect(l[0]!.cible).toEqual({ type: 'champ', champ: 'usp', saisie: 'texte' });
    expect(l[1]!.cible).toEqual({ type: 'lien', href: '/brands/b1/personas' });
    expect(l[2]!.cible).toEqual({ type: 'lien', href: '/brands/b1/offre' });
    expect(l[3]!.cible).toEqual({ type: 'champ', champ: 'competitors', saisie: 'lignes' });
  });
  it('chaque lien vise un écran Spatial porté (jamais une impasse)', () => {
    const vide: FicheMarqueLue = { description: null, usp: null, audience: null, category: null, categoryNeeds: null, tone: null, industryTags: 0, colors: 0, scenarios: 0, personas: 0, produits: 0, concurrents: 0 };
    const l = lignesACompleter(vide, '6f1c0a3e-1111-4222-8333-944455556666');
    expect(l).toHaveLength(12);
    for (const x of l) if (x.cible.type === 'lien') expect(ecranSpatial(x.cible.href), x.cible.href).not.toBeNull();
  });
});

describe('Spatial · Marque · textes, produits, sources', () => {
  it('morceaux · séparateurs, doublons (casse ignorée), vides et plafond', () => {
    expect(morceauxTexte('Chaleureux, ludique ; Ludique\nDirect · sobre.')).toEqual(['Chaleureux', 'ludique', 'Direct', 'sobre']);
    expect(morceauxTexte(null)).toEqual([]);
    expect(morceauxTexte('a,b,c,d', 2)).toEqual(['a', 'b']);
    expect(listePropre(['#fff', '', null, '#FFF', '#000'])).toEqual(['#fff', '#000']);
  });
  it('fiche produit · la première pièce manquante est nommée', () => {
    expect(statutFicheProduit({ nom: 'a', prix: 24.9, image: true, description: 'd' })).toEqual({ complete: true, detail: '24,90 € · fiche complète' });
    expect(statutFicheProduit({ nom: 'a', prix: 14.9, image: false, description: 'd' })).toEqual({ complete: false, detail: '14,90 € · photo manquante' });
    expect(statutFicheProduit({ nom: 'a', prix: null, image: true, description: 'd' }).detail).toBe('prix manquant');
    expect(resumeProduits([{ nom: 'a', prix: 1, image: true, description: 'd' }, { nom: 'b', prix: null, image: true, description: null }])).toEqual({ aCompleter: 1, libelle: '1 fiche à compléter' });
    expect(resumeProduits([]).libelle).toBeNull();
  });
  it('sources de Jarvis · chaque ligne dit si la source est réellement là', () => {
    const s = sourcesJarvisMarque({ site: 'a.fr', produits: 2, personas: 0, assets: 1, shopify: false, meta: true });
    expect(s.map((x) => x.branchee)).toEqual([true, true, false, true, false, true]);
    expect(manquantesLibelle(s)).toBe('2 manquantes');
    expect(manquantesLibelle(s.filter((x) => x.branchee))).toBeNull();
  });
  it('retours d’action · erreur prioritaire, code inconnu muet, table indexée', () => {
    expect(retourActionMarque('saved', 'credits')).toEqual({ message: 'Crédits insuffisants.', erreur: true });
    expect(retourActionMarque('inconnu', null)).toBeNull();
    expect(messagesRetourMarque()['ok:persona']).toBe('Persona ajouté.');
  });
  it('personas · citations réelles seulement, statut lisible, teintes cycliques', () => {
    expect(citationsPersona(['Enfin !', { texte: 'zéro fuite' }, { type: 'avis' }, 42, 'a'])).toEqual(['Enfin !', 'zéro fuite']);
    expect(citationsPersona(null)).toEqual([]);
    expect(statutPersona('proposed')).toEqual({ libelle: 'Proposé', classe: 'w' });
    expect(teinteAvatar(4)).toBe(teinteAvatar(0));
  });
});

describe('Spatial · Marque · règles dans creative_rules', () => {
  it('lit les préfixes, range le texte libre dans les préférences', () => {
    const r = lireReglesMarque('Interdit : visage d’enfant\n\nObligatoire · Surveillance d’un adulte\n- Toujours montrer le produit\nPréférence: pastel');
    expect(r.map((x) => [x.type, x.texte, x.ligne])).toEqual([['ban', 'visage d’enfant', 0], ['must', 'Surveillance d’un adulte', 2], ['pref', 'Toujours montrer le produit', 3], ['pref', 'pastel', 4]]);
    expect(reglesParType(r).ban).toHaveLength(1);
  });
  it('ajouter pose UNE ligne à la fin · retirer enlève SA ligne, le reste intact', () => {
    const avant = 'Texte libre écrit avant\n\nInterdit : a';
    const apres = ajouterRegleMarque(avant, 'must', '  Dès 3 ans ')!;
    expect(apres).toBe('Texte libre écrit avant\n\nInterdit : a\nObligatoire : Dès 3 ans');
    const lu = lireReglesMarque(apres);
    expect(retirerRegleMarque(apres, lu.find((x) => x.texte === 'a')!.ligne)).toBe('Texte libre écrit avant\n\nObligatoire : Dès 3 ans');
    expect(retirerRegleMarque(apres, 99)).toBe(apres);
  });
  it('refuse le vide et le dépassement de la longueur maximale', () => {
    expect(ajouterRegleMarque('', 'ban', '   ')).toBeNull();
    expect(ajouterRegleMarque('x'.repeat(LONGUEUR_MAX_REGLES - 5), 'ban', 'trop long')).toBeNull();
  });
});
