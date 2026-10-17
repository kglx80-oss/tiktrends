// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a>,
}));

const { JarvisAccueilV5 } = await import('../app/(app)/jarvis/JarvisAccueilV5');
const { completudeFicheMarque } = await import('@tiktrends/core');
type FicheMarqueLue = import('@tiktrends/core').FicheMarqueLue;
type SourceDepenseJarvis = import('@tiktrends/core').SourceDepenseJarvis;

/**
 * UX V5 · le panneau d'accueil de Jarvis RENDU · on lit le HTML.
 *
 * On monte le vrai composant et on constate ce qui est À L'ÉCRAN :
 *  · la carte de complétude montre le % RÉEL de `completudeFicheMarque` (pas un
 *    nombre figé · changer la fiche change le % rendu) ;
 *  · l'encart KPI est en état vide honnête, avec le lien `/connections`, tant
 *    qu'aucune source n'est passée (une source le fait disparaître) ;
 *  · les trois lignes d'automatisation sont bien `disabled`.
 */

const ficheVide: FicheMarqueLue = {
  description: null, usp: null, audience: null, category: null, categoryNeeds: null, tone: null,
  industryTags: 0, colors: 0, scenarios: 0, personas: 0, produits: 0, concurrents: 0,
};
const fichePartielle: FicheMarqueLue = { ...ficheVide, description: 'd', usp: 'u', audience: 'a', category: 'c', colors: 2, produits: 3 };

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monter(props: Partial<Parameters<typeof JarvisAccueilV5>[0]> = {}) {
  act(() => {
    root!.render(
      <JarvisAccueilV5
        fiche={'fiche' in props ? props.fiche! : ficheVide}
        brandId={props.brandId ?? 'B1'}
        kpiSource={props.kpiSource ?? null}
        amorces={props.amorces ?? ['Par où je commence ?', 'Quelle est la prochaine chose à tester ?']}
        onAmorce={props.onAmorce ?? (() => {})}
        enCours={props.enCours ?? false}
      />,
    );
  });
  return el!;
}

describe('carte de complétude · le % RÉEL, jamais figé', () => {
  it('rend le pourcentage calculé par completudeFicheMarque', () => {
    const dom = monter({ fiche: fichePartielle });
    const attendu = completudeFicheMarque(fichePartielle).score; // 6/12 = 50 %
    const score = dom.querySelector('[data-completude-score]');
    expect(score?.textContent).toBe(`${attendu} %`);
    const barre = dom.querySelector('[role="progressbar"]');
    expect(barre?.getAttribute('aria-valuenow')).toBe(String(attendu));
  });

  it('MUTATION · changer la fiche change le % rendu (pas un nombre en dur)', () => {
    const a = monter({ fiche: ficheVide }).querySelector('[data-completude-score]')?.textContent;
    act(() => { root!.unmount(); }); el!.remove();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    const b = monter({ fiche: fichePartielle }).querySelector('[data-completude-score]')?.textContent;
    expect(a).toBe('0 %');
    expect(b).not.toBe(a);
    expect(b).toBe(`${completudeFicheMarque(fichePartielle).score} %`);
  });

  it('chaque élément manquant est un lien vers la fiche', () => {
    const dom = monter({ fiche: ficheVide, brandId: 'B7' });
    const liens = [...dom.querySelectorAll('[data-zone="completude"] a[href^="/brands/B7"]')];
    expect(liens.length).toBeGreaterThanOrEqual(12); // les 12 manques + le bouton « Compléter »
  });

  it('fiche illisible (null) · aucune carte de complétude inventée', () => {
    const dom = monter({ fiche: null });
    expect(dom.querySelector('[data-zone="completude"]')).toBeNull();
    expect(dom.querySelector('[data-completude-score]')).toBeNull();
  });
});

describe('encart KPI · état vide honnête', () => {
  it('sans source · un lien vers /connections, aucun chiffre', () => {
    const dom = monter({ kpiSource: null });
    const zone = dom.querySelector('[data-zone="kpi"]')!;
    expect(zone.querySelector('a[href="/connections"]')).not.toBeNull();
    expect(zone.textContent).not.toMatch(/€|ROAS/);
  });

  it('MUTATION · une source branchée fait disparaître l’état vide', () => {
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

describe('automatisations · présentes mais désactivées', () => {
  it('trois lignes, chaque action rendue en bouton disabled', () => {
    const dom = monter();
    const boutons = [...dom.querySelectorAll('[data-zone="automatisations"] button')] as HTMLButtonElement[];
    expect(boutons).toHaveLength(3);
    for (const b of boutons) expect(b.disabled).toBe(true);
  });
});

describe('amorces · les vraies suggestions, en cartes cliquables', () => {
  it('rend une carte par amorce et appelle onAmorce au clic', () => {
    const vues: string[] = [];
    const dom = monter({ amorces: ['A', 'B'], onAmorce: (q) => vues.push(q) });
    const cartes = [...dom.querySelectorAll('[data-zone="amorces"] button')] as HTMLButtonElement[];
    expect(cartes).toHaveLength(2);
    act(() => { cartes[0]!.click(); });
    expect(vues).toEqual(['A']);
  });
});
