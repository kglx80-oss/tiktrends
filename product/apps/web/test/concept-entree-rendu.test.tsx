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
 *  · le composeur porte un envoi RÉEL (plus « à venir ») · c'est le premier
 *    message qui démarre le concept (PR3), jamais le rendu ; aucun formulaire.
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

describe('écran « Nouveau concept créatif » · accroche + composeur à envoi réel', () => {
  it('rend l’accroche nommant la marque active', () => {
    const d = dom(renderToStaticMarkup(<NouveauConcept etat={pret} />));
    expect(d.querySelector('[data-concept="pret"] [data-accroche]')?.textContent).toBe('Que veux-tu créer pour Neva ?');
  });

  it('composeur présent, envoi RÉEL (plus « à venir »), désactivé tant que vide, AUCUN formulaire', () => {
    const d = dom(renderToStaticMarkup(<NouveauConcept etat={pret} />));
    expect(d.querySelector('[data-composeur] textarea'), 'composeur absent').not.toBeNull();
    // L'envoi n'est plus « à venir » · c'est un vrai bouton (la création démarre
    // au premier message, PR3), désactivé tant que la saisie est vide.
    expect(d.querySelector('[data-envoi="a-venir"]'), 'l’envoi « à venir » devrait avoir disparu').toBeNull();
    const envoi = d.querySelector('[data-envoi="pret"]');
    expect(envoi, 'bouton d’envoi absent').not.toBeNull();
    expect((envoi as HTMLButtonElement).disabled, 'l’envoi devrait être désactivé tant que la saisie est vide').toBe(true);
    expect(envoi!.textContent).toContain('Envoyer');
    expect(envoi!.textContent).not.toContain('Bientôt');
    // Rien qui écrive au rendu · aucun formulaire ne poste d’action (l'envoi est
    // un bouton, pas un `<form>` ; rien n'est créé tant que rien n'est envoyé).
    expect(d.querySelector('form')).toBeNull();
  });

  it('états repris du noyau · sans marque mène aux marques, lecture seule le dit', () => {
    const sm = dom(renderToStaticMarkup(<NouveauConcept etat={sansMarque} />));
    expect(sm.querySelector('[data-concept="sans-marque"] a[href="/brands"]')).not.toBeNull();
    const ls = dom(renderToStaticMarkup(<NouveauConcept etat={lectureSeule} />));
    expect(ls.querySelector('[data-concept="lecture-seule"]')?.textContent).toContain('pas d’en créer');
  });
});
