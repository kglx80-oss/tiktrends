import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONNEXION_INACTIVE, DRIVE_SELECTEUR_INACTIF, DRIVE_PORTEE_ACCES,
  ERREURS_CONNEXION_DRIVE, ERREUR_CONNEXION_DRIVE_REPLI, messageErreurConnexionDrive,
  jargonTechnique, texteMessageClient, resumeImportDrive, TEXTES_IA_INACTIFS,
} from '../src';

/**
 * Lot B · recette #106 · les messages Google Drive de l'écran Assets ne
 * montrent AUCUNE configuration technique (variables, clés, permission, protocole)
 * et disent au client ce qui manque, qui peut agir et quoi faire.
 */
describe('copie-client · le détecteur de jargon voit ce qu’il doit voir', () => {
  it('reconnaît les anciens messages techniques (sinon la garde ne garde rien)', () => {
    expect(jargonTechnique('variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET')).not.toEqual([]);
    expect(jargonTechnique('Sélecteur non configuré (GOOGLE_API_KEY / GOOGLE_APP_ID).')).not.toEqual([]);
    expect(jargonTechnique('Accès limité (scope drive.file)')).not.toEqual([]);
    expect(jargonTechnique('Session OAuth invalide')).not.toEqual([]);
    expect(jargonTechnique('Google n’a pas renvoyé de jeton.')).not.toEqual([]);
    expect(jargonTechnique('IA non configurée : ajoute ANTHROPIC_API_KEY sur le serveur.')).not.toEqual([]);
    expect(jargonTechnique('Bibliothèque pub · TRENDTRACK_API_KEY')).not.toEqual([]);
    expect(jargonTechnique('fournie par Trendtrack')).not.toEqual([]);
  });
  // Chaque terme SEUL · un motif retiré ne doit pas être masqué par un voisin.
  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY', 'GOOGLE_APP_ID', 'ANTHROPIC_API_KEY', 'TRENDTRACK_API_KEY',
    'drive.file', 'OAuth', 'process.env', '.env.deploy', 'Trendtrack', 'Anthropic'])('repère « %s » à lui seul', (terme) => {
    expect(jargonTechnique(`avant ${terme} après`), `« ${terme} » passe inaperçu`).not.toEqual([]);
  });

  it('laisse passer une copie client ordinaire', () => {
    expect(jargonTechnique('Connecte le compte Google de Neva en 1 clic.')).toEqual([]);
  });
});

describe('copie-client · chaque message est propre et dit quoi faire', () => {
  const tous: Array<[string, string]> = [
    ['connexion inactive', texteMessageClient(DRIVE_CONNEXION_INACTIVE)],
    ['sélecteur inactif', texteMessageClient(DRIVE_SELECTEUR_INACTIF)],
    ['textes inactifs', texteMessageClient(TEXTES_IA_INACTIFS)],
    ['portée', DRIVE_PORTEE_ACCES],
    ['dossier vide', resumeImportDrive({ found: 0, added: 0, skipped: 0 })],
    ...Object.entries(ERREURS_CONNEXION_DRIVE),
    ['repli', ERREUR_CONNEXION_DRIVE_REPLI],
  ];
  it.each(tous)('%s · aucun terme technique', (_nom, texte) => {
    expect(jargonTechnique(texte), `jargon technique dans « ${texte} »`).toEqual([]);
  });

  it('les deux états non activés nomment qui agit et le repli disponible', () => {
    for (const m of [DRIVE_CONNEXION_INACTIVE, DRIVE_SELECTEUR_INACTIF]) {
      expect(m.suite, 'qui agit n’est pas dit').toMatch(/notre équipe/);
      expect(m.suite, 'le repli par lien n’est pas proposé').toMatch(/importer tes fichiers Drive par lien/);
      expect(m.action, 'aucun geste proposé').toEqual({ libelle: expect.stringMatching(/support/), href: '/support' });
    }
  });

  it('Textes inactifs · dit qui agit, et qu’aucun crédit n’est débité', () => {
    expect(TEXTES_IA_INACTIFS.suite).toMatch(/notre équipe/);
    expect(TEXTES_IA_INACTIFS.suite).toMatch(/Aucun crédit/);
    expect(TEXTES_IA_INACTIFS.action?.href).toBe('/support');
  });

  it('un code de retour connu est traduit, un inconnu a un repli · jamais le code brut', () => {
    expect(messageErreurConnexionDrive('drive_session')).toMatch(/Reconnecte-toi/);
    expect(messageErreurConnexionDrive('drive_inconnu')).toBe(ERREUR_CONNEXION_DRIVE_REPLI);
    expect(messageErreurConnexionDrive('toString')).toBe(ERREUR_CONNEXION_DRIVE_REPLI);
    expect(messageErreurConnexionDrive('drive_inconnu')).not.toContain('drive_');
  });
});
