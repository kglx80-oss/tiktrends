import { describe, expect, it } from 'vitest';
import {
  cibleFocusApresGeste, INSTANT_FOCUS_VIDE, etatEchecStudio, messageHorsLigneStudio, CODES_ERREUR_STUDIO, DEFINITIONS_ERREUR_STUDIO,
  type InstantFocus,
} from '../src';

/**
 * L8-B · règles d'écran des projets (UX-02, UX-03), éprouvées au RÉSULTAT.
 * Les tableaux mesurés sont dans `studios/ux/projet-focus.ts` et `projet-etats.ts`.
 */

const i = (o: Partial<InstantFocus> = {}): InstantFocus => ({ ...INSTANT_FOCUS_VIDE, ...o });

describe('UX-02 · le focus suit ce qui vient d’apparaître', () => {
  it('un aperçu d’impact qui apparaît prend le focus · même si un message apparaît en même temps', () => {
    expect(cibleFocusApresGeste(i(), i({ apercu: true }))).toBe('apercu');
    expect(cibleFocusApresGeste(i(), i({ apercu: true, retour: 'r1' }))).toBe('apercu');
  });
  it('un NOUVEAU message de retour prend le focus · le même message ne le reprend pas', () => {
    expect(cibleFocusApresGeste(i({ apercu: true }), i({ retour: 'ok-1' }))).toBe('retour');
    expect(cibleFocusApresGeste(i({ retour: 'ok-1' }), i({ retour: 'err-2' }))).toBe('retour');
    expect(cibleFocusApresGeste(i({ retour: 'ok-1' }), i({ retour: 'ok-1' }))).toBe('rien');
  });
  it('un formulaire qui s’ouvre prend le focus ; refermé sans message, le focus revient au geste', () => {
    expect(cibleFocusApresGeste(i(), i({ formulaire: true }))).toBe('formulaire');
    expect(cibleFocusApresGeste(i({ formulaire: true }), i())).toBe('declencheur');
    expect(cibleFocusApresGeste(i({ apercu: true }), i())).toBe('declencheur');
  });
  it('refermé AVEC un message (enregistrement réussi) · le message l’emporte sur le retour au geste', () => {
    expect(cibleFocusApresGeste(i({ formulaire: true }), i({ retour: 'ok' }))).toBe('retour');
  });
  it('rien n’a changé (relecture périodique) · le focus ne bouge pas', () => {
    expect(cibleFocusApresGeste(i({ retour: 'x', apercu: true }), i({ retour: 'x', apercu: true }))).toBe('rien');
    expect(cibleFocusApresGeste(i(), i())).toBe('rien');
  });
});

describe('UX-03 · un échec dit un mot, puis la prochaine action', () => {
  it('chaque code d’erreur studio a un état · mot non vide, action nommée', () => {
    for (const c of CODES_ERREUR_STUDIO) {
      const e = etatEchecStudio(c);
      expect(e.mot.trim().length, c).toBeGreaterThan(0);
      expect(e.action, c).not.toBe('');
    }
  });
  it('conflit de version · le geste est RECHARGER, et c’est un bouton', () => {
    const e = etatEchecStudio('VERSION_CONFLICT');
    expect(e.action).toBe('recharger');
    expect(e.libelleAction).toBe('Recharger la version courante');
  });
  it('hors ligne · réessayer est un bouton ; un code inconnu est traité comme une panne réseau', () => {
    expect(etatEchecStudio('NETWORK')).toMatchObject({ mot: 'Hors ligne', action: 'reessayer', libelleAction: 'Réessayer' });
    expect(etatEchecStudio('INCONNU')).toEqual(etatEchecStudio('NETWORK'));
    expect(etatEchecStudio(null)).toEqual(etatEchecStudio('NETWORK'));
  });
  it('plafond atteint · on attend, aucun bouton ne relance une dépense', () => {
    expect(etatEchecStudio('BUDGET_EXCEEDED')).toMatchObject({ mot: 'Plafond atteint', action: 'attendre', libelleAction: null });
  });
  it('un geste qui quitte l’écran porte son lien · un geste de l’écran n’en porte pas', () => {
    for (const c of [...CODES_ERREUR_STUDIO, 'NETWORK'] as const) {
      const e = etatEchecStudio(c);
      if (e.action === 'se-reconnecter' || e.action === 'revenir-aux-projets') expect(e.lien, c).toMatch(/^\//);
      else expect(e.lien, c).toBeNull();
    }
  });
  it('les codes récupérables du contrat ont une action autre que « aucune »', () => {
    for (const c of CODES_ERREUR_STUDIO) if (DEFINITIONS_ERREUR_STUDIO[c].recoverable) expect(etatEchecStudio(c).action, c).not.toBe('aucune');
  });
  it('le message hors ligne dit ce qui n’a pas eu lieu, puis quoi faire, et que la saisie reste', () => {
    const m = messageHorsLigneStudio('creation');
    expect(m).toBe('Connexion perdue · rien n’a été créé. Vérifie ta connexion puis réessaie · ta saisie est conservée.');
    expect(messageHorsLigneStudio('commande')).toContain('rien n’a été modifié');
    for (const g of ['creation', 'enregistrement', 'chargement', 'proposition', 'export', 'commande'] as const) {
      expect(messageHorsLigneStudio(g)).not.toMatch(/—/);
      expect(messageHorsLigneStudio(g)).toContain('saisie est conservée');
    }
  });
});
