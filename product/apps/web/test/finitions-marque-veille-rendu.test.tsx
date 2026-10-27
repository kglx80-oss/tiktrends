import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { messageServiceInactif, messagesRetourMarque } from '@tiktrends/core';

/**
 * Finitions relevées en recette 106b (Codex) · rendu lu, pas un appel constaté.
 * - fiche Marque · « Enregistrer le profil », « Récupérer la DA » (et « Éditer »
 *   sur la même rangée), « Générer maintenant » · 44 px (42 mesurés avant) ;
 * - aide de la Veille · nomme l'action réelle de la carte et ne promet aucun
 *   résultat (« Générer une variante » n'existe pas à l'écran).
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('../app/actions/brands', stub);
vi.mock('../app/actions/brand-detail', stub);

// Vague 2 · les boutons de 44 px de la fiche V5 partent avec elle (apparence V5).
describe('Fiche Marque · copie client sans « clé serveur » (recette #106)', () => {
  it('l’IA absente se dit en mots de client, jamais « serveur », sur chaque écran de la fiche', () => {
    // Vague 2 · la fiche est servie par Spatial (vue d'ensemble, Identité, Offre, relecture du site).
    for (const f of ['page.tsx', 'donnees.ts', 'identite/page.tsx', 'offre/page.tsx']) {
      const src = readFileSync(join(process.cwd(), 'app/(spatial)/sp/brands/[id]', f), 'utf8');
      // Un TEXTE affiché (chaîne), pas un commentaire de code.
      expect(src, `${f} · la fiche parle encore du serveur`).not.toMatch(/'[^'\n]*serveur[^'\n]*'/);
      expect(src, f).toContain("messageServiceInactif('ia_profil')");
    }
    expect(messagesRetourMarque()['e:ai'], 'le retour « IA » parle du serveur').toBe(messageServiceInactif('ia_profil'));
  });
});
