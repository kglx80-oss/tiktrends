import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La grammaire de layout de la catégorie descend jusqu'à la génération d'entière.
 *
 * ── Ce que ça défend ─────────────────────────────────────────────────────────
 *
 * #265 a posé le moteur et armé la donnée. Ici on ferme la boucle · la grammaire
 * gagnante de la catégorie devient une consigne de direction artistique dans la
 * publicité entière. Trois choses tiennent le contrat : la lecture SANS
 * migration (on relit le jsonb, on ne promeut aucune colonne), le CÂBLAGE
 * best-effort (une lecture en échec ne bloque pas la génération), et le respect
 * du preset maison (qui porte sa propre direction).
 */

const READER = readFileSync(join(process.cwd(), 'app/actions/layout-marche.ts'), 'utf8');

describe('le lecteur agrège sans migration', () => {
  it('relit les dimensions du jsonb analysis, pas une colonne', () => {
    // C'est ce qui rend l'étape sûre et sans dépense · on lit ce que #265 a rangé
    // dans le blob, aucune promotion en colonne (qui serait la migration gated).
    expect(READER).toMatch(/schema\.marketCreatives\.analysis/);
    // La grammaire est agrégée par le noyau (`grammaireLayout`) · c'est elle
    // que lit la carte d'identité de l'écran.
    expect(READER, 'la grammaire n’est plus agrégée par le noyau').toMatch(/grammaireLayout\(obs\)/);
  });
});
