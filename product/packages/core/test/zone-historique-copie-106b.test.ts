import { describe, expect, it } from 'vitest';
import {
  extensionCible, FICHE_MARQUE_MESURES, CIBLE_TACTILE_MIN,
  lireVueAdsmap, rechercheAdsmap, ficheEmpileHistorique,
  MESSAGES_SERVICE_INACTIF, COPIE_STOCKAGE, BANDEAU_DEMO_VEILLE,
} from '../src';

/**
 * Recette #106b · trois règles pures, vérifiées au RÉSULTAT (les nombres, les
 * URL, les textes).
 */
describe('extensionCible · 44 px de zone sans grossir le visuel', () => {
  it('le visuel + les deux extensions font la cible, jamais moins', () => {
    for (const h of [15, 34, 37, 40, 43]) {
      const e = extensionCible(h);
      expect(h + e.haut + e.bas, `visuel ${h}`).toBe(CIBLE_TACTILE_MIN);
      expect(e.haut).toBeGreaterThanOrEqual(0);
      expect(e.bas).toBeGreaterThanOrEqual(0);
    }
  });
  it('déjà à 44 ou plus · aucune extension', () => {
    expect(extensionCible(44)).toEqual({ haut: 0, bas: 0 });
    expect(extensionCible(60)).toEqual({ haut: 0, bas: 0 });
  });
  it('la place libre bornée d’un côté reporte le reste de l’autre', () => {
    expect(extensionCible(15, { libreBas: 10 })).toEqual({ haut: 19, bas: 10 });
    expect(extensionCible(40, { libreBas: 0 })).toEqual({ haut: 4, bas: 0 });
  });
  it('les mesures de la fiche Marque donnent une zone de 44 partout', () => {
    for (const [nom, m] of Object.entries(FICHE_MARQUE_MESURES)) {
      const e = extensionCible(m.visuel, 'libreBas' in m ? { libreBas: m.libreBas } : {});
      expect(m.visuel + e.haut + e.bas, nom).toBe(44);
      if ('libreBas' in m) expect(e.bas, `${nom} déborde sous le visuel`).toBeLessThanOrEqual(m.libreBas);
    }
  });
});

describe('Adsmap · historique de la fiche', () => {
  it('la vue se lit dans l’URL, l’inconnu retombe sur « À décider »', () => {
    expect(lireVueAdsmap('table')).toBe('table');
    expect(lireVueAdsmap('carte')).toBe('carte');
    expect(lireVueAdsmap('autre')).toBe('decider');
    expect(lireVueAdsmap(null)).toBe('decider');
  });
  it('ouvrir une fiche garde la vue et les autres paramètres, retire « depuis »', () => {
    expect(rechercheAdsmap('?vue=table&lot=3', { fiche: 'abc' })).toBe('?vue=table&lot=3&ad=abc');
    expect(rechercheAdsmap('?ad=x&depuis=studio', { fiche: 'abc' })).toBe('?ad=abc');
  });
  it('fermer la fiche rend la liste, avec sa vue', () => {
    expect(rechercheAdsmap('?vue=carte&ad=abc', { fiche: null })).toBe('?vue=carte');
    expect(rechercheAdsmap('?ad=abc&depuis=studio', { fiche: null })).toBe('');
  });
  it('« À décider » est la vue par défaut · absente de l’URL', () => {
    expect(rechercheAdsmap('?vue=table', { vue: 'decider' })).toBe('');
    expect(rechercheAdsmap('', { vue: 'carte' })).toBe('?vue=carte');
  });
  it('seule une fiche ouverte depuis la liste empile une entrée', () => {
    expect(ficheEmpileHistorique('liste')).toBe(true);
    expect(ficheEmpileHistorique('lien-profond')).toBe(false);
  });
});

// Le détecteur de `copie-client` (#716) n'est pas encore sur main · même liste
// ici, augmentée de « serveur » et des termes d'infrastructure.
const JARGON = [/\b[A-Z0-9]+(_[A-Z0-9]+)+\b/, /GOOGLE_[A-Z_]+/, /[A-Z]+_(API_)?KEY\b/, /API[_ ]?KEY/i, /\bscope\b/i, /oauth/i, /\bvariables?\b/i, /\btoken\b/i,
  /\bjeton\b/i, /configur/i, /\.env\b/i, /trendtrack/i, /anthropic/i, /serveur/i, /\bS3\b/, /\bCORS\b/, /bucket/i, /\bVPS\b/, /docker/i, /proxy/i, /postgres/i];
const jargon = (t: string) => JARGON.filter((m) => m.test(t)).map(String);

describe('copie-service · un client lit ce qui manque et qui agit, sans jargon', () => {
  it.each(Object.entries(MESSAGES_SERVICE_INACTIF))('%s', (_k, t) => {
    expect(jargon(t), `jargon dans « ${t} »`).toEqual([]);
    expect(t, 'qui agit n’est pas dit').toMatch(/notre équipe l’active sur demande/);
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
