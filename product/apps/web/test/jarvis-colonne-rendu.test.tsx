// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...reste}>{children}</a>,
}));

const { JarvisColonne } = await import('../app/(app)/jarvis/JarvisColonne');
const { completudeFicheJarvis, completudeFicheMarque } = await import('@tiktrends/core');
type FicheMarqueLue = import('@tiktrends/core').FicheMarqueLue;

/**
 * UX V5 · la colonne secondaire de Jarvis RENDUE · on lit le HTML.
 *
 *  · sélecteur de marque · un vrai lien vers `/brands` portant le nom réel ;
 *  · nav · « Nouvelle conversation » crée (callback), « Documents & sources »
 *    renvoie aux vraies sources, « Actions programmées » est DÉSACTIVÉ (honnête) ;
 *  · PROJETS · les vrais projets (liens) · aucune section si la liste est vide ;
 *  · CONVERSATIONS · la liste réelle, l'active surlignée, clic → ouvrir,
 *    crayon → renommer ;
 *  · carte « Fiche marque N % » · le % RÉEL (mutation : changer la fiche bouge
 *    le %) · pas de carte si la fiche est illisible.
 */

const fichePartielle: FicheMarqueLue = {
  description: 'd', usp: 'u', audience: 'a', category: 'c', categoryNeeds: null, tone: null,
  industryTags: 0, colors: 2, scenarios: 0, personas: 0, produits: 3, concurrents: 0,
};

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });

function monter(props: Partial<Parameters<typeof JarvisColonne>[0]> = {}) {
  const complet = 'completude' in props ? props.completude! : completudeFicheJarvis(fichePartielle, 'B1');
  act(() => {
    root!.render(
      <JarvisColonne
        brandName={props.brandName ?? 'Neva'}
        projets={props.projets ?? [{ id: 'p1', titre: 'Rentrée des clubs', href: '/studio/projets/p1' }]}
        conversations={props.conversations ?? [{ id: 'c1', titre: 'Angles rentrée', majLe: '2026-01-01T00:00:00Z' }]}
        conversationId={props.conversationId ?? null}
        onNouvelle={props.onNouvelle ?? (() => {})}
        onOuvrirPrincipal={props.onOuvrirPrincipal ?? (() => {})}
        onOuvrir={props.onOuvrir ?? (() => {})}
        onRenommer={props.onRenommer ?? (() => {})}
        completude={complet}
        enCours={props.enCours ?? false}
      />,
    );
  });
  return el!;
}

describe('sélecteur de marque + navigation', () => {
  it('un lien vers /brands portant le nom réel de la marque', () => {
    const dom = monter({ brandName: 'Maison Lumière' });
    const sel = dom.querySelector('a[data-selecteur-marque][href="/brands"]')!;
    expect(sel).not.toBeNull();
    expect(sel.textContent).toContain('Maison Lumière');
  });

  it('« Nouvelle conversation » appelle onNouvelle · « Documents & sources » renvoie aux vraies sources', () => {
    let cree = 0;
    const dom = monter({ onNouvelle: () => { cree++; } });
    const nouv = [...dom.querySelectorAll('button')].find((b) => /Nouvelle conversation/.test(b.textContent ?? ''))!;
    act(() => { nouv.click(); });
    expect(cree).toBe(1);
    expect(dom.querySelector('a[href="/jarvis/sources"]')).not.toBeNull();
  });

  it('« Actions programmées » est DÉSACTIVÉ (aucun planificateur) · pas de faux succès', () => {
    const dom = monter();
    const act2 = [...dom.querySelectorAll('button')].find((b) => /Actions programmées/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(act2.disabled).toBe(true);
  });
});

describe('projets · les vrais projets, liens', () => {
  it('rend un lien par projet', () => {
    const dom = monter({ projets: [{ id: 'a', titre: 'Projet A', href: '/studio/projets/a' }, { id: 'b', titre: 'Projet B', href: '/studio/projets/b' }] });
    expect(dom.querySelector('a[href="/studio/projets/a"]')).not.toBeNull();
    expect(dom.querySelector('a[href="/studio/projets/b"]')).not.toBeNull();
  });
  it('aucune section PROJETS si la marque n’a pas de projet visible', () => {
    const dom = monter({ projets: [] });
    expect(dom.textContent).not.toContain('Projets');
  });
});

describe('conversations · liste réelle, ouvrir et renommer', () => {
  it('clic sur une conversation appelle onOuvrir ; l’active est surlignée', () => {
    const ouvertes: string[] = [];
    const dom = monter({
      conversations: [{ id: 'c1', titre: 'Angles', majLe: 'x' }, { id: 'c2', titre: 'Accroches', majLe: 'x' }],
      conversationId: 'c2', onOuvrir: (id) => ouvertes.push(id),
    });
    const items = [...dom.querySelectorAll('button')].filter((b) => /^(Angles|Accroches)$/.test((b.textContent ?? '').trim()));
    const angles = items.find((b) => (b.textContent ?? '').trim() === 'Angles')!;
    act(() => { angles.click(); });
    expect(ouvertes).toEqual(['c1']);
    const active = items.find((b) => (b.textContent ?? '').trim() === 'Accroches')!;
    expect((active.getAttribute('style') ?? '')).toContain('var(--accent-soft)');
  });

  it('le crayon appelle onRenommer avec l’identifiant et le titre actuel', () => {
    const renommes: Array<[string, string]> = [];
    const dom = monter({
      conversations: [{ id: 'c9', titre: 'À renommer', majLe: 'x' }],
      onRenommer: (id, t) => renommes.push([id, t]),
    });
    const pencil = dom.querySelector('button[aria-label="Renommer « À renommer »"]') as HTMLButtonElement;
    act(() => { pencil.click(); });
    expect(renommes).toEqual([['c9', 'À renommer']]);
  });
});

describe('carte Fiche marque · le % RÉEL', () => {
  it('rend le pourcentage de completudeFicheMarque', () => {
    const dom = monter();
    const attendu = completudeFicheMarque(fichePartielle).score;
    expect(dom.querySelector('[data-completude-score]')?.textContent).toBe(`${attendu} %`);
    expect(dom.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(String(attendu));
  });
  it('MUTATION · changer la fiche change le % rendu', () => {
    const vide: FicheMarqueLue = { description: null, usp: null, audience: null, category: null, categoryNeeds: null, tone: null, industryTags: 0, colors: 0, scenarios: 0, personas: 0, produits: 0, concurrents: 0 };
    const a = monter({ completude: completudeFicheJarvis(vide, 'B1') }).querySelector('[data-completude-score]')?.textContent;
    act(() => { root!.unmount(); }); el!.remove();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    const b = monter({ completude: completudeFicheJarvis(fichePartielle, 'B1') }).querySelector('[data-completude-score]')?.textContent;
    expect(a).toBe('0 %');
    expect(b).not.toBe(a);
  });
  it('fiche illisible (null) · aucune carte inventée', () => {
    const dom = monter({ completude: null });
    expect(dom.querySelector('[data-completude-score]')).toBeNull();
  });
});
