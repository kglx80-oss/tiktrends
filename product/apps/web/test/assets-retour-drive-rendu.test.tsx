// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { jargonTechnique, LIBELLE_CONNECTER_DRIVE } from '@tiktrends/core';

/**
 * Le retour de la connexion Google (`?e=drive_…`) parle de l'état AFFICHÉ ·
 * un message qui cite un geste le trouve à l'écran, sans jargon technique.
 *
 * Vague 2 · l'écran V5 `/assets` est retiré · on MONTE l'écran Spatial (seul à
 * servir `/assets`) et on lit le message annoncé (toast) et les gestes rendus.
 */
const etat = vi.hoisted(() => ({ role: 'owner', drive: null as null | Record<string, unknown> }));
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/assets', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: etat.role, plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('@tiktrends/integrations', () => ({ storageConfigured: () => false }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => true }));
vi.mock('../app/actions/assets', () => ({ ...stub(), listAssets: async () => [] }));
vi.mock('../app/actions/drive', () => ({ ...stub(), getDriveState: async () => etat.drive }));
vi.mock('../app/actions/bibliotheque-dossiers', () => stub());

import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

const base = { pickerReady: false, brandName: 'Neva', folderId: null, folderName: null, syncedAt: null, dernier: null };
const ETATS: Record<string, { role: string; drive: null | Record<string, unknown> }> = {
  inactive: { role: 'owner', drive: { ...base, available: false, needBrand: false, connected: false } },
  sans_marque: { role: 'owner', drive: { ...base, available: true, needBrand: true, connected: false, brandName: null } },
  a_connecter: { role: 'owner', drive: { ...base, available: true, needBrand: false, connected: false } },
  connecte: { role: 'owner', drive: { ...base, available: true, needBrand: false, connected: true } },
  hors_admin: { role: 'member', drive: null },
};
const CODES = ['drive_config', 'drive_state', 'drive_session', 'drive_norefresh', 'drive_exchange', 'drive_nobrand', 'drive_inconnu'];

async function monter(nom: string, code: string) {
  Object.assign(etat, ETATS[nom]);
  const toast = vi.fn();
  const ctx: CtxSpatial = { utilisateur: { nom: 'D', initiales: 'D', email: 'd@x.fr', role: 'Propriétaire' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast };
  const vue = await BibliothequeSpatiale({ searchParams: Promise.resolve({ e: code }) });
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={ctx}>{vue}</FournisseurSpatial>); });
  expect(toast, `${nom}/${code} · pas de message de retour`).toHaveBeenCalledTimes(1);
  return { el, message: String(toast.mock.calls[0]![0]) };
}
const actif = (h: HTMLElement, libelle: string) => [...h.querySelectorAll('button')].some((b) => b.textContent?.includes(libelle) && !b.disabled);

describe('Assets · le retour Drive parle de l’état affiché', () => {
  for (const nom of Object.keys(ETATS)) {
    for (const code of CODES) {
      it(`${nom} · ${code}`, async () => {
        const { el: h, message } = await monter(nom, code);
        expect(jargonTechnique(message), 'jargon technique').toEqual([]);
        if (message.includes(LIBELLE_CONNECTER_DRIVE)) {
          expect(actif(h, LIBELLE_CONNECTER_DRIVE), `le message cite « ${LIBELLE_CONNECTER_DRIVE} » mais ce bouton n’est pas proposé`).toBe(true);
        }
        if (nom === 'inactive') {
          expect(message).toMatch(/pas encore activée/);
          // « Importe tes fichiers Drive par lien » · le geste existe (menu « Nouveau »).
          await act(async () => { [...h.querySelectorAll('button')].find((b) => b.textContent === 'Nouveau')!.click(); });
          expect(actif(h, 'Importer par lien'), 'le message renvoie à un import par lien absent').toBe(true);
        }
      });
    }
  }
});
