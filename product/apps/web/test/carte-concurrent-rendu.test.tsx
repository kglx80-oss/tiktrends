import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// next/link → une ancre simple, pour lire les href sans contexte de routeur.
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { CarteConcurrent } from '../components/CarteConcurrent';

/**
 * Ce que la carte AFFICHE · on rend et on lit le HTML. Une favicon posée dans un
 * bloc mort, un lien « voir le site » manquant ou un nom promu en faux domaine se
 * verraient ici, pas dans un compteur d'appels.
 */
const html = (nom: string) => renderToStaticMarkup(<CarteConcurrent nom={nom} brandId="b1" />);

describe('la carte de concurrent se voit', () => {
  it('mène toujours à l’analyse · avatar, nom et CTA', () => {
    const h = html('HVMN');
    expect(h).toContain('HVMN');
    // Le lien d'analyse porte le nom encodé.
    expect(h).toContain('/brands/b1/competitors/HVMN');
    expect(h).toContain('Analyser ›');
  });

  it('un nom sans domaine · initiales sur avatar teinté, aucun lien externe', () => {
    const h = html('Neva');
    // Initiales visibles (pas de favicon à poser).
    expect(h).toContain('NE');
    // Pas de favicon ni de lien externe · on n'invente pas de site.
    expect(h).not.toContain('s2/favicons');
    expect(h).not.toContain('target="_blank"');
    // Un sous-titre neutre plutôt qu'un domaine faux.
    expect(h).toContain('Concurrent suivi');
  });

  it('une saisie de domaine · favicon en fond et lien « voir le site » sûr', () => {
    const h = html('hvmn.com');
    // La favicon du site est posée en fond de l'avatar.
    expect(h, 'la favicon du site doit être posée').toContain('s2/favicons?domain=hvmn.com');
    // Le domaine est le lien externe · nouvelle fenêtre, protégé du tabnabbing.
    expect(h).toContain('href="https://hvmn.com"');
    expect(h).toContain('target="_blank"');
    expect(h, 'un lien externe doit être protégé').toContain('rel="noopener noreferrer nofollow"');
    // Le domaine s'affiche.
    expect(h).toContain('hvmn.com');
  });

  it('une URL entière est réduite à l’hôte dans la favicon et le lien', () => {
    const h = html('https://www.nike.com/fr/running');
    expect(h).toContain('s2/favicons?domain=nike.com');
    expect(h).toContain('href="https://nike.com"');
  });
});
