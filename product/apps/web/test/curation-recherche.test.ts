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
    // Spatial · la recherche et la borne vivent dans l'adresse, la page les passe à l'action.
    const page = read('app/(spatial)/sp/adsmap/tri/page.tsx');
    const s = read('spatial/vues/resultats/Tri.tsx');
    expect(page, 'la recherche n’est pas passée à l’action').toMatch(/curationViewAction\(\{ q: premier\(sp\.q\)[^}]*limit:/);
    // Appliquée à la demande (M6) · à l'envoi du formulaire, pas à chaque frappe.
    expect(s, 'la recherche ne part pas à la demande').toContain("onSubmit={(e) => { e.preventDefault(); router.push(adresse(saisie.trim(), 20)); }}");
    // Pagination · voir plus augmente la borne.
    expect(s, 'la suite ne se charge pas').toContain('router.push(adresse(v.q, v.limit + 20))');
    // Compte « X sur Y » quand une recherche est active.
    expect(s).toContain('sur ${v.counts[kind]}');
  });
});
