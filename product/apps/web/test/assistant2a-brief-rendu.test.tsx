// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { EtatNouveauProjet, ReferenceAdsmap } from '@tiktrends/core';

/**
 * Raccord V5 · Lot 2a · l'étape BRIEF de l'assistant, au RÉSULTAT (HTML rendu).
 *
 * On monte le VRAI composant (jsdom), on passe de « Départ » à « Brief », puis
 * on LIT le HTML : chaque champ V5 est présent, le persona est optionnel
 * (« Aucun persona » par défaut), et les étapes à venir sont « bientôt » SANS
 * aucun contrôle simulé (ni bouton, ni champ). On vérifie ce qu'on VOIT.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ appels: [] as unknown[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/studios/projets', () => ({
  creerProjet: async (e: unknown) => { h.appels.push(e); return { ok: true, projet: { id: 'proj-1' }, version: { id: 'v1' } }; },
}));

import { AssistantProjet } from '../components/studios/projet/AssistantProjet';

const etatPret: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' };
const personas: ReferenceAdsmap[] = [{ id: 'p-claire', label: 'Claire, maman active' }];

async function monter(personasListe: ReferenceAdsmap[] = personas) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => {
    racine.render(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={personasListe} />);
  });
  return { hote, fermer: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); }); };

beforeEach(() => { h.appels = []; });
afterEach(() => { document.body.innerHTML = ''; });

describe('assistant V5 · rail et étapes « bientôt » honnêtes', () => {
  it('les étapes à venir sont marquées « bientôt » et ne portent AUCUN contrôle', async () => {
    const { hote, fermer } = await monter();
    for (const id of ['strategie', 'direction', 'format', 'creation']) {
      const li = hote.querySelector(`[data-rail-etape="${id}"]`);
      expect(li, `étape ${id} absente du rail`).not.toBeNull();
      expect(li!.getAttribute('data-etat')).toBe('bientot');
      expect(li!.getAttribute('data-bientot')).toBe('true');
      expect(li!.textContent).toContain('bientôt');
      // pas de faux contrôle : aucun bouton, champ, case ni sélecteur dans l'étape à venir
      expect(li!.querySelector('button, input, select, textarea, a')).toBeNull();
    }
    // l'étape brief, elle, est navigable (actif)
    const brief = hote.querySelector('[data-rail-etape="brief"]');
    expect(brief!.getAttribute('data-bientot')).toBeNull();
    await fermer();
  });
});

describe('assistant V5 · l’étape brief porte les vrais champs', () => {
  it('passe de Départ à Brief et rend chaque champ V5, persona optionnel', async () => {
    const { hote, fermer } = await monter();
    // au départ, pas encore l'étape brief
    expect(hote.querySelector('[data-zone="assistant-brief"]')).toBeNull();
    await clic(hote.querySelector('[data-bouton="vers-brief"]'));

    const brief = hote.querySelector('[data-zone="assistant-brief"]');
    expect(brief, 'étape brief non rendue').not.toBeNull();

    expect(hote.querySelector('[data-champ="titre"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="intention"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="audience"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="angle"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="concept"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="contraintes"]')).not.toBeNull();

    // objectif typé · les 4 options V5
    const objectifs = [...hote.querySelectorAll('[data-champ="objectif-type"] [data-objectif]')].map((e) => e.getAttribute('data-objectif'));
    expect(objectifs).toEqual(['notoriete', 'consideration', 'conversion', 'fidelisation']);
    // aucune n'est cochée par défaut (objectif facultatif)
    expect(hote.querySelectorAll('[data-champ="objectif-type"] input:checked')).toHaveLength(0);

    // plateformes · les 3 cases, aucune cochée par défaut
    const plateformes = [...hote.querySelectorAll('[data-champ="plateformes"] [data-plateforme]')].map((e) => e.getAttribute('data-plateforme'));
    expect(plateformes).toEqual(['meta_feed', 'meta_stories_reels', 'tiktok']);

    // persona · sélecteur relié aux personas de la marque, « Aucun persona » par défaut
    const select = hote.querySelector('[data-champ="persona"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe(''); // aucun persona choisi
    const options = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(options[0]).toBe('Aucun persona');
    expect(options).toContain('Claire, maman active');

    // le geste réel existe
    expect(hote.querySelector('[data-bouton="creer-projet"]')).not.toBeNull();
    await fermer();
  });

  it('sans persona Adsmap · le sélecteur garde « Aucun persona » et n’est jamais bloquant', async () => {
    const { hote, fermer } = await monter([]);
    await clic(hote.querySelector('[data-bouton="vers-brief"]'));
    const select = hote.querySelector('[data-champ="persona"]') as HTMLSelectElement;
    expect([...select.querySelectorAll('option')]).toHaveLength(1);
    expect(select.querySelector('option')!.textContent).toBe('Aucun persona');
    // le bouton de création reste présent (persona non requis)
    expect(hote.querySelector('[data-bouton="creer-projet"]')).not.toBeNull();
    await fermer();
  });
});

describe('assistant V5 · état lecture seule / sans marque', () => {
  it('sans marque active · message et porte vers les marques, pas d’assistant', async () => {
    const etat: EtatNouveauProjet = { etat: 'sans-marque', message: 'choisis une marque active', lien: { href: '/brands', libelle: 'Choisir une marque' } };
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(<AssistantProjet etat={etat} initial={{ type: 'ads', titre: 'x', intention: '' }} personas={[]} />); });
    expect(hote.querySelector('[data-zone="assistant-projet"]')!.getAttribute('data-etat')).toBe('sans-marque');
    expect(hote.querySelector('a[href="/brands"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="vers-brief"]')).toBeNull();
    await act(async () => { racine.unmount(); });
    hote.remove();
  });
});
