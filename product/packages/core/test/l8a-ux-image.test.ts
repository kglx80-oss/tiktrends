import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  JETONS_COULEUR, PAIRES_TEXTE_MESUREES, ARRETS_DEGRADE_ACCENT, ratioContraste, ratioPaire, seuilContraste, SEUIL_AA_TEXTE,
  raisonEpinglage, raisonAssociation, raisonAjoutTexte, calqueApresRetrait, TAILLE_CHAMP_MIN_PX,
} from '../src';

/**
 * L8-A · règles d'interface des écrans image, produit, textes et éditeur.
 * Contraste : le tableau MESURÉ du module est recalculé sur les jetons RÉELS
 * de `packages/ui/tokens.css` · un jeton qui change, ou un ratio recopié de
 * travers, fait tomber la garde avec la paire en cause.
 */

const CSS = readFileSync(join(__dirname, '../../ui/tokens.css'), 'utf8');
const jetonCss = (nom: string) => new RegExp(`--${nom}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS)?.[1]?.toLowerCase() ?? null;

describe('contraste · jetons et paires mesurées', () => {
  it('les jetons du module sont ceux de tokens.css', () => {
    for (const [nom, hex] of Object.entries(JETONS_COULEUR)) expect(jetonCss(nom), `jeton --${nom}`).toBe(hex);
    const degrade = /--grad-accent:\s*linear-gradient\([^,]+,\s*(#[0-9a-f]{6})[^,]*,\s*(#[0-9a-f]{6})/i.exec(CSS);
    expect(degrade?.slice(1, 3).map((x) => x.toLowerCase())).toEqual([...ARRETS_DEGRADE_ACCENT]);
  });

  it('chaque ratio écrit est le ratio recalculé, et passe AA', () => {
    for (const p of PAIRES_TEXTE_MESUREES) {
      const r = ratioPaire(p);
      expect(Math.abs(r - p.ratio), `ratio écrit faux pour ${p.texte} sur ${p.fond} (recalculé ${r})`).toBeLessThanOrEqual(0.01);
      expect(r, `contraste insuffisant pour ${p.texte} sur ${p.fond} · ${p.usage}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });

  it('formule WCAG · blanc sur noir 21, identique 1, sens indifférent', () => {
    expect(ratioContraste('#ffffff', '#000000')).toBe(21);
    expect(ratioContraste('#9a8a98', '#9a8a98')).toBe(1);
    expect(ratioContraste('#1c121b', '#f6eef4')).toBe(ratioContraste('#f6eef4', '#1c121b'));
    expect(seuilContraste(24, false)).toBe(3);
    expect(seuilContraste(19, true)).toBe(3);
    expect(seuilContraste(16, true)).toBe(4.5);
  });
});

describe('états · prochaine action dite quand un geste est bloqué', () => {
  it('épinglage', () => {
    expect(raisonEpinglage({ peutModifier: true, enCours: false, produitChoisi: true, photoChoisie: false })).toBe('Choisis d’abord une photo.');
    expect(raisonEpinglage({ peutModifier: false, enCours: false, produitChoisi: true, photoChoisie: true })).toMatch(/consulter/);
    expect(raisonEpinglage({ peutModifier: true, enCours: false, produitChoisi: true, photoChoisie: true })).toBeNull();
  });

  it('association · nomme tout ce qui manque, fichier compris', () => {
    const b = { peutModifier: true, briefPresent: true, enCours: false, fichier: '', role: 'style', portee: 'background' };
    expect(raisonAssociation(b)).toBe('Choisis un fichier.');
    expect(raisonAssociation({ ...b, role: '', portee: '' })).toBe('Choisis un fichier, un rôle et une portée.');
    expect(raisonAssociation({ ...b, fichier: 'a1', portee: '' })).toBe('Choisis une portée.');
    expect(raisonAssociation({ ...b, fichier: 'a1' })).toBeNull();
    expect(raisonAssociation({ ...b, briefPresent: false })).toMatch(/pas de brief/);
  });

  it('ajout de texte', () => {
    const b = { peutEcrire: true, briefPresent: true, enCours: false, texte: '   ' };
    expect(raisonAjoutTexte(b)).toBe('Écris un texte pour pouvoir l’ajouter.');
    expect(raisonAjoutTexte({ ...b, texte: 'Fini les boutons' })).toBeNull();
    expect(raisonAjoutTexte({ ...b, texte: 'x', briefPresent: false })).toMatch(/pas de brief/);
  });

  it('focus après le retrait d’un calque · même rang, sinon le dernier, sinon rien', () => {
    expect(calqueApresRetrait(['a', 'b', 'c'], 'b')).toBe('c');
    expect(calqueApresRetrait(['a', 'b', 'c'], 'c')).toBe('b');
    expect(calqueApresRetrait(['a'], 'a')).toBeNull();
    expect(calqueApresRetrait(['a', 'b'], 'zz')).toBe('a');
  });

  it('champs à 16 px au moins', () => expect(TAILLE_CHAMP_MIN_PX).toBe(16));
});
