import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le poumon apprend AUSSI de TikTok, pas seulement de Meta.
 *
 * ── L'angle mort ─────────────────────────────────────────────────────────────
 *
 * Le produit est TikTok-first, mais l'apprentissage de la grammaire gagnante ne
 * cherchait que sur Meta · une pub TikTok trouvée était sauvegardable mais
 * n'entrait JAMAIS dans le poumon qui nourrit les créas. On apprenait le marché
 * sur la mauvaise plateforme.
 *
 * Le stockage (`analyseLot`) était déjà agnostique · il range `platform:
 * a.platform`. Il ne manquait que d'aller chercher les créas TikTok des marques
 * suivies. Ce garde vérifie que la recherche couvre les deux plateformes ET que
 * le stockage reste agnostique · sans quoi les créas TikTok resteraient hors du
 * poumon même une fois trouvées.
 */

const LEARN = readFileSync(join(process.cwd(), 'app/actions/market-learn.ts'), 'utf8');

describe('la recherche couvre les deux plateformes', () => {
  it('suit les marques sur Meta ET TikTok', () => {
    expect(LEARN).toMatch(/inArray\(schema\.followedBrands\.platform, \['meta', 'tiktok'\]\)/);
  });

  it('dispatche une vraie recherche TikTok pour les marques TikTok', () => {
    expect(LEARN).toMatch(/b\.platform === 'tiktok'/);
    expect(LEARN).toMatch(/ttSearchTikTok\(/);
  });
});

describe('le stockage reste agnostique · TikTok entre dans le poumon', () => {
  it('range chaque créa sous SA plateforme, pas un « meta » figé', () => {
    // C'est l'invariant qui fait qu'une créa TikTok atterrit dans
    // marketCreatives (donc dans la grammaire vidéo) · un `platform: 'meta'` en
    // dur la reléguerait ou l'écraserait.
    expect(LEARN).toMatch(/platform: a\.platform/);
    expect(LEARN, 'la plateforme ne doit pas être figée à meta au stockage').not.toMatch(/platform: 'meta',/);
  });
});
