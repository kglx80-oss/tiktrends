// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Équipe · le retrait d'un membre est CONFIRMÉ avant l'envoi. On clique la
 * vraie croix (jsdom) et on lit ce qui part vers l'action : rien sur un refus,
 * l'identifiant du membre sur un oui. Le menu de rôle envoie le rôle choisi.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), useSearchParams: () => new URLSearchParams() }));
import { RetirerMembre, RoleMembre } from '../spatial/vues/reglages/interactifs';

let root: Root | null = null;
let hote: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; vi.restoreAllMocks(); });
const monter = (el: React.ReactElement) => { hote = document.createElement('div'); document.body.append(hote); root = createRoot(hote); act(() => root!.render(el)); return hote; };

describe('Équipe · retrait confirmé', () => {
  it('refus de la confirmation · rien n’est envoyé ; oui · l’identifiant du membre part, le texte demandé est celui de la règle', async () => {
    const envois: string[] = [];
    const action = async (fd: FormData) => { envois.push(String(fd.get('userId'))); };
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const h = monter(<RetirerMembre userId="u-1" nom="Marine" confirmation="Retirer Marine de l’espace ?" action={action} raison={null}>x</RetirerMembre>);
    const b = h.querySelector('button')!;
    await act(async () => { b.click(); });
    expect(envois).toEqual([]);
    await act(async () => { b.click(); });
    expect(envois).toEqual(['u-1']);
    expect(confirmer).toHaveBeenNthCalledWith(1, 'Retirer Marine de l’espace ?');
  });

  it('fermé par la règle · désactivé, la raison en infobulle, aucun envoi même cliqué', async () => {
    const action = vi.fn(async () => {});
    const h = monter(<RetirerMembre userId="u-1" nom="Marine" confirmation="?" action={action} raison="C’est le seul propriétaire de l’espace">x</RetirerMembre>);
    const b = h.querySelector('button')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('C’est le seul propriétaire de l’espace');
    await act(async () => { b.click(); });
    expect(action).not.toHaveBeenCalled();
  });
});

describe('Équipe · menu de rôle', () => {
  it('choisir « Admin » envoie le membre et le rôle choisi', async () => {
    const envois: Array<[string, string]> = [];
    const action = async (fd: FormData) => { envois.push([String(fd.get('userId')), String(fd.get('role'))]); };
    const h = monter(<RoleMembre userId="u-2" nom="Paul" actuel="member" options={[{ valeur: 'owner', libelle: 'Propriétaire', choisissable: false }, { valeur: 'admin', libelle: 'Admin', choisissable: true }, { valeur: 'member', libelle: 'Membre', choisissable: true }]} action={action} raison={null} style={{}} />);
    const s = h.querySelector('select')!;
    expect(s.value).toBe('member');
    expect((s.querySelector('option[value="owner"]') as HTMLOptionElement).disabled).toBe(true);
    await act(async () => { s.value = 'admin'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(envois).toEqual([['u-2', 'admin']]);
  });
});
