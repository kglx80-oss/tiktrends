// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * UX V5 · la carte de Veille porte la présentation de la maquette · bandeau
 * plateforme + format en haut du média, pastille de statut (Active / Inactive ·
 * N j) avec jauge. On REND la carte et on LIT le HTML · on ne vérifie pas qu'une
 * fonction est appelée. Seuls des champs RÉELS sont affichés · pas de variantes,
 * ni de date de première vue, ni de tags (absents de la source · R14).
 *
 * `badgesV5` est OPT-IN · sans lui, la carte des autres surfaces ne change pas.
 */
vi.mock('../components/InspoButtons', () => ({ SaveButton: () => <button type="button">♥</button>, FollowButton: () => <button type="button">+ Suivre</button> }));
vi.mock('../components/studios/PreparerCreation', () => ({ PreparerCreation: () => <button type="button">Préparer une création</button> }));
import { AdCard } from '../components/AdCard';

const adActive: InspoAd = { id: 'a', platform: 'meta', status: 'active', daysRunning: 63, mediaType: 'video', advertiserName: 'Ploufy', mainCountry: 'FR', body: 'Il a enfin mis la tête sous l’eau.' } as never;
const adInactive: InspoAd = { id: 'b', platform: 'tiktok', status: 'inactive', daysRunning: 7, mediaType: 'image', advertiserName: 'Écume', body: 'promo' } as never;

const rendu = (ad: InspoAd, badgesV5: boolean) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(<AdCard ad={ad} ctaSobre cibles44 badgesV5={badgesV5} contexteRetour="/veille" />);
  return d;
};

describe('Veille · carte V5 (HTML rendu)', () => {
  it('bandeau plateforme + format, et statut « Active · N j » avec jauge', () => {
    const d = rendu(adActive, true);
    const txt = d.textContent || '';
    expect([...d.querySelectorAll('span')].some((s) => s.textContent === 'Meta'), 'badge plateforme Meta').toBe(true);
    expect([...d.querySelectorAll('span')].some((s) => s.textContent === 'Vidéo'), 'badge format Vidéo').toBe(true);
    expect(txt, 'pastille de statut avec les jours réels').toContain('Active · 63 j');
    // La jauge · une barre dont le remplissage est une largeur en %.
    const jauge = [...d.querySelectorAll('span')].find((s) => /width:\s*100%/.test(s.getAttribute('style') || ''));
    expect(jauge, 'jauge pleine pour une diffusion au-delà du seuil éprouvé').toBeTruthy();
  });

  it('une créa inactive dit « Inactive · N j »', () => {
    const d = rendu(adInactive, true);
    expect(d.textContent || '', 'statut inactif réel').toContain('Inactive · 7 j');
    expect([...d.querySelectorAll('span')].some((s) => s.textContent === 'TikTok'), 'badge plateforme TikTok').toBe(true);
  });

  it('la carte ne fabrique PAS de variantes ni de date de première vue (absentes de la source)', () => {
    const txt = rendu(adActive, true).textContent || '';
    expect(/variante/i.test(txt), 'aucune mention de variantes inventée').toBe(false);
    expect(/vue le/i.test(txt), 'aucune date de première vue inventée').toBe(false);
  });

  it('sans badgesV5, aucun bandeau V5 · les autres surfaces de la carte ne régressent pas', () => {
    const d = rendu(adActive, false);
    expect(d.textContent || '', 'pas de pastille de statut hors V5').not.toContain('Active · 63 j');
    expect([...d.querySelectorAll('span')].some((s) => s.textContent === 'Meta'), 'pas de badge plateforme hors V5').toBe(false);
  });

  // ── Fidélité à la maquette · mesurée sur le HTML ciselé (ordre, pastilles,
  //    jauge, titre) · chaque assertion éprouvée par mutation. ──────────────────
  const html = (ad: InspoAd) => renderToStaticMarkup(<AdCard ad={ad} ctaSobre cibles44 badgesV5 contexteRetour="/veille" />);

  it('le nom précède la pastille de statut (ordre de la maquette · identité puis signal)', () => {
    const h = html(adActive);
    const iNom = h.indexOf('Ploufy');
    const iStatut = h.indexOf('Active · 63 j');
    expect(iNom, 'nom présent').toBeGreaterThanOrEqual(0);
    expect(iStatut, 'la pastille de statut vient APRÈS le nom').toBeGreaterThan(iNom);
  });

  it('les pastilles plateforme et média restent lisibles et visuellement cohérentes', () => {
    const d = rendu(adActive, true);
    const badges = [...d.querySelectorAll('span')].filter(s => ['Meta', 'Vidéo'].includes(s.textContent || ''));
    expect(badges.map(b => b.textContent), 'plateforme puis format').toEqual(['Meta', 'Vidéo']);
    expect(badges[0]!.parentElement, 'même bandeau média').toBe(badges[1]!.parentElement);
    expect(badges.map(b => b.style.borderRadius), 'rayon compact commun au prototype').toEqual(['6px', '6px']);
    expect(badges[0]!.style.background, 'fond sombre non vide').not.toBe('');
    expect(badges[0]!.style.background, 'fonds identiques').toBe(badges[1]!.style.background);
    expect(badges.map(b => b.style.color), 'texte clair sur fond sombre').toEqual(['var(--clair-fixe)', 'var(--clair-fixe)']);
  });

  it('la jauge reste VERTE même pour une créa inactive · elle mesure la progression vers le seuil, pas l’état', () => {
    const m = html(adInactive).match(/<span style="display:block;height:100%;width:\d+%;border-radius:999px;background:([^"]+)"/);
    expect(m, 'remplissage de jauge présent').toBeTruthy();
    const fond = m?.[1] ?? '';
    expect(fond, 'jauge en --ok').toContain('var(--ok)');
    expect(/var\(--muted\)/.test(fond), 'la jauge n’est jamais grisée sur un inactif').toBe(false);
  });

  it('le corps de l’annonce est présenté comme une citation « … » (maquette)', () => {
    expect(html(adActive), 'guillemets autour du corps').toContain('« Il a enfin mis la tête sous l’eau. »');
    // Non-régression · hors V5, pas de guillemets ajoutés au corps.
    expect(renderToStaticMarkup(<AdCard ad={adActive} ctaSobre cibles44 contexteRetour="/veille" />), 'corps nu hors V5').not.toContain('« Il a enfin');
  });
});
