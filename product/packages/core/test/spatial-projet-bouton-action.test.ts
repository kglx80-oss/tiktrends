import { describe, expect, it } from 'vitest';
import { TEXTES_HORS_LIGNE, etatBoutonAction, focusAReplacer, premiereCibleFocus, raisonFermeture, type EntreeBoutonAction } from '../src';

/**
 * La règle unique du bouton d'action serveur · chaque écran qui la recopiait
 * (Export #1024, Éditeur #1027, atelier vidéo #1031, fiche #1032) est rejoué
 * ici comme ORACLE · sa formule d'avant, recopiée telle quelle, doit donner
 * les mêmes attributs que la règle pour TOUTES les combinaisons d'état. Une
 * règle qui dérive change un écran · ce test le dit, avec le nom de l'écran.
 */

type Attendu = { disabled: boolean; ariaDisabled: boolean; ariaBusy: boolean; aspectFerme: boolean; clicPermis: boolean };
const B = [false, true];

/** Les formules recopiées des écrans AVANT la brique (le `|| undefined` des attributs retiré). */
const ORACLES: Array<{ ecran: string; entree: (presse: boolean, autre: boolean, ferme: boolean) => EntreeBoutonAction; avant: (presse: boolean, autre: boolean, ferme: boolean) => Attendu | null }> = [
  {
    // Export · `disabled: !pret || (encours !== null && encours !== format)` · le pressé n'est jamais fermé par `!pret` (on ne presse pas un bouton fermé).
    ecran: 'Export · PNG / JPEG',
    entree: (presse, autre, ferme) => ({ presse, occupe: presse || autre, ferme }),
    avant: (presse, autre, ferme) => (presse && ferme ? null : { disabled: ferme || (autre && !presse), ariaDisabled: presse, ariaBusy: presse, aspectFerme: false, clicPermis: !presse && !autre && !ferme }),
  },
  {
    // Éditeur · « Enregistrer » · `aria-disabled={!enregistrable}`, `style={enregistrable || enCours ? undefined : FERME}`, jamais `disabled`.
    ecran: 'Éditeur · Enregistrer',
    entree: (presse, _autre, ferme) => ({ presse, ferme: ferme || presse, focalisable: 'tout' }),
    avant: (presse, autre, ferme) => {
      if (autre) return null; // un seul geste d'enregistrement · pas d'« autre » action
      const enregistrable = !ferme && !presse;
      return { disabled: false, ariaDisabled: !enregistrable, ariaBusy: presse, aspectFerme: !(enregistrable || presse), clicPermis: enregistrable };
    },
  },
  {
    // Éditeur · « Restaurer » · `disabled={!permis && !enCours}`, `aria-disabled`/`aria-busy` = enCours.
    ecran: 'Éditeur · Restaurer',
    entree: (presse, _autre, ferme) => ({ presse, ferme }),
    avant: (presse, autre, ferme) => (autre ? null : { disabled: ferme && !presse, ariaDisabled: presse, ariaBusy: presse, aspectFerme: false, clicPermis: !ferme && !presse }),
  },
  {
    // Vidéo · geste du plan · `aria-disabled={!gesteOuvert}`, `aria-busy={gestePresse}`, `style={gesteOuvert || gestePresse ? undefined : FERME}`.
    ecran: 'Vidéo · geste du plan',
    entree: (presse, autre, ferme) => ({ presse, occupe: presse || autre, ferme, focalisable: 'tout' }),
    avant: (presse, autre, ferme) => {
      const enCours = presse || autre;
      const ouvert = !ferme && !enCours;
      return { disabled: false, ariaDisabled: !ouvert, ariaBusy: presse, aspectFerme: !(ouvert || presse), clicPermis: ouvert };
    },
  },
  {
    // Vidéo · « Proposer un storyboard » · `disabled={!dispo && enCours !== 'storyboard'}`, `aria-disabled={!!enCours}`, FERME si un autre geste travaille.
    ecran: 'Vidéo · storyboard, assembler, enregistrer le changement',
    entree: (presse, autre, ferme) => ({ presse, occupe: presse || autre, ferme, focalisable: 'occupe' }),
    avant: (presse, autre, ferme) => {
      const enCours = presse || autre;
      return { disabled: ferme && !presse, ariaDisabled: enCours, ariaBusy: presse, aspectFerme: enCours && !presse, clicPermis: !enCours && !ferme };
    },
  },
  {
    // Jarvis · « Envoyer » · `aria-disabled={envoiFerme}`, `style={envoiFerme && enCours !== 'message' ? FERME : undefined}`.
    ecran: 'Jarvis · Envoyer',
    entree: (presse, autre, ferme) => ({ presse, occupe: presse || autre, ferme, focalisable: 'tout' }),
    avant: (presse, autre, ferme) => {
      const envoiFerme = presse || autre || ferme;
      return { disabled: false, ariaDisabled: envoiFerme, ariaBusy: presse, aspectFerme: envoiFerme && !presse, clicPermis: !envoiFerme };
    },
  },
  {
    // Fiche · `pendantAction` (#1032) · `disabled: !presse && (ferme || occupe)`.
    ecran: 'Fiche · Brief, Propositions, Créations',
    entree: (presse, autre, ferme) => ({ presse, occupe: presse || autre, ferme }),
    avant: (presse, autre, ferme) => ({ disabled: !presse && (ferme || autre), ariaDisabled: presse, ariaBusy: presse, aspectFerme: false, clicPermis: !presse && !autre && !ferme }),
  },
  {
    // Un bouton voisin, fermé pendant l'action d'un autre (« Annuler », « Ne rien changer ») · `disabled={!!enCours}`.
    ecran: 'voisin fermé pendant l’action',
    entree: (_presse, autre, ferme) => ({ occupe: autre, ferme }),
    avant: (presse, autre, ferme) => (presse ? null : { disabled: autre || ferme, ariaDisabled: false, ariaBusy: false, aspectFerme: false, clicPermis: !autre && !ferme }),
  },
];

describe('bouton d’action serveur · la règle unique reproduit chaque écran', () => {
  for (const o of ORACLES) {
    it(`${o.ecran} · mêmes attributs qu’avant la brique, pour chaque état`, () => {
      const ecarts: string[] = [];
      for (const presse of B) for (const autre of B) for (const ferme of B) {
        const avant = o.avant(presse, autre, ferme);
        if (!avant) continue;
        const apres = etatBoutonAction(o.entree(presse, autre, ferme));
        if (JSON.stringify(apres) !== JSON.stringify(avant)) ecarts.push(`presse=${presse} autre=${autre} ferme=${ferme} · avant ${JSON.stringify(avant)} · règle ${JSON.stringify(apres)}`);
      }
      expect(ecarts, `${o.ecran} · la règle change l’écran`).toEqual([]);
    });
  }

  it('le bouton pressé n’est JAMAIS `disabled` (il garderait le focus sinon) et porte seul `aria-busy`', () => {
    for (const focalisable of ['aucun', 'occupe', 'tout'] as const) for (const ferme of B) {
      const e = etatBoutonAction({ presse: true, occupe: true, ferme, focalisable });
      expect(e.disabled, `pressé, ${focalisable}, ferme=${ferme} · disabled rendrait le focus au document`).toBe(false);
      expect(e.ariaBusy, `pressé, ${focalisable} · aria-busy manquant`).toBe(true);
      expect(e.ariaDisabled, `pressé, ${focalisable} · aria-disabled manquant`).toBe(true);
      expect(e.clicPermis, `pressé, ${focalisable} · le second clic doit être ignoré`).toBe(false);
      expect(etatBoutonAction({ presse: false, occupe: true, ferme, focalisable }).ariaBusy, 'seul le pressé dit qu’il travaille').toBe(false);
    }
  });
});

describe('replacement du focus · deux modes voulus', () => {
  it('`toujours` (Éditeur, fiche) · replace même si le focus est encore sur un élément vivant', () => {
    expect(focusAReplacer('toujours', { estCorps: false, connecte: true })).toBe(true);
    expect(focusAReplacer('toujours', null)).toBe(true);
  });
  it('`si-perdu` (atelier vidéo) · seulement si le focus est sur <body>, sur un élément retiré, ou absent', () => {
    expect(focusAReplacer('si-perdu', { estCorps: false, connecte: true }), 'si-perdu · un focus repris (aperçu, message) doit être laissé').toBe(false);
    expect(focusAReplacer('si-perdu', { estCorps: true, connecte: true }), 'si-perdu · un focus tombé sur <body> doit être replacé').toBe(true);
    expect(focusAReplacer('si-perdu', { estCorps: false, connecte: false }), 'si-perdu · un focus sur un élément retiré doit être replacé').toBe(true);
    expect(focusAReplacer('si-perdu', null)).toBe(true);
  });
  it('la cible · le premier candidat présent et ouvert, sinon aucun', () => {
    expect(premiereCibleFocus([{ present: false, disabled: false }, { present: true, disabled: true }, { present: true, disabled: false }])).toBe(2);
    expect(premiereCibleFocus([{ present: true, disabled: true }])).toBe(-1);
    expect(premiereCibleFocus([])).toBe(-1);
  });
});

describe('raisonFermeture · la phrase écrite à côté d’un bouton fermé', () => {
  it('hors ligne passe avant toute autre raison (le geste ne partirait pas)', () => {
    expect(raisonFermeture(true, 'Choisis un fichier.')).toBe(TEXTES_HORS_LIGNE.bouton);
    expect(raisonFermeture(true)).toBe(TEXTES_HORS_LIGNE.bouton);
  });
  it('en ligne · la première raison donnée, dans l’ordre de l’écran ; les vides sont sautés', () => {
    expect(raisonFermeture(false, null, false, '', 'Choisis un rôle.', 'Choisis une portée.')).toBe('Choisis un rôle.');
  });
  it('rien ne ferme le bouton · aucune phrase', () => {
    expect(raisonFermeture(false)).toBeNull();
    expect(raisonFermeture(false, null, undefined, false)).toBeNull();
  });
});
