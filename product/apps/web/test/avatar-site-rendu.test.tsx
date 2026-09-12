import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarSite } from '../components/AvatarSite';

/**
 * Ce que l'avatar identitaire AFFICHE · on rend et on lit le HTML. La favicon
 * quand une adresse est connue, les initiales sinon · jamais la même pastille
 * pour toutes les marques.
 */
const html = (nom: string, site?: string | null) => renderToStaticMarkup(<AvatarSite nom={nom} site={site} />);

describe('l’avatar de site se voit', () => {
  it('avec une adresse · la favicon du site, pas d’initiales', () => {
    const h = html('Klorea', 'https://klorea.com');
    expect(h, 'la favicon du site doit être posée').toContain('s2/favicons?domain=klorea.com');
    expect(h, 'la favicon remplace les initiales').not.toContain('>KL<');
  });

  it('sans adresse · les initiales sur une teinte, pas de favicon', () => {
    const h = html('Klorea', null);
    expect(h).toContain('KL');
    expect(h).not.toContain('s2/favicons');
  });

  it('une adresse qui n’est pas un domaine retombe sur les initiales', () => {
    const h = html('Marque X', 'profil à compléter');
    expect(h).toContain('MX');
    expect(h).not.toContain('s2/favicons');
  });

  it('deux marques n’ont pas la même teinte · pas un mur uniforme', () => {
    // La couleur de fond vient de la teinte propre au nom · on vérifie qu'elle
    // diffère d'une marque à l'autre (sinon l'avatar ne distingue rien).
    const a = html('Alpha', null);
    const b = html('Beta', null);
    const hsl = (s: string) => s.match(/hsl\([^)]*\)/)?.[0];
    expect(hsl(a)).toBeTruthy();
    expect(hsl(a)).not.toBe(hsl(b));
  });
});
