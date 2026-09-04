import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdTemplate } from '@tiktrends/ai';
import { AssistantPub } from '../app/(app)/studio/ads/AssistantPub';

/**
 * Ce que la fenêtre AFFICHE · pas ce que le fichier mentionne.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Trois fois de suite, le même défaut a traversé des gardes verts :
 *
 * 1. le composeur à plat n'avait plus de bouton · le garde vérifiait que
 *    `setAvance` existait quelque part ;
 * 2. l'assistant était monté sous un `hidden` · le garde vérifiait que
 *    `setAssistant` apparaissait dans un `onClick` ;
 * 3. l'échec de génération s'affichait derrière la fenêtre qui le provoquait ·
 *    aucun garde ne regardait ce qui était visible.
 *
 * À chaque fois j'ai vérifié qu'un APPEL était présent, jamais qu'un RÉSULTAT
 * était lisible. Le premier garde budget écrit ici est tombé dans le même
 * piège : muter la condition en `{false && (` le laissait vert, parce que
 * `p.budget` restait écrit dans le corps mort.
 *
 * On rend donc le composant et on lit le HTML. C'est la seule vérification que
 * cette famille de défauts ne sait pas contourner · un bloc mort ne produit
 * aucun texte.
 *
 * Pas de DOM ici · `renderToStaticMarkup` suffit, on ne clique pas.
 */

const ETAT = {
  productId: '', aPhotoProduit: false, aDesProduits: false,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

function rendu(o: { erreur?: string; busy?: boolean; budget?: { resume: string; bloque: boolean } | null } = {}): string {
  return renderToStaticMarkup(
    <AssistantPub
      ouvert
      onFermer={() => {}}
      etat={ETAT}
      produits={[]}
      libelleGabarit={() => 'Bénéfices'}
      gabaritsDispo={['benefits'] as AdTemplate[]}
      onProduit={() => {}} onGabarit={() => {}} onAngle={() => {}} onOffre={() => {}}
      onDirection={() => {}} onMode={() => {}} onNombre={() => {}} onMoteur={() => {}}
      onGenerer={() => {}}
      busy={o.busy ?? false}
      erreur={o.erreur ?? ''}
      budget={o.budget ?? null}
    />,
  );
}

describe('la fenêtre dit ce qui s’est passé', () => {
  it('affiche l’échec de la génération', () => {
    // Le défaut rapporté, mot pour mot : « les images ne se génèrent pas,
    // aucun résultat ». L'explication existait · elle était sur la page, sous
    // la fenêtre qui recouvre l'écran.
    const html = rendu({ erreur: 'Plafond de dépense atteint · 9.84 $ engagés sur 10.00 $.' });
    expect(html).toContain('Plafond de dépense atteint');
    expect(html, 'l’échec n’est pas annoncé comme tel').toContain('n’a rien produit');
  });

  it('n’invente pas d’échec quand il n’y en a pas', () => {
    // Un bandeau rouge permanent apprendrait à ne plus le lire · c'est ainsi
    // qu'un vrai échec finit par passer inaperçu.
    expect(rendu()).not.toContain('n’a rien produit');
  });

  it('ne montre pas l’échec précédent pendant qu’on relance', () => {
    // Pendant la relance, l'échec d'avant est faux · et il occuperait la place
    // du message qui dit que ça travaille.
    const html = rendu({ erreur: 'Le service n’a pas répondu.', busy: true });
    expect(html).not.toContain('n’a rien produit');
    expect(html, 'rien ne dit que la génération est en cours').toContain('groupes de trois');
  });
});

describe('le plafond de dépense se voit avant de payer', () => {
  it('un plafond ATTEINT s’annonce dès le premier écran', () => {
    // C'est un refus certain : aucune image ne partira, quels que soient les
    // cinq écrans. Le dire à la fin ferait remplir un formulaire pour rien.
    //
    // La fenêtre s'ouvre sur « Le produit » · c'est donc bien le premier écran
    // qu'on rend ici, sans avoir cliqué.
    //
    // Deux endroits le montrent · le chiffre à côté du bouton, et la raison du
    // refus sous lui. C'est volontaire, et ça a une conséquence sur ce garde :
    // couper l'un des deux le laisse vert, parce que l'information reste
    // lisible. Il ne tombe que si le plafond disparaît des DEUX · vérifié.
    // C'est la bonne granularité : il garde ce qui se voit, pas par quel
    // chemin ça s'affiche.
    const html = rendu({ budget: { resume: 'Plafond atteint · 10.00 $ sur 10.00 $. Plus aucune requête payante ne part.', bloque: true } });
    expect(html).toContain('Plafond atteint');
  });

  it('un plafond NON atteint ne s’affiche pas dès le premier écran', () => {
    // Il appartient à l'écran du volume · c'est là qu'il aide à décider. Plus
    // tôt, ce n'est qu'un chiffre de plus sur un écran qui en a déjà.
    const html = rendu({ budget: { resume: '2.40 $ dépensés sur un plafond de 10.00 $.', bloque: false } });
    expect(html).not.toContain('2.40 $');
  });

  it('sans plafond lisible, la fenêtre ne prétend rien', () => {
    // On n'a pas toujours pu lire la base · inventer « 0 $ sur 10 $ » ferait
    // croire à une marge qu'on ne connaît pas.
    expect(rendu({ budget: null })).not.toContain('plafond');
  });
});
