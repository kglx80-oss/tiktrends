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
vi.mock('../app/actions/invites', () => ({ createInviteAction: async () => {} }));
import { CopierTexte } from '../components/CopierTexte';
import { InviteMemberButton } from '../components/InviteMemberButton';
import { Msg } from '../components/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el; };
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Équipe · le lien d’invitation se copie, l’état est annoncé', () => {
  it('« Copier le lien » copie et annonce « Copié. »', async () => {
    const ecrit = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: ecrit } });
    const h = await monter(<CopierTexte texte="https://app.exemple/invite/abc" />);
    await act(async () => { (h.querySelector('button') as HTMLButtonElement).click(); });
    expect(ecrit).toHaveBeenCalledWith('https://app.exemple/invite/abc');
    expect(h.querySelector('[role=status]')?.textContent, 'la copie n’est pas annoncée').toBe('Copié.');
  });
  it('le déclencheur de la fenêtre d’invitation annonce une boîte de dialogue et son état', async () => {
    const h = await monter(<InviteMemberButton />);
    const b = [...h.querySelectorAll('button')].find((x) => x.textContent?.includes('Inviter'))!;
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { b.click(); });
    expect(b.getAttribute('aria-expanded'), 'l’ouverture n’est pas annoncée').toBe('true');
  });
  it('le déclencheur d’invitation est une cible tactile (44 px mesurés à 40 en 390)', async () => {
    const h = await monter(<InviteMemberButton />);
    const b = [...h.querySelectorAll('button')].find((x) => x.textContent?.includes('Inviter'))!;
    expect(b.style.minHeight, 'cible sous 44 px au toucher').toBe('44px');
  });
  it('les messages de retour sont annoncés (succès · status, erreur · alert)', async () => {
    const h = await monter(<><Msg kind="ok">ok</Msg><Msg kind="err">non</Msg></>);
    expect([...h.querySelectorAll('[role]')].map((x) => x.getAttribute('role'))).toEqual(['status', 'alert']);
  });
  it('page Équipe · invitation expirée signalée, lien = celui de l’e-mail, « Révoquer » nommé, noms longs à la ligne', () => {
    const s = src('app/(app)/team/page.tsx');
    expect(s).toContain("etatInvitation(inv.expiresAt as Date | null, maintenant) === 'expiree'");
    expect(s).toContain('Expirée · lien inactif');
    expect(s, 'lien relatif inutilisable hors de l’app').toContain('const lienBase = appUrl();');
    expect(s).toContain('aria-label={`Révoquer l’invitation de ${inv.email}`}');
    expect(s).toContain('<CopierTexte texte={lien} />');
    expect(s.match(/overflowWrap: 'anywhere'/g)?.length ?? 0, 'e-mail d’invitation ou nom de membre peut déborder').toBeGreaterThanOrEqual(3);
  });
  it('l’écran dit si l’e-mail d’invitation est parti', () => {
    expect(src('app/actions/invites.ts')).toContain("redirect(envoye ? '/team?ok=invite_mail' : '/team?ok=invite');");
    expect(src('app/(app)/team/page.tsx')).toContain('aucun e-mail n’est parti');
  });
});

describe('Usage et Crédits · chiffres et motifs', () => {
  it('Usage · familles et motifs du noyau, motif entier, répartition honnête', () => {
    const s = src('app/(app)/usage/page.tsx');
    expect(s, 'familyOf local subsiste').not.toContain('function familyOf');
    expect(s).toContain('libelleMotif(r.reason)');
    expect(s).toContain('repartition.tronquee');
    expect(s).toContain('avant remboursements');
    expect(s, 'motif coupé en ellipse').not.toMatch(/textOverflow: 'ellipsis' }}>\{r\.reason\}/);
    expect(s, '« fondateur » affiché aussi pour le staff').not.toContain('Illimité · fondateur');
  });
  it('Usage · plus de promesse d’exhaustivité · la limite du journal est dite', () => {
    const s = src('app/(app)/usage/page.tsx');
    expect(s, 'promesse contredite par la limite de 120 lignes').not.toContain('Rien n\'est facturé sans apparaître ici');
    expect(s).toContain('les {LIMITE_JOURNAL} plus récents sont listés ici');
  });
  it('Abonnement · badge d’espace, pas « ADMIN+ » (réservé au personnel de la plateforme)', () => {
    const s = src('app/(app)/billing/page.tsx');
    expect(s, 'badge ADMIN+ sur une page d’admin d’espace').not.toMatch(/>ADMIN\+<\/span>/);
    expect(s).toContain('>ESPACE ADMIN</span>');
  });
  it('Crédits · plus de report de 25 % promis, consommé borné, illimité = ∞', () => {
    const s = src('app/(app)/credits/page.tsx');
    expect(s, 'promesse de report jamais appliquée').not.toContain('Report partiel de 25');
    expect(s).toContain('partConsommeeCycle({ allocation: alloc, solde: balance, illimite, mouvements: ledger.length })');
    expect(s).toContain("{illimite ? '∞'");
    expect(s, 'un « · » seul tenait lieu de valeur quand la part ne se mesure pas').not.toContain("conso.pct === null ? '·'");
    expect(s).toContain('>Sans objet</span>');
    expect(s, 'six actions s’affichaient en clé brute (« chat », « asset_analysis »)').not.toContain('ACTION_FR[k] || k');
    expect(s).toContain('LIBELLE_ACTION_CREDIT[k');
    expect(s).toContain('libelleMotif(l.reason)');
  });
});

describe('Support · promesses tenues, fil accessible', () => {
  it('plus aucune promesse d’une équipe qui ne reçoit pas les tickets', () => {
    for (const p of ['app/(app)/support/page.tsx', 'components/SupportWidget.tsx']) {
      const s = src(p);
      expect(s, `${p} · promesse non tenue`).not.toMatch(/On te répond|on te répond vite|on répond vite|Notre équipe te répond/);
    }
    expect(src('app/(app)/support/page.tsx')).toContain('il n\'est pas transmis automatiquement à l\'équipe TikTrends');
    // Lot 11 · Réglages promettait « un service à activer se demande à notre équipe, depuis le support ».
    expect(src('app/(app)/settings/page.tsx'), 'Réglages · promesse non tenue').not.toMatch(/se demande à notre équipe/);
    expect(src('app/(app)/settings/page.tsx')).toContain('(seuls ses admins le lisent)');
  });
  it('ticket · retour à la liste, réponse nommée, statuts annoncés, « rouvrir » fidèle', () => {
    const s = src('app/(app)/support/[id]/page.tsx');
    expect(s).toContain('href="/support"');
    expect(s).toContain("aria-label={isAdmin ? 'Ta réponse dans le fil' : 'Ton message dans le fil'}");
    expect(s).toContain('aria-pressed={tk.status === v}');
    expect(s, '« Envoyer la réponse » mesuré à 40 px en 390').toMatch(/minHeight: CIBLE_TACTILE_MIN, padding: '10px 18px'[^>]*>Envoyer la réponse/);
    expect(s, 'promet une réouverture que le serveur ne fait pas').not.toContain('Réponds ci-dessous pour le rouvrir');
  });
});
