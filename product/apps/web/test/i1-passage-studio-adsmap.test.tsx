import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }) }));

import { Views } from '../app/(app)/adsmap/Views';

/**
 * I1 · le passage Studio → Adsmap. On RÉEND la carte et l'écran Adsmap et on lit
 * le HTML · quel lien sort de la carte, avec quel libellé, pour quel état, et ce
 * que l'écran Adsmap montre au bout du lien.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const views = (testProfond: { adId: string; depuisStudio: boolean; introuvable: boolean } | null) => renderToStaticMarkup(
  <Views batches={[]} canBuild={false} testProfond={testProfond} marque="Klôrea" />,
);

describe('I1 · au bout du lien, Adsmap ouvre le bon test et rend le chemin du Studio', () => {
  it('le lien profond ouvre le panneau du test, avec « Retour aux Studios »', () => {
    const h = views({ adId: AD, depuisStudio: true, introuvable: false });
    expect(h, 'le panneau du test ne s’ouvre pas au lien profond').toContain('role="dialog"');
    expect(h, 'le panneau ouvert depuis le Studio n’offre pas le retour').toContain('href="/studio/projets"');
    expect(h).toContain('Retour aux Studios');
  });

  it('hors Studio, pas de retour Studio inventé', () => {
    expect(views({ adId: AD, depuisStudio: false, introuvable: false })).not.toContain('Retour aux Studios');
  });

  it('un test hors de la marque active n’est PAS ouvert · on le dit, et on rend la main', () => {
    const h = views({ adId: AD, depuisStudio: true, introuvable: true });
    expect(h, 'un test d’une autre marque est ouvert sous le nom de la marque active').not.toContain('role="dialog"');
    expect(h).toContain('introuvable dans Adsmap pour Klôrea');
    expect(h).toContain('href="/studio/projets"');
  });

  it('sans lien profond, rien ne s’ouvre d’office', () => {
    const h = views(null);
    expect(h).not.toContain('role="dialog"');
    expect(h).not.toContain('introuvable');
  });
});

describe('I1 · câblage serveur (lecture seule, marque active)', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/(app)/adsmap/page.tsx'), 'utf8');
  it('fermer le panneau du lien profond rend le focus au contenu Adsmap (premier onglet)', () => {
    const V = readFileSync(join(process.cwd(), 'app/(app)/adsmap/Views.tsx'), 'utf8');
    expect(V, 'le focus n’est plus rendu au premier onglet à la fermeture').toContain('setTimeout(() => premierOnglet.current?.focus(), 0)');
    expect(V).toContain('ref={premierOnglet}');
  });
  it('Adsmap vérifie la marque avant d’ouvrir le lien profond', () => {
    expect(PAGE).toContain('lireLienProfondAdsmap(await searchParams)');
    expect(PAGE, 'le lien profond ouvre un test sans vérifier la marque active').toContain('adsDeLaMarque(s.workspaceId, brand.id, [profond.adId])');
  });
});
