import { describe, expect, it } from 'vitest';
import {
  resoudreAccueilProjets, doitLireProjetsAccueil, rangeeStudiosAccueil, liensPilotage, apercuReprise, projetsParRecence,
  NB_AUTRES_PROJETS, CHEMIN_TOUS_PROJETS, type SortieApercu,
} from '../src/accueil-projets';
import { CHEMIN_NOUVEAU_PROJET } from '../src/studios/anciennes-adresses';

/** UX V2 · lot 5 · la tête de l'Accueil · reprendre ou créer un projet, plus le pilotage. */

const tout = () => true;
const carte = (id: string, updatedAt: string) => ({ id, updatedAt, title: `Projet ${id}` });
const cartes = [
  carte('p-ancien', '2026-10-01T08:00:00.000Z'),
  carte('p-recent', '2026-10-10T18:00:00.000Z'),
  carte('p-milieu', '2026-10-05T08:00:00.000Z'),
  carte('p-vieux', '2026-09-01T08:00:00.000Z'),
  carte('p-tres-vieux', '2026-08-01T08:00:00.000Z'),
];

describe('accueil · quel projet reprendre, lesquels montrer', () => {
  it('reprend le PLUS RÉCEMMENT modifié, quel que soit l’ordre reçu', () => {
    const e = resoudreAccueilProjets({ ouvert: tout, lecture: { ok: true, cartes }, peutCreer: true });
    expect(e.etat).toBe('liste');
    if (e.etat !== 'liste') return;
    expect(e.reprendre.id, 'le projet repris n’est pas le plus récent').toBe('p-recent');
    expect(e.autres.map((c) => c.id), 'les suivants ne sont pas dans l’ordre de récence').toEqual(['p-milieu', 'p-ancien', 'p-vieux']);
    expect(e.autres).toHaveLength(NB_AUTRES_PROJETS);
    expect(e.autres.map((c) => c.id), 'le projet repris est répété dans les suivants').not.toContain('p-recent');
    expect(e.tous).toEqual({ href: CHEMIN_TOUS_PROJETS, libelle: 'Voir tous les projets' });
    expect(e.nouveau).toEqual({ href: CHEMIN_NOUVEAU_PROJET, libelle: 'Nouveau projet' });
  });

  it('un seul projet · repris, aucun « autre » inventé', () => {
    const e = resoudreAccueilProjets({ ouvert: tout, lecture: { ok: true, cartes: [cartes[0]!] }, peutCreer: true });
    expect(e.etat === 'liste' && e.reprendre.id).toBe('p-ancien');
    expect(e.etat === 'liste' && e.autres).toEqual([]);
  });

  it('date égale ou illisible · ordre stable, jamais de plantage', () => {
    const t = projetsParRecence([carte('b', '2026-10-01T00:00:00Z'), carte('a', '2026-10-01T00:00:00Z'), carte('z', 'pas une date')]);
    expect(t.map((c) => c.id)).toEqual(['a', 'b', 'z']);
  });

  it('« Nouveau projet » seulement si le serveur l’accepterait ET que le rôle ouvre la préparation', () => {
    const sans = resoudreAccueilProjets({ ouvert: tout, lecture: { ok: true, cartes }, peutCreer: false });
    expect(sans.etat === 'liste' && sans.nouveau, 'bouton proposé à un rôle que creerProjet refuserait').toBeNull();
    const ferme = resoudreAccueilProjets({ ouvert: (h) => h !== CHEMIN_NOUVEAU_PROJET, lecture: { ok: true, cartes }, peutCreer: true });
    expect(ferme.etat === 'liste' && ferme.nouveau).toBeNull();
  });
});

describe('accueil · les états de la tête', () => {
  it('rôle sans Studios · on ne lit même pas, aucun bloc projet', () => {
    const ouvert = (h: string) => !h.startsWith('/studio');
    expect(doitLireProjetsAccueil(ouvert)).toBe(false);
    expect(resoudreAccueilProjets({ ouvert, lecture: { ok: true, cartes }, peutCreer: true })).toEqual({ etat: 'ferme' });
    expect(resoudreAccueilProjets({ ouvert: tout, lecture: null, peutCreer: true })).toEqual({ etat: 'ferme' });
  });

  it('refus de rôle du serveur (formule, session) · fermé, pas une « erreur »', () => {
    for (const code of ['FORBIDDEN', 'AUTH_REQUIRED']) {
      expect(resoudreAccueilProjets({ ouvert: tout, lecture: { ok: false, code, traceId: 'st_x' }, peutCreer: true }).etat, code).toBe('ferme');
    }
  });

  it('capacité coupée · une note qui la nomme, aucun geste', () => {
    const e = resoudreAccueilProjets({ ouvert: tout, lecture: { ok: false, code: 'UNSUPPORTED_CAPABILITY', capacitesCoupees: ['projets'] }, peutCreer: true });
    expect(e.etat).toBe('coupee');
    expect(e.etat === 'coupee' && e.message).toContain('« Projets et atelier » · non activé pour cet espace');
  });

  it('panne de lecture · état erreur avec l’identifiant support, le reste continue', () => {
    const e = resoudreAccueilProjets({ ouvert: tout, lecture: { ok: false, code: 'INTERNAL', traceId: 'st_42' }, peutCreer: true });
    expect(e).toEqual({ etat: 'erreur', traceId: 'st_42', tous: { href: CHEMIN_TOUS_PROJETS, libelle: 'Voir tous les projets' } });
  });

  it('aucun projet · premier usage, « Nouveau projet » et la Veille si ouverts', () => {
    expect(resoudreAccueilProjets({ ouvert: tout, lecture: { ok: true, cartes: [] }, peutCreer: true })).toEqual({
      etat: 'premier-usage', nouveau: { href: CHEMIN_NOUVEAU_PROJET, libelle: 'Nouveau projet' }, veille: { href: '/veille', libelle: 'Partir d’une annonce de la Veille' },
    });
    expect(resoudreAccueilProjets({ ouvert: (h) => h !== '/veille', lecture: { ok: true, cartes: [] }, peutCreer: false })).toEqual({
      etat: 'premier-usage', nouveau: null, veille: null,
    });
  });

  it('la rangée Studios d’avant ne reste que si la tête ne porte pas déjà ses gestes', () => {
    expect(rangeeStudiosAccueil({ etat: 'ferme' })).toBe(true);
    expect(rangeeStudiosAccueil({ etat: 'erreur' })).toBe(true);
    expect(rangeeStudiosAccueil({ etat: 'liste' })).toBe(false);
    expect(rangeeStudiosAccueil({ etat: 'premier-usage' })).toBe(false);
    expect(rangeeStudiosAccueil({ etat: 'coupee' })).toBe(false);
  });
});

describe('accueil · piloter l’activité selon les droits', () => {
  it('tout ouvert · Résultats, Activité et coûts, Jarvis, dans cet ordre', () => {
    expect(liensPilotage({ ouvert: tout, compteOuvert: tout }).map((l) => [l.href, l.titre])).toEqual([
      ['/adsmap', 'Résultats'], ['/usage', 'Activité et coûts'], ['/jarvis', 'Faire le point avec Jarvis'],
    ]);
  });
  it('un accès fermé au rôle est ABSENT, pas grisé', () => {
    expect(liensPilotage({ ouvert: (h) => h === '/jarvis', compteOuvert: tout }).map((l) => l.href)).toEqual(['/jarvis']);
    expect(liensPilotage({ ouvert: () => false, compteOuvert: tout })).toEqual([]);
  });
  it('« Activité et coûts » exige aussi le menu de compte (garde réelle de /usage)', () => {
    expect(liensPilotage({ ouvert: tout, compteOuvert: () => false }).map((l) => l.href)).toEqual(['/adsmap', '/jarvis']);
  });
});

describe('accueil · aperçu du projet repris (réel ou rien)', () => {
  const sortie = (o: Partial<SortieApercu>): SortieApercu => ({
    id: 'a1', projectId: 'p1', origin: 'render', mime: 'image/png', storageState: 'stored', simule: false, lot: null, createdAt: '2026-10-10T10:00:00Z', ...o,
  });
  it('la sortie livrée image la plus récente du projet · servie par la route gardée', () => {
    const s = [sortie({ id: 'vieux', createdAt: '2026-10-01T10:00:00Z' }), sortie({ id: 'neuf', createdAt: '2026-10-09T10:00:00Z' })];
    expect(apercuReprise('p1', s)).toBe('/api/studios/media/neuf');
  });
  it('aucune sortie livrée · aucun aperçu (pas d’image inventée)', () => {
    expect(apercuReprise('p1', [])).toBeNull();
    expect(apercuReprise('p1', [sortie({ storageState: 'pending' })]), 'octets non stockés').toBeNull();
    expect(apercuReprise('p1', [sortie({ origin: 'upload' })]), 'entrée de travail').toBeNull();
    expect(apercuReprise('p1', [sortie({ simule: true })]), 'média simulé').toBeNull();
    expect(apercuReprise('p1', [sortie({ origin: 'generated', lot: { state: 'completed', qualityStatus: 'rejected' } })]), 'écartée à la relecture').toBeNull();
    expect(apercuReprise('p1', [sortie({ mime: 'video/mp4' })]), 'une vidéo n’est pas un aperçu fixe').toBeNull();
    expect(apercuReprise('p1', [sortie({ projectId: 'p2' })]), 'la sortie d’un AUTRE projet').toBeNull();
  });
  it('une génération livrée par un lot terminé est un aperçu', () => {
    expect(apercuReprise('p1', [sortie({ id: 'g', origin: 'generated', lot: { state: 'completed', qualityStatus: 'passed' } })])).toBe('/api/studios/media/g');
  });
});
