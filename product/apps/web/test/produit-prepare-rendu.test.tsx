// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L'écran de la fiche produit et des vues (`FicheEtVues`, atelier Produit) ·
 * monté dans jsdom, lu dans le DOM : les photos qui partent au modèle, la
 * raison écrite à côté d'un bouton fermé, ce que l'enregistrement reçoit.
 * Les règles sont celles du noyau (`raisonFiche`, `raisonVue`). 0 $.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: vi.fn(), associerReference: vi.fn(), retirerReference: vi.fn(), trancherComposants: vi.fn(), importerPhotoProduit: vi.fn(), definirFicheProduit: vi.fn() }));
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: vi.fn() }));
const parcours = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: parcours.lire, compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn(), controlerMediaImage: vi.fn() }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/produit', useRouter: () => ({ refresh: vi.fn(), push: () => {} }) }));

import { FicheEtVues, Produit } from '../spatial/vues/projet/Produit';
import { avecSpatial } from './spatial/fournisseur';
import type { VueProduit } from '../lib/studios/produit/vue';

const photo = (n: number) => ({ assetId: `ph${n}`, assetVersion: 'v', sha256: 'a'.repeat(64), nature: 'contenu', position: n, apercu: `/p${n}.png` });

function vue(o: { fiche?: unknown; vuesChoisies?: string[]; peutModifier?: boolean; produit?: 'pr1' | 'pr2' } = {}): VueProduit {
  const pid = o.produit ?? 'pr1';
  const p0 = pid === 'pr1' ? 'ph5' : 'pq1';
  const prep = {
    ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [],
    vuesProduit: [{ assetId: p0, position: pid === 'pr1' ? 5 : 1, origine: 'epinglee' }],
    vuesProposees: pid === 'pr1' && !o.vuesChoisies ? [{ assetId: 'ph6', position: 6, origine: 'defaut' }, { assetId: 'ph7', position: 7, origine: 'defaut' }] : [],
  };
  return {
    projet: { id: 'p1', title: 'Lunettes', marque: 'Course' }, version: { id: 'v1', n: 2 }, briefPresent: true,
    produits: [{ id: 'pr1', nom: 'Lunettes Sport', photos: [1, 2, 3, 4, 5, 6, 7].map(photo) }, { id: 'pr2', nom: 'Casquette', photos: [{ ...photo(1), assetId: 'pq1' }, { ...photo(2), assetId: 'pq2' }] }],
    epingle: {
      productId: pid, nom: pid === 'pr1' ? 'Lunettes Sport' : 'Casquette', photo: { assetId: p0, position: pid === 'pr1' ? 5 : 1, total: 7, nature: 'contenu' },
      variante: { libelle: 'Variante unique' }, etat: 'presente', libelleEtat: 'Photo épinglée présente', apercu: null, composantsObligatoires: [], transformationsAutorisees: [],
      ...(o.fiche ? { fiche: o.fiche } : {}), ...(o.vuesChoisies ? { vuesChoisies: o.vuesChoisies } : {}),
    },
    produitSansPhoto: null, fichiers: [], associations: [],
    preparation: { faithful_composite: prep, generative_scene: prep }, peutModifier: o.peutModifier ?? true,
  } as unknown as VueProduit;
}

let hote: HTMLDivElement; let racine: Root;
const enregistrer = vi.fn(async () => true);
beforeEach(() => { enregistrer.mockClear(); hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });
const monter = (v: VueProduit) => act(() => racine.render(<FicheEtVues vue={v} occupe={false} enCours={false} horsLigne={false} enregistrer={enregistrer} />));
const q = <T extends Element>(s: string) => hote.querySelector<T>(s)!;
function saisir(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valeur: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
const champ = (libelle: string) => [...hote.querySelectorAll('label.field')].find((l) => l.textContent!.startsWith(libelle))!.querySelector('input, select, textarea') as HTMLInputElement;
const cliquer = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe('fiche et vues · ce que l’écran dit et ce que l’enregistrement reçoit', () => {
  it('par défaut · seule l’épinglée part (version enregistrée) ; les suivantes sont proposées, un clic les envoie avec la fiche enregistrée', () => {
    monter(vue({ fiche: { tailleReelle: '15 cm', echelle: 'main', echelleDetail: '', nonMontre: '', contenuAchat: '', emballage: '' } }));
    expect(q('.lbl').textContent).toContain('version enregistrée');
    expect([...hote.querySelectorAll('[data-liste="vues-envoyees"] li')].map((li) => li.textContent)).toEqual(['Photo 5 · photo épinglée']);
    expect(q('[data-zone="vues-proposees"]').textContent).toContain('Proposées · photo 6, photo 7');
    expect(hote.textContent).toContain('Il fait partie du produit · ce n’est pas un autre produit');
    saisir(champ('Taille réelle'), 'brouillon non enregistré');
    cliquer(q('[data-geste="vues-proposees"]'));
    expect(enregistrer).toHaveBeenCalledWith({ tailleReelle: '15 cm', echelle: 'main', echelleDetail: '', nonMontre: '', contenuAchat: '', emballage: '' }, ['ph6', 'ph7']);
  });

  it('un choix de vues pas encore enregistré est dit', () => {
    monter(vue());
    expect(hote.querySelector('[data-etat="vues-modifiees"]')).toBeNull();
    cliquer(q('[data-geste="vues-choix"]'));
    expect(q('[data-etat="vues-modifiees"]').textContent).toBe('Choix modifié à l’écran · enregistre la fiche pour l’appliquer.');
  });

  it('taille sans repère · le bouton est fermé, la raison écrite à côté, le clic ne part pas ; le repère choisi, il part avec la fiche', async () => {
    monter(vue());
    saisir(champ('Taille réelle'), '15 cm de large');
    const bouton = q<HTMLButtonElement>('[data-geste="fiche"]');
    expect(bouton.disabled).toBe(true);
    expect(q(`#${CSS.escape(bouton.getAttribute('aria-describedby')!)}`).textContent).toBe('choisis à quoi comparer la taille réelle : une main, une personne ou un objet courant');
    cliquer(bouton);
    expect(enregistrer).not.toHaveBeenCalled();
    saisir(champ('Comparée à'), 'main');
    saisir(champ('Ce que donne la comparaison'), 'plus large que la paume');
    saisir(champ('Emballage'), 'étui rigide noir');
    expect(q<HTMLButtonElement>('[data-geste="fiche"]').disabled).toBe(false);
    cliquer(q('[data-geste="fiche"]'));
    expect(enregistrer).toHaveBeenCalledWith({ tailleReelle: '15 cm de large', echelle: 'main', echelleDetail: 'plus large que la paume', nonMontre: '', contenuAchat: '', emballage: 'étui rigide noir' }, null);
  });

  it('je choisis les vues · deux au plus, la troisième est fermée avec sa raison ; l’ordre du choix part tel quel', () => {
    monter(vue());
    cliquer(q('[data-geste="vues-choix"]'));
    expect(hote.textContent).toContain('Aucune vue choisie · seule la photo épinglée partira.');
    cliquer(q('[data-vue-choix="3"]'));
    cliquer(q('[data-vue-choix="1"]'));
    const troisieme = q<HTMLButtonElement>('[data-vue-choix="2"]');
    expect(troisieme.disabled).toBe(true);
    expect(q(`#${CSS.escape(troisieme.getAttribute('aria-describedby')!)}`).textContent).toBe('2 vues au plus en plus de la photo épinglée · retires-en une pour en choisir une autre.');
    expect(hote.querySelector('[data-vue-choix="5"]')).toBeNull();
    cliquer(q('[data-geste="fiche"]'));
    expect(enregistrer).toHaveBeenCalledWith(expect.objectContaining({ tailleReelle: '' }), ['ph3', 'ph1']);
  });

  it('une fiche déjà enregistrée se relit dans les champs · un lecteur la voit sans bouton', () => {
    monter(vue({ fiche: { tailleReelle: '15 cm', echelle: 'main', echelleDetail: '', nonMontre: 'logo gravé', contenuAchat: '', emballage: '' }, vuesChoisies: ['ph2'], peutModifier: false }));
    expect(champ('Taille réelle').value).toBe('15 cm');
    expect(champ('Ce que les photos ne montrent pas').value).toBe('logo gravé');
    expect(q('[data-geste="vues-choix"]').getAttribute('aria-checked')).toBe('true');
    expect(hote.querySelector('[data-geste="fiche"]')).toBeNull();
    expect(hote.textContent).toContain('Ton rôle permet de consulter, pas de modifier la fiche.');
  });
});

describe('atelier Produit · l’état de la fiche suit l’épinglage relu', () => {
  beforeEach(() => parcours.lire.mockResolvedValue({ ok: false, code: 'NOT_FOUND', status: 404, message: 'absent', targetIds: [], recoverable: false, traceId: 't' }));
  const atelier = (v: VueProduit) => act(() => racine.render(avecSpatial(<Produit vue={v} atelier={[]} />)));
  const FICHE = { tailleReelle: '15 cm', echelle: 'main', echelleDetail: '', nonMontre: 'logo gravé', contenuAchat: '', emballage: 'étui noir' };

  it('un AUTRE produit épinglé après coup · les champs repartent de sa référence, jamais de l’ancienne fiche', () => {
    atelier(vue({ fiche: FICHE }));
    expect(champ('Emballage').value).toBe('étui noir');
    atelier(vue({ produit: 'pr2' }));
    expect([champ('Taille réelle').value, champ('Emballage').value, champ('Ce que les photos ne montrent pas').value]).toEqual(['', '', '']);
  });

  it('une autre photo épinglée · le choix des vues relu (la nouvelle épinglée n’y est plus)', () => {
    atelier(vue({ vuesChoisies: ['ph3', 'ph2'] }));
    expect(q('[data-vue-choix="3"]').getAttribute('aria-pressed')).toBe('true');
    const v = vue({ vuesChoisies: ['ph2'] });
    atelier({ ...v, epingle: { ...v.epingle!, photo: { ...v.epingle!.photo, assetId: 'ph3', position: 3 } } } as VueProduit);
    expect(hote.querySelector('[data-vue-choix="3"]')).toBeNull();
    expect(q('[data-vue-choix="2"]').getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLButtonElement>('[data-vue-choix="1"]').disabled).toBe(false);
  });

  it('choisir un autre produit à épingler · « La fiche de … sera retirée de ce projet », seulement si la fiche n’est pas vide', () => {
    atelier(vue({ fiche: FICHE }));
    expect(hote.querySelector('[data-avertissement="fiche-retiree"]')).toBeNull();
    const select = [...hote.querySelectorAll('label.field')].find((l) => l.textContent!.startsWith('Produit'))!.querySelector('select')!;
    saisir(select, 'pr2');
    expect(q('[data-avertissement="fiche-retiree"]').textContent).toBe('La fiche de « Lunettes Sport » sera retirée de ce projet. Elle ne suit pas un autre produit.');
    atelier(vue());
    expect(hote.querySelector('[data-avertissement="fiche-retiree"]')).toBeNull();
  });
});
