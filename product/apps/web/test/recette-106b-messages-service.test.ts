import { describe, expect, it, vi, beforeEach } from 'vitest';
import { messageServiceInactif } from '@tiktrends/core';
import { jargonEcran } from './helpers/jargon-ecran';

/**
 * Recette #106b · les refus « service absent » réellement renvoyés à l'écran
 * client. On APPELLE chaque action (session simulée, aucun service branché,
 * aucun réseau) et on lit l'erreur qu'elle rend · plus de « non configuré sur
 * le serveur », de clé ni de fournisseur.
 *
 * Classement (qui voit ce texte) · tous ces écrans sont ouverts au client ·
 *  · Assets (membre) · téléversement direct ;
 *  · Jarvis · « Apprendre des marques suivies » (administrateur de SON espace) ;
 *  · Assistant de création de marque (administrateur de son espace) ;
 *  · Image IA · relecture (membre) ;
 *  · Marques suivies · brief (membre avec Veille) ;
 *  · Jarvis · conversation (membre).
 */
const session = { workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid' } };
vi.mock('../lib/auth', () => ({ getSession: async () => session }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('../lib/spend-guard', async (orig) => ({ ...(await orig<typeof import('../lib/spend-guard')>()), guardedAnthropic: () => null }));
vi.mock('../lib/adsmap-guard', () => ({ adsmapGuard: async () => ({ s: session, brand: { id: 'b', name: 'Neva' } }) }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: {} }));
vi.mock('../lib/image-jointe', () => ({ imageJointe: async () => ({ data: 'x', media_type: 'image/png' }) }));

beforeEach(() => {
  for (const k of ['TRENDTRACK_API_KEY', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'ANTHROPIC_API_KEY']) delete process.env[k];
});

const propre = (t: string | undefined) => {
  expect(t, 'aucune erreur rendue').toBeTruthy();
  expect(jargonEcran(t!), `jargon technique à l’écran : « ${t} »`).toEqual([]);
};

describe('Recette #106b · refus « service absent » rendus au client', () => {
  it('Assets · téléversement direct sans stockage', async () => {
    const { presignAssetUploadAction } = await import('../app/actions/assets');
    const r = await presignAssetUploadAction({ filename: 'a.mp4', contentType: 'video/mp4', sizeBytes: 10 });
    propre(r.error); expect(r.error).toBe(messageServiceInactif('stockage'));
  });
  it('Jarvis · apprendre des marques suivies sans recherche publicitaire', async () => {
    const { learnFromFollowedAction } = await import('../app/actions/market-learn');
    const r = await learnFromFollowedAction();
    propre(r.error); expect(r.error).toBe(messageServiceInactif('veille'));
  });
  it('Marque · pré-remplissage IA indisponible', async () => {
    const { generateBrandDraftAction } = await import('../app/actions/brands');
    const fd = new FormData(); fd.set('name', 'Neva'); fd.set('url', 'neva.fr');
    const r = await generateBrandDraftAction({} as never, fd);
    propre(r.error); expect(r.error).toBe(messageServiceInactif('ia_profil'));
  });
  it('Image IA · relecture indisponible', async () => {
    const { scoreImageAction } = await import('../app/actions/image');
    const r = await scoreImageAction({ url: 'https://exemple.invalid/a.png' });
    propre(r.error); expect(r.error).toBe(messageServiceInactif('relecture_image'));
  });
  it('Marques suivies · brief sans recherche publicitaire', async () => {
    const { briefMarqueAction } = await import('../app/actions/brief-marque');
    const r = await briefMarqueAction({ platform: 'meta', name: 'Neutrogena' });
    propre(r.error); expect(r.error).toBe(messageServiceInactif('veille'));
  });
  it('Jarvis · conversation sans IA', async () => {
    const { POST } = await import('../app/api/jarvis/chat/route');
    const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', body: JSON.stringify({ message: 'Bonjour' }) }) as never);
    const j = (await res.json()) as { error?: string };
    propre(j.error); expect(j.error).toBe(messageServiceInactif('jarvis'));
  });
});
