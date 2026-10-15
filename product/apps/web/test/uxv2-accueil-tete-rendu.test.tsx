// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { liensPilotage, resoudreAccueilProjets, type EtatAccueilProjets } from '@tiktrends/core';
import type { CarteProjet } from '../lib/studios/sources/projet';

vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));

import { TeteProjets } from '../components/accueil/TeteProjets';
import { PilotageActivite } from '../components/accueil/PilotageActivite';
import { AssistantHome } from '../components/AssistantHome';

/**
 * UX V2 · lot 5 · la tête de l'Accueil RENDUE · on lit le HTML de chaque état
 * (la règle vient du noyau, le composant ne décide rien).
 */

const carte = (id: string, title: string, updatedAt: string, o: Partial<CarteProjet> = {}): CarteProjet => ({
  id, title, kind: 'ads', libelleType: 'Pub statique', brandId: 'b1', marque: 'Neva', etape: 'brief_a_completer', libelleEtape: 'Brief à compléter',
  manques: [{ cle: 'produit', libelle: 'Choisir un produit', bloquant: true }] as never, versionN: 2, sources: 1, updatedAt, ...o,
});
const cartes = [
  carte('p1', 'Collection été · lancement', '2026-10-02T08:00:00Z'),
  carte('p2', 'Le plaisir du premier plongeon, un titre vraiment très long qui doit passer à la ligne sans casser la carte', '2026-10-10T08:00:00Z'),
  carte('p3', 'La piscine au quotidien', '2026-10-05T08:00:00Z'),
];
const etat = (o: Partial<Parameters<typeof resoudreAccueilProjets<CarteProjet>>[0]> = {}) =>
  resoudreAccueilProjets<CarteProjet>({ ouvert: () => true, lecture: { ok: true, cartes }, peutCreer: true, ...o });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const rendre = (e: EtatAccueilProjets<CarteProjet>, apercu: string | null = null) => dom(renderToStaticMarkup(<TeteProjets etat={e} apercu={apercu} />));

describe('Tête · reprendre le dernier projet', () => {
  it('titre, marque, étape, date, manques réels · bouton « Reprendre le projet » vers SA page', () => {
    const d = rendre(etat(), '/api/studios/media/a9');
    const r = d.querySelector('[data-reprendre]')!;
    expect(r.getAttribute('data-reprendre')).toBe('p2');
    expect(r.querySelector('h3')?.textContent).toContain('Le plaisir du premier plongeon');
    expect(r.textContent).toContain('Dernier projet modifié · Neva');
    expect(r.querySelector('[data-etape="brief_a_completer"]')?.textContent).toBe('Brief à compléter');
    expect(r.textContent).toContain('modifié le 10/10/2026 · version 2');
    expect(r.textContent).toContain('Choisir un produit');
    const b = d.querySelector('a[data-reprendre-lien]')!;
    expect([b.getAttribute('href'), b.textContent]).toEqual(['/studio/projets/p2', 'Reprendre le projet']);
  });

  it('un titre long passe à la ligne, il n’est pas coupé', () => {
    const st = rendre(etat()).querySelector('[data-reprendre] h3')!.getAttribute('style')!;
    expect(st).toContain('overflow-wrap:anywhere');
    expect(st).not.toMatch(/text-overflow:ellipsis|white-space:nowrap/);
  });

  it('aperçu RÉEL seulement · l’adresse gardée fournie, sinon aucune image', () => {
    const avec = rendre(etat(), '/api/studios/media/a9');
    expect(avec.querySelector('[data-apercu-reprise] img')?.getAttribute('src')).toBe('/api/studios/media/a9');
    const sans = rendre(etat(), null);
    expect(sans.querySelector('img'), 'une image est rendue sans sortie livrée').toBeNull();
    expect(sans.querySelector('[data-apercu-reprise]')).toBeNull();
  });

  // UX V5 · « Nouveau projet » vit dans les tuiles d'action (même règle,
  // `etat.nouveau`, garde de page `uxv5-accueil-db`) · la liste ne le double plus.
  it('« Nouveau projet » n’est plus doublé dans « Reprendre » · jamais de bouton mort', () => {
    expect(rendre(etat()).querySelector('a[href^="/studio/projets/nouveau"]'), '« Nouveau projet » doublé dans la liste (la tuile le porte)').toBeNull();
    expect(rendre(etat({ peutCreer: false })).querySelector('a[href^="/studio/projets/nouveau"]'), 'bouton mort pour un rôle en lecture').toBeNull();
  });

  it('« Tes autres projets » · les suivants en cartes, puis « Voir tous les projets »', () => {
    const d = rendre(etat());
    expect(d.textContent).toContain('Tes autres projets');
    expect([...d.querySelectorAll('[data-autres-projets] [data-projet]')].map((a) => a.getAttribute('data-projet'))).toEqual(['p3', 'p1']);
    const tous = [...d.querySelectorAll('a')].find((a) => a.textContent?.startsWith('Voir tous les projets'));
    expect(tous?.getAttribute('href')).toBe('/studio/projets?toutes=1');
  });

  it('un seul projet · pas de titre « Tes autres projets » vide, la liste reste accessible', () => {
    const d = rendre(etat({ lecture: { ok: true, cartes: [cartes[0]!] } }));
    expect(d.textContent).not.toContain('Tes autres projets');
    expect(d.querySelector('[data-autres-projets]')).toBeNull();
    expect(d.textContent).toContain('Voir tous les projets');
  });
});

describe('Tête · les autres états', () => {
  it('rôle sans Studios · rien du tout', () => {
    expect(renderToStaticMarkup(<TeteProjets etat={{ etat: 'ferme' }} apercu={null} />)).toBe('');
  });
  it('premier usage · « Nouveau projet » et la Veille, aucun projet inventé', () => {
    const d = rendre(etat({ lecture: { ok: true, cartes: [] } }));
    const b = d.querySelector('[data-accueil-projets="premier-usage"]')!;
    expect(b.textContent).toContain('Aucun projet pour l’instant');
    expect(b.querySelector('a[href="/studio/projets/nouveau"]')?.textContent).toBe('Nouveau projet');
    expect(b.querySelector('a[href="/veille"]')).not.toBeNull();
    expect(d.querySelector('[data-reprendre]')).toBeNull();
  });
  it('premier usage sans droit de créer · on le dit, aucun bouton', () => {
    const d = rendre(etat({ lecture: { ok: true, cartes: [] }, peutCreer: false, ouvert: (h) => h !== '/veille' }));
    expect(d.querySelector('a')).toBeNull();
    expect(d.textContent).toContain('pas d’en créer');
  });
  it('capacité coupée · note discrète (status), aucun lien', () => {
    const d = rendre(etat({ lecture: { ok: false, code: 'UNSUPPORTED_CAPABILITY', capacitesCoupees: ['projets'] } }));
    const p = d.querySelector('[data-accueil-projets="coupee"]')!;
    expect(p.getAttribute('role')).toBe('status');
    expect(p.textContent).toContain('non activé pour cet espace');
    expect(d.querySelector('a')).toBeNull();
  });
  it('erreur de lecture · discret (status, pas alert), identifiant support, porte vers la liste', () => {
    const d = rendre(etat({ lecture: { ok: false, code: 'INTERNAL', traceId: 'st_123' } }));
    const p = d.querySelector('[data-accueil-projets="erreur"]')!;
    expect(p.getAttribute('role')).toBe('status');
    expect(p.textContent).toContain('st_123');
    expect(p.querySelector('a')?.getAttribute('href')).toBe('/studio/projets?toutes=1');
  });
});

describe('Piloter ton activité', () => {
  it('les liens ouverts, avec titre et description, aucun chiffre', () => {
    const d = dom(renderToStaticMarkup(<PilotageActivite liens={liensPilotage({ ouvert: () => true, compteOuvert: () => true })} />));
    expect(d.querySelector('h2')?.textContent).toBe('Piloter ton activité');
    expect([...d.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.querySelector('b')?.textContent])).toEqual([
      ['/adsmap', 'Résultats'], ['/usage', 'Activité et coûts'], ['/jarvis', 'Faire le point avec Jarvis'],
    ]);
    expect(d.textContent).not.toMatch(/\d/);
  });
  it('aucun accès ouvert · rien n’est rendu', () => {
    expect(renderToStaticMarkup(<PilotageActivite liens={[]} />)).toBe('');
  });
});

describe('AssistantHome · la tête passe AVANT l’existant, sans le supprimer', () => {
  const html = (rangeeStudios?: boolean) => renderToStaticMarkup(
    <AssistantHome firstName="Kévin" credits={10} unlimited={false} brandName="Neva" brandId="b1" aiReady
      projets={<div data-test="projets" />} pilotage={<div data-test="pilotage" />} rangeeStudios={rangeeStudios}
      bandeau={<div data-test="bandeau" />} marques={<div data-test="marques" />} prochaineEtape={<div data-test="etape" />} exemple={<div data-test="exemple" />} />,
  );
  it('projets → pilotage → bandeau → marques → prochaine étape → … → exemple', () => {
    const h = html();
    const i = (m: string) => h.indexOf(`data-test="${m}"`);
    for (const m of ['projets', 'pilotage', 'bandeau', 'marques', 'etape', 'exemple']) expect(i(m), `${m} absent`).toBeGreaterThan(-1);
    expect(i('projets')).toBeLessThan(i('pilotage'));
    expect(i('pilotage')).toBeLessThan(i('bandeau'));
    expect(i('bandeau')).toBeLessThan(i('marques'));
    expect(i('marques')).toBeLessThan(i('etape'));
    expect(i('etape')).toBeLessThan(i('exemple'));
  });
  it('la rangée Studios d’avant · gardée par défaut, retirée quand la tête porte ses gestes', () => {
    expect(html()).toContain('Créer les variantes de ton test');
    expect(html(false)).not.toContain('Créer les variantes de ton test');
  });
});
