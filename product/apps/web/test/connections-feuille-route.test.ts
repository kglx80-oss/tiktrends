import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un connecteur ne peut pas être « disponible maintenant » ET « à venir » sur la
 * même page. Meta Ads et Shopify sont branchables en direct (DataConnections) ·
 * ils ne doivent donc pas figurer dans la feuille de route « Bientôt » (CATS).
 * TikTok Ads et Google Ads, eux, sont réellement à venir · ils y restent.
 *
 * Page serveur (session, OAuth) · non rendable. Adoption par la source, bornée à
 * la déclaration CATS pour ne pas capter le nom d'un connecteur cité en prose.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/connections/page.tsx'), 'utf8');
const iCats = src.indexOf('const CATS');
const iEnd = src.indexOf('const TOTAL');
const CATS = src.slice(iCats, iEnd > iCats ? iEnd : undefined);

describe('Connexions · la feuille de route ne liste pas ce qui est déjà live', () => {
  it('Meta Ads et Shopify ne sont pas dans la feuille de route « Bientôt »', () => {
    expect(iCats, 'déclaration CATS introuvable').toBeGreaterThan(-1);
    expect(CATS, 'Meta Ads est à la fois live et « à venir »').not.toContain("name: 'Meta Ads'");
    expect(CATS, 'Shopify est à la fois live et « à venir »').not.toContain("name: 'Shopify'");
  });

  it('les connecteurs réellement à venir y restent', () => {
    expect(CATS).toContain("name: 'TikTok Ads'");
    expect(CATS).toContain("name: 'Google Ads'");
  });

  it('l’intro n’annonce plus Meta comme « à venir »', () => {
    expect(src, 'l’intro annonce encore Meta Ads comme à venir').not.toMatch(/Meta Ads et .*en tête/);
  });
});
