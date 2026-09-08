import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdTemplate } from '@tiktrends/ai';
import { ETAPES, ETAPE_TITRE, ETAPE_ROLE } from '@tiktrends/core';
import { AssistantPub } from '../app/(app)/studio/ads/AssistantPub';

/**
 * L'assistant est LE chemin · une décision par écran.
 *
 * ── Pourquoi ce garde, maintenant ────────────────────────────────────────────
 *
 * Le bouton principal du studio ouvre l'assistant · c'est devenu le chemin de
 * création. Sa propriété qui compte n'est pas « il existe » mais « il ne montre
 * qu'une décision à la fois ». Le composeur à plat qu'il remplace posait onze
 * décisions d'un coup · le verdict reçu était « c'est incompréhensible ». Si
 * l'assistant se remettait à tout afficher d'un coup, on aurait reconstruit
 * l'usine à gaz sous un autre nom, et aucun garde de câblage ne le verrait.
 *
 * On rend donc la fenêtre à l'ouverture et on lit le HTML · le corps ne montre
 * QUE l'étape courante, pendant que le fil montre le chemin entier. Un bloc mort
 * ne produit aucun texte · c'est la seule vérification que cette famille de
 * défauts ne sait pas contourner.
 */

const ETAT = {
  productId: '', aPhotoProduit: false, aDesProduits: true,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

function rendu(): string {
  return renderToStaticMarkup(
    <AssistantPub
      ouvert
      onFermer={() => {}}
      etat={ETAT}
      produits={[{ id: 'p1', name: 'Crème hydratante' }]}
      libelleGabarit={() => 'Bénéfices'}
      selecteurStyle={<div>sélecteur de style</div>}
      conseilMoteurs={{ recommande: null, deconseilles: [], lignes: {}, resume: '' }}
      gabaritsDispo={['benefits'] as AdTemplate[]}
      onProduit={() => {}} onGabarit={() => {}} onAngle={() => {}} onOffre={() => {}}
      onDirection={() => {}} onMode={() => {}} onNombre={() => {}} onMoteur={() => {}}
      onGenerer={() => {}}
      busy={false}
      erreur=""
      budget={null}
    />,
  );
}

describe('l’assistant ouvre sur une seule décision', () => {
  it('le corps montre l’étape courante · le produit', () => {
    const html = rendu();
    // Le rôle de l'étape « produit » est le texte du corps · il n'est écrit
    // qu'à l'écran courant.
    expect(html).toContain(ETAPE_ROLE.produit);
    // Et la décision proposée est bien celle du produit.
    expect(html).toContain('Crème hydratante');
  });

  it('les décisions suivantes sont CACHÉES jusqu’à leur tour', () => {
    const html = rendu();
    // Marqueurs du corps de l'étape « volume » · ils ne rendent que là. Les
    // voir à l'ouverture voudrait dire que tout s'affiche d'un coup.
    expect(html, 'le récapitulatif ne doit pas s’afficher à l’étape 1').not.toContain('RÉCAPITULATIF');
    expect(html, 'le choix du nombre ne doit pas s’afficher à l’étape 1').not.toContain('Combien de visuels');
    // Aucune génération à l'étape 1 · le prix et « Générer » appartiennent au
    // dernier écran. Ici, on avance.
    expect(html).toContain('Suivant');
    expect(html, 'on ne génère pas depuis le premier écran').not.toContain('Générer 2 pub');
  });

  it('le fil montre le chemin entier · les cinq étapes sont là', () => {
    const html = rendu();
    // Une décision à l'écran, mais le chemin est lisible · chaque étape a sa
    // pastille dans le fil, quel que soit l'écran courant.
    for (const e of ETAPES) {
      expect(html, `l’étape « ${ETAPE_TITRE[e]} » manque au fil`).toContain(ETAPE_TITRE[e]);
    }
  });
});
