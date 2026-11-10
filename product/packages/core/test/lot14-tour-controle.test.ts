import { describe, expect, it } from 'vitest';
import {
  COLONNES_COMPTES_TOUR, COLONNES_INCIDENTS, LIGNES_MAX_EXPORT_TOUR, LONGUEUR_MAX_RECHERCHE, NOTES_MAX_INCIDENT, TAILLE_PAGE_TOUR, VALEUR_ABSENTE,
  adresseListeTour, cellulesCompteTour, celluleSansFuite, clesSegmentCompte, correspondRecherche, dansSegmentIncident, etatExportTour, etatIncident,
  gesteIncident, incidentAffiche, lirePageTour, lireSegment, lireSegmentIncident, nomEquipePlateforme, nomFichierExportTour, paginer, plierTexte,
  saisieRechercheTour, segmentsComptes, segmentsIncidents, tableComptesTour, tableauCsv, termesRecherche, textePage, validerClotureIncident,
  validerNoteIncident, validerOuvertureIncident,
  type EspacePlateforme, type IncidentLu, type TarifsPlateforme,
} from '../src';

/**
 * Lot 14 · Tour de contrôle · recherche, pagination, segments, export et
 * incidents déclarés, au RÉSULTAT des règles pures. Le rendu des vraies pages
 * sur une base pglite est gardé par `apps/web/test/lot14-tour-controle-db.test.tsx`.
 */

const MAINTENANT = new Date('2026-11-10T12:00:00Z');
const J = 86_400_000;
const ilYa = (jours: number) => new Date(MAINTENANT.getTime() - jours * J);
const TARIFS: TarifsPlateforme = {
  ordre: ['starter', 'core', 'plus', 'business'],
  libelles: { starter: 'Starter', core: 'Core', plus: 'Plus', business: 'Business' },
  prix: { starter: 0, core: 99, plus: 299, business: 990 },
  credits: { starter: 200, core: 2000, plus: 7000, business: 24000 },
};
const espace = (o: Partial<EspacePlateforme> = {}): EspacePlateforme => ({
  id: 'w', nom: 'Espace', forfait: 'core', type: 'normal', creeLe: ilYa(100), onboardeLe: ilYa(99), essaiFinLe: null,
  abonnementStripe: true, statutAbonnement: 'active', solde: 500, conso30: 100, aConsomme: true, derniereActivite: ilYa(2),
  ticketsSansReponse: 0, profil: null, ...o,
});

describe('recherche · casse, accents, ligatures, bornes', () => {
  it('« eclat » trouve « Éclat », « OEUVRE » trouve « Œuvre », l’apostrophe courbe vaut la droite', () => {
    expect(plierTexte('  Éclat   BEAUTÉ ')).toBe('eclat beaute');
    expect(correspondRecherche(['Maison Éclat'], 'eclat')).toBe(true);
    expect(correspondRecherche(['Maison Éclat'], 'ÉCLAT')).toBe(true);
    expect(correspondRecherche(['Œuvre & Cie'], 'OEUVRE')).toBe(true);
    expect(correspondRecherche(['L’Atelier'], "l'atelier")).toBe(true);
    expect(correspondRecherche(['Maison Éclat'], 'eclats')).toBe(false);
  });
  it('chaque mot doit se trouver, dans n’importe quel champ · une recherche vide garde tout', () => {
    expect(correspondRecherche(['Maison Lumen', 'Plus', 'Agence'], 'lumen agence')).toBe(true);
    expect(correspondRecherche(['Maison Lumen', 'Plus', 'Agence'], 'lumen freelance')).toBe(false);
    expect(correspondRecherche(['Maison Lumen'], '   ')).toBe(true);
    expect(correspondRecherche(['Maison Lumen', null, undefined], 'maison')).toBe(true);
  });
  it('la saisie est bornée · au-delà de 80 caractères et de 8 mots, le reste est ignoré', () => {
    expect(saisieRechercheTour('a'.repeat(200))).toHaveLength(LONGUEUR_MAX_RECHERCHE);
    expect(termesRecherche('un deux trois quatre cinq six sept huit neuf dix')).toEqual(['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit']);
    expect(termesRecherche('lumen LUMEN Lumen')).toEqual(['lumen']);
    // Un 9e mot ignoré ne fait pas échouer la recherche.
    expect(correspondRecherche(['a b c d e f g h'], 'a b c d e f g h zzz')).toBe(true);
  });
});

describe('pagination · pages bornées, jamais une page vide par erreur de saisie', () => {
  const lignes = Array.from({ length: 132 }, (_, i) => i + 1);
  it('page 1, page 3 (dernière, partielle), page 99 ramenée à la dernière, page 0 ramenée à la première', () => {
    expect(paginer(lignes, 1)).toMatchObject({ page: 1, pages: 3, total: 132, debut: 1, fin: 50 });
    expect(paginer(lignes, 3)).toMatchObject({ page: 3, debut: 101, fin: 132 });
    expect(paginer(lignes, 3).lignes).toHaveLength(32);
    expect(paginer(lignes, 99).page).toBe(3);
    expect(paginer(lignes, 0).page).toBe(1);
    expect(paginer([], 4)).toMatchObject({ page: 1, pages: 1, total: 0, debut: 0, fin: 0, lignes: [] });
    expect(TAILLE_PAGE_TOUR).toBe(50);
  });
  it('la page lue dans l’adresse · entier positif, 1 sinon', () => {
    expect(['2', ' 3 ', '10000'].map(lirePageTour)).toEqual([2, 3, 10000]);
    expect(['', '0', '-2', '1.5', 'abc', '10001', '1e3', undefined].map(lirePageTour)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
  it('ce que la page montre, en mots', () => {
    const u = { un: 'compte', plusieurs: 'comptes' };
    expect(textePage(paginer(lignes, 2), u)).toBe('51 à 100 sur 132 comptes');
    expect(textePage(paginer([1], 1), u)).toBe('1 compte');
    expect(textePage(paginer([], 1), u)).toBe('Aucun compte');
  });
  it('l’adresse ne porte que l’utile · page 1, « tous » et recherche vide tus', () => {
    expect(adresseListeTour('/admin/signups', { q: '  ', segment: 'tous', page: 1 })).toBe('/admin/signups');
    expect(adresseListeTour('/admin/signups', { q: 'Éclat', segment: 'essai', page: 2 })).toBe('/admin/signups?q=%C3%89clat&segment=essai&page=2');
  });
});

describe('segments des comptes · CALCULÉS sur les faits, mêmes règles que le reste du Tour de contrôle', () => {
  const E = {
    payant: espace({ id: 'p', nom: 'Payant' }),
    retard: espace({ id: 'r', nom: 'Retard', statutAbonnement: 'past_due' }),
    impaye: espace({ id: 'i', nom: 'Impayé', statutAbonnement: 'unpaid', abonnementStripe: true }),
    essai: espace({ id: 'e', nom: 'Essai', abonnementStripe: false, statutAbonnement: null, essaiFinLe: new Date(MAINTENANT.getTime() + 5 * J) }),
    essaiFini: espace({ id: 'f', nom: 'Essai fini', abonnementStripe: false, statutAbonnement: null, essaiFinLe: ilYa(1) }),
    dormant: espace({ id: 'd', nom: 'Dormant', derniereActivite: ilYa(30) }),
    jamais: espace({ id: 'j', nom: 'Jamais', forfait: 'starter', abonnementStripe: false, statutAbonnement: null, derniereActivite: null, aConsomme: false }),
    presque: espace({ id: 'q', nom: 'Presque', derniereActivite: ilYa(29) }),
  };
  const cles = (e: EspacePlateforme) => clesSegmentCompte(e, TARIFS, MAINTENANT);
  it('chaque espace répond aux segments que ses faits disent, et à eux seuls', () => {
    expect(cles(E.payant)).toEqual(['core', 'payants']);
    expect(cles(E.retard)).toEqual(['core', 'payants', 'impayes', 'risque']);
    expect(cles(E.impaye)).toEqual(['core', 'impayes']);
    expect(cles(E.essai)).toEqual(['core', 'essai']);
    expect(cles(E.essaiFini)).toEqual(['core']);
    // Le seuil d'inactivité est celui des signaux de risque (`JOURS_INACTIVITE`, 30 j) · 29 j ne compte pas.
    expect(cles(E.dormant)).toEqual(['core', 'payants', 'risque', 'inactifs']);
    expect(cles(E.presque)).toEqual(['core', 'payants']);
    expect(cles(E.jamais)).toEqual(['starter', 'inactifs']);
  });
  it('les segments proposés, dans l’ordre, avec leur effectif sur tous les espaces', () => {
    const s = segmentsComptes(Object.values(E), TARIFS, MAINTENANT);
    expect(s.map((x) => `${x.cle}:${x.n}`)).toEqual(['tous:8', 'core:7', 'plus:0', 'business:0', 'payants:4', 'essai:1', 'impayes:2', 'risque:2', 'inactifs:2']);
    expect(s.every((x) => x.definition.length > 10)).toBe(true);
    expect(lireSegment('impayes', s)).toBe('impayes');
    expect(lireSegment('inconnu', s)).toBe('tous');
    expect(lireSegment('starter', s), 'une formule gratuite n’est pas un segment proposé').toBe('tous');
  });
  it('la table d’un filtre · segment puis recherche (accents ignorés), puis la page · l’export reprend toutes les lignes du filtre', () => {
    const espaces = [...Object.values(E), ...Array.from({ length: 60 }, (_, i) => espace({ id: `x${i}`, nom: `Éclat ${i}` }))];
    const t = tableComptesTour(espaces, TARIFS, MAINTENANT, { q: 'ECLAT', segment: 'payants', page: 2 });
    expect(t.segment).toBe('payants');
    expect(t.filtrees).toHaveLength(60);
    expect(t.page).toMatchObject({ page: 2, pages: 2, debut: 51, fin: 60 });
    expect(t.page.lignes.map((l) => l.nom)).toEqual(Array.from({ length: 10 }, (_, i) => `Éclat ${50 + i}`));
    const r = tableComptesTour(espaces, TARIFS, MAINTENANT, { q: 'impayé', segment: 'tous' });
    expect(r.filtrees.map((l) => l.nom)).toEqual(['Impayé']);
    expect(tableComptesTour(espaces, TARIFS, MAINTENANT, { segment: 'essai' }).filtrees.map((l) => l.forfait.libelle)).toEqual(['Essai']);
  });
  it('les cellules exportées sont les textes de la table, colonne par colonne', () => {
    const [l] = tableComptesTour([E.essai], TARIFS, MAINTENANT, {}).filtrees;
    expect(COLONNES_COMPTES_TOUR).toEqual(['Compte', 'Forfait', 'MRR', 'Crédits utilisés', 'Santé', 'Profil', 'Inscrit le']);
    expect(cellulesCompteTour(l!)).toEqual(['Essai', 'Essai', VALEUR_ABSENTE, '5 %', 'Aucun signal', VALEUR_ABSENTE, '2 août']);
  });
});

describe('export · CSV neutralisé, sans secret ni adresse', () => {
  it('« =1+1 » et les autres débuts de formule sont neutralisés · un nombre reste un nombre', () => {
    const csv = tableauCsv(['A', 'B', 'C'], [['=1+1', '+SUM(A1)', 12], ['@cmd', '-2+3', '-12,5']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toEqual(['﻿A;B;C', "'=1+1;'+SUM(A1);12", "'@cmd;'-2+3;-12,5", '']);
  });
  it('aucune adresse e-mail brute, aucun secret reconnaissable · un séparateur est entouré', () => {
    expect(celluleSansFuite('Écrire à proprio@lumen.example pour la facture')).toBe('Écrire à [adresse masquée] pour la facture');
    expect(celluleSansFuite('clé sk_live_abcDEF123 et whsec_Zz9')).toBe('clé sk_live_[masquée] et whsec_[masqué]');
    expect(celluleSansFuite('x sk-ant-api03-AbCdEf_gh y')).toBe('x sk-ant-[masquée] y');
    expect(celluleSansFuite('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [masqué]');
    const csv = tableauCsv(['Note'], [['a@b.co; =HYPERLINK("x")'], ['=a@b.co']]);
    expect(csv).not.toMatch(/a@b\.co/);
    expect(csv.split('\r\n')[1]).toBe('"[adresse masquée]; =HYPERLINK(""x"")"');
    expect(csv.split('\r\n')[2]).toBe("'=[adresse masquée]");
  });
  it('l’export est borné et le dit · fermé sans ligne, avec sa raison', () => {
    const csv = tableauCsv(['n'], Array.from({ length: LIGNES_MAX_EXPORT_TOUR + 5 }, (_, i) => [i]));
    expect(csv.trimEnd().split('\r\n')).toHaveLength(LIGNES_MAX_EXPORT_TOUR + 1);
    const u = { un: 'compte', plusieurs: 'comptes' };
    expect(etatExportTour(0, u)).toEqual({ ferme: true, raison: 'Rien à exporter · aucun compte dans ce filtre.', titre: 'Rien à exporter' });
    expect(etatExportTour(3, u)).toMatchObject({ ferme: false, raison: null, titre: 'Exporter les 3 comptes de ce filtre, colonnes de la table' });
    expect(etatExportTour(LIGNES_MAX_EXPORT_TOUR + 1, u).titre).toContain('premiers sur');
    expect(nomFichierExportTour('Incidents · ouverts', MAINTENANT)).toBe('tour-de-controle_incidents-ouverts_2026-11-10.csv');
  });
});

describe('incidents déclarés · états calculés, saisies bornées, gestes', () => {
  const incident = (o: Partial<IncidentLu> = {}): IncidentLu => ({
    id: 'i1', titre: 'Quota fal', gravite: 'critique', cause: 'quota', constat: 'Les images échouent', statut: 'ouvert', notes: [],
    ouvertLe: ilYa(1), ouvertPar: 'u1', closLe: null, closPar: null, resolution: null, ...o,
  });
  const note = { texte: 'vu', auteur: 'u1', le: '2026-11-10T10:00:00Z' };
  it('l’état est calculé · ouvert sans note, en cours dès une note, clos après la clôture · les segments suivent', () => {
    const a = incident(), b = incident({ id: 'b', notes: [note] }), c = incident({ id: 'c', statut: 'clos', closLe: ilYa(0), resolution: 'r', notes: [note] });
    expect([a, b, c].map(etatIncident)).toEqual(['ouvert', 'en-cours', 'clos']);
    expect(segmentsIncidents([a, b, c]).map((s) => `${s.cle}:${s.n}`)).toEqual(['ouverts:2', 'en-cours:1', 'clos:1', 'tous:3']);
    expect(dansSegmentIncident(c, 'ouverts')).toBe(false);
    expect([lireSegmentIncident('clos'), lireSegmentIncident('x'), lireSegmentIncident(undefined)]).toEqual(['clos', 'ouverts', 'ouverts']);
  });
  it('ouvrir · titre sur une ligne (1 à 140), gravité et cause connues, constat (1 à 2 000)', () => {
    const ok = validerOuvertureIncident({ titre: '  Quota\n fal  ', gravite: 'majeure', cause: 'quota', constat: ' Les images échouent ' }, ['quota']);
    expect(ok).toEqual({ ok: true, saisie: { titre: 'Quota fal', gravite: 'majeure', cause: 'quota', constat: 'Les images échouent' } });
    expect(validerOuvertureIncident({ titre: 'T', gravite: 'majeure', cause: '', constat: 'c' }, []).ok).toBe(true);
    const ko = validerOuvertureIncident({ titre: 'a'.repeat(141), gravite: 'grave', cause: 'inconnue', constat: '   ' }, ['quota']);
    expect(ko.ok ? [] : ko.erreurs.map((e) => e.champ)).toEqual(['titre', 'gravite', 'cause', 'constat']);
    expect(validerNoteIncident('x'.repeat(2001)).ok).toBe(false);
    expect(validerNoteIncident(' x ')).toEqual({ ok: true, texte: 'x' });
    expect(validerClotureIncident('').ok).toBe(false);
  });
  it('clore un incident clos est refusé avec sa raison · annoter reste permis jusqu’à la borne', () => {
    const clos = incident({ statut: 'clos', closLe: ilYa(0), resolution: 'r' });
    expect(gesteIncident(clos, 'clore')).toEqual({ permis: false, raison: 'Déjà clos · un incident clos ne se rouvre pas d’ici, il s’annote.' });
    expect(gesteIncident(clos, 'annoter')).toEqual({ permis: true });
    const plein = incident({ notes: Array.from({ length: NOTES_MAX_INCIDENT }, () => note) });
    expect(gesteIncident(plein, 'annoter')).toMatchObject({ permis: false });
    expect(gesteIncident(incident(), 'clore')).toEqual({ permis: true });
  });
  it('la ligne affichée (et exportée) · une cellule par colonne, aucun nom d’auteur ne devient une adresse', () => {
    const a = incidentAffiche(incident({ notes: [note] }), { nom: (id) => (id === 'u1' ? 'Kevin' : 'Équipe plateforme'), cause: () => 'Quota fournisseur', date: () => '9 nov.', absent: VALEUR_ABSENTE });
    expect(a.cellules).toEqual(['Quota fal', 'Critique', 'En cours', 'Quota fournisseur', '9 nov.', 'Kevin', '1', VALEUR_ABSENTE, VALEUR_ABSENTE]);
    expect(a.cellules).toHaveLength(COLONNES_INCIDENTS.length);
    expect([nomEquipePlateforme('Kevin '), nomEquipePlateforme(null), nomEquipePlateforme('k@x.fr'), nomEquipePlateforme('  ')]).toEqual(['Kevin', 'Équipe plateforme', 'Équipe plateforme', 'Équipe plateforme']);
  });
});
