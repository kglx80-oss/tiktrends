// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  avertissementPublication, CONFIRMATION_PUBLICATION_PLATEFORME, REFUS_PUBLICATION_PLATEFORME,
  creerConnaissance, validerSaisie, vueConnaissance, apercuContextePlateforme, type SaisieConnaissance,
} from '@tiktrends/core';

/**
 * Message 55 · ce qu'on VOIT juste avant « Publier ».
 *
 *  - rendu statique · l'avertissement de la portée (texte du noyau) est le
 *    dernier bloc avant le bouton Publier, avec la case de confirmation pour
 *    la plateforme seulement ;
 *  - comportement (jsdom) · « Publier » sans la case n'envoie RIEN, le refus
 *    s'affiche sous la case et le focus y revient ; cochée au clavier (Espace),
 *    l'envoi part avec `confirmerPlateforme: true`.
 */

const h = vi.hoisted(() => ({ appels: [] as Array<{ action: string; input: unknown }> }));
vi.mock('../app/actions/connaissances', () => ({
  creerConnaissanceAction: async (input: unknown) => { h.appels.push({ action: 'creer', input }); return {}; },
  nouvelleVersionAction: async (input: unknown) => { h.appels.push({ action: 'version', input }); return {}; },
  publierConnaissanceAction: async (input: unknown) => { h.appels.push({ action: 'publier', input }); return {}; },
  retirerConnaissanceAction: async () => ({}),
}));

import { Formulaire, EcranConnaissances } from '../app/(app)/admin/connaissances/EcranConnaissances';
import type { VueAdminConnaissances } from '../app/actions/connaissances';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Niveau = 'plateforme' | 'espace' | 'marque';
const VALEURS = (niveau: Niveau) => ({ titre: 'Titre', type: 'methode' as const, texte: 'Texte', mode: 'saisie' as const, fichier: null, niveau, workspaceId: niveau === 'plateforme' ? '' : 'w', brandId: niveau === 'marque' ? 'b' : '' });
const statique = (niveau: Niveau) => renderToStaticMarkup(
  <Formulaire initial={VALEURS(niveau)} titreFormulaire="Nouvelle connaissance" espaces={[{ id: 'w', name: 'Espace' }]} marques={[{ id: 'b', name: 'Neva', workspaceId: 'w' }]} occupe={false} onEnvoyer={async () => true} />,
);
const echappe = (t: string) => renderToStaticMarkup(<i>{t}</i>).slice(3, -4);

describe('rendu · l’avertissement est juste avant « Publier »', () => {
  it('plateforme · avertissement du noyau + case non cochée, puis le bouton', () => {
    const html = statique('plateforme');
    const avert = html.indexOf(echappe(avertissementPublication('plateforme')));
    const caseC = html.indexOf('name="confirmer-plateforme"');
    const publier = html.indexOf('>Publier</button>');
    expect(avert, 'avertissement plateforme absent').toBeGreaterThan(-1);
    expect(html).toContain('TOUS les destinataires autorisés');
    expect(html).toContain(echappe(CONFIRMATION_PUBLICATION_PLATEFORME));
    expect(caseC).toBeGreaterThan(avert);
    expect(publier).toBeGreaterThan(caseC);
    // Rien d'autre entre l'encart et la rangée de boutons.
    const entre = html.slice(caseC, publier);
    expect(entre).not.toMatch(/<(textarea|select|section|h2)\b/);
    expect(html).not.toMatch(/name="confirmer-plateforme"[^>]*checked/);
  });

  it('espace et marque · leur avertissement, sans case', () => {
    for (const n of ['espace', 'marque'] as const) {
      const html = statique(n);
      expect(html).toContain(echappe(avertissementPublication(n)));
      expect(html).not.toContain('name="confirmer-plateforme"');
      expect(html.indexOf(echappe(avertissementPublication(n)))).toBeLessThan(html.indexOf('>Publier</button>'));
    }
  });
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = undefined; container = undefined; h.appels = []; });
function monter(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => r.render(node));
}
const bouton = (texte: string) => [...container!.querySelectorAll('button')].find((b) => b.textContent === texte)!;
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('comportement · formulaire', () => {
  it('Publier sans la case · rien n’est envoyé, refus sous la case, focus sur la case', async () => {
    const envois: unknown[][] = [];
    monter(<Formulaire initial={VALEURS('plateforme')} titreFormulaire="Nouvelle" espaces={[]} marques={[]} occupe={false} onEnvoyer={async (...a) => { envois.push(a); return true; }} />);
    await act(async () => { bouton('Publier').click(); });
    expect(envois).toEqual([]);
    const caseC = container!.querySelector<HTMLInputElement>('input[name="confirmer-plateforme"]')!;
    expect(document.activeElement).toBe(caseC);
    const alerte = container!.querySelector('[role="alert"]');
    expect(alerte?.textContent).toBe(REFUS_PUBLICATION_PLATEFORME);
    expect(caseC.getAttribute('aria-describedby')).toBe(alerte!.id);
  });

  it('cochée · l’envoi part avec la confirmation plateforme', async () => {
    const envois: unknown[][] = [];
    monter(<Formulaire initial={VALEURS('plateforme')} titreFormulaire="Nouvelle" espaces={[]} marques={[]} occupe={false} onEnvoyer={async (...a) => { envois.push(a); return true; }} />);
    const caseC = container!.querySelector<HTMLInputElement>('input[name="confirmer-plateforme"]')!;
    caseC.focus();
    await act(async () => { caseC.click(); }); // Espace sur une case = clic
    expect(caseC.checked).toBe(true);
    await act(async () => { bouton('Publier').click(); });
    expect(envois.length).toBe(1);
    expect(envois[0]![1]).toBe(true);   // publier
    expect(envois[0]![3]).toBe(true);   // confirmerPlateforme
  });

  it('brouillon · part sans la case (pas une publication)', async () => {
    const envois: unknown[][] = [];
    monter(<Formulaire initial={VALEURS('plateforme')} titreFormulaire="Nouvelle" espaces={[]} marques={[]} occupe={false} onEnvoyer={async (...a) => { envois.push(a); return true; }} />);
    await act(async () => { bouton('Enregistrer en brouillon').click(); });
    expect(envois.length).toBe(1);
    expect(envois[0]![1]).toBe(false);
    expect(envois[0]![3]).toBe(false);
  });
});

describe('comportement · publier un brouillon depuis sa carte', () => {
  const s = (o: Partial<SaisieConnaissance>) => { const v = validerSaisie({ titre: 'Brouillon plateforme', type: 'instruction', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o }); if (!v.ok) throw new Error(v.erreur); return v.valeur; };
  const c = creerConnaissance('00000055-aaaa-4aaa-8aaa-aaaaaaaaaaaa', s({}), 'e', '2026-10-05T08:00:00.000Z');
  const vue: VueAdminConnaissances = { items: [{ ...vueConnaissance(c), usage: {} }], apercu: apercuContextePlateforme([c]) };

  it('l’avertissement s’ouvre avant tout envoi · sans la case, refus et rien d’envoyé · cochée, publiée avec confirmation', async () => {
    monter(<EcranConnaissances vueInitiale={vue} espaces={[]} marques={[]} />);
    await act(async () => { bouton('Publier v1').click(); });
    expect(h.appels).toEqual([]);
    const encart = container!.querySelector('article [data-avant-publication="plateforme"]');
    expect(encart?.textContent).toContain('TOUS les destinataires autorisés');
    await act(async () => { bouton('Publier v1').click(); });
    expect(h.appels).toEqual([]);
    expect(container!.querySelector('article [role="alert"]')?.textContent).toBe(REFUS_PUBLICATION_PLATEFORME);
    const caseC = container!.querySelector<HTMLInputElement>('article input[name="confirmer-plateforme"]')!;
    expect(document.activeElement).toBe(caseC);
    await act(async () => { caseC.click(); });
    await act(async () => { bouton('Publier v1').click(); });
    await attendre();
    expect(h.appels).toEqual([{ action: 'publier', input: { id: c.id, n: 1, confirmerPlateforme: true } }]);
  });
});
