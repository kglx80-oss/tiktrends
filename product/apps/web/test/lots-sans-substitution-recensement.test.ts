import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Aucun `[]` à la place des variantes d'un lot lu en partie (suite de #1126).
 *
 * Le type (`VariantesDuLot`, noyau) rend `l.ads` absent d'un lot lu en partie ·
 * mais un ternaire `l.partielle ? [] : l.ads` (ou `lot?.ads ?? []`) satisfait le
 * type ET nourrit une règle qui en tire une phrase fausse · « Aucun verdict du
 * moteur n'attend d'être arbitré dans ce lot », « Aucune variante de ce lot
 * n'est une gagnante arbitrée ». Les règles qui décrivent UN lot reçoivent le
 * lot lui-même (`variantesDe`) · les lectures de toute la marque passent par
 * `variantesDesLotsLus`. Ce recensement refuse le motif hors des exemptions
 * NOMMÉES ci-dessous, chacune avec sa raison.
 */

const RACINE = join(process.cwd(), '../..');
const DOSSIERS = ['packages/core/src', 'apps/web/app', 'apps/web/lib', 'apps/web/spatial'];
const MOTIF = /partielle\s*\?\s*\[\]|\bads\s*\?\?\s*\[\]/;

/** Les exemptions · `fichier` + un extrait EXACT de la ligne · la raison. */
const EXEMPTIONS: ReadonlyArray<{ fichier: string; extrait: string; raison: string }> = [
  { fichier: 'packages/core/src/spatial/resultats/lecture-lot.ts', extrait: 'return lots.flatMap((l) => (l.partielle ? [] : [...l.ads]))', raison: '`variantesDesLotsLus` · LA règle des lectures de toute la marque, écrite une fois' },
  { fichier: 'apps/web/app/(spatial)/sp/adsmap/boucle/page.tsx', extrait: 'pubs: [...(l.partielle ? [] : l.ads)]', raison: 'vignettes · une liste vide n’affiche rien, aucune règle ne la lit (et un lot illisible n’est jamais « à analyser »)' },
  { fichier: 'apps/web/app/(spatial)/sp/adsmap/page.tsx', extrait: 'pubs: l.partielle ? [] : l.ads.slice(0, 2)', raison: 'vignettes · une liste vide n’affiche rien, aucune règle ne la lit' },
  { fichier: 'apps/web/app/(spatial)/sp/adsmap/lots/[id]/page.tsx', extrait: '(fiche.detail?.ads ?? [])', raison: 'le détail de composition (`batchDetailAction`), pas un lot lu · un lot partiel n’y arrive pas (`FicheLotPartiel`)' },
  { fichier: 'apps/web/app/(spatial)/sp/radar/page.tsx', extrait: 'lus.lue.insights?.ads ?? []', raison: 'les annonces du compte Meta (Radar), pas un lot' },
  { fichier: 'apps/web/spatial/vues/veille/radar-client.tsx', extrait: 'setAds(r.ads ?? [])', raison: 'les annonces de la découverte de marché, pas un lot' },
];

function fichiers(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

function occurrences(): Array<{ fichier: string; ligne: number; texte: string }> {
  return DOSSIERS.flatMap((d) => fichiers(join(RACINE, d))).flatMap((f) => {
    const fichier = relative(RACINE, f);
    return readFileSync(f, 'utf8').split('\n').flatMap((texte, i) => (MOTIF.test(texte) ? [{ fichier, ligne: i + 1, texte: texte.trim() }] : []));
  });
}

describe('aucun `[]` à la place des variantes d’un lot lu en partie', () => {
  it('le motif n’apparaît que dans les exemptions nommées', () => {
    const hors = occurrences().filter((o) => !EXEMPTIONS.some((e) => e.fichier === o.fichier && o.texte.includes(e.extrait)));
    expect(hors.map((o) => `${o.fichier}:${o.ligne} · ${o.texte}`), 'un `[]` se substitue aux variantes d’un lot lu en partie · passe le lot lui-même (`variantesDe`) ou `variantesDesLotsLus`').toEqual([]);
  });

  it('préalable · chaque exemption existe encore (une exemption périmée ne garde rien)', () => {
    const tout = occurrences();
    expect(EXEMPTIONS.filter((e) => !tout.some((o) => o.fichier === e.fichier && o.texte.includes(e.extrait))).map((e) => `${e.fichier} · ${e.extrait}`)).toEqual([]);
  });

  it('préalable · le motif reconnaît les formes refusées', () => {
    for (const t of ['const ads = l.partielle ? [] : l.ads;', 'ads: lot.partielle ? []', 'd.lots.find((l) => l.id === id)?.ads ?? []', 'c.lot.partielle?[]:c.lot.ads']) expect(MOTIF.test(t), t).toBe(true);
    expect(MOTIF.test('variantesDe(l)')).toBe(false);
  });
});
