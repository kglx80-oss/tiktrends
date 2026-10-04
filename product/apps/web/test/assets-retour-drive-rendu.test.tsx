import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jargonTechnique, LIBELLE_CONNECTER_DRIVE } from '@tiktrends/core';

/**
 * Recette #106 · retour Codex sur 4f2d2d2 · `/assets?e=drive_state` affichait
 * « Relance « Connecter Google Drive » » au-dessus d'un bloc « connexion pas
 * encore activée » qui ne propose ni ce bouton ni cette action.
 *
 * On REND la page Assets (session et données simulées, aucune base, aucun
 * réseau) pour chaque état Drive et chaque code de retour, et on lit le HTML ·
 * le message ne cite un bouton que s'il est à l'écran, et propose un geste qui
 * l'est.
 */
const etat = vi.hoisted(() => ({ role: 'owner', drive: null as null | Record<string, unknown> }));
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/assets', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: etat.role, plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('@tiktrends/integrations', () => ({ storageConfigured: () => false }));
vi.mock('../app/actions/assets', () => ({ ...stub(), listAssets: async () => [] }));
vi.mock('../app/actions/drive', () => ({ ...stub(), getDriveState: async () => etat.drive }));
vi.mock('../app/actions/creatives', stub);

import AssetsPage from '../app/(app)/assets/page';
import { ToastProvider } from '../components/Toast';

const base = { pickerReady: false, brandName: 'Neva', folderId: null, folderName: null, syncedAt: null, dernier: null };
const ETATS: Record<string, { role: string; drive: null | Record<string, unknown> }> = {
  inactive: { role: 'owner', drive: { ...base, available: false, needBrand: false, connected: false } },
  sans_marque: { role: 'owner', drive: { ...base, available: true, needBrand: true, connected: false, brandName: null } },
  a_connecter: { role: 'owner', drive: { ...base, available: true, needBrand: false, connected: false } },
  connecte: { role: 'owner', drive: { ...base, available: true, needBrand: false, connected: true } },
  hors_admin: { role: 'member', drive: null },
};
const CODES = ['drive_config', 'drive_state', 'drive_session', 'drive_norefresh', 'drive_exchange', 'drive_nobrand', 'drive_inconnu'];

async function rendre(nom: string, code: string) {
  Object.assign(etat, ETATS[nom]);
  const html = renderToStaticMarkup(<ToastProvider>{await AssetsPage({ searchParams: Promise.resolve({ e: code }) })}</ToastProvider>);
  // Le bandeau de retour est le premier bloc coloré après l'aide de la page.
  const m = html.match(/color:#ff9db0">([^<]+)<\/div>/);
  expect(m, `${nom}/${code} · pas de message de retour`).not.toBeNull();
  return { html, message: m![1]!.replace(/&#x27;|&#39;/g, '’') };
}
const boutonPresent = (html: string, libelle: string) => new RegExp(`>\\s*(?:<[^>]+>\\s*)*${libelle}\\s*</(a|button)>`).test(html);

describe('Assets · le retour Drive parle de l’état affiché', () => {
  for (const nom of Object.keys(ETATS)) {
    for (const code of CODES) {
      it(`${nom} · ${code}`, async () => {
        const { html, message } = await rendre(nom, code);
        expect(jargonTechnique(message), 'jargon technique').toEqual([]);
        if (message.includes(LIBELLE_CONNECTER_DRIVE)) {
          expect(boutonPresent(html, LIBELLE_CONNECTER_DRIVE), `le message cite « ${LIBELLE_CONNECTER_DRIVE} » mais ce bouton n’est pas affiché`).toBe(true);
        }
        if (nom === 'inactive') {
          expect(message).toMatch(/pas encore activée/);
          expect(boutonPresent(html, 'Ouvrir un ticket interne')).toBe(true);
          expect(boutonPresent(html, 'Importer par lien')).toBe(true);
        }
      });
    }
  }
});
