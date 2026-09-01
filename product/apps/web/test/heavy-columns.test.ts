import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le garde qui aurait attrapé le défaut le plus coûteux du produit.
 *
 * ── Ce qui s'est passé ───────────────────────────────────────────────────────
 *
 * `listAssets` faisait `db.select().from(schema.assets)` · sans liste de
 * colonnes, donc toutes, dont `url` qui contient jusqu'à six mégaoctets de
 * base64 par image téléversée. Quatre cents lignes traversaient la base, le
 * serveur et la page, pour finir en vingt-quatre vignettes.
 *
 * Rien ne l'empêchait, et rien n'empêcherait que ça revienne · un `select()`
 * nu ne ressemble pas à une faute, il ressemble à du code court.
 *
 * ── Ce que le garde vérifie ──────────────────────────────────────────────────
 *
 * Sur les tables qui portent du contenu (et pas seulement des références), on
 * exige une liste de colonnes explicite. Écrire les colonnes qu'on veut oblige
 * à se demander si on veut vraiment celle qui pèse.
 *
 * Le garde ne juge pas la taille réelle — il ne peut pas — il juge l'intention :
 * **une table lourde se lit colonne par colonne.**
 */

/** Tables dont au moins une colonne peut contenir un document entier. */
const LOURDES: Record<string, string> = {
  assets: 'url · data URI d’image, jusqu’à ~6 Mo par ligne',
  generations: 'input / output · recette complète et sorties du modèle',
  marketCreatives: 'analysis · description IA complète de la créa',
  savedAds: 'snapshot · capture entière de l’annonce',
  jarvisMessages: 'content · un fil de conversation complet',
};

/** Fichiers relus : les actions et les routes, c'est-à-dire ce qui répond. */
function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('une table lourde se lit colonne par colonne', () => {
  const racine = join(process.cwd(), 'app');
  const sources = [...fichiers(join(racine, 'actions')), ...fichiers(join(racine, 'api')), ...fichiers(join(process.cwd(), 'lib'))];

  it('aucun select() nu sur une table qui porte du contenu', () => {
    const fautes: string[] = [];

    for (const f of sources) {
      const texte = readFileSync(f, 'utf8');
      for (const [table, quoi] of Object.entries(LOURDES)) {
        // `.select()` sans argument, suivi (éventuellement à la ligne) de
        // `.from(schema.<table>)`. C'est exactement la forme qui a coûté cher.
        const motif = new RegExp(`\\.select\\(\\s*\\)[\\s\\S]{0,40}?\\.from\\(\\s*schema\\.${table}\\b`, 'g');
        if (motif.test(texte)) {
          fautes.push(`${f.replace(process.cwd() + '/', '')} · schema.${table} (${quoi})`);
        }
      }
    }

    expect(
      fautes,
      `select() sans liste de colonnes sur une table lourde · nomme les colonnes voulues :\n${fautes.join('\n')}`,
    ).toEqual([]);
  });

  it('le motif reconnaît bien la forme fautive · sinon le garde ne garde rien', () => {
    // On valide le garde sur du code fabriqué · un test qui ne peut pas échouer
    // ne protège de rien, et celui-ci a été écrit APRÈS l'incident.
    const fautif = 'const rows = await db.select().from(schema.assets).where(x);';
    const correct = 'const rows = await db.select({ id: schema.assets.id }).from(schema.assets).where(x);';
    const motif = /\.select\(\s*\)[\s\S]{0,40}?\.from\(\s*schema\.assets\b/;
    expect(motif.test(fautif)).toBe(true);
    expect(motif.test(correct)).toBe(false);
  });

  it('la forme fautive est reconnue même sur plusieurs lignes', () => {
    const motif = /\.select\(\s*\)[\s\S]{0,40}?\.from\(\s*schema\.generations\b/;
    expect(motif.test('await db\n  .select()\n  .from(schema.generations)')).toBe(true);
  });
});
