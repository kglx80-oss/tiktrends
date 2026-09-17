import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fraicheur } from '../app/(app)/connections/DataConnections';

/**
 * CDC v7 · N09 · chaque connecteur date sa PROPRE dernière synchro. Un horodatage
 * partagé (`insights_synced_at`) mentait · une synchro Shopify le remettait à
 * l'instant, faisant passer des KPI Meta anciens pour frais.
 */
describe('N09 · badge de fraîcheur · résultat visible', () => {
  it('affiche « Synchronisé le … » quand une date existe', () => {
    const html = renderToStaticMarkup(<Fraicheur iso="2026-09-10T08:30:00.000Z" />);
    expect(html).toContain('Synchronisé le');
  });
  it('n\'affiche rien tant qu\'aucune synchro n\'a abouti', () => {
    expect(renderToStaticMarkup(<Fraicheur iso={null} />)).toBe('');
  });
  it('ignore une date illisible plutôt que d\'afficher « Invalid Date »', () => {
    expect(renderToStaticMarkup(<Fraicheur iso="pas-une-date" />)).toBe('');
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
  it('Analytics data ses KPI Meta avec metaSyncedAt', () => {
    const a = readFileSync(join(process.cwd(), 'app/(app)/analytics/page.tsx'), 'utf8');
    expect(a).toMatch(/syncedAt: schema\.brands\.metaSyncedAt/);
  });
  it('Radar data ses créas Meta avec metaSyncedAt', () => {
    const r = readFileSync(join(process.cwd(), 'app/(app)/radar/page.tsx'), 'utf8');
    expect(r).toMatch(/at: schema\.brands\.metaSyncedAt/);
  });
});
