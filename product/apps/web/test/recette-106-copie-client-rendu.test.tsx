import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jargonTechnique, DRIVE_CONNEXION_INACTIVE, DRIVE_SELECTEUR_INACTIF, TEXTES_IA_INACTIFS } from '@tiktrends/core';

/**
 * Recette #106 · lot B · la copie CLIENT d'un service pas encore activé.
 *
 * On REND l'encadré Google Drive de l'écran Assets et le Studio Textes, et on
 * lit le texte affiché · aucun nom de variable, de clé, de permission ou de
 * fournisseur interne n'atteint l'écran, et le message dit ce qui manque, qui
 * agit (la plateforme · lot 11) et quoi faire (ticket interne, import par lien en attendant).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/drive', () => ({
  getDrivePickerConfigAction: async () => ({}), setDriveFolderAction: async () => ({}),
  syncDriveNowAction: async () => ({}), syncDriveFilesAction: async () => ({}), disconnectDriveAction: async () => ({}),
}));
vi.mock('../app/actions/studio', () => ({ generateAction: async () => ({}) }));

import { DriveConnect } from '../app/(app)/assets/DriveConnect';
import { StudioClient } from '../app/(app)/studio/textes/StudioClient';

type Etat = Parameters<typeof DriveConnect>[0]['state'];
const etat = (o: Partial<Etat> = {}): Etat => ({
  available: true, pickerReady: true, needBrand: false, brandName: 'Neva', connected: false,
  folderId: null, folderName: null, syncedAt: null, dernier: null, ...o,
});
/** Le texte VISIBLE · balises retirées, entités décodées sommairement. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('Recette #106 · encadré Google Drive (Assets) · copie client', () => {
  const cas: Array<[string, Etat]> = [
    ['connexion pas activée', etat({ available: false, pickerReady: false })],
    ['connecté, sélecteur pas activé', etat({ connected: true, pickerReady: false })],
    ['à connecter', etat()],
    ['connecté, prêt', etat({ connected: true, folderId: 'f', folderName: 'Rushs' })],
  ];
  it.each(cas)('%s · aucun nom de variable, de clé ni de permission à l’écran', (_n, s) => {
    const html = renderToStaticMarkup(<DriveConnect state={s} />);
    expect(jargonTechnique(texte(html)), `jargon technique affiché : ${texte(html)}`).toEqual([]);
    expect(html, 'du code technique est encore rendu').not.toContain('<code>');
  });

  it('connexion pas activée · dit ce qui manque, qui agit, quoi faire', () => {
    const t = texte(renderToStaticMarkup(<DriveConnect state={etat({ available: false, pickerReady: false })} />));
    expect(t).toContain(DRIVE_CONNEXION_INACTIVE.constat);
    expect(t, 'qui agit n’est pas dit').toMatch(/côté plateforme, pas depuis ton espace/);
    expect(t, 'le routage du ticket n’est pas dit').toContain('seuls ses admins le lisent');
    expect(t, 'le repli par lien n’est pas proposé').toMatch(/importer tes fichiers Drive par lien/);
    const html = renderToStaticMarkup(<DriveConnect state={etat({ available: false, pickerReady: false })} />);
    expect(html, 'aucun geste vers le support').toMatch(/<a href="\/support"[^>]*>Ouvrir un ticket interne<\/a>/);
    expect(html, 'le bouton promet une activation').not.toMatch(/Demander l’activation/);
  });

  it('connecté sans sélecteur · même interlocuteur, et Déconnecter reste là', () => {
    const html = renderToStaticMarkup(<DriveConnect state={etat({ connected: true, pickerReady: false })} />);
    expect(texte(html)).toContain(DRIVE_SELECTEUR_INACTIF.constat);
    expect(html).toContain('href="/support"');
    expect(html, 'la déconnexion a disparu').toContain('Déconnecter');
    expect(texte(html), 'le mode d’emploi décrit des boutons absents').not.toContain('Choisir des fichiers');
  });

  it('les boutons et le lien de connexion font au moins 44 px de haut', () => {
    const html = renderToStaticMarkup(<DriveConnect state={etat()} />);
    const lien = html.match(/<a href="\/api\/oauth\/google" style="([^"]+)"/);
    expect(lien?.[1], 'le lien « Connecter Google Drive » n’a pas de hauteur minimale').toContain('min-height:44px');
    const pret = renderToStaticMarkup(<DriveConnect state={etat({ connected: true, folderId: 'f', folderName: 'Rushs' })} />);
    const boutons = [...pret.matchAll(/<button[^>]*style="([^"]+)"/g)].map((m) => m[1]);
    expect(boutons.length).toBeGreaterThanOrEqual(3);
    for (const st of boutons) expect(st, `bouton sous 44 px : ${st}`).toContain('min-height:44px');
  });
});

describe('Recette #106 · Studio Textes sans IA activée · copie client', () => {
  const html = renderToStaticMarkup(<StudioClient hasKey={false} />);
  it('aucun nom de variable ni de fournisseur à l’écran', () => {
    expect(jargonTechnique(texte(html)), `jargon technique affiché : ${texte(html)}`).toEqual([]);
    expect(html).not.toContain('<code>');
  });
  // Lot 9 · fidèle au routage réel · un ticket du support reste dans l'espace,
  // aucun bouton ne promet une activation que le support ne peut pas faire.
  // Lot 11 · l'accès au support revient, nommé « ticket interne ».
  it('dit ce qui manque et le routage réel, sans promettre une équipe injoignable', () => {
    expect(texte(html)).toContain(TEXTES_IA_INACTIFS.constat);
    expect(texte(html)).not.toMatch(/notre équipe l’active sur demande/);
    expect(texte(html)).toMatch(/reste dans ton espace/);
    expect(html, 'bouton vers un support qui ne peut pas activer').not.toMatch(/Demander l’activation au support/);
    expect(html, 'accès au support retiré').toMatch(/<a href="\/support"[^>]*>Ouvrir un ticket interne<\/a>/);
  });
  it('avec l’IA active, aucun message d’absence', () => {
    expect(renderToStaticMarkup(<StudioClient hasKey />)).not.toContain(TEXTES_IA_INACTIFS.constat);
  });
});
