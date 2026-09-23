import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerdictBadge } from '../components/VerdictBadge';
import { CarteCreative, type CarteCreativeProps } from '../components/CarteCreative';
import { FOND_PASTILLE_MEDIA } from '../components/ui';

/**
 * Axe 3 · cohérence visuelle du parcours Pubs IA (galerie → fiche →
 * modification → prévisualisation). Trois fonds divergeaient d'un écran à
 * l'autre pour un MÊME rôle · on les fait converger et on garde la convergence.
 *
 * 1. Le fond DERRIÈRE une créa affichée en `contain` · `var(--paper)` dans la
 *    carte de galerie, mais un `#0c080e` en dur dans la fiche · même token
 *    partout désormais.
 * 2. Le fond d'une PASTILLE posée sur la créa · `rgba(8,5,10,.72)` dans la
 *    galerie (carte + verdict), mais trois `rgba(0,0,0,.4x)` au hasard dans la
 *    fiche · une seule source, `FOND_PASTILLE_MEDIA`.
 * 3. Le SCRIM des deux fenêtres plein écran · la fiche posait `rgba(6,4,8,.82)`
 *    (teinté, convention des modales du dépôt) et la lightbox un `rgba(0,0,0,.8)`
 *    noir pur, alors qu'elle s'ouvre par-dessus la fiche · même scrim désormais.
 *
 * La galerie (CarteCreative, VerdictBadge) est RENDABLE · on lit le HTML, un
 * RÉSULTAT. La fiche vit dans `AdsStudio` (client volumineux à actions serveur,
 * non rendable) · garde par adoption de la source.
 */
const lire = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const STUDIO = lire('app/(app)/studio/ads/AdsStudio.tsx');
const CARTE = lire('components/CarteCreative.tsx');

const base: CarteCreativeProps = {
  media: { url: '/api/ad/x?r=4:5', aspect: '4 / 5' },
  titre: 'Une créa témoin',
  actionPrincipale: { cle: 'ouvrir', label: 'Ouvrir', onClick: () => {} },
};

describe('Parcours · 1 · le fond derrière une créa est le même token de la galerie à la fiche', () => {
  it('la carte de galerie pose la créa sur `var(--paper)`', () => {
    // Le rôle « fond de la piste média » · c'est le token de référence.
    expect(CARTE, 'la carte n’adopte plus var(--paper) pour sa zone média')
      .toContain("background: 'var(--paper)'");
  });

  it('la fiche pose sa grande prévisualisation sur le MÊME token · plus de `#0c080e` en dur', () => {
    expect(STUDIO, 'la zone média de la fiche n’adopte pas var(--paper)')
      .toContain("background: 'var(--paper)'");
    expect(STUDIO, 'un fond `#0c080e` en dur traîne encore dans la fiche')
      .not.toContain('#0c080e');
  });
});

describe('Parcours · 2 · une pastille sur média a une source de fond unique', () => {
  it('le pronostic de la carte de galerie rend le fond partagé (HTML)', () => {
    const h = renderToStaticMarkup(<CarteCreative {...base} performance={{ prediction: 82 }} />);
    expect(h, 'la pastille de pronostic ne porte pas le fond partagé')
      .toContain(`background:${FOND_PASTILLE_MEDIA}`);
  });

  it('le verdict en surimpression rend le même fond partagé (HTML)', () => {
    const h = renderToStaticMarkup(<VerdictBadge etat="gagnante" overlay />);
    expect(h, 'le verdict en surimpression ne porte pas le fond partagé')
      .toContain(`background:${FOND_PASTILLE_MEDIA}`);
  });

  it('la fiche adopte la source unique · plus aucun `rgba(0,0,0,.4x)` recopié', () => {
    expect(STUDIO, 'la fiche n’importe pas la source de fond partagée')
      .toContain('FOND_PASTILLE_MEDIA');
    // Les trois valeurs au hasard (sélecteur de cadre, « Format d’origine »,
    // compteur) ont disparu · elles passaient par la source unique.
    expect(STUDIO, 'un fond de pastille `rgba(0,0,0,.5)` traîne encore')
      .not.toContain('rgba(0,0,0,.5)');
    expect(STUDIO, 'un fond de pastille `rgba(0,0,0,.45)` traîne encore')
      .not.toContain('rgba(0,0,0,.45)');
  });
});

describe('Parcours · 3 · les deux fenêtres plein écran partagent un scrim teinté', () => {
  it('la fiche et la lightbox posent le MÊME scrim `rgba(6,4,8,.82)` · plus de noir pur', () => {
    // Les deux occurrences · le scrim de la fiche (déjà en place) et celui de la
    // lightbox (aligné) · même teinte magentée, convention des modales du dépôt.
    const occurrences = STUDIO.split("background: 'rgba(6,4,8,.82)'").length - 1;
    expect(occurrences, 'les deux scrims plein écran ne partagent pas la même teinte')
      .toBeGreaterThanOrEqual(2);
    // On vise le SCRIM (`background:`), pas les ombres portées qui gardent
    // légitimement un noir · le rôle diffère.
    expect(STUDIO, 'la lightbox garde un scrim noir pur `rgba(0,0,0,.8)`')
      .not.toContain("background: 'rgba(0,0,0,.8)'");
  });
});
