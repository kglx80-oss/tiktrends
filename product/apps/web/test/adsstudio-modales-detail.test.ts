import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les deux fenêtres plein écran du studio · la vue détail d'une pub (clic sur
 * une carte) et la lightbox d'aperçu · étaient des overlays sans sémantique ni
 * sortie clavier. Un lecteur d'écran ne les annonçait pas comme dialogues, et
 * sans souris on ne pouvait pas les fermer (Échap ne faisait rien). Non couvert
 * par une règle globale.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · les fenêtres plein écran sont des modales fermables au clavier', () => {
  it('la lightbox d’aperçu se déclare dialogue modal nommé', () => {
    expect(src).toContain('role="dialog" aria-modal="true" aria-label="Aperçu plein écran"');
  });

  it('la vue détail se déclare dialogue modal, nommée par l’accroche', () => {
    expect(src).toContain('role="dialog" aria-modal="true" aria-label={`Détail de la pub · ${detailAd.headline}`}');
  });

  it('Échap ferme la fenêtre du dessus · lightbox puis détail', () => {
    const i = src.indexOf("if (e.key !== 'Escape') return;");
    expect(i, 'aucun handler Échap').toBeGreaterThan(-1);
    const corps = src.slice(i, i + 120);
    expect(corps, 'Échap ne ferme pas la lightbox en premier').toContain('if (preview) setPreview(null)');
    expect(corps, 'Échap ne ferme pas la vue détail ensuite').toContain('else setDetailIdx(null)');
  });
});
