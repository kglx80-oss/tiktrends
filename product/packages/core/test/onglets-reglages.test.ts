import { describe, expect, it } from 'vitest';
import {
  ONGLETS_REGLAGES, PAGES_ADMINISTRATION, GROUPES_ADMINISTRATION,
  ongletsReglages, ongletsAdministration, groupesAdministration, gardeOuverte, voitAdministration, cleCourante,
  type DroitsAdministration,
} from '../src/onglets-reglages';

const ESPACE = new Set(['brands', 'team', 'connect', 'usage', 'billing', 'settings']);
const AUCUN: DroitsAdministration = { fondateur: false, adminEspace: false, accesTotalEquipe: false, plateforme: false, jarvis: false };
const PROPRIETAIRE: DroitsAdministration = { ...AUCUN, adminEspace: true, jarvis: true };
const EQUIPE: DroitsAdministration = { fondateur: true, adminEspace: true, accesTotalEquipe: true, plateforme: true, jarvis: true };

describe('Réglages · onglets selon le menu de compte réellement ouvert', () => {
  it('admin d’espace · les six onglets, dans l’ordre, le courant marqué', () => {
    const o = ongletsReglages(ESPACE, '/usage');
    expect(o.map((x) => x.libelle)).toEqual(['Réglages', 'Membres', 'Connexions', 'Utilisation des crédits', 'Abonnement et factures', 'Mon profil']);
    expect(o.filter((x) => x.courant).map((x) => x.href)).toEqual(['/usage']);
  });

  it('membre ou lecteur (menu « Espace » vide) · aucune barre · un seul onglet ne mène nulle part', () => {
    expect(ongletsReglages(new Set(), '/profile')).toEqual([]);
    expect(ongletsReglages(new Set(['support']), '/profile')).toEqual([]);
  });

  it('équipe dont la matrice masque la facturation · l’onglet disparaît, les autres restent', () => {
    const o = ongletsReglages(new Set(['team', 'settings']), '/team');
    expect(o.map((x) => x.href)).toEqual(['/settings', '/team', '/profile']);
    expect(o.find((x) => x.courant)?.href).toBe('/team');
  });

  it('Marques n’est pas un onglet de Réglages (elle a sa propre entrée)', () => {
    expect(ongletsReglages(ESPACE, '/settings').map((x) => x.href)).not.toContain('/brands');
  });

  it('chemin hors Réglages · aucun onglet courant', () => {
    expect(ongletsReglages(ESPACE, '/dashboard').some((x) => x.courant)).toBe(false);
  });

  it('chaque entrée de menu déclare la garde « admin d’espace », le profil la session', () => {
    for (const e of ONGLETS_REGLAGES) expect(e.gardePage, e.href).toBe(e.ouverture === 'session' ? 'session' : 'admin-espace');
  });
});

describe('Administration · onglets selon la garde de chaque page', () => {
  it('client (propriétaire de son espace) · aucun onglet, aucune administration', () => {
    expect(ongletsAdministration(PROPRIETAIRE, '/admin')).toEqual([]);
    expect(voitAdministration(PROPRIETAIRE)).toBe(false);
    expect(voitAdministration(AUCUN)).toBe(false);
  });

  it('équipe plateforme complète · toutes les pages d’Administration, aucune page cliente en onglet', () => {
    const o = ongletsAdministration(EQUIPE, '/admin');
    const attendues = PAGES_ADMINISTRATION.filter((p) => !p.horsOnglets).map((p) => p.href);
    expect(o.map((x) => x.href)).toEqual(attendues);
    expect(o.map((x) => x.href)).not.toContain('/billing');
    expect(o.map((x) => x.href)).not.toContain('/settings');
    expect(o.map((x) => x.href)).toEqual(expect.arrayContaining(['/console', '/credits', '/admin/ia-studios', '/admin/studios-interrupteurs']));
  });

  it('les douze pages d’Administration, `/console` et `/credits` ont chacune un onglet', () => {
    const hrefs = PAGES_ADMINISTRATION.filter((p) => !p.horsOnglets).map((p) => p.href).sort();
    expect(hrefs).toEqual([
      '/admin', '/admin/connaissances', '/admin/depenses', '/admin/equipe', '/admin/finance', '/admin/ia-studios',
      '/admin/incidents', '/admin/intelligence', '/admin/paiement', '/admin/plans', '/admin/signups',
      '/admin/studios-interrupteurs', '/console', '/credits',
    ]);
  });

  it('la sous-page la plus précise est courante, pas la vue d’ensemble', () => {
    const courant = (c: string) => ongletsAdministration(EQUIPE, c).filter((x) => x.courant).map((x) => x.href);
    expect(courant('/admin')).toEqual(['/admin']);
    expect(courant('/admin/finance')).toEqual(['/admin/finance']);
    expect(courant('/admin/ia-studios')).toEqual(['/admin/ia-studios']);
    expect(courant('/credits')).toEqual(['/credits']);
    expect(courant('/admin/inconnue')).toEqual(['/admin']);
  });

  it('fondateur sans compte admissible (SEC-10) · ni IA et Studios ni Interrupteurs', () => {
    const o = ongletsAdministration({ ...EQUIPE, plateforme: false }, '/admin').map((x) => x.href);
    expect(o).not.toContain('/admin/ia-studios');
    expect(o).not.toContain('/admin/studios-interrupteurs');
    expect(o).toContain('/admin/connaissances');
  });

  it('accès total d’équipe sans être fondateur · seulement Équipe, Connaissances et le registre', () => {
    const o = ongletsAdministration({ ...AUCUN, accesTotalEquipe: true, plateforme: true }, '/admin/equipe').map((x) => x.href);
    expect(o).toEqual(['/admin/equipe', '/admin/ia-studios', '/admin/studios-interrupteurs', '/admin/connaissances']);
  });

  it('permission plateforme sans accès total · refusée (le défaut est le refus)', () => {
    expect(gardeOuverte('plateforme', { ...AUCUN, plateforme: true })).toBe(false);
    expect(gardeOuverte('nimporte' as never, EQUIPE)).toBe(false);
  });

  it('page d’entrée · groupes dans l’ordre, chacun avec une description réelle, sans la vue d’ensemble', () => {
    const g = groupesAdministration(EQUIPE);
    expect(g.map((x) => x.groupe)).toEqual(GROUPES_ADMINISTRATION.filter((x) => x !== 'Pilotage'));
    const pages = g.flatMap((x) => x.pages);
    expect(pages.map((p) => p.href)).not.toContain('/admin');
    for (const p of pages) expect(p.description.length, p.href).toBeGreaterThan(30);
    // Toutes les anciennes cartes du tableau de bord restent atteignables.
    for (const href of ['/admin/finance', '/admin/signups', '/admin/equipe', '/credits', '/console', '/jarvis', '/admin/connaissances', '/admin/ia-studios', '/admin/studios-interrupteurs', '/admin/intelligence', '/billing', '/settings']) {
      expect(pages.map((p) => p.href), href).toContain(href);
    }
  });

  it('page d’entrée · un groupe sans page ouverte n’apparaît pas', () => {
    const g = groupesAdministration({ ...EQUIPE, accesTotalEquipe: false, plateforme: false });
    expect(g.find((x) => x.groupe === 'IA et connaissances')).toBeUndefined();
    expect(g.find((x) => x.groupe === 'Comptes et équipe')?.pages.map((p) => p.href)).toEqual(['/admin/signups']);
  });

  it('aucun tiret cadratin ni nom de fournisseur interne dans les libellés', () => {
    const textes = [...PAGES_ADMINISTRATION.flatMap((p) => [p.onglet, p.titre, p.description]), ...ONGLETS_REGLAGES.map((e) => e.libelle)];
    for (const t of textes) {
      expect(t).not.toContain('—');
      expect(t).not.toMatch(/trendtrack/i);
    }
  });
});

describe('cleCourante', () => {
  it('ignore requête et ancre, préfère la base la plus longue', () => {
    const e = [{ cle: 'a', href: '/admin' }, { cle: 'f', href: '/admin/finance?x=1' }];
    expect(cleCourante(e, '/admin/finance/detail?y=2')).toBe('f');
    expect(cleCourante(e, '/administration')).toBeNull();
  });
});
