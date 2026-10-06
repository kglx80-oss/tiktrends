import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Message 56 · le refus de Jarvis dit sa VRAIE raison (offre ou rôle, selon
 * `denyReason`), dans les mots de l'écran `RefusJarvis`.
 *
 * Défaut reproduit : `chatThreadAction` répondait `GUARD.role({needRole:'admin'})`
 * · « Cette action demande un rôle administrateur » · à un freelance ou à un
 * lecteur client, et la phrase générique de `GUARD.plan` à un compte Starter.
 * On lit le texte RETOURNÉ par l'action et le texte RENDU par l'écran.
 */

const h = vi.hoisted(() => ({ session: null as unknown, marqueLue: 0 }));
// Base factice non nulle · le refus doit tomber avant toute requête (un appel à `db` planterait).
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: {} }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => { h.marqueLue++; return null; } }));

import { chatThreadAction } from '../app/actions/jarvis-chat';
import { RefusJarvis } from '../app/(app)/jarvis/RefusJarvis';
import { TEXTE_REFUS_JARVIS } from '../lib/jarvis-acces';

const base = (o: Record<string, unknown>) => ({ user: { id: 'u', email: 'x@synth.test', name: null }, workspaceId: 'w', workspaceName: 'W', ...o });
const CAS: Array<[string, Record<string, unknown>, 'plan' | 'role']> = [
  ['membre Starter', { role: 'member', plan: 'starter', equipe: null }, 'plan'],
  ['membre d’équipe freelance', { role: 'member', plan: 'business', equipe: { role: 'freelance', matrice: {} } }, 'role'],
  ['client_viewer', { role: 'client_viewer', plan: 'business', equipe: null }, 'role'],
];
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('chatThreadAction · le refus retourné dit la vraie raison', () => {
  for (const [nom, s, raison] of CAS) {
    it(`${nom} → ${raison}`, async () => {
      h.session = base(s); h.marqueLue = 0;
      const r = await chatThreadAction();
      expect(r.error).toBe(TEXTE_REFUS_JARVIS[raison]);
      expect(r.error).not.toContain('administrateur');
      expect(h.marqueLue).toBe(0);
    });
  }
});

describe('RefusJarvis · l’écran dit la même phrase', () => {
  for (const raison of ['plan', 'role'] as const) {
    it(raison, () => {
      expect(texte(renderToStaticMarkup(<RefusJarvis titre="Jarvis" why={raison} owner={false} />))).toContain(TEXTE_REFUS_JARVIS[raison]);
    });
  }
});
