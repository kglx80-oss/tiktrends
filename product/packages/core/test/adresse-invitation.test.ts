import { describe, expect, it } from 'vitest';
import { adresseInvitationValide } from '../src';

/**
 * Une invitation vise UNE adresse · recette #1103 · « a@x.com, b@y.com » passait
 * la limite comme une seule demande et nodemailer l'envoyait à tous (relais).
 */
const CAS: Array<[string, boolean, string]> = [
  ['victime@exemple.test', true, 'adresse ordinaire'],
  ['prenom.nom+equipe@sous.domaine.fr', true, 'point, plus et sous-domaine'],
  ['a@x.test, b@y.test', false, 'virgule · deux destinataires'],
  ['a,b@x.test', false, 'virgule seule, un seul @ · nodemailer y lit deux destinataires'],
  ['a;b@x.test', false, 'point-virgule seul, un seul @'],
  ['a@x.test;b@y.test', false, 'point-virgule'],
  ['a@x.test b@y.test', false, 'espace'],
  ['a@x.test\nb@y.test', false, 'retour à la ligne'],
  ['a@x.test\r\nBcc: b@y.test', false, 'injection d’en-tête'],
  ['Nom <a@x.test>', false, 'chevrons (adresse avec nom)'],
  ['"a,b"@x.test', false, 'guillemets'],
  ['a@b@x.test', false, 'deux @'],
  ['ax.test', false, 'aucun @'],
  ['@x.test', false, 'partie locale vide'],
  ['a@', false, 'domaine vide'],
  ['a\t@x.test', false, 'tabulation'],
  [`${'a'.repeat(243)}@x.test`, true, '250 caractères'],
  [`${'a'.repeat(248)}@x.test`, false, '255 caractères · au-delà de 254'],
  ['', false, 'vide'],
];

describe('adresseInvitationValide · une seule adresse, rien qui sépare ou injecte', () => {
  for (const [adresse, attendu, cas] of CAS) {
    it(`${cas} → ${attendu ? 'acceptée' : 'refusée'}`, () => {
      expect(adresseInvitationValide(adresse), `${cas} · « ${adresse.slice(0, 40)} »`).toBe(attendu);
    });
  }
});
