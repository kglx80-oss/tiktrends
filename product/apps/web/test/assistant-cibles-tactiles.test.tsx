import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CIBLE_TACTILE_MIN, ETAPES, ETAPE_TITRE } from '@tiktrends/core';
import type { AdTemplate } from '@tiktrends/ai';
import { AssistantPub } from '../app/(app)/studio/ads/AssistantPub';

/**
 * L'assistant Pubs IA se pilote au doigt · sur mobile, une croix de 20 px et des
 * pastilles d'étape de 24 px se ratent. On rend la fenêtre et on LIT le HTML : la
 * croix et chaque pastille d'étape doivent atteindre la cible tactile du noyau
 * (CIBLE_TACTILE_MIN). Retour en arrière = « le geste le plus fréquent dans un
 * assistant » (commentaire du composant), donc ces pastilles comptent.
 */

const ETAT = {
  productId: '', aPhotoProduit: false, aDesProduits: false,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

function rendu(): string {
  return renderToStaticMarkup(
    <AssistantPub
      ouvert
      onFermer={() => {}}
      etat={ETAT}
      produits={[]}
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

const min = `min-width:${CIBLE_TACTILE_MIN}px`;
const minH = `min-height:${CIBLE_TACTILE_MIN}px`;

describe('AssistantPub · cibles tactiles au minimum maison', () => {
  const html = rendu();

  it('la croix de fermeture atteint la cible dans ses DEUX dimensions', () => {
    const m = html.match(/aria-label="Fermer"[^>]*style="([^"]*)"/);
    expect(m, 'bouton Fermer introuvable').not.toBeNull();
    const style = m![1]!;
    expect(style, `croix trop étroite · ${style}`).toContain(min);
    expect(style, `croix trop basse · ${style}`).toContain(minH);
  });

  it('CHAQUE pastille d’étape atteint la hauteur de cible · pas juste le total', () => {
    // Une pastille est un bouton en gélule (border-radius:999px). On les prend
    // une par une · un compteur global masquerait qu'UNE seule ait perdu sa
    // hauteur (relève de relecture). On exige la propriété PAR pastille.
    const tags = html.split('<button').slice(1).map((b) => b.slice(0, b.indexOf('>')));
    const pastilles = tags.filter((t) => t.includes('border-radius:999px'));
    expect(pastilles.length, 'une pastille par étape').toBe(ETAPES.length);
    for (const t of pastilles) {
      expect(t, `pastille sous la cible tactile · ${t}`).toContain(minH);
    }
    // et le libellé de la première étape est bien rendu (la barre d'étapes existe).
    expect(html).toContain(ETAPE_TITRE[ETAPES[0]!]);
  });
});
