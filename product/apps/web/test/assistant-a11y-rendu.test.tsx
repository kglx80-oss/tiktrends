import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdTemplate } from '@tiktrends/ai';
import { AssistantPub, EtapeMessage } from '../app/(app)/studio/ads/AssistantPub';

/**
 * Ce que la fenêtre EXPOSE à l'assistance · rôles, noms et états lisibles sans
 * souris, lus dans le HTML rendu (pas dans la mention du fichier).
 *
 * On rend, on lit. L'étape 1 sort du rendu complet de la fenêtre ; l'étape
 * « message » (ses champs) se rend en montant `EtapeMessage` à part, faute de
 * pouvoir cliquer en rendu statique.
 */

const ETAT_BASE = {
  productId: '', aPhotoProduit: false, aDesProduits: false,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

type Etat = typeof ETAT_BASE;

function props(o: { etat?: Partial<Etat>; erreur?: string; produits?: Array<{ id: string; name: string }> }) {
  return {
    ouvert: true as const,
    onFermer: () => {},
    etat: { ...ETAT_BASE, ...o.etat },
    produits: o.produits ?? [],
    libelleGabarit: () => 'Bénéfices',
    selecteurStyle: <div>sélecteur de style</div>,
    conseilMoteurs: { recommande: null, deconseilles: [], lignes: {}, resume: '' },
    gabaritsDispo: ['benefits'] as AdTemplate[],
    onProduit: () => {}, onGabarit: () => {}, onAngle: () => {}, onOffre: () => {},
    onDirection: () => {}, onMode: () => {}, onNombre: () => {}, onMoteur: () => {},
    onGenerer: () => {},
    busy: false,
    erreur: o.erreur ?? '',
    budget: null,
  };
}

describe('assistant · la fenêtre s’annonce comme une modale nommée', () => {
  it('la boîte porte role=dialog, aria-modal et un nom (le titre d’étape)', () => {
    const html = renderToStaticMarkup(<AssistantPub {...props({})} />);
    expect(html, 'pas de rôle de dialogue').toContain('role="dialog"');
    expect(html, 'la modale n’est pas déclarée modale').toContain('aria-modal="true"');
    expect(html, 'le dialogue n’a pas de nom accessible').toContain('aria-labelledby="assistant-titre"');
    expect(html, 'le titre nommé est absent').toContain('id="assistant-titre"');
  });

  it('l’étape en cours est marquée aria-current="step"', () => {
    const html = renderToStaticMarkup(<AssistantPub {...props({})} />);
    expect(html).toContain('aria-current="step"');
  });

  it('un échec de génération est un role=alert (il s’annonce)', () => {
    const html = renderToStaticMarkup(<AssistantPub {...props({ erreur: 'Le service n’a pas répondu.' })} />);
    expect(html).toContain('role="alert"');
  });

  it('le produit sélectionné est exposé par aria-pressed, pas par la seule couleur', () => {
    const produits = [{ id: 'a', name: 'Café' }, { id: 'b', name: 'Thé' }];
    const html = renderToStaticMarkup(<AssistantPub {...props({ produits, etat: { productId: 'a' } })} />);
    expect(html, 'l’état sélectionné n’est pas exposé').toContain('aria-pressed="true"');
    expect(html, 'les non-sélectionnés ne sont pas exposés').toContain('aria-pressed="false"');
  });
});

describe('assistant · étape message · champs nommés et focus visible', () => {
  const p = props({ etat: { angle: '', offre: '' } });

  it('les libellés Angle et Offre sont liés à leur champ (htmlFor/id)', () => {
    const html = renderToStaticMarkup(<EtapeMessage p={p} />);
    expect(html, 'Angle n’est pas un label lié').toContain('for="assistant-angle"');
    expect(html, 'le champ Angle n’a pas l’id attendu').toContain('id="assistant-angle"');
    expect(html, 'Offre n’est pas un label lié').toContain('for="assistant-offre"');
    expect(html, 'le champ Offre n’a pas l’id attendu').toContain('id="assistant-offre"');
  });

  it('les champs ne suppriment pas l’anneau de focus', () => {
    const html = renderToStaticMarkup(<EtapeMessage p={p} />);
    expect(html, 'un champ coupe son indicateur de focus au clavier').not.toContain('outline:none');
  });

  it('le type de pub sélectionné est exposé par aria-pressed', () => {
    const html = renderToStaticMarkup(<EtapeMessage p={p} />);
    expect(html).toContain('aria-pressed="true"');
  });
});
