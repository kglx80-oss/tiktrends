import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';

/**
 * Le contexte de marque, à la demande · ce que Jarvis a comme appui, et la
 * PORTÉE de chaque élément. On vérifie le RÉSULTAT rendu : la portée est
 * affichée (une consigne sans portée laisse croire qu'elle vaut partout), et le
 * panneau renvoie vers l'écran qui édite la marque · il ne recrée pas d'éditeur.
 * Retirer la portée fait tomber la garde.
 */
function rendu(identity: string | null = 'Crème solaire clean', rules: string | null = 'Toujours montrer le packaging'): string {
  return renderToStaticMarkup(
    <JarvisContexte
      contexte={{ brandId: 'b-42', identity, rules }}
      brandName="Neva"
      onClose={() => {}}
    />,
  );
}

describe('JarvisContexte · le contexte de marque, portée comprise', () => {
  const html = rendu();

  it('chaque élément affiche sa portée · ici tout est propre à la marque', () => {
    // Trois blocs (marque, consignes, sources), chacun porte « portée · marque ».
    expect(html.match(/portée · marque/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('la marque renvoie vers son écran d’édition, il ne recrée pas d’éditeur', () => {
    expect(html).toContain('href="/brands/b-42"');
    expect(html).toContain('Modifier la marque');
  });

  it('l’identité et les consignes de la marque sont montrées', () => {
    expect(html).toContain('Crème solaire clean');
    expect(html).toContain('Toujours montrer le packaging');
  });

  it('les sources renvoient au détail sous la conversation', () => {
    expect(html).toContain('href="/jarvis#detail"');
  });

  it('vide · on le dit sans inventer, et on garde la portée', () => {
    const h = rendu(null, null);
    expect(h).toContain('pas encore renseignée');
    expect(h).toContain('Aucune consigne maison');
    expect(h.match(/portée · marque/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('le panneau s’annonce comme une fenêtre nommée et fermable', () => {
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Fermer le contexte"');
  });
});
