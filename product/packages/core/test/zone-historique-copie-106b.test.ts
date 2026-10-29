import { describe, expect, it } from 'vitest';
import { MESSAGES_SERVICE_INACTIF, COPIE_STOCKAGE, BANDEAU_DEMO_VEILLE } from '../src';

/**
 * Recette #106b · la copie de service, vérifiée au RÉSULTAT (les textes). La
 * zone tactile de la fiche Marque V5 (`zone-cible`) et l'historique de la fiche
 * Adsmap V5 (`adsmap/historique-fiche`) n'avaient plus d'appelant · retirés
 * avec leurs cas.
 */
// Le détecteur de `copie-client` (#716) n'est pas encore sur main · même liste
// ici, augmentée de « serveur » et des termes d'infrastructure.
const JARGON = [/\b[A-Z0-9]+(_[A-Z0-9]+)+\b/, /GOOGLE_[A-Z_]+/, /[A-Z]+_(API_)?KEY\b/, /API[_ ]?KEY/i, /\bscope\b/i, /oauth/i, /\bvariables?\b/i, /\btoken\b/i,
  /\bjeton\b/i, /configur/i, /\.env\b/i, /trendtrack/i, /anthropic/i, /serveur/i, /\bS3\b/, /\bCORS\b/, /bucket/i, /\bVPS\b/, /docker/i, /proxy/i, /postgres/i];
const jargon = (t: string) => JARGON.filter((m) => m.test(t)).map(String);

describe('copie-service · un client lit ce qui manque et qui agit, sans jargon', () => {
  it.each(Object.entries(MESSAGES_SERVICE_INACTIF))('%s', (_k, t) => {
    expect(jargon(t), `jargon dans « ${t} »`).toEqual([]);
    // Lot 11 · qui agit = la plateforme ; plus « notre équipe … depuis le support » (un ticket reste dans l'espace).
    expect(t, 'qui agit n’est pas dit').toMatch(/côté plateforme, pas depuis ton espace/);
    expect(t, 'promet une équipe que le support ne joint pas').not.toMatch(/notre équipe|depuis le support/);
  });
  it('le bandeau de démonstration de la veille', () => {
    expect(jargon(BANDEAU_DEMO_VEILLE)).toEqual([]);
  });
  it('le panneau Stockage côté client · aucun terme d’infrastructure', () => {
    const c = COPIE_STOCKAGE.client;
    for (const t of [c.inactif, c.configurer, c.deplacer, c.migrationTitre(3, 2), c.migrationTexte, c.testOk, c.testLecture, c.testEcriture]) {
      expect(jargon(t), `jargon dans « ${t} »`).toEqual([]);
    }
  });
  it('le détecteur voit bien les anciens textes (sinon il ne garde rien)', () => {
    for (const t of ['Stockage objet non configuré sur le serveur.', 'Pose les clés S3 dans .env.deploy sur le VPS',
      'Configurer le bucket (public + CORS)', 'renseigne S3_PUBLIC_BASE_URL', 'Source de données non configurée.', COPIE_STOCKAGE.operateur.migrationTexte]) {
      expect(jargon(t), `« ${t} » passe inaperçu`).not.toEqual([]);
    }
  });
});
