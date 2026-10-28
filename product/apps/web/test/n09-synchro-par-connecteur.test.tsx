import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fraicheurConnecteur } from '@tiktrends/core';

/**
 * CDC v7 · N09 · chaque connecteur date sa PROPRE dernière synchro. Un horodatage
 * partagé (`insights_synced_at`) mentait · une synchro Shopify le remettait à
 * l'instant, faisant passer des KPI Meta anciens pour frais.
 */
// Vague 2 · l'écran V5 est retiré · la fraîcheur des cartes Spatial passe par
// la règle du noyau `fraicheurConnecteur` (utilisée par `app/(spatial)/sp/connections`).
describe('N09 · fraîcheur d’une carte · résultat visible', () => {
  it('affiche « synchronisé le … » quand une date existe', () => {
    expect(fraicheurConnecteur('2026-09-10T08:30:00.000Z', 'Europe/Paris')).toBe('synchronisé le 10 septembre');
  });
  it('dit « pas encore synchronisé » tant qu\'aucune synchro n\'a abouti', () => {
    expect(fraicheurConnecteur(null, 'Europe/Paris')).toBe('pas encore synchronisé');
  });
  it('ignore une date illisible plutôt que d\'afficher « Invalid Date »', () => {
    expect(fraicheurConnecteur('pas-une-date', 'Europe/Paris')).toBe('pas encore synchronisé');
  });
  it('l’écran Spatial passe par la règle', () => {
    expect(readFileSync(join(process.cwd(), 'app/(spatial)/sp/connections/page.tsx'), 'utf8')).toContain('fraicheurConnecteur(iso, FUSEAU_ACCUEIL)');
  });
});

describe('N09 · l\'écriture de fraîcheur ne déborde pas d\'un connecteur sur l\'autre', () => {
  const src = readFileSync(join(process.cwd(), 'app/actions/connections.ts'), 'utf8');
  const bloc = (nom: string) => {
    const i = src.indexOf(`export async function ${nom}`);
    const j = src.indexOf('export async function', i + 1);
    return src.slice(i, j === -1 ? undefined : j);
  };
  it('la synchro Shopify date Shopify, jamais Meta', () => {
    const b = bloc('syncShopifyAction');
    expect(b).toMatch(/shopifySyncedAt: new Date\(\)/);
    expect(b, 'une synchro Shopify ne doit pas dater Meta').not.toContain('metaSyncedAt');
  });
  it('la synchro Meta date Meta, jamais Shopify', () => {
    const b = bloc('syncMetaAction');
    expect(b).toMatch(/metaSyncedAt: new Date\(\)/);
    expect(b, 'une synchro Meta ne doit pas dater Shopify').not.toContain('shopifySyncedAt');
  });
  it('changer de compte Meta efface la fraîcheur Meta', () => {
    expect(bloc('selectMetaAccountAction')).toMatch(/metaSyncedAt: null/);
  });
  it('déconnecter un connecteur efface SA fraîcheur', () => {
    expect(bloc('disconnectShopifyAction')).toMatch(/shopifySyncedAt: null/);
    expect(bloc('disconnectMetaAction')).toMatch(/metaSyncedAt: null/);
  });
});

describe('N09 · les lecteurs Meta lisent la fraîcheur Meta, pas la valeur partagée', () => {
  // Planche de banc v4 · l'Accueil, Analytics et le Radar passent par LA même lecture
  // (`lib/connexion-meta.ts`) · elle date par les colonnes Meta, jamais `insightsSyncedAt`.
  const lecture = readFileSync(join(process.cwd(), 'lib/connexion-meta.ts'), 'utf8');
  it('la lecture partagée date par metaSyncedAt et adsmapSyncedAt, jamais la valeur partagée', () => {
    expect(lecture).toMatch(/syncedAt: schema\.brands\.metaSyncedAt/);
    expect(lecture).toMatch(/mesuresLe: schema\.brands\.adsmapSyncedAt/);
    expect(lecture).not.toContain('insightsSyncedAt');
  });
  it.each([
    ['Analytics', 'app/(spatial)/sp/dashboard/analytics.ts'],
    ['Radar', 'app/(spatial)/sp/radar/page.tsx'],
    ['Accueil', 'app/(spatial)/sp/dashboard/chargement.ts'],
  ])('%s passe par la lecture partagée', (_n, f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).toContain('lireConnexionMeta(');
    expect(src).not.toMatch(/schema\.brands\.(metaSyncedAt|adsmapSyncedAt|insightsSyncedAt)/);
  });
});
