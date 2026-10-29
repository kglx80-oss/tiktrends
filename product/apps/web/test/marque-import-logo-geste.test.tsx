// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Marque · « Importer » un fichier de logo · le geste réel dans le navigateur
 * (jsdom) : on choisit un fichier et on lit CE QUI PART (dépôt, charte) et ce
 * que l'écran DIT · rien n'est enregistré sur un refus ou un dépôt raté, et la
 * réussite ne se dit qu'après le oui du serveur.
 */
const toasts: string[] = [];
const rafraichis = { n: 0 };
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { rafraichis.n++; }, push() {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../spatial/coquille/contexte', () => ({ useSpatial: () => ({ toast: (t: string) => toasts.push(t) }) }));
import { ImportLogo, type ImportLogoActions } from '../spatial/vues/marque/interactifs';

let root: Root | null = null; let hote: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; toasts.length = 0; rafraichis.n = 0; vi.unstubAllGlobals(); });

function monter(actions: ImportLogoActions | null, raison: string | null = null) {
  hote = document.createElement('div'); document.body.append(hote); root = createRoot(hote);
  act(() => root!.render(<ImportLogo brandId="b1" logos={['https://a/ancien.png']} defaut="https://a/ancien.png" couleurs={['#112233']} polices={['Inter']} actions={actions} raison={raison} />));
  return hote.querySelector('input[type="file"]') as HTMLInputElement;
}
async function choisir(input: HTMLInputElement, f: File) {
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const png = () => new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' });

function faux(depotOk = true, typeSigne = 'image/png') {
  const appels = { preparer: [] as unknown[], enregistrer: [] as unknown[], put: [] as string[], typesEnvoyes: [] as string[] };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.put.push(`${init.method} ${url}`);
    appels.typesEnvoyes.push(String((init.headers as Record<string, string>)['Content-Type']));
    return { ok: depotOk } as Response;
  }));
  const actions: ImportLogoActions = {
    preparer: async (i) => { appels.preparer.push(i); return { uploadUrl: 'https://bucket/put?sig', publicUrl: 'https://bucket/assets/ws/neuf.png', contentType: typeSigne }; },
    enregistrer: async (i) => { appels.enregistrer.push(i); return { ok: true }; },
  };
  return { appels, actions };
}

describe('Marque · importer un fichier de logo', () => {
  it('png · déposé dans le bucket, puis la charte : le nouveau par défaut, l’ancien gardé, couleurs et polices renvoyées telles quelles', async () => {
    const { appels, actions } = faux();
    await choisir(monter(actions), png());
    expect(appels.preparer).toEqual([{ filename: 'logo.png', contentType: 'image/png', sizeBytes: 2048 }]);
    expect(appels.put).toEqual(['PUT https://bucket/put?sig']);
    expect(appels.typesEnvoyes, 'le type SIGNÉ par le serveur part dans le PUT').toEqual(['image/png']);
    expect(appels.enregistrer).toEqual([{ brandId: 'b1', logoUrl: 'https://bucket/assets/ws/neuf.png', logos: ['https://a/ancien.png', 'https://bucket/assets/ws/neuf.png'], colors: ['#112233'], fonts: ['Inter'] }]);
    expect(toasts).toEqual(['Logo importé · il devient le logo par défaut de la charte']);
    expect(rafraichis.n).toBe(1);
  });

  it('le PUT porte le type rendu par le serveur, pas celui du navigateur', async () => {
    // Contrat · le client suit le type que le serveur a SIGNÉ, même s'il diffère de celui du navigateur.
    const { appels, actions } = faux(true, 'image/webp');
    await choisir(monter(actions), png());
    expect(appels.typesEnvoyes).toEqual(['image/webp']);
    const sansType = faux(true);
    sansType.actions.preparer = async () => ({ uploadUrl: 'https://bucket/put?sig', publicUrl: 'https://bucket/assets/ws/neuf.png' });
    toasts.length = 0;
    act(() => root?.unmount()); hote?.remove();
    await choisir(monter(sansType.actions), png());
    expect(sansType.appels.put, 'sans type signé, rien ne part').toEqual([]);
    expect(toasts).toEqual(['Le téléversement a échoué. Réessaie.']);
  });

  it('svg · refusé avant tout envoi, la raison dite', async () => {
    const { appels, actions } = faux();
    await choisir(monter(actions), new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(appels.preparer).toEqual([]);
    expect(appels.enregistrer).toEqual([]);
    expect(toasts).toEqual(['Formats acceptés pour un logo : png, jpg, webp.']);
  });

  it('dépôt raté · la charte n’est pas touchée, l’écran le dit', async () => {
    const { appels, actions } = faux(false);
    await choisir(monter(actions), png());
    expect(appels.put).toHaveLength(1);
    expect(appels.enregistrer).toEqual([]);
    expect(toasts).toEqual(['Le fichier n’a pas pu être envoyé · rien n’a changé dans la charte. Réessaie.']);
    expect(rafraichis.n).toBe(0);
  });

  it('refus du serveur à l’enregistrement · son message, aucune réussite annoncée', async () => {
    const { actions } = faux();
    actions.enregistrer = async () => ({ error: 'Réservé aux administrateurs.' });
    await choisir(monter(actions), png());
    expect(toasts).toEqual(['Réservé aux administrateurs.']);
    expect(rafraichis.n).toBe(0);
  });

  it('fermé · case désactivée, raison en infobulle', () => {
    const input = monter(null, 'Le dépôt de fichiers n’est pas activé');
    expect(input.disabled).toBe(true);
    expect(input.closest('label')!.getAttribute('title')).toBe('Le dépôt de fichiers n’est pas activé');
    expect(input.closest('label')!.getAttribute('aria-disabled')).toBe('true');
  });
});
