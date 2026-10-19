import { describe, it, expect } from 'vitest';
import {
  MESSAGE_LANCEMENT_INCERTAIN, MESSAGE_DEVIS_INCONNU, peutConfirmerLancement,
  signatureChoixDevis, verdictDevisRecu,
} from '../src/studios/ux/assistant-course';
import type { SaisieFormat } from '../src/studios/ux/assistant-projet';

/**
 * Raccord V5 · Lot 2c · réponses de mutation PERDUES et COURSES RÉSEAU du devis,
 * au RÉSULTAT (ce que les fonctions pures RENDENT).
 *
 *  · une réponse perdue sur une mutation PAYANTE promet l'INCERTITUDE (pas une
 *    absence de débit) et verrouille · `peutConfirmerLancement(true)` est faux ;
 *  · un devis reçu dont les choix affichés ont changé est REJETÉ (perime) ;
 *  · un devis relu qui n'est pas celui de LA demande est REJETÉ (non-correle) ;
 *  · une seconde demande rend la première OBSOLÈTE (séquence).
 *
 * Chaque assertion a été éprouvée par mutation (cf. note en fin de fichier).
 */

const saisie = (format: SaisieFormat['format'], relecture: boolean): SaisieFormat => ({ format, relectureAuto: relecture });

describe('réponse de mutation perdue · l’état honnête, jamais une fausse absence d’effet', () => {
  it('le message « lancement incertain » dit que le débit est incertain et exige un rechargement, jamais « rien n’a été débité »', () => {
    expect(MESSAGE_LANCEMENT_INCERTAIN).toBe(
      'La réponse du serveur n’a pas été reçue. Le lancement peut avoir été accepté et le débit est incertain. Recharge le projet pour consulter les tâches et le budget avant toute nouvelle tentative.',
    );
    expect(MESSAGE_LANCEMENT_INCERTAIN).toContain('le débit est incertain');
    expect(MESSAGE_LANCEMENT_INCERTAIN).not.toMatch(/rien n’a été (confirmé|débité)/);
  });

  it('le message « devis inconnu » dit l’état inconnu et invite à relire, sans promettre d’absence d’effet', () => {
    expect(MESSAGE_DEVIS_INCONNU).toBe('L’état du devis n’a pas pu être confirmé · relis le projet.');
    expect(MESSAGE_DEVIS_INCONNU).not.toMatch(/rien n’a été (deviser|devisé)/);
  });

  it('tant que l’état est incertain, on ne peut plus confirmer (la garde du bouton)', () => {
    expect(peutConfirmerLancement(false)).toBe(true);
    expect(peutConfirmerLancement(true)).toBe(false);
  });
});

describe('signature des choix · deux demandes identiques ont la même signature, un choix différent la change', () => {
  it('format et relecture entrent dans la signature', () => {
    expect(signatureChoixDevis(saisie('4:5', true))).toBe(signatureChoixDevis(saisie('4:5', true)));
    expect(signatureChoixDevis(saisie('4:5', true))).not.toBe(signatureChoixDevis(saisie('9:16', true)));
    expect(signatureChoixDevis(saisie('4:5', true))).not.toBe(signatureChoixDevis(saisie('4:5', false)));
  });
});

describe('verdict d’un devis reçu · courses réseau (promesses retardées / désordre)', () => {
  const base = {
    seqDemande: 2, seqCourant: 2,
    signatureDemande: signatureChoixDevis(saisie('9:16', true)),
    signatureAffichee: signatureChoixDevis(saisie('9:16', true)),
    devisCreeId: 'q-de-la-demande', devisReluId: 'q-de-la-demande',
  };

  it('correlé, à jour, demande courante ⇒ ACCEPTÉ', () => {
    expect(verdictDevisRecu(base)).toEqual({ accepte: true });
  });

  it('les choix affichés ont changé depuis la demande ⇒ REJETÉ (perime)', () => {
    const r = verdictDevisRecu({ ...base, signatureAffichee: signatureChoixDevis(saisie('4:5', true)) });
    expect(r).toEqual({ accepte: false, raison: 'perime' });
  });

  it('le devis relu n’est pas celui de LA demande (dernier devis du projet) ⇒ REJETÉ (non-correle)', () => {
    const r = verdictDevisRecu({ ...base, devisReluId: 'un-autre-devis' });
    expect(r).toEqual({ accepte: false, raison: 'non-correle' });
  });

  it('aucun devis relu ⇒ REJETÉ (non-correle), jamais accepté par défaut', () => {
    expect(verdictDevisRecu({ ...base, devisReluId: null })).toEqual({ accepte: false, raison: 'non-correle' });
  });

  it('une seconde demande a été lancée depuis (séquence dépassée) ⇒ la première est OBSOLÈTE', () => {
    const r = verdictDevisRecu({ ...base, seqDemande: 1, seqCourant: 2 });
    expect(r).toEqual({ accepte: false, raison: 'obsolete' });
  });

  it('l’obsolescence prime sur la péremption et la corrélation (ordre des rejets)', () => {
    const r = verdictDevisRecu({
      ...base, seqDemande: 1, seqCourant: 2,
      signatureAffichee: signatureChoixDevis(saisie('4:5', true)), devisReluId: 'un-autre-devis',
    });
    expect(r).toEqual({ accepte: false, raison: 'obsolete' });
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · MESSAGE_LANCEMENT_INCERTAIN remis à « rien n’a été débité » → « le message… » tombe (toBe + not.toMatch).
 *  · peutConfirmerLancement renvoyant toujours true → « on ne peut plus confirmer » tombe.
 *  · verdictDevisRecu ignorant la signature (retour accepte:true) → « choix changés » tombe (perime).
 *  · verdictDevisRecu ignorant devisReluId ≠ devisCreeId → « dernier devis du projet » tombe (non-correle).
 *  · verdictDevisRecu ignorant la séquence → « seconde demande obsolète » tombe.
 */
