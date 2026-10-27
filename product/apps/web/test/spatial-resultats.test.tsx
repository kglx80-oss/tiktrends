// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_VERDICT_CONFIG, kpisResultats, sousNavResultats, type CarteHypothese, type EtatLotSpatial } from '@tiktrends/core';
import { parite, squelette, fragmentReference } from './spatial/parite';

vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
// Les vues interactives appellent les actions serveur EXISTANTES · neutralisées ici (rendu seul).
vi.mock('../app/actions/adsmap-batch', () => ({ createBatchAction: async () => ({}), setBatchAdAction: async () => ({}), prepareBatchAction: async () => ({}), launchBatchAction: async () => ({}) }));
const espions = vi.hoisted(() => ({ valider: vi.fn(async (_: unknown) => ({ ok: true })), enregistrer: vi.fn(async (_: unknown) => ({ ok: true })) }));
vi.mock('../app/actions/adsmap-verdict', () => ({ validateVerdictAction: espions.valider }));
vi.mock('../app/actions/adsmap-protocol', () => ({ saveSettingsAction: espions.enregistrer }));
vi.mock('../app/actions/adsmap', () => ({ syncAdsMapAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-import', () => ({ previewImportAction: async () => ({}), applyImportAction: async () => ({}) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { VueEnsemble } from '../spatial/vues/resultats/VueEnsemble';
import { Lots } from '../spatial/vues/resultats/Lots';
import { Lot } from '../spatial/vues/resultats/Lot';
import { Protocole } from '../spatial/vues/resultats/Protocole';
import { Importer } from '../spatial/vues/resultats/Importer';
import { Apprentissages } from '../spatial/vues/resultats/Apprentissages';
import { Hypotheses } from '../spatial/vues/resultats/Hypotheses';
import { Boucle } from '../spatial/vues/resultats/Boucle';
import { ActionsLot } from '../spatial/vues/resultats/ActionsLot';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const IMG = 'https://cdn.exemple.test/v.jpg';
const NAV = sousNavResultats({ admin: true });
/**
 * `.ad .ph` · le cadrage de l'image d'exemple de la maquette (object-position,
 * scale, filtre sépia posés sur UNE photo fictive pour simuler des variantes) ·
 * ici chaque variante montre SON média réel, sans recadrage inventé.
 */
const SANS_CADRAGE_FICTIF = ['.ad .ph'];
/** React place un `<link rel=preload>` par image en tête du rendu · on compare la vue elle-même. */
const VUE = { selecteur: 'div.view', ignorer: SANS_CADRAGE_FICTIF };

describe('Spatial · Résultats · parité de structure avec la maquette', () => {
  it('« Vue d’ensemble » reproduit la maquette', () => {
    const k = kpisResultats({ depense: 10416, impressions: 54300, vues3s: 13032, achats: 1327, ventes: 18957 }, { depense: 8857, impressions: 50000, vues3s: 10500, achats: 1150, ventes: 16400 });
    const html = rendre(
      <VueEnsemble
        sousNav={NAV} sous="14 derniers jours · Meta"
        accroche={{ avant: 'Le lot #1 est prêt à donner sa réponse :', fort: 'v2 · Gagnante.', apres: 'Deux autres attendent une action de ta part.' }}
        kpis={k}
        vedette={{
          statut: { libelle: 'À conclure', classe: 'g' }, meta: 'Lot #1 · 14 jours · Meta', titre: 'Quelle accroche ?',
          variantes: ['A', 'B', 'C'].map((v, i) => ({ id: v, texte: 'x', image: IMG, variante: v, categorie: 'Accroche', gagnante: i === 1, barre: { libelle: '21 €', part: 80 } })),
          note: 'n', passe: 'p', retient: { texte: 'r', niveau: 3, detail: 'Mesuré' }, ensuite: 'e',
          suite: { libelle: 'Préparer la suite', href: '/adsmap/suites' }, lot: { libelle: 'Conclure le lot #1', href: '/adsmap/lots/l1' },
        }}
        autres={[
          { id: 'a', alerte: false, statut: { libelle: 'En cours', classe: 'c' }, titre: 'Lot #2', pubs: [{ texte: '4:5', image: IMG }, { texte: '9:16', image: IMG, r916: true }], progression: 43, texte: 't', action: { libelle: 'Suivre', href: '/adsmap/lots/l2' } },
          { id: 'b', alerte: true, statut: { libelle: 'Terminé', classe: 'w' }, titre: 'Lot #4', pubs: [{ texte: 'Sie', image: IMG }, { texte: 'Du', image: IMG }], progression: null, texte: 't', action: { libelle: 'Importer', href: '/adsmap/import' } },
          { id: 'c', alerte: false, statut: { libelle: 'Prêt à lancer', classe: '' }, titre: 'Lot #3', pubs: [{ texte: 'P', image: IMG }, { texte: 'A', image: IMG }], progression: null, texte: 't', action: { libelle: 'Lancer', href: '/adsmap/lots/l3' } },
        ]}
        commencer={{ libelle: 'Préparer un lot', href: '/adsmap/lots' }}
      />,
    );
    const p = parite(html, 'resultats', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Lots de test » reproduit la maquette', () => {
    const lot = (id: string, etat: EtatLotSpatial, statut: string, classe: '' | 'c' | 'g' | 'w', anneau: '' | 'c' | 'g' | 'w', primaire = false, r916 = false) => ({
      id, etat, titre: `Lot ${id}`, hypothese: 'Si on change, alors ça bouge.', categorie: 'Accroche', statut: { libelle: statut, classe },
      anneau: { part: 50, libelle: 'J6', classe: anneau }, action: { libelle: 'Voir', href: `/adsmap/lots/${id}`, primaire },
      pubs: [{ texte: ' ', image: IMG, r916 }, { texte: ' ', image: IMG }], mesure: 'Meta · Coût par achat',
    });
    const html = rendre(
      <Lots sousNav={NAV} sous="4 lots" peutCreer note="n"
        lots={[lot('1', 'a_conclure', 'À conclure', 'g', 'g', true), lot('2', 'diffusion', 'En diffusion', 'c', 'c', false, true), lot('3', 'pret', 'Prêt à lancer', '', 'c'), lot('4', 'a_importer', 'Mesures à importer', 'w', 'w')]} />,
    );
    const p = parite(html, 'lots', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Lot » (fiche, verdict) reproduit la maquette', () => {
    const html = rendre(
      <Lot sous="Lot #1 · Meta · 14 jours" titre="Affirmation ou question ?"
        verdict={{ gagnant: true, titre: 'v2 · Gagnante', phrase: 'CPA sous la cible.', niveau: 3 }}
        variantes={['v1', 'v2', 'v3'].map((v, i) => ({ id: v, texte: 'x', image: IMG, tag: `${v} · perdante`, gagnante: i === 1, barre: { libelle: '21 €', part: 70 } }))}
        controles={[{ icone: 'cal', titre: '14 jours sur 14', detail: 'd' }, { icone: 'chart', titre: '18 000 impressions', detail: 'd' }, { icone: 'lock', titre: 'Règle respectée', detail: 'd' }]}
        coach={{ avant: 'Le moteur retient :', fort: 'v2 · Gagnante', apres: '.' }}
      />,
    );
    const p = parite(html, 'lot1', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Protocole » reproduit la maquette', () => {
    const html = rendre(
      <Protocole sousNav={NAV} peutModifier
        initial={{ protocol: { structure: 'abo_one_adset_per_ad', dailyBudgetPerAd: 20, durationDays: 14, audienceRule: 'broad', campaignNamePattern: 'x', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG, evaluationWindowDays: 14, minImpressions: 15000 }, namingPattern: 'x', isDefault: false }}
        garanties={[{ ok: true, texte: 'a' }, { ok: true, texte: 'b' }, { ok: true, texte: 'c' }, { ok: false, texte: 'd' }]}
      />,
    );
    const p = parite(html, 'protocole', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Importer des résultats » reproduit la maquette', () => {
    const html = rendre(
      <Importer sousNav={NAV} meta={{ connecte: false, mesure: null }}
        remontees={[{ source: 'meta', texte: 'Mesure Meta', le: '2026-10-27T08:00:00Z', quand: 'il y a 2 h' }, { source: 'tableau', texte: 'Tableau · Lot #4', le: '2026-10-26T08:00:00Z', quand: 'hier' }, { source: 'tableau', texte: 'Tableau · Lot #1', le: '2026-10-11T08:00:00Z', quand: '11 oct.' }]}
      />,
    );
    // `.conn2:nth-child(2) .t` · la tuile TikTok de la maquette se dit « Synchronisé il y a 2 h · 18
    // publicités » (pastille verte) · aucun connecteur TikTok n'existe, l'écran réel dit « Bientôt ».
    const p = parite(html, 'importer', { selecteur: 'div.view', ignorer: ['.conn2:nth-child(2) .t'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Apprentissages » reproduit la maquette', () => {
    const preuve = [{ texte: ' ', image: IMG, libelle: '30 €', part: 70, gagne: false }, { texte: ' ', image: IMG, libelle: '21 €', part: 100, gagne: true }];
    const html = rendre(
      <Apprentissages sousNav={NAV} cartes={[
        { id: '1', niveau: 3, icone: 'q', etat: 'valider', titre: 't', preuve, pied: 'Lot #1', usage: null, action: { libelle: 'Valider', href: '/adsmap/lots/1' } },
        { id: '2', niveau: 3, icone: 'text', etat: 'valide', titre: 't', preuve, pied: 'Lot #0', usage: 'appliqué dans 5 briefs', action: { libelle: 'Itérer', href: '/adsmap/suites' } },
        { id: '3', niveau: 2, icone: 'img', etat: 'valide', titre: 't', preuve: null, pied: 'p', usage: 'appliqué dans 3 briefs', action: { libelle: 'Itérer', href: '/adsmap/suites' } },
        { id: '4', niveau: 1, icone: 'phone', etat: 'retester', titre: 't', preuve: null, pied: 'p', usage: null, action: { libelle: 'Tester', href: '/adsmap/hypotheses' } },
      ]} />,
    );
    const p = parite(html, 'apprentissages', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Hypothèses » reproduit la maquette', () => {
    const c = (cle: string, colonne: CarteHypothese['colonne'], categorie: string, priorite: CarteHypothese['priorite'], texte: string, conclue = false): CarteHypothese => ({
      cle, colonne, categorie, priorite, texte, meta: 'm',
      action: conclue ? null : { libelle: 'Voir', href: '/adsmap/lots' },
      conclusion: conclue ? { libelle: 'Confirmée', classe: 'g', icone: 'check' } : null,
    });
    const html = rendre(
      <Hypotheses sousNav={NAV} jarvis note="n" cartes={[
        c('1', 'formuler', 'Offre', 0, 'Si le prix barré apparaît dans l’image, alors… ?'),
        c('2', 'formuler', 'Accroche', 2, 'Si l’accroche reprend la question gagnante, alors le taux se maintient, parce que cela prolonge A1.'),
        c('3', 'prete', 'Visuel', 3, 'Si on montre une vidéo UGC, alors le taux de clic augmente, parce que les avis le disent.'),
        c('4', 'test', 'Format', 2, 'Si on passe au 9:16, alors le coût baisse, parce que le 9:16 occupe l’écran.'),
        c('5', 'test', 'Texte', 1, 'Si on tutoie, alors le clic tient, parce que les concurrents tutoient.'),
        c('6', 'conclue', 'Accroche', 3, 'Si l’accroche s’ouvre sur une question, alors on regarde plus, parce que 3 concurrents le font.', true),
      ]} />,
    );
    const p = parite(html, 'hypotheses', VUE);
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Boucle d’itération » reproduit la maquette', () => {
    const k = { libelle: 'k', valeur: '7', note: 'n' };
    const html = rendre(
      <Boucle sousNav={NAV} kpis={[k, { ...k, libelle: 'l' }, { ...k, libelle: 'm' }, { ...k, libelle: 'o' }]}
        prochaine={{ titre: 'Conclure le lot #1', phrase: 'p', bouton: 'Conclure le lot', href: '/adsmap/lots/1' }}
        idees={([['a', 'chat'], ['b', 'users'], ['c', 'eye']] as const).map(([id, icone]) => ({ id, icone, teinte: 'bleu' as const, origine: 'Suite', texte: 't', categorie: 'Accroche', action: { libelle: 'Formuler', href: '/adsmap/suites' } }))}
        ajouter="/adsmap/suites"
        preparation={[{ id: 'p', titre: 'Lot #3', categorie: 'Visuel', action: { libelle: 'Compléter', href: '/adsmap/lots/3' }, fait: 2, sur: 4 }]}
        diffusion={[{ id: 'd', titre: 'Lot #2', categorie: 'Format', action: { libelle: 'Suivre', href: '/adsmap/lots/2' }, image: IMG, r916: true, part: 43, jour: 'J6 / 14', bilan: 'b' }]}
        analyse={[
          { id: 'a1', titre: 'Lot #1', categorie: 'Accroche', pubs: [{ image: IMG, gagne: true }, { image: IMG, gagne: false }], detail: 'd', statut: { libelle: 'À conclure', classe: 'g' }, action: { libelle: 'Conclure', href: '/adsmap/lots/1' } },
          { id: 'a2', titre: 'Lot #4', categorie: 'Texte', pubs: [{ image: IMG, gagne: false }], detail: 'd', statut: { libelle: 'À importer', classe: 'w' }, action: { libelle: 'Importer', href: '/adsmap/import' } },
        ]}
        apprentissages={[
          { id: '1', niveau: 3, texte: 't', statut: { libelle: 'À valider', classe: 'w' }, valide: null },
          { id: '2', niveau: 3, texte: 't', statut: { libelle: 'Validé', classe: 'g' }, valide: 'Validé en oct.' },
          { id: '3', niveau: 2, texte: 't', statut: { libelle: 'Validé', classe: 'g' }, valide: 'Validé en sept.' },
          { id: '4', niveau: 1, texte: 't', statut: { libelle: 'À retester', classe: '' }, valide: null },
        ]}
        alimenter={[
          { icone: 'chat', teinte: 'bleu', titre: 'a', texte: 't', action: { libelle: 'Ouvrir Jarvis', href: '/jarvis', primaire: true } },
          { icone: 'eye', teinte: 'ambre', titre: 'b', texte: 't', action: { libelle: 'Veille', href: '/veille' } },
          { icone: 'users', teinte: 'vert', titre: 'c', texte: 't', action: { libelle: 'Avis', href: '/brands/b1' } },
          { icone: 'down', teinte: 'rose', titre: 'd', texte: 't', action: { libelle: 'Importer', href: '/adsmap/import' } },
          { icone: 'bulb', teinte: 'violet', titre: 'e', texte: 't', action: { libelle: 'Suites', href: '/adsmap/suites' } },
        ]}
      />,
    );
    const p = parite(html, 'boucle', VUE);
    expect(p.rendu).toEqual(p.reference);
  });
});

/* ───────────────────────── comportements (jsdom) ───────────────────────── */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function monter(n: React.ReactNode) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const root = createRoot(hote);
  act(() => root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>));
  return { hote, fin: () => { act(() => root.unmount()); hote.remove(); } };
}
/** Saisie contrôlée React · le setter natif, puis l'événement `input`. */
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const bouton = (h: HTMLElement, texte: RegExp) => [...h.querySelectorAll('button')].find((b) => texte.test(b.textContent ?? ''))!;

describe('Spatial · Résultats · comportements', () => {
  it('les filtres des lots ne montrent que l’état choisi, et « Tous » les rend tous', () => {
    const l = (id: string, etat: EtatLotSpatial) => ({ id, etat, titre: id, hypothese: null, categorie: 'Accroche', statut: { libelle: etat, classe: '' as const }, anneau: { part: 0, libelle: '–', classe: '' as const }, action: { libelle: 'Voir', href: `/adsmap/lots/${id}`, primaire: false }, pubs: [], mesure: 'm' });
    const { hote, fin } = monter(<Lots sousNav={NAV} sous="s" peutCreer={false} note="n" lots={[l('a', 'a_conclure'), l('b', 'diffusion'), l('c', 'composition'), l('d', 'pret'), l('e', 'conclu')]} />);
    expect(hote.querySelectorAll('.lotrow')).toHaveLength(5);
    expect(bouton(hote, /En préparation/).textContent).toBe('En préparation · 2');
    act(() => bouton(hote, /À conclure/).click());
    expect([...hote.querySelectorAll('.lotrow h3')].map((x) => x.textContent)).toEqual(['a']);
    act(() => bouton(hote, /En préparation/).click());
    expect([...hote.querySelectorAll('.lotrow h3')].map((x) => x.textContent)).toEqual(['c', 'd']);
    act(() => bouton(hote, /Tous/).click());
    expect(hote.querySelectorAll('.lotrow')).toHaveLength(5);
    // Sans droit de création, pas de bouton « Nouveau lot ».
    expect(bouton(hote, /Nouveau lot/)).toBeUndefined();
    fin();
  });

  it('le protocole enregistre la période et le volume lus, et refuse un volume illisible', async () => {
    espions.enregistrer.mockClear();
    const { hote, fin } = monter(
      <Protocole sousNav={NAV} peutModifier garanties={[]}
        initial={{ protocol: { structure: 'abo_one_adset_per_ad', dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', campaignNamePattern: 'x', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG }, namingPattern: 'x', isDefault: false }} />,
    );
    const champ = hote.querySelector('input')!;
    act(() => saisir(champ, 'beaucoup'));
    await act(async () => bouton(hote, /Enregistrer/).click());
    expect(espions.enregistrer).not.toHaveBeenCalled();
    expect(hote.querySelector('.foot2 small')!.textContent).toMatch(/volume minimum/);
    act(() => saisir(champ, '20 000 impressions'));
    const periode = hote.querySelectorAll('select')[1]!;
    act(() => { periode.value = '21'; periode.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => bouton(hote, /Enregistrer/).click());
    expect(espions.enregistrer).toHaveBeenCalledTimes(1);
    const envoye = espions.enregistrer.mock.calls[0]![0] as { verdict: { minImpressions: number; evaluationWindowDays: number; targetCpa: number } };
    expect(envoye.verdict).toMatchObject({ minImpressions: 20000, evaluationWindowDays: 21, targetCpa: DEFAULT_VERDICT_CONFIG.targetCpa });
    fin();
  });

  it('un membre sans droit voit le protocole en lecture · rien ne part', async () => {
    espions.enregistrer.mockClear();
    const { hote, fin } = monter(
      <Protocole sousNav={NAV} peutModifier={false} garanties={[]}
        initial={{ protocol: { structure: 'abo_one_adset_per_ad', dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', campaignNamePattern: 'x', budgetVarianceTolerance: 0.2 }, verdict: { ...DEFAULT_VERDICT_CONFIG }, namingPattern: 'x', isDefault: false }} />,
    );
    expect(bouton(hote, /Enregistrer/).disabled).toBe(true);
    expect(hote.querySelector('input')!.disabled).toBe(true);
    expect(hote.querySelector('.foot2 small')!.textContent).toMatch(/administrateurs/);
    fin();
  });

  it('conclure valide le verdict CALCULÉ avec l’apprentissage écrit, variante par variante', async () => {
    espions.valider.mockClear();
    const { hote, fin } = monter(<ActionsLot mode="arbitrage" lotId="l1" aArbitrer={[{ id: 'ad1', variante: 'v1', verdict: 'Gagnante', raison: 'CPA sous la cible', calcule: 'winner' }, { id: 'ad2', variante: 'v2', verdict: 'Perdante', raison: null, calcule: 'loser' }]} />);
    const formulaires = hote.querySelectorAll('form');
    expect(formulaires).toHaveLength(2);
    act(() => saisir(formulaires[1]!.querySelector('textarea')!, 'Une affirmation seule ne retient pas en ouverture.'));
    act(() => bouton(formulaires[1] as HTMLElement, /L’offre/).click());
    await act(async () => { formulaires[1]!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(espions.valider).toHaveBeenCalledWith({ adId: 'ad2', value: 'loser', learning: { statement: 'Une affirmation seule ne retient pas en ouverture.', scope: 'offer', confidence: 3 } });
    expect(hote.querySelector('[role=status]')!.textContent).toMatch(/v2 · verdict validé/);
    fin();
  });

  it('un refus de l’action se dit · aucun succès affiché', async () => {
    espions.valider.mockClear();
    espions.valider.mockResolvedValueOnce({ error: 'L’apprentissage doit dire ce qu’on a compris.' } as never);
    const { hote, fin } = monter(<ActionsLot mode="arbitrage" lotId="l1" aArbitrer={[{ id: 'ad1', variante: 'v1', verdict: 'Gagnante', raison: null, calcule: 'winner' }]} />);
    await act(async () => { hote.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(hote.querySelector('[role=alert]')!.textContent).toMatch(/doit dire/);
    expect(hote.querySelector('[role=status]')).toBeNull();
    fin();
  });
});

describe('Spatial · Résultats · les gardes de parité voient un écart', () => {
  it('retirer une carte de lot du fragment fait tomber la comparaison', () => {
    const ref = squelette(fragmentReference('lots'), VUE);
    const ampute = fragmentReference('lots').replace(/<div class="lotrow"[\s\S]*?Conclure<\/a><\/div>/, '');
    expect(squelette(ampute, VUE)).not.toEqual(ref);
  });
});
