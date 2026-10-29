// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TEXTES_HORS_LIGNE } from '@tiktrends/core';

/**
 * Spatial · fiche projet · onglet « Créations » · le MODE HORS LIGNE du panneau
 * « Variantes et tests », porté du panneau V5 retiré (`PanneauVariantes`,
 * `FormulaireTest`, `PreparerEssai`). On MONTE l'onglet (jsdom), on coupe la
 * connexion du navigateur (`navigator.onLine` + événement `offline`) et on lit
 * l'écran : la pastille et la phrase, les gestes fermés, AUCUN envoi au serveur
 * même cliqué, la saisie du formulaire conservée ; puis la reconnexion rouvre.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ creerVariante: vi.fn(), iterer: vi.fn(), rattacher: vi.fn(), relire: vi.fn(), preparer: vi.fn() }));
vi.mock('../app/actions/studios/tests', () => ({ preparerLotEssai: h.preparer, rattacherVarianteAuTest: h.rattacher, relireApprentissage: h.relire }));
vi.mock('../app/actions/studios/variantes', () => ({ creerVariante: h.creerVariante, iterer: h.iterer }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/studio/projets/p1' }));

const { OngletCreations } = await import('../spatial/vues/projet/OngletCreations');
const { avecSpatial } = await import('./spatial/fournisseur');
type PropsCreationsProjet = import('../spatial/vues/projet/types').PropsCreationsProjet;
type VarianteSpatiale = import('../spatial/vues/projet/types').VarianteSpatiale;

const variante = (id: string): VarianteSpatiale => ({
  id, libelle: `Variante ${id}`, apercu: null, version: 'V1', statut: 'Retenue', hypothese: 'Le prix en gros accroche', variable: 'accroche', comparaison: '—',
  test: null, lienTest: `lien-${id}`, lecture: null, gestes: { iterer: true, relire: true, rattacher: true }, rattachement: { hypothese: 'Le prix en gros accroche', variable: 'hook', aUnParent: false },
});
const props = (): PropsCreationsProjet => ({
  projectId: 'p1', versionCouranteId: 'v1', messageVide: 'Aucune création.', editeurHref: null, preparerHref: null, videoHref: null,
  lots: [{ jobId: 'j1', titre: 'Lot 1', version: 'V1', etat: { libelle: 'Prête', classe: 'g', pret: true, actif: false }, qualite: null, message: null,
    sorties: [{ assetId: 'a1', libelle: 'Sortie 1', apercu: null, detail: '', choisir: true, raison: null, varianteId: null }] }],
  variantes: [variante('x'), variante('y')], erreurVariantes: null, relecture: { disponible: true, mention: '0,02 $ au plus', raison: null, coutMaxUsd: 0.02 },
  taches: [], erreurTaches: null, peutProposer: true, relire: false,
  adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
});

let root: Root; let el: HTMLDivElement;
const connexion = (enLigne: boolean) => act(() => {
  Object.defineProperty(window.navigator, 'onLine', { value: enLigne, configurable: true });
  window.dispatchEvent(new Event(enLigne ? 'online' : 'offline'));
});
const bouton = (texte: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(texte))!;
beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.creerVariante.mockResolvedValue({ ok: true });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => root.render(avecSpatial(<OngletCreations {...props()} />)));
});
afterEach(() => { act(() => root.unmount()); el.remove(); });

describe('Créations · mode hors ligne du panneau des variantes', () => {
  it('en ligne · ni pastille ni phrase, gestes ouverts', () => {
    expect(el.querySelector('[data-hors-ligne]')).toBeNull();
    expect(el.textContent).not.toContain(TEXTES_HORS_LIGNE.panneau);
    expect(bouton('Retenir').disabled).toBe(false);
    expect(bouton('Itérer').disabled).toBe(false);
  });

  it('hors ligne · la pastille et la phrase, chaque geste fermé avec sa raison, aucun envoi même cliqué', async () => {
    connexion(false);
    expect(el.querySelector('#variantes [data-hors-ligne]')?.textContent).toBe('Hors ligne');
    expect(el.querySelector('#variantes [role="status"]')?.textContent).toBe(TEXTES_HORS_LIGNE.panneau);
    for (const t of ['Retenir', 'Itérer', 'Relire', 'Rattacher au test']) {
      expect(bouton(t).disabled, t).toBe(true);
      expect(bouton(t).title, t).toBe(TEXTES_HORS_LIGNE.bouton);
    }
    await act(async () => { bouton('Retenir').click(); bouton('Itérer').click(); });
    expect(h.creerVariante).not.toHaveBeenCalled();
    expect(h.iterer).not.toHaveBeenCalled();
  });

  it('le formulaire « Rattacher » ouvert puis la connexion perdue · envoi suspendu, la saisie reste, la reconnexion rouvre', async () => {
    act(() => bouton('Rattacher au test').click());
    const ta = el.querySelector<HTMLTextAreaElement>('[data-formulaire-test="x"] textarea[name="hypothese"]')!;
    expect(ta.value).toBe('Le prix en gros accroche');
    connexion(false);
    const form = el.querySelector<HTMLFormElement>('[data-formulaire-test="x"]')!;
    expect(form.querySelector('[role="status"]')?.textContent).toBe(TEXTES_HORS_LIGNE.formulaire);
    const envoyer = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(envoyer.disabled).toBe(true);
    // Un envoi forcé (Entrée dans un champ, script) · la garde du formulaire, pas seulement le bouton fermé.
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(h.rattacher).not.toHaveBeenCalled();
    expect(ta.value, 'la saisie est conservée').toBe('Le prix en gros accroche');
    // Le formulaire ouvert reste refermable hors ligne.
    expect(bouton('Rattacher au test').disabled).toBe(false);
    connexion(true);
    expect(el.querySelector('[data-hors-ligne]')).toBeNull();
    expect(envoyer.disabled).toBe(false);
    expect(bouton('Retenir').disabled).toBe(false);
  });

  it('le lot d’essai · « Préparer » reste fermé hors ligne, même la sélection faite', () => {
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-essai-variable]')!.click();
      el.querySelector<HTMLButtonElement>('[data-essai-variante="x"]')!.click();
      el.querySelector<HTMLButtonElement>('[data-essai-variante="y"]')!.click();
    });
    expect(bouton('Préparer le lot d’essai').disabled).toBe(false);
    connexion(false);
    expect(bouton('Préparer le lot d’essai').disabled).toBe(true);
    act(() => bouton('Préparer le lot d’essai').click());
    expect(h.preparer).not.toHaveBeenCalled();
  });
});
