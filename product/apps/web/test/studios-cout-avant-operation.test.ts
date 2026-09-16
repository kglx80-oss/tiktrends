import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S21 du cahier des charges · « avant chaque opération : coût total ou gratuité ».
 * Plusieurs boutons payants des studios ne l'annonçaient pas · Textes IA (aucune
 * mention), et dans Image/Vidéo/Pubs les gestes secondaires payants (proposer,
 * varier, noter). On exige que chaque libellé porte son coût.
 *
 * Studios non rendables (composants client à actions serveur, sauf Textes qui
 * tire une action serveur aussi) · garde par adoption de la source · le libellé
 * EST ce que l'utilisateur lit avant de payer. Le coût vient du barème
 * (`costFor`), jamais d'un nombre écrit à la main.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('Studios · le coût est annoncé avant chaque opération payante (S21)', () => {
  it('Textes IA · le bouton de génération porte son coût et la politique d’échec', () => {
    const s = src('app/(app)/studio/textes/StudioClient.tsx');
    expect(s).toContain("Générer la créative · {costFor('script')} crédits");
    expect(s, 'la politique « non facturé si échec » doit être dite').toContain('non facturé si la génération échoue');
  });

  it('Image · proposer, varier et noter portent leur coût', () => {
    const s = src('app/(app)/studio/image/ImageStudio.tsx');
    expect(s).toContain("Proposer une description · ${costFor('suggest')} cr.");
    expect(s).toContain('Varier (3) · {modelSpec.credits * 3} cr.');
    expect(s).toContain("Noter (IA) · ${costFor('score')} cr.");
  });

  it('Vidéo · proposer un mouvement/description porte son coût', () => {
    const s = src('app/(app)/studio/video/VideoStudioFull.tsx');
    expect(s).toContain("'Proposer un mouvement'} · ${costFor('suggest')} cr.");
  });

  it('Pubs IA · proposer des angles porte son coût', () => {
    const s = src('app/(app)/studio/ads/AdsStudio.tsx');
    expect(s).toContain("Proposer des angles · ${costFor('suggest')} cr.");
  });
});
