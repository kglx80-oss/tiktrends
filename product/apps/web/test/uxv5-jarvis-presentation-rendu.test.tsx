// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a>,
}));

const { JarvisAccueilV5 } = await import('../app/(app)/jarvis/JarvisAccueilV5');
const { amorcesCategorie, CATEGORIES_JARVIS } = await import('@tiktrends/core');
type SourceDepenseJarvis = import('@tiktrends/core').SourceDepenseJarvis;
type CategorieJarvis = import('@tiktrends/core').CategorieJarvis;

/**
 * UX V5 · le panneau d'accueil de Jarvis RENDU · on lit le HTML.
 *
 * On monte le vrai composant et on constate ce qui est À L'ÉCRAN :
 *  · les pastilles de catégories changent RÉELLEMENT les trois cartes de prompts,
 *    et cliquer une carte lance la vraie amorce (onAmorce) ;
 *  · les trois automatisations sont `disabled` (service absent, Slack non branché) ;
 *  · l'encart « Chiffres clés » est en état VIDE honnête · 4 cartes sans valeur,
 *    légende Période / Période précédente, « Meta Ads · 14 derniers jours »,
 *    mention de production et lien `/connections` · AUCUN nombre fabriqué. Une
 *    vraie source le fait disparaître (mutation).
 */

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monter(props: Partial<Parameters<typeof JarvisAccueilV5>[0]> = {}) {
  act(() => {
    root!.render(
      <JarvisAccueilV5
        measuredAds={props.measuredAds ?? 8}
        categorie={props.categorie ?? 'strategie'}
        onCategorie={props.onCategorie ?? (() => {})}
        onAmorce={props.onAmorce ?? (() => {})}
        kpiSource={props.kpiSource ?? null}
        enCours={props.enCours ?? false}
      />,
    );
  });
  return el!;
}

describe('pastilles de catégories · changent les prompts (réel, pas figé)', () => {
  it('rend une pastille par catégorie et appelle onCategorie au clic', () => {
    const choisies: string[] = [];
    const dom = monter({ onCategorie: (c) => choisies.push(c) });
    const pills = [...dom.querySelectorAll('[data-zone="categories"] button')] as HTMLButtonElement[];
    expect(pills).toHaveLength(CATEGORIES_JARVIS.length);
    const angles = pills.find((p) => /Angles/.test(p.textContent ?? ''))!;
    act(() => { angles.click(); });
    expect(choisies).toEqual(['angles']);
  });

  it('les 3 cartes de prompts suivent la catégorie active (pas des titres en dur)', () => {
    const titres = (c: CategorieJarvis) =>
      [...monter({ categorie: c }).querySelectorAll('[data-zone="prompts"] button')].map((b) => b.querySelector('span span')?.textContent);
    const strat = titres('strategie');
    act(() => { root!.unmount(); }); el!.remove();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    const accr = titres('accroches');
    expect(strat).toHaveLength(3);
    expect(accr).toHaveLength(3);
    expect(strat).not.toEqual(accr);
    expect(strat).toEqual(amorcesCategorie('strategie', { measuredAds: 8 }).map((a) => a.titre));
  });

  it('cliquer une carte de prompt lance la VRAIE amorce (prompt complet)', () => {
    const lances: string[] = [];
    const dom = monter({ categorie: 'strategie', onAmorce: (q) => lances.push(q) });
    const cartes = [...dom.querySelectorAll('[data-zone="prompts"] button')] as HTMLButtonElement[];
    act(() => { cartes[0]!.click(); });
    expect(lances).toEqual([amorcesCategorie('strategie', { measuredAds: 8 })[0]!.prompt]);
  });
});

describe('automatisations · présentes mais désactivées (Slack compris)', () => {
  it('trois lignes, chaque action rendue en bouton disabled', () => {
    const dom = monter();
    const boutons = [...dom.querySelectorAll('[data-zone="automatisations"] button')] as HTMLButtonElement[];
    expect(boutons).toHaveLength(3);
    for (const b of boutons) expect(b.disabled).toBe(true);
    // La ligne « Rapport Jarvis » (Slack) est bien là, sans faux succès.
    expect(dom.querySelector('[data-zone="automatisations"]')!.textContent).toContain('Rapport Jarvis');
  });
});

describe('Chiffres clés · état VIDE honnête, au pixel de la maquette', () => {
  it('4 cartes (libellés), légende, plateforme/période, mention · aucun nombre, lien /connections', () => {
    const dom = monter({ kpiSource: null });
    const zone = dom.querySelector('[data-zone="kpi"]')!;
    for (const libelle of ['Dépense', 'CPA', 'ROAS', 'Valeur d’achat']) expect(zone.textContent).toContain(libelle);
    expect(zone.textContent).toContain('Période');
    expect(zone.textContent).toContain('Période précédente');
    expect(zone.textContent).toContain('Meta Ads · 14 derniers jours');
    expect(zone.querySelector('a[href="/connections"]')).not.toBeNull();
    // AUCUN nombre fabriqué · ni euro, ni ROAS chiffré, ni pourcentage de tendance.
    expect(zone.textContent).not.toMatch(/€|\d+,\d+|\+\d|\d+ ?%/);
  });

  it('MUTATION · une source branchée fait disparaître l’état vide et montre les vrais KPI', () => {
    const source: SourceDepenseJarvis = {
      plateforme: 'Meta', periode: '14 derniers jours',
      kpis: [{ cle: 'depense', libelle: 'Dépense', valeur: '10 416 €' }],
    };
    const dom = monter({ kpiSource: source });
    const zone = dom.querySelector('[data-zone="kpi"]')!;
    expect(zone.querySelector('a[href="/connections"]')).toBeNull();
    expect(zone.textContent).toContain('10 416 €');
  });
});

describe('fidélité V5 · présentation alignée sur la maquette', () => {
  const sansEspace = (e: Element | null) => (e?.getAttribute('style') ?? '').replace(/\s+/g, '');
  it('titres de zone prominents · ≈16px en encre pleine', () => {
    const dom = monter();
    const titres = [...dom.querySelectorAll('h3')];
    expect(titres.length).toBeGreaterThanOrEqual(2);
    for (const t of titres) {
      expect(sansEspace(t)).toContain('font-size:16px');
      expect(sansEspace(t)).toContain('color:var(--ink)');
    }
  });
  it('les cartes de prompt flottent · ombre par jeton --sh-card', () => {
    const dom = monter();
    const carte = dom.querySelector('[data-zone="prompts"] button');
    expect(sansEspace(carte)).toContain('box-shadow:var(--sh-card)');
  });
});
