import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R05 · recherche et pagination sur la population COMPLÈTE de la
 * curation (atteindre le 21e élément, retrouver une variante par son titre). Le
 * filtre est prouvé au noyau (`correspondAuNom`). Ici on vérifie le câblage :
 * l'action filtre la population et borne l'affichage ; l'écran cherche à la
 * demande et charge la suite. Composants serveur/client · adoption source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('R05 · curation · recherche + voir plus', () => {
  it('l’action filtre par nom et borne l’affichage sur la population complète', () => {
    const s = read('app/actions/adsmap-curation.ts');
    expect(s, 'l’action n’accepte pas recherche + borne').toContain('opts?: { q?: string; limit?: number }');
    expect(s, 'l’action ne filtre pas par nom').toContain('correspondAuNom(b.label, q)');
    expect(s, 'l’action ne renvoie pas les compteurs de correspondance').toContain('matched');
    // Le filtre précède l'extension coûteuse (ancêtres/descendants).
    expect(s).toContain('filtres[kind].slice(0, limit)');
  });

  it('l’écran cherche à la demande et peut charger la suite', () => {
    const s = read('app/(app)/adsmap/tri/Curation.tsx');
    expect(s, 'la recherche n’est pas passée à l’action').toContain('curationViewAction({ q, limit })');
    // Appliquée à la demande (M6) · saisie distincte de la recherche appliquée.
    expect(s).toContain('const appliquer = ()');
    expect(s).toContain("if (e.key === 'Enter')");
    // Pagination · voir plus augmente la borne.
    expect(s).toContain('setLimit((l) => l + 20)');
    // Compte « X sur Y » quand une recherche est active.
    expect(s).toContain('sur ${view.counts[kind]}');
  });
});
