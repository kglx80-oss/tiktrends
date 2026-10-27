import { describe, expect, it } from 'vitest';
import {
  presentationNotif, FILTRES_NOTIF, TYPES_NOTIF_CONNUS, notifDansFiltre, nonLuesParFiltre, grouperNotifs, quandNotif, libelleNonLues,
  groupesPalette, filtrerPalette, selectionVoisine, modulesMobiles, destinationExiste, typeEntreePalette,
  sousTitreTiroirJarvis, suggestionsTiroirJarvis, brouillonAvecSuggestion, texteTourJarvis,
  etapesParcours, progressionParcours, libelleEtapeParcours, reponsesParcours, basculerObjectif, texteBienvenueParcours,
  boutonPrincipalParcours, marqueSaisieValide, lignesOffreParcours, PROFILS_PARCOURS, OBJECTIFS_PARCOURS,
} from '../src';

/* ───────────── Notifications ───────────── */

describe('Spatial · coquille · notifications', () => {
  it('chaque type réellement émis est classé (digest → Jarvis, tracker/radar → Veille, tickets → Support)', () => {
    expect(presentationNotif('digest')).toMatchObject({ categorie: 'jarvis', icone: null, teinte: 't-jarvis' });
    expect(presentationNotif('tracker').categorie).toBe('veille');
    expect(presentationNotif('radar').categorie).toBe('veille');
    for (const t of ['ticket_new', 'ticket_reply', 'ticket_status']) expect(presentationNotif(t).categorie).toBe('support');
    expect(TYPES_NOTIF_CONNUS.sort()).toEqual(['digest', 'radar', 'ticket_new', 'ticket_reply', 'ticket_status', 'tracker']);
  });

  it('un type inconnu reste visible sous « Tout », présenté sans catégorie', () => {
    expect(presentationNotif('nimporte').categorie).toBe('autre');
    expect(notifDansFiltre({ type: 'nimporte' }, 'tout')).toBe(true);
    expect(FILTRES_NOTIF.filter((f) => f.cle !== 'tout').some((f) => notifDansFiltre({ type: 'nimporte' }, f.cle))).toBe(false);
  });

  it('aucun filtre sans émetteur réel (Résultats, Produit de la maquette)', () => {
    expect(FILTRES_NOTIF.map((f) => f.cle)).toEqual(['tout', 'jarvis', 'veille', 'support']);
    for (const f of FILTRES_NOTIF.filter((x) => x.cle !== 'tout')) {
      expect(TYPES_NOTIF_CONNUS.some((t) => presentationNotif(t).categorie === f.cle), `filtre ${f.cle} sans type`).toBe(true);
    }
  });

  it('les non lues se comptent par filtre, les lues jamais', () => {
    const c = nonLuesParFiltre([
      { type: 'digest', read: false }, { type: 'tracker', read: false }, { type: 'radar', read: true }, { type: 'ticket_new', read: false }, { type: 'x', read: false },
    ]);
    expect(c).toEqual({ tout: 4, jarvis: 1, veille: 1, support: 1 });
  });

  it('« Aujourd’hui » suit le jour calendaire, pas les 24 dernières heures', () => {
    const now = new Date(2026, 9, 27, 0, 30);
    const g = grouperNotifs([{ createdAt: new Date(2026, 9, 27, 0, 10).toISOString() }, { createdAt: new Date(2026, 9, 26, 23, 50).toISOString() }], now);
    expect(g.aujourdhui).toHaveLength(1);
    expect(g.plusTot).toHaveLength(1);
  });

  it('l’heure relative reprend les libellés de la maquette', () => {
    const now = new Date(2026, 9, 27, 15, 0); // mardi
    const il = (d: Date) => quandNotif(d.toISOString(), now);
    expect(il(new Date(2026, 9, 27, 14, 59, 40))).toBe('à l’instant');
    expect(il(new Date(2026, 9, 27, 14, 55))).toBe('il y a 5 min');
    expect(il(new Date(2026, 9, 27, 12, 0))).toBe('il y a 3 h');
    expect(il(new Date(2026, 9, 26, 9, 0))).toBe('hier');
    expect(il(new Date(2026, 9, 26 - 4, 9, 0))).toBe('jeu.');
    expect(il(new Date(2026, 9, 12, 9, 0))).toBe('12 oct.');
    expect(libelleNonLues(0)).toBeNull();
    expect(libelleNonLues(1)).toBe('1 non lue');
    expect(libelleNonLues(3)).toBe('3 non lues');
  });
});

/* ───────────── Palette ⌘K et modules ───────────── */

const TOUT = new Set(['/studio/projets', '/veille', '/adsmap', '/adsmap/lots', '/adsmap/import', '/assets', '/jarvis', '/brands', '/connections', '/settings']);

describe('Spatial · coquille · palette ⌘K', () => {
  it('mêmes groupes que la maquette, chaque entrée vers une page qui EXISTE (V5 ou portée)', () => {
    const g = groupesPalette({ ouverts: TOUT, marque: { id: 'b1' }, projets: [{ id: 'p1', titre: 'Collection été' }] });
    expect(g.map((x) => x.titre)).toEqual(['Pages', 'Projets', 'Actions']);
    // Hypothèses, Apprentissages et Boucle n'existent qu'en Spatial (#872) · présentes parce que portées.
    expect(g[0]!.entrees.map((e) => e.cle)).toEqual(['accueil', 'studios', 'veille', 'resultats', 'boucle', 'lots', 'hypotheses', 'apprentissages', 'bibliotheque', 'jarvis', 'marque', 'connexions']);
    expect(g[0]!.entrees.find((e) => e.cle === 'marque')!.href).toBe('/brands/b1');
    expect(g[1]!.entrees).toEqual([{ cle: 'projet-p1', href: '/studio/projets/p1', icone: 'brush', titre: 'Collection été' }]);
    expect(g[2]!.entrees.map((e) => e.cle)).toEqual(['iterer', 'nouveau', 'importer']);
    for (const e of g.flatMap((x) => x.entrees)) expect(destinationExiste(e.href), e.href).toBe(true);
  });

  it('les droits filtrent · un membre sans Résultats ni réglages ne voit que ses pages', () => {
    const g = groupesPalette({ ouverts: new Set(['/studio/projets', '/jarvis']), marque: { id: 'b1' }, projets: [] });
    expect(g.map((x) => x.titre)).toEqual(['Pages', 'Actions']);
    expect(g[0]!.entrees.map((e) => e.cle)).toEqual(['accueil', 'studios', 'jarvis']);
  });

  it('sans accès Studios, aucun projet même fourni', () => {
    const g = groupesPalette({ ouverts: new Set(), marque: null, projets: [{ id: 'p', titre: 'x' }] });
    expect(g.map((x) => x.titre)).toEqual(['Pages']);
  });

  it('le filtre ignore casse et accents, et retire les groupes vides', () => {
    const g = groupesPalette({ ouverts: TOUT, marque: { id: 'b1' }, projets: [{ id: 'p', titre: 'Rentrée' }] });
    expect(filtrerPalette(g, 'BIBLIO').flatMap((x) => x.entrees.map((e) => e.cle))).toEqual(['bibliotheque']);
    expect(filtrerPalette(g, 'rentree').map((x) => x.titre)).toEqual(['Projets']);
    expect(filtrerPalette(g, 'zzzz')).toEqual([]);
    expect(filtrerPalette(g, '  ')).toEqual(g);
    expect(typeEntreePalette('Actions')).toBe('Action');
    expect(typeEntreePalette('Pages')).toBe('');
  });

  it('les flèches font boucler la sélection', () => {
    expect(selectionVoisine(0, 3, 1)).toBe(1);
    expect(selectionVoisine(2, 3, 1)).toBe(0);
    expect(selectionVoisine(0, 3, -1)).toBe(2);
    expect(selectionVoisine(-1, 3, 1)).toBe(0);
    expect(selectionVoisine(0, 0, 1)).toBe(-1);
  });

  it('« Tous les modules » reprend la liste de la maquette, selon l’accès', () => {
    expect(modulesMobiles({ ouverts: TOUT, marque: { id: 'b1' } }).map((e) => e.titre)).toEqual(['Veille & formats', 'Bibliothèque', 'Marque', 'Réglages']);
    expect(modulesMobiles({ ouverts: new Set(['/assets']), marque: { id: 'b1' } }).map((e) => e.cle)).toEqual(['bibliotheque']);
  });
});

/* ───────────── Tiroir Jarvis ───────────── */

describe('Spatial · coquille · tiroir Jarvis', () => {
  it('ne prétend pas analyser la page · il nomme la marque', () => {
    expect(sousTitreTiroirJarvis('Neva')).toBe('Conversation · Neva');
    expect(sousTitreTiroirJarvis(null)).toMatch(/aucune marque/);
  });

  it('les suggestions viennent du fil réel · trois au plus, sans doublon ni vide', () => {
    expect(suggestionsTiroirJarvis(['a', ' a ', '', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(suggestionsTiroirJarvis(undefined)).toEqual([]);
  });

  it('une suggestion REMPLIT le champ, elle n’envoie rien', () => {
    expect(brouillonAvecSuggestion('', 'Propose trois angles')).toBe('Propose trois angles');
    expect(brouillonAvecSuggestion('Bonjour', 'Propose')).toBe('Bonjour\nPropose');
    expect(brouillonAvecSuggestion('x'.repeat(4000), 'y')).toHaveLength(4000);
  });

  it('le texte d’un tour retire les marqueurs et le tiret cadratin', () => {
    expect(texteTourJarvis('Bonjour — voici')).not.toContain('—');
  });
});

/* ───────────── Parcours d'accueil ───────────── */

describe('Spatial · coquille · parcours d’accueil', () => {
  it('les étapes sans action réelle sont omises, les conditionnelles suivent la donnée', () => {
    expect(etapesParcours({ creerMarque: true, outils: true, offre: true })).toEqual(['bienvenue', 'profil', 'objectifs', 'marque', 'outils', 'offre']);
    expect(etapesParcours({ creerMarque: false, outils: false, offre: false })).toEqual(['bienvenue', 'profil', 'objectifs']);
  });

  it('progression et libellé d’étape', () => {
    expect(progressionParcours(4, 1)).toEqual(['done', 'on', '', '']);
    expect(libelleEtapeParcours(['bienvenue', 'profil'], 1)).toBe('Étape 2 sur 2 · Ton profil');
    expect(boutonPrincipalParcours(0, 4)).toMatchObject({ libelle: 'Commencer', fin: false });
    expect(boutonPrincipalParcours(3, 4)).toMatchObject({ libelle: 'Aller à l’accueil', fin: true });
    expect(boutonPrincipalParcours(1, 4).libelle).toBe('Continuer');
  });

  it('les réponses enregistrées se relisent sans planter, adLevel compris (repris, jamais effacé)', () => {
    expect(reponsesParcours(null)).toEqual({ profile: '', goals: [], brandName: '', siteUrl: '', adLevel: '', teamSize: '' });
    expect(reponsesParcours({ profile: 'agency', goals: ['ads', 3, 'clone'], adLevel: 'teste' })).toMatchObject({ profile: 'agency', goals: ['ads', 'clone'], adLevel: 'teste' });
  });

  it('catalogues · mêmes clés que le parcours V5', () => {
    expect(PROFILS_PARCOURS.map((p) => p.cle)).toEqual(['brand', 'agency', 'freelancer', 'ai_artist', 'other']);
    expect(OBJECTIFS_PARCOURS.map((p) => p.cle)).toEqual(['ads', 'clone', 'analyze', 'scale', 'multi', 'video']);
    expect(basculerObjectif(['ads'], 'ads')).toEqual([]);
    expect(basculerObjectif(['ads'], 'clone')).toEqual(['ads', 'clone']);
    expect(marqueSaisieValide('  ')).toBe(false);
    expect(marqueSaisieValide('Neva')).toBe(true);
  });

  it('le texte d’accueil ne cite que les étapes présentes', () => {
    expect(texteBienvenueParcours(['bienvenue', 'profil', 'objectifs'], null)).toContain('pour ta marque : ton profil et tes objectifs.');
    expect(texteBienvenueParcours(['bienvenue', 'profil', 'objectifs', 'marque', 'outils'], 'Neva')).toContain('pour Neva : ton profil, tes objectifs, ta marque et tes outils.');
  });

  it('une formule · ses crédits réels puis ce qu’elle débloque, quatre lignes au plus', () => {
    expect(lignesOffreParcours(2000, ['Studios', 'Veille', 'Jarvis', 'Bibliothèque'])).toEqual([`${(2000).toLocaleString('fr-FR')} crédits / mois`, 'Débloque Studios', 'Débloque Veille', 'Débloque Jarvis']);
    expect(lignesOffreParcours(24000, [])).toEqual([`${(24000).toLocaleString('fr-FR')} crédits / mois`]);
  });
});
