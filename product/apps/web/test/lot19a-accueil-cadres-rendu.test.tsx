import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { journey, relance } from '@tiktrends/core';
import { AssistantHome } from '../components/AssistantHome';
import { HomeBandeau } from '../components/HomeBandeau';
import { HomeMarques } from '../components/HomeMarques';
import { JourneyPanel } from '../components/JourneyPanel';

/**
 * Lot 19A · l'Accueil RENDU porte les cadres de la charte (#725 · `--line`
 * cadres, `--line-2` contrôles, `--r-card` 20, `--r-md` 12).
 *
 * Mesuré au navigateur sur `837314dd` (1440 · 1280 · 390) · la garde source
 * passait, et l'Accueil gardait des cartes-liens « Analyser & décider » en
 * `--line-2` r14 · exemptées comme contrôles parce qu'elles portent la hauteur
 * de cible tactile. Une carte cliquable reste une carte · on rend l'écran et on
 * LIT chaque style de bloc bordé.
 */
const STYLE = /<(a|div|section|article|p)\b[^>]*style="([^"]*)"/g;
function cadresHorsRole(html: string): string[] {
  const fautes: string[] = [];
  for (const [, tag, st] of html.matchAll(STYLE)) {
    const bordure = /(?:^|;)border:1px (solid|dashed) ([^;]+)/.exec(st!);
    if (!bordure) continue;
    const rayon = /border-radius:([^;]+)/.exec(st!)?.[1] ?? '';
    if (/999|50%|--r-pill/.test(rayon)) continue; // pilule
    if (/(?:^|;)display:inline-flex/.test(st!)) continue; // bouton-lien compact ou puce · un contrôle (bordure --line-2 permise)
    if (/(?:^|;)(width|height):(\d+)px/.test(st!) && +/(?:^|;)(?:width|height):(\d+)px/.exec(st!)![1]! < 40) continue; // pastille
    if (bordure[1] === 'solid' && bordure[2] === 'var(--line-2)') fautes.push(`<${tag}> cadre plein en --line-2 · ${st!.slice(0, 90)}`);
    if (!/^var\(--r-(card|md)\)$/.test(rayon)) fautes.push(`<${tag}> rayon « ${rayon || 'aucun'} » hors rôle · ${st!.slice(0, 90)}`);
  }
  return fautes;
}

const j = journey(new Set(['brand', 'identity']));
const r = relance(j, { joursDepuisMarque: 5, joursDepuisGeneration: null });

describe('lot 19A · Accueil rendu · chaque cadre porte son rôle', () => {
  const ecrans: Array<[string, string]> = [
    ['AssistantHome (tout ouvert)', renderToStaticMarkup(
      <AssistantHome firstName="Kévin" credits={0} unlimited brandName="Neva" brandId="b1" aiReady={false} />,
    )],
    ['HomeBandeau', renderToStaticMarkup(
      <HomeBandeau contenu={{ titre: 'Prépare ton prochain test', sous: 'Analyse.', ctaLabel: 'Voir mes tests', href: '/adsmap', ctaSecLabel: 'Créer', hrefSec: '/studio/ads' } as never} />,
    )],
    ['HomeMarques', renderToStaticMarkup(
      <HomeMarques marques={[{ id: 'b1', name: 'Neva' }, { id: 'b2', name: 'Klorea' }] as never} activeId="b1" />,
    )],
    ['JourneyPanel (relance + prochaine étape)', renderToStaticMarkup(<JourneyPanel j={j} relance={r} />)],
    ['JourneyPanel (en attente)', renderToStaticMarkup(<JourneyPanel j={{ ...j, next: null }} />)],
  ];
  it('on lit bien des cadres', () => {
    const n = ecrans.reduce((s, [, h]) => s + [...h.matchAll(STYLE)].filter((m) => /border:1px/.test(m[2]!)).length, 0);
    expect(n).toBeGreaterThanOrEqual(12);
  });
  for (const [nom, html] of ecrans) {
    it(nom, () => {
      const fautes = cadresHorsRole(html);
      expect(fautes, `Cadre(s) hors rôle :\n${fautes.join('\n')}`).toEqual([]);
    });
  }
  it('les cartes « Analyser & décider » sont des surfaces', () => {
    const html = ecrans[0]![1];
    const balise = /<a\b[^>]*href="\/adsmap"[^>]*>/.exec(html)?.[0] ?? '';
    const carte = /style="([^"]*)"/.exec(balise)?.[1] ?? '';
    expect(carte, 'la carte Adsmap n’est pas rendue').not.toBe('');
    expect(carte).toContain('border:1px solid var(--line);border-radius:var(--r-card)');
  });
});
