import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import type { AdTemplate } from '@tiktrends/ai';
import { AssistantPub, EtapeMessage, EtapeVolume } from '../app/(app)/studio/ads/AssistantPub';

/**
 * Ce que la fenêtre EXPOSE au doigt et à l'assistance · lu dans le HTML rendu.
 *
 * ── Le trou que ça bouche ────────────────────────────────────────────────────
 *
 * `assistant-cibles-tactiles.test.tsx` garde la croix et les pastilles d'étape
 * (l'en-tête). Il ne voit RIEN des gélules de sélection (`pastille()` · type de
 * pub, nombre de visuels) ni des deux boutons du pied (Retour, Suivant/Générer)
 * · toutes ces cibles vivaient sous `CIBLE_TACTILE_MIN`, atteignables au doigt
 * mais trop petites. On rend et on LIT chaque style, pas un compteur global.
 *
 * Et les gélules d'un même choix forment un groupe · sans nom de groupe,
 * l'assistance les annonce une à une sans dire à quoi elles répondent. On lit
 * le `role=group` nommé.
 *
 * L'étape 1 seule sort du rendu complet · « message » et « volume » se rendent
 * en montant leur sous-composant, faute de pouvoir cliquer en rendu statique.
 */

const ETAT = {
  productId: '', aPhotoProduit: false, aDesProduits: false,
  angle: '', offre: '', gabarits: ['benefits'] as readonly string[],
  direction: '', mode: 'entiere', nombre: 2, moteur: 'nano-banana-2',
};

function props() {
  return {
    ouvert: true as const,
    onFermer: () => {},
    etat: ETAT,
    produits: [] as Array<{ id: string; name: string }>,
    libelleGabarit: () => 'Bénéfices',
    selecteurStyle: <div>sélecteur de style</div>,
    conseilMoteurs: { recommande: null, deconseilles: [], lignes: {}, resume: '' },
    gabaritsDispo: ['benefits'] as AdTemplate[],
    onProduit: () => {}, onGabarit: () => {}, onAngle: () => {}, onOffre: () => {},
    onDirection: () => {}, onMode: () => {}, onNombre: () => {}, onMoteur: () => {},
    onGenerer: () => {},
    busy: false,
    erreur: '',
    budget: null,
  };
}

const minH = `min-height:${CIBLE_TACTILE_MIN}px`;
const minW = `min-width:${CIBLE_TACTILE_MIN}px`;

/** Le tag ouvrant du premier `<button>` dont le CONTENU contient `texte`. */
function boutonAvecTexte(html: string, texte: string): string | null {
  const parts = html.split('<button').slice(1);
  const p = parts.find((x) => {
    const fin = x.indexOf('</button>');
    return fin > -1 && x.slice(0, fin).includes(texte);
  });
  return p ? p.slice(0, p.indexOf('>')) : null;
}

/** Les tags ouvrants des `<button>` en gélule (border-radius:999px). */
function gelules(html: string): string[] {
  return html.split('<button').slice(1)
    .map((b) => b.slice(0, b.indexOf('>')))
    .filter((t) => t.includes('border-radius:999px'));
}

describe('AssistantPub · le pied se touche au doigt', () => {
  const html = renderToStaticMarkup(<AssistantPub {...props()} />);

  it('le bouton Retour atteint la hauteur de cible', () => {
    const t = boutonAvecTexte(html, 'Retour');
    expect(t, 'bouton Retour introuvable').not.toBeNull();
    expect(t!, `Retour sous la cible tactile · ${t}`).toContain(minH);
  });

  it('le bouton d’avancement (Suivant/Générer) atteint la hauteur de cible', () => {
    const t = boutonAvecTexte(html, 'Suivant');
    expect(t, 'bouton d’avancement introuvable').not.toBeNull();
    expect(t!, `avancement sous la cible tactile · ${t}`).toContain(minH);
  });
});

describe('AssistantPub · les gélules de sélection se touchent au doigt', () => {
  it('le type de pub · chaque gélule atteint la cible dans ses DEUX dimensions', () => {
    const html = renderToStaticMarkup(<EtapeMessage p={props()} />);
    const g = gelules(html);
    expect(g.length, 'aucune gélule de type de pub rendue').toBeGreaterThan(0);
    for (const t of g) {
      expect(t, `gélule trop basse · ${t}`).toContain(minH);
      expect(t, `gélule trop étroite · ${t}`).toContain(minW);
    }
  });

  it('le nombre de visuels · chaque gélule atteint la cible dans ses DEUX dimensions', () => {
    const html = renderToStaticMarkup(<EtapeVolume p={props()} />);
    const g = gelules(html);
    // Six choix de nombre · 1, 2, 3, 4, 6, 8.
    expect(g.length, 'gélules de nombre absentes').toBeGreaterThanOrEqual(6);
    for (const t of g) {
      expect(t, `gélule de nombre trop basse · ${t}`).toContain(minH);
      expect(t, `gélule de nombre trop étroite · ${t}`).toContain(minW);
    }
  });
});

describe('AssistantPub · un choix de gélules est un groupe nommé', () => {
  it('« Type de pub » est un role=group qui porte son libellé', () => {
    const html = renderToStaticMarkup(<EtapeMessage p={props()} />);
    expect(html, 'le choix « type de pub » n’est pas un groupe').toContain('role="group"');
    expect(html, 'le groupe « type de pub » n’a pas de nom accessible')
      .toContain('aria-label="Type de pub · requis, au moins un"');
  });

  it('« Combien de visuels » est un role=group qui porte son libellé', () => {
    const html = renderToStaticMarkup(<EtapeVolume p={props()} />);
    expect(html, 'le choix du nombre n’est pas un groupe').toContain('role="group"');
    expect(html, 'le groupe du nombre n’a pas de nom accessible')
      .toContain('aria-label="Combien de visuels"');
  });
});
