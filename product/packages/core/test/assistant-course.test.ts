import { describe, it, expect } from 'vitest';
import {
  MESSAGE_LANCEMENT_INCERTAIN, MESSAGE_DEVIS_INCONNU, peutConfirmerLancement,
  signatureChoixDevis, verdictDevisRecu, devisIndicatifImage,
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

describe('devis INDICATIF · un CALCUL (0 $, aucune action serveur) atteignable depuis un projet neuf', () => {
  // Montants de grille utilisés par les tests · le prix et la borne viennent du
  // serveur (prixImage, borneControleVisionParImageMicros), ici on ASSEMBLE.
  const prix = { credits: 4, usdMicros: 600_000 };
  const borne = 147_000;

  it('image seule (relecture indisponible) ⇒ une ligne, total = prix de l’image', () => {
    const d = devisIndicatifImage({ prix, relectureDisponible: false, relectureAuto: true, borneRelectureParImageUsdMicros: borne });
    expect(d.lignes.map((l) => l.cle)).toEqual(['image']);
    expect(d.usdMicros).toBe(600_000);
    expect(d.credits).toBe(4);
    expect(d.lignes[0]!.borne).toBe(true);
  });

  it('relecture disponible ET cochée ⇒ deux lignes, total = image + borne de relecture, crédits inchangés', () => {
    const d = devisIndicatifImage({ prix, relectureDisponible: true, relectureAuto: true, borneRelectureParImageUsdMicros: borne });
    expect(d.lignes.map((l) => l.cle)).toEqual(['image', 'relecture']);
    expect(d.usdMicros).toBe(600_000 + 147_000);
    // la relecture est à 0 crédit · le prix en crédits de l'offre ne change pas.
    expect(d.credits).toBe(4);
  });

  it('relecture décochée ⇒ la ligne de relecture disparaît, le total RETOMBE à l’image seule', () => {
    const avec = devisIndicatifImage({ prix, relectureDisponible: true, relectureAuto: true, borneRelectureParImageUsdMicros: borne });
    const sans = devisIndicatifImage({ prix, relectureDisponible: true, relectureAuto: false, borneRelectureParImageUsdMicros: borne });
    expect(avec.usdMicros).toBeGreaterThan(sans.usdMicros);
    expect(sans.lignes.map((l) => l.cle)).toEqual(['image']);
    expect(sans.usdMicros).toBe(600_000);
  });

  it('borne de relecture nulle ⇒ jamais de ligne de relecture (rien à chiffrer), aucune valeur inventée', () => {
    const d = devisIndicatifImage({ prix, relectureDisponible: true, relectureAuto: true, borneRelectureParImageUsdMicros: 0 });
    expect(d.lignes.map((l) => l.cle)).toEqual(['image']);
    expect(d.usdMicros).toBe(600_000);
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · MESSAGE_LANCEMENT_INCERTAIN remis à « rien n’a été débité » → « le message… » tombe (toBe + not.toMatch).
 *  · peutConfirmerLancement renvoyant toujours true → « on ne peut plus confirmer » tombe.
 *  · verdictDevisRecu ignorant la signature (retour accepte:true) → « choix changés » tombe (perime).
 *  · verdictDevisRecu ignorant devisReluId ≠ devisCreeId → « dernier devis du projet » tombe (non-correle).
 *  · verdictDevisRecu ignorant la séquence → « seconde demande obsolète » tombe.
 *  · devisIndicatifImage ajoutant toujours la ligne de relecture (ignorant relectureAuto/disponible) → « décochée » et « image seule » tombent.
 *  · devisIndicatifImage comptant la borne de relecture en crédits → « crédits inchangés » tombe.
 */
