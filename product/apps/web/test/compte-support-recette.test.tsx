// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recette #106 · Équipe, Usage, Crédits, Support. Composants clients rendus
 * (jsdom) ; pages serveur (lecture base) gardées sur leur source, leurs
 * chiffres sur les règles du noyau (`compte-vue`).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { journalCredits, messagesRetourEquipe } from '@tiktrends/core';
import { Msg } from '../components/ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/team' }));
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { CopierLien } from '../spatial/vues/reglages/interactifs';
import { Equipe } from '../spatial/vues/reglages/Equipe';
import { SOUS_NAV_REGLAGES } from '../spatial/vues/reglages/sous-nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el; };
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ctx = (toast: (m: string) => void): CtxSpatial => ({
  utilisateur: { nom: 'T P', initiales: 'TP', email: 't@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast,
});

/*
 * Vague 2 · l'écran V5 `/team` est retiré · ses gardes de comportement sont
 * portées sur l'écran Spatial (`spatial/vues/reglages/Equipe.tsx`,
 * `app/(spatial)/sp/team/page.tsx`). Celles de l'apparence V5 (bouton de
 * fenêtre d'invitation, badge « ESPACE ADMIN ») disparaissent avec elle.
 */
describe('Équipe · le lien d’invitation se copie, l’état est annoncé', () => {
  it('« Copier le lien » copie et annonce la copie', async () => {
    const ecrit = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: ecrit } });
    const toast = vi.fn();
    const h = await monter(<FournisseurSpatial value={ctx(toast)}><CopierLien lien="https://app.exemple/invite/abc">Copier le lien</CopierLien></FournisseurSpatial>);
    await act(async () => { (h.querySelector('button') as HTMLButtonElement).click(); });
    expect(ecrit).toHaveBeenCalledWith('https://app.exemple/invite/abc');
    expect(toast, 'la copie n’est pas annoncée').toHaveBeenCalledWith('Lien d’invitation copié');
  });
  it('les messages de retour sont annoncés (succès · status, erreur · alert)', async () => {
    const h = await monter(<><Msg kind="ok">ok</Msg><Msg kind="err">non</Msg></>);
    expect([...h.querySelectorAll('[role]')].map((x) => x.getAttribute('role'))).toEqual(['status', 'alert']);
  });
  it('écran Équipe · invitation expirée signalée sans lien à copier, annulation nommée, lien = celui de l’e-mail', () => {
    const html = renderToStaticMarkup(
      <FournisseurSpatial value={ctx(() => {})}>
        <Equipe
          sousNav={SOUS_NAV_REGLAGES} plan="Core" formules={[]} suivante={null} membres={[]} roles={[]} tousRoles={[]} inviter={null} revoquer={async () => {}} retours={{}}
          invitations={[{ id: 'i1', email: 'perime@exemple.invalid', role: 'Membre', expiree: true, lien: 'https://app.exemple/invite/x' }, { id: 'i2', email: 'actif@exemple.invalid', role: 'Membre', expiree: false, lien: 'https://app.exemple/invite/y' }]}
        />
      </FournisseurSpatial>,
    );
    expect(html).toContain('Expirée · lien inactif');
    expect(html.match(/Copier le lien/g)?.length, 'une invitation expirée propose encore son lien').toBe(1);
    expect(html).toContain('aria-label="Annuler l’invitation de perime@exemple.invalid"');
    expect(src('app/(spatial)/sp/team/page.tsx'), 'lien relatif inutilisable hors de l’app').toContain('const base = appUrl();');
  });
  it('l’écran dit si l’e-mail d’invitation est parti', () => {
    expect(src('app/actions/invites.ts')).toContain("redirect(envoye ? '/team?ok=invite_mail' : '/team?ok=invite');");
    expect(messagesRetourEquipe()['ok:invite']).toContain('aucun e-mail n’est parti');
  });
});

describe('Usage et Crédits · chiffres et motifs', () => {
  it('Usage · motifs du noyau, limite du journal dite, fenêtre honnête', () => {
    const depuis = new Date('2026-10-01T00:00:00Z');
    const lignes = Array.from({ length: 3 }, (_, i) => ({ id: String(i), delta: -1, reason: 'adsmap:propose:x', createdAt: new Date(Date.UTC(2026, 9, 20 - i)) }));
    const j = journalCredits(lignes, { depuis, limite: 3, jours: 30, fuseau: 'Europe/Paris' });
    expect(j.lignes[0]!.libelle).toBe('Adsmap · propositions de concepts');
    expect(j.limiteAtteinte, 'la limite de lignes n’est pas dite').toBe(true);
    expect(j.fenetre, 'un total tronqué se présente comme « 30 jours »').toBe('3 derniers mouvements (une partie des 30 jours)');
  });
  // Crédits · vague 4 · l'écran V5 `/credits` est retiré · ses promesses (pas de
  // report de 25 %, consommé borné, illimité = ∞, libellés lisibles) sont gardées
  // sur le rendu Spatial (`spatial-credits.test.tsx`).
});

describe('Support · promesses tenues, fil accessible', () => {
  it('plus aucune promesse d’une équipe qui ne reçoit pas les tickets', () => {
    // Vague 4 · l'écran `/support` est servi par Spatial · sa promesse (et la
    // portée du ticket) est gardée sur le rendu (`spatial-support.test.tsx`).
    for (const p of ['components/SupportWidget.tsx']) {
      const s = src(p);
      expect(s, `${p} · promesse non tenue`).not.toMatch(/On te répond|on te répond vite|on répond vite|Notre équipe te répond/);
    }
    // Lot 11 · Réglages promettait « un service à activer se demande à notre équipe, depuis le support ».
    expect(src('spatial/vues/reglages/Espace.tsx'), 'Réglages · promesse non tenue').not.toMatch(/se demande à notre équipe/);
    expect(src('spatial/vues/reglages/Espace.tsx')).toContain('(seuls ses admins le lisent)');
  });
  // Le fil d'un ticket (retour à la liste, réponse nommée, statuts annoncés,
  // « rouvrir » fidèle) · porté sur le rendu Spatial (`spatial-support.test.tsx`).
});
