// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette #106, point 6 · un nom d'annonceur long dans la carte partagée
 * (Nouveautés, Créations, Veille). Mesuré à 1280 · « M… » entre « Piste forte »
 * et « Suivre », nom complet introuvable. On rend la carte et on lit le HTML.
 */
vi.mock('../components/InspoButtons', () => ({ SaveButton: () => <button type="button">★</button>, FollowButton: () => <button type="button">+ Suivre</button> }));
import { AdCard } from '../components/AdCard';

const NOM = 'Maison Laboratoire Dermatologique Végétale de Provence et des Alpes du Sud';
const carte = (nom: string) => {
  const html = renderToStaticMarkup(<AdCard ad={{ id: 'a', platform: 'facebook', status: 'active', daysRunning: 64, advertiserName: nom } as never} />);
  const d = document.createElement('div'); d.innerHTML = html; return d;
};

describe('AdCard · nom d’annonceur long', () => {
  it('le nom complet est au survol, sur 2 lignes au plus, et la rangée peut passer à la ligne', () => {
    const d = carte(NOM);
    const nom = [...d.querySelectorAll('span')].find((s) => s.textContent === NOM) as HTMLElement;
    expect(nom.getAttribute('title'), 'nom long sans version complète').toBe(NOM);
    expect(nom.style.getPropertyValue('-webkit-line-clamp') || nom.style.webkitLineClamp, 'le nom reste sur une ligne coupée').toBe('2');
    expect(nom.style.flex, 'le nom peut tomber à « M… »').toBe('1 1 120px');
    expect((nom.parentElement as HTMLElement).style.flexWrap, 'badge et Suivre écrasent le nom').toBe('wrap');
  });
});
