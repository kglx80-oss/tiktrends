import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redirectionTestProfond } from '@tiktrends/core';

/**
 * I1 · le passage Studio → Adsmap. Les cartes des Studios mènent à
 * `/adsmap?ad=<id>&depuis=studio`. L'ancienne Adsmap ouvrait un panneau ·
 * Résultats (Spatial, exclusif) ouvre la FICHE du test, le retour aux Studios
 * conservé, et refuse d'afficher le test d'une autre marque.
 *
 * La règle de redirection vit au noyau (`redirectionTestProfond`, testée et
 * éprouvée dans `packages/core/test/spatial-resultats-gestes.test.ts`) · la
 * fiche (rendu, retour aux Studios) est gardée dans `spatial-resultats-gestes.test.tsx`.
 * Ici · le câblage serveur, de bout en bout.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const VUE = readFileSync(join(process.cwd(), 'app/(spatial)/sp/adsmap/page.tsx'), 'utf8');
const FICHE = readFileSync(join(process.cwd(), 'app/(spatial)/sp/adsmap/tests/[id]/page.tsx'), 'utf8');

describe('I1 · au bout du lien, Résultats ouvre la fiche du bon test', () => {
  it('le lien profond des Studios mène à la fiche, retour aux Studios conservé', () => {
    expect(redirectionTestProfond({ ad: AD, depuis: 'studio' })).toBe(`/adsmap/tests/${AD}?depuis=studio`);
  });
  it('hors Studio, pas de retour Studio inventé · sans lien profond, rien ne s’ouvre d’office', () => {
    expect(redirectionTestProfond({ ad: AD })).toBe(`/adsmap/tests/${AD}`);
    expect(redirectionTestProfond({})).toBeNull();
  });
});

describe('I1 · câblage serveur (lecture seule, marque active)', () => {
  it('la vue d’ensemble redirige le lien profond vers la fiche', () => {
    expect(VUE).toMatch(/const profond = redirectionTestProfond\(sp\)/);
    expect(VUE).toContain('if (profond) redirect(profond);');
  });
  it('la fiche vérifie la marque AVANT de lire le test · un test d’une autre marque est dit introuvable', () => {
    const iMarque = FICHE.indexOf('adsDeLaMarque(g.s.workspaceId, g.marque.id, [id])');
    const iLecture = FICHE.indexOf('await adDetailAction(id)');
    expect(iMarque, 'la fiche ouvre un test sans vérifier la marque active').toBeGreaterThan(-1);
    expect(iLecture, 'la lecture du test est conditionnée à la marque').toBeGreaterThan(iMarque);
    expect(FICHE).toContain('id && dansLaMarque ? await adDetailAction(id) : null');
    expect(FICHE).toContain('est introuvable dans Adsmap pour');
  });
  it('le retour aux Studios n’est proposé que depuis les Studios', () => {
    expect(FICHE).toContain('const retour = depuisStudio ? { ...RETOUR_STUDIO } : null;');
  });
});
