// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EtatNouveauProjet } from '@tiktrends/core';

/**
 * Parcours « Nouveau concept créatif » · l'ENTRÉE (mandat Kevin du 20/10). On
 * REND les vrais composants et on LIT le HTML · jamais « une fonction est
 * appelée ». Quatre résultats tenus :
 *  · le CTA porte le nouveau libellé et NAVIGUE vers l'écran de concept ;
 *  · il n'ouvre PLUS la modale Titre/Type (aucun formulaire de création) ;
 *  · l'écran de concept rend l'accroche nommant la marque ;
 *  · cet écran est INERTE · composeur présent, envoi « à venir », aucun
 *    formulaire d'action serveur.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

import { NouveauProjet } from '../components/studios/projet/NouveauProjet';
import { NouveauConcept } from '../components/studios/projet/NouveauConcept';

const CONCEPT = '/studio/projets/nouveau/concept';
const pret: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau concept créatif' };
const sansMarque: EtatNouveauProjet = { etat: 'sans-marque', message: 'choisis une marque active', lien: { href: '/brands', libelle: 'Choisir une marque' } };
const lectureSeule: EtatNouveauProjet = { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer' };

function dom(html: string): HTMLDivElement { const d = document.createElement('div'); d.innerHTML = html; return d; }

describe('CTA « Nouveau concept créatif » · navigue, n’ouvre plus de modale', () => {
  it('en-tête : un lien vers l’écran de concept, le nouveau libellé, l’icône « + » · aucun formulaire', () => {
    const d = dom(renderToStaticMarkup(<NouveauProjet etat={pret} />));
    const cta = d.querySelector('a[data-nouveau-projet="pret"]');
    expect(cta, 'le CTA n’est pas un lien de navigation').not.toBeNull();
    expect(cta!.getAttribute('href')).toBe(CONCEPT);
    expect(cta!.textContent).toContain('Nouveau concept créatif');
    expect(cta!.querySelector('svg'), 'icône « + » absente').not.toBeNull();
    // Plus de modale Titre/Type · aucun formulaire de création, aucun champ titre/type.
    expect(d.querySelector('form[data-formulaire="nouveau-projet"]'), 'la modale Titre/Type est encore là').toBeNull();
    expect(d.querySelector('#np-titre')).toBeNull();
    expect(d.querySelector('#np-type')).toBeNull();
  });

  it('carte : un lien vers l’écran de concept, le raccourci N, pas d’image fabriquée', () => {
    const d = dom(renderToStaticMarkup(<NouveauProjet etat={pret} variante="carte" />));
    const carte = d.querySelector('a[data-nouveau-projet="carte"]');
    expect(carte!.getAttribute('href')).toBe(CONCEPT);
    expect(carte!.getAttribute('aria-keyshortcuts')).toBe('N');
    expect(carte!.textContent).toContain('Nouveau concept créatif');
    expect(d.querySelector('img')).toBeNull();
    expect(d.querySelector('form[data-formulaire="nouveau-projet"]')).toBeNull();
  });

  it('jamais de porte morte · sans marque → vers les marques ; lecture seule → on le dit ; la carte s’efface', () => {
    const sm = dom(renderToStaticMarkup(<NouveauProjet etat={sansMarque} />));
    expect(sm.querySelector('[data-nouveau-projet="sans-marque"] a[href="/brands"]')?.textContent).toBe('Choisir une marque');
    expect(sm.querySelector('a[data-nouveau-projet="pret"]')).toBeNull();
    const ls = dom(renderToStaticMarkup(<NouveauProjet etat={lectureSeule} />));
    expect(ls.querySelector('[data-nouveau-projet="lecture-seule"]')?.textContent).toContain('pas d’en créer');
    // La carte ne double jamais une porte morte.
    expect(renderToStaticMarkup(<NouveauProjet etat={sansMarque} variante="carte" />)).toBe('');
    expect(renderToStaticMarkup(<NouveauProjet etat={lectureSeule} variante="carte" />)).toBe('');
  });
});

describe('écran « Nouveau concept créatif » · accroche + composeur inerte', () => {
  it('rend l’accroche nommant la marque active', () => {
    const d = dom(renderToStaticMarkup(<NouveauConcept etat={pret} />));
    expect(d.querySelector('[data-concept="pret"] [data-accroche]')?.textContent).toBe('Que veux-tu créer pour Neva ?');
  });

  it('composeur présent, envoi HONNÊTEMENT « à venir », AUCUN formulaire d’action serveur', () => {
    const d = dom(renderToStaticMarkup(<NouveauConcept etat={pret} />));
    expect(d.querySelector('[data-composeur] textarea'), 'composeur absent').not.toBeNull();
    const envoi = d.querySelector('[data-envoi="a-venir"]');
    expect(envoi, 'bouton d’envoi absent').not.toBeNull();
    expect((envoi as HTMLButtonElement).disabled, 'l’envoi n’est pas désactivé · il simulerait une création').toBe(true);
    expect(envoi!.getAttribute('aria-disabled')).toBe('true');
    expect(envoi!.textContent).toContain('Bientôt');
    // Rien qui écrive au rendu · aucun formulaire ne poste d’action.
    expect(d.querySelector('form')).toBeNull();
  });

  it('états repris du noyau · sans marque mène aux marques, lecture seule le dit', () => {
    const sm = dom(renderToStaticMarkup(<NouveauConcept etat={sansMarque} />));
    expect(sm.querySelector('[data-concept="sans-marque"] a[href="/brands"]')).not.toBeNull();
    const ls = dom(renderToStaticMarkup(<NouveauConcept etat={lectureSeule} />));
    expect(ls.querySelector('[data-concept="lecture-seule"]')?.textContent).toContain('pas d’en créer');
  });
});
