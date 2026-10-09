import { describe, it, expect } from 'vitest';
import { decisionDeverrouillage, decisionRepriseVerrou, porteVisionEssai } from '../src/engagement-essai';

/**
 * E4 · règles pures de la contre-recette Codex sur 150c17c.
 *
 *  · `porteVisionEssai` · l'ORDRE de la porte de tout contrôle visuel d'une
 *    commande d'essai : décision complète → fournisseur → interrupteur →
 *    engagement → appel. Un appel n'est jamais permis sans qu'un engagement
 *    le couvre ou soit d'abord écrit ;
 *  · `decisionRepriseVerrou` · un verrou n'est repris que si la mort de son
 *    détenteur est ÉTABLIE (même hôte, même démarrage, même espace de PID,
 *    PID absent) · jamais sur l'âge, qui n'est même pas une entrée ;
 *  · `decisionDeverrouillage` · retrait manuel seulement après arrêt vérifié.
 */

const ici = { hote: 'outils', demarrage: 'boot-1', pidns: 'pid:[1]' };

describe('porteVisionEssai', () => {
  const base = { decisionLancer: true, fournisseur: true, capacitesCoupees: [] as string[], engagementCouvrant: false };
  it('décision complète négative ⇒ aucun appel, avant tout le reste', () => {
    expect(porteVisionEssai({ ...base, decisionLancer: false, fournisseur: false, capacitesCoupees: ['controle_visuel'] })).toEqual({ appeler: false, etape: 'decision' });
  });
  it('fournisseur absent ⇒ aucun appel', () => {
    expect(porteVisionEssai({ ...base, fournisseur: false })).toEqual({ appeler: false, etape: 'fournisseur' });
  });
  it('interrupteur coupé ⇒ aucun appel, même avec un engagement qui couvre (rien n’est engagé de plus)', () => {
    expect(porteVisionEssai({ ...base, capacitesCoupees: ['controle_visuel'], engagementCouvrant: true })).toEqual({ appeler: false, etape: 'interrupteur' });
    expect(porteVisionEssai({ ...base, capacitesCoupees: ['controle_visuel'] })).toEqual({ appeler: false, etape: 'interrupteur' });
  });
  it('autorisé sans engagement couvrant ⇒ ENGAGER d’abord ; couvert par la passe ⇒ appel direct', () => {
    expect(porteVisionEssai(base), 'un appel autorisé sans engagement au registre').toEqual({ appeler: true, engager: true });
    expect(porteVisionEssai({ ...base, engagementCouvrant: true })).toEqual({ appeler: true, engager: false });
  });
});

describe('decisionRepriseVerrou', () => {
  const d = { ...ici, pid: 42 };
  it('même hôte, même démarrage, même espace de PID, PID absent ⇒ repris', () => {
    expect(decisionRepriseVerrou({ detenteur: d, ici, pidVivant: false })).toEqual({ reprendre: true });
  });
  it('PID vivant ⇒ jamais repris', () => {
    expect(decisionRepriseVerrou({ detenteur: d, ici, pidVivant: true })).toEqual({ reprendre: false, motif: 'vivant' });
  });
  it.each([
    ['autre hôte', { hote: 'autre' }],
    ['machine redémarrée (autre démarrage) · la mort n’est pas prouvée si le registre est partagé', { demarrage: 'boot-2' }],
    ['autre espace de PID (autre `docker compose run`)', { pidns: 'pid:[2]' }],
    ['espace de PID inconnu (ancien format)', { pidns: '' }],
    ['démarrage inconnu', { demarrage: 'inconnu' }],
  ] as const)('%s, PID absent ici ⇒ insondable, jamais repris', (_n, x) => {
    expect(decisionRepriseVerrou({ detenteur: { ...d, ...x }, ici, pidVivant: false })).toEqual({ reprendre: false, motif: 'insondable' });
  });
  it('ici inconnu (hors Linux) ⇒ jamais repris', () => {
    expect(decisionRepriseVerrou({ detenteur: { ...d, pidns: 'inconnu' }, ici: { ...ici, pidns: 'inconnu' }, pidVivant: false })).toEqual({ reprendre: false, motif: 'insondable' });
  });
  it('contenu illisible ⇒ jamais repris', () => {
    expect(decisionRepriseVerrou({ detenteur: null, ici, pidVivant: false })).toEqual({ reprendre: false, motif: 'illisible' });
  });
});

describe('decisionDeverrouillage', () => {
  const insondable = { reprendre: false as const, motif: 'insondable' as const };
  it('détenteur vivant ⇒ refus, quoi qu’on confirme', () => {
    expect(decisionDeverrouillage({ reprise: { reprendre: false, motif: 'vivant' }, autresCommandes: 0, confirmation: 'j', jeton: 'j' })).toEqual({ retirer: false, motif: 'vivant' });
  });
  it('autres commandes connectées ⇒ refus', () => {
    expect(decisionDeverrouillage({ reprise: insondable, autresCommandes: 2, confirmation: 'j', jeton: 'j' })).toEqual({ retirer: false, motif: 'autres_commandes' });
  });
  it('sans confirmation, ou confirmation d’un autre verrou ⇒ refus', () => {
    expect(decisionDeverrouillage({ reprise: insondable, autresCommandes: 0, confirmation: null, jeton: 'j' })).toEqual({ retirer: false, motif: 'confirmation_absente' });
    expect(decisionDeverrouillage({ reprise: insondable, autresCommandes: null, confirmation: 'ancien', jeton: 'j' })).toEqual({ retirer: false, motif: 'confirmation_autre' });
  });
  it('confirmation du verrou actuel, aucune commande connue ⇒ retrait (connexions non vérifiables : dit à l’écran)', () => {
    expect(decisionDeverrouillage({ reprise: insondable, autresCommandes: 0, confirmation: 'j', jeton: 'j' })).toEqual({ retirer: true });
    expect(decisionDeverrouillage({ reprise: { reprendre: false, motif: 'illisible' }, autresCommandes: null, confirmation: 'j', jeton: 'j' })).toEqual({ retirer: true });
  });
});
