import type { ReactElement } from 'react';
import { gestesClavierLot, reperesTests, sousNavResultats } from '@tiktrends/core';
import { Lot } from '../../spatial/vues/resultats/Lot';
import { RaccourcisLot } from '../../spatial/vues/resultats/RaccourcisLot';
import { ActionsLot } from '../../spatial/vues/resultats/ActionsLot';
import { Lots, type LigneLot } from '../../spatial/vues/resultats/Lots';
import { Tests } from '../../spatial/vues/resultats/Tests';
import { Decisions } from '../../spatial/vues/resultats/Decisions';
import { FicheTest } from '../../spatial/vues/resultats/FicheTest';
import { Hypotheses } from '../../spatial/vues/resultats/Hypotheses';
import { Boucle } from '../../spatial/vues/resultats/Boucle';
import { Apprentissages } from '../../spatial/vues/resultats/Apprentissages';
import { VueEnsemble } from '../../spatial/vues/resultats/VueEnsemble';
import { Partage } from '../../spatial/vues/resultats/Partage';
import { Tri } from '../../spatial/vues/resultats/Tri';
import { Carte } from '../../spatial/vues/resultats/Carte';
import { CanvasLibre } from '../../spatial/vues/projet/CanvasLibre';
import { Prompts } from '../../spatial/vues/studios/Prompts';
import { Studios } from '../../spatial/vues/studios/Studios';
import { SOUS_NAV_STUDIOS } from '../../spatial/vues/studios/sous-nav';
import type { AdRow } from '../../app/actions/adsmap';
import type { ProposedNode } from '../../app/actions/adsmap-curation';
import { LOT_CONCLU, canevasLignee, propsFicheConclue } from './gagnante-clavier-vues';

/**
 * Des contrôles de ligne aux noms distincts · chaque vue recensée, rendue
 * avec DEUX lignes au moins (sinon rien ne peut entrer en collision), des
 * faits FIGÉS · les mêmes servent à la capture faite sur main avant le
 * changement (`fixtures/noms-accessibles-avant.html`) et à la comparaison ·
 * seuls les `aria-label` ajoutés peuvent différer. Aucune image, aucune date
 * relative à l'horloge.
 */

const NAV = sousNavResultats({ admin: true });
const IMG = null;
const ID = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

const ligneTest = (i: number, o: Partial<AdRow> = {}): AdRow => ({
  id: ID(100 + i), status: 'live', batchNumber: 2, author: null, concept: `Concept ${i}`, conceptId: `c${i}`, desire: 'Gagner du temps', angle: 'Preuve',
  iterationReason: null, hypothesis: 'Si on chiffre, alors on retient.', format: 'video', adType: 'video', briefUrl: null, assetUrl: null,
  variantCode: `v${i}`, testedVariable: 'hook', platform: 'meta', launchedAt: '2026-10-01T00:00:00Z', verdict: 'winner', verdictStatus: 'computed',
  comparable: true, failedStage: null, killFlag: null, cpa: 21.5, cpaHi: 30, spend: 120, purchases: 5, learnings: [], legacyFlags: [], ...o,
});

const lot = (i: number, libelle: string): LigneLot => ({
  id: `l${i}`, etat: 'diffusion', titre: `Lot #${i}`, hypothese: 'Si on change, alors ça bouge.', categorie: 'Accroche', statut: { libelle: 'En diffusion', classe: 'c' },
  anneau: { part: 50, libelle: 'J6', classe: 'c' }, action: { libelle, href: `/adsmap/lots/l${i}`, primaire: false },
  pubs: [{ texte: ' ', image: IMG }], mesure: 'Meta · Coût par achat',
});

const noeud = (id: string, label: string): ProposedNode => ({ id, kind: 'persona', label, parents: [], descendants: 0, tested: 0, rename: null, notice: null, warning: null });

const prompt = (i: number) => ({
  id: `pr${i}`, categorie: 'iterer', titre: `Prompt ${i}`, description: 'd', morceaux: [{ texte: 'texte ' }, { texte: 'VAR', variable: true }],
  pastilles: [{ libelle: 'Image', classe: '' }], requis: 'r', appui: 'a', utiliser: `/studio/projets/nouveau?prompt=pr${i}`,
  iteration: { href: `/studio/iterer?prompt=pr${i}`, raison: null },
});

const carteIter = (i: number) => ({
  id: `a${i}`, flux: [{ src: 'https://cdn.exemple/creative.jpg', texte: 'gagnante', classe: 'won', tag: 'Gagnante' }],
  pastille: { libelle: 'Gagnante · Lot #1 conclu', classe: 'g', icone: 'bulb' }, titre: `Concept · ${i}`,
  mesure: null, garde: 'Garde · visuel', change: 'Change · accroche', raison: 'Raison réelle.', iterer: `/studio/projets/nouveau?type=ads&iter=x${i}`, note: 'Gratuit ici',
});

/** Les vues recensées · une clé stable par vue (la capture est rangée par clé). */
export const VUES_NOMS: Record<string, () => ReactElement> = {
  'resultats/lot · fiche conclue': () => {
    const l = LOT_CONCLU;
    const k = gestesClavierLot({ etat: l.etat, ads: l.ads, gagnante: l.gagnante, planIds: new Set(l.ads.map((a) => a.id)) });
    return <Lot {...propsFicheConclue()} actions={<RaccourcisLot conclure={k.conclure} iterer={k.iterer} />} />;
  },
  'resultats/actions-lot · composition': () => (
    <ActionsLot mode="composition" lotId="l1" pret={false} brief={null}
      variantes={[{ id: ID(1), variante: 'v1', concept: 'Trois erreurs', manques: [], nom: null }, { id: ID(2), variante: 'v2', concept: 'Trois erreurs', manques: [], nom: null }]}
      vivier={[{ id: ID(3), variante: 'v3', concept: 'Trois erreurs', manques: [], nom: null }, { id: ID(4), variante: 'v4', concept: 'Preuve', manques: [], nom: null }]} />
  ),
  'resultats/actions-lot · arbitrage': () => (
    <ActionsLot mode="arbitrage" lotId="l1" aArbitrer={[{ id: ID(5), variante: 'v1', verdict: 'Gagnante', raison: null, calcule: 'winner' }, { id: ID(6), variante: 'v2', verdict: 'Perdante', raison: null, calcule: 'loser' }]} />
  ),
  'resultats/lots': () => <Lots sousNav={NAV} sous="3 lots" peutCreer note="n" lots={[lot(1, 'Voir'), lot(2, 'Voir'), lot(3, 'Conclure')]} />,
  'resultats/tests': () => {
    const lignes = [ligneTest(1), ligneTest(2, { verdict: null, verdictStatus: null })];
    return <Tests sousNav={NAV} sous="s" lots={[]} filtres={{}} lignes={lignes} erreur={null} reperes={reperesTests(lignes)} admin />;
  },
  'resultats/decisions': () => (
    <Decisions sousNav={NAV} sous="s" resume="2 décisions" ecartees={0} erreur={null} decisions={[
      { id: 'd1', type: 'kill_suggested', titre: 'v1 brûle', action: 'Couper', priorite: 1, enJeu: 80, adId: ID(7) },
      { id: 'd2', type: 'kill_suggested', titre: 'v2 brûle', action: 'Couper', priorite: 1, enJeu: 60, adId: ID(8) },
    ]} />
  ),
  'resultats/fiche-test · filiation': () => (
    <FicheTest titre="Trois erreurs" sous="v1 · lot 2" provenance={null} retour={null} hypothese="Si on chiffre, alors on retient." arbitre={null} apprentissages={[]}
      resultat={{ type: 'vide', texte: 'Pas encore lancée', prochaine: { texte: 'La placer dans un lot', lien: { href: '/adsmap/lots', libelle: 'Préparer un test' } } }}
      filiation={{ parent: { href: `/adsmap/tests/${ID(9)}`, texte: 'Née de v0 · Trois erreurs' }, enfants: [{ href: `/adsmap/tests/${ID(10)}`, texte: 'v2 · accroche chiffrée', verdict: 'Gagnante' }, { href: `/adsmap/tests/${ID(11)}`, texte: 'v3 · accroche question', verdict: null }] }} />
  ),
  'resultats/hypotheses': () => (
    <Hypotheses sousNav={NAV} jarvis={false} note="n" cartes={[
      { cle: '1', colonne: 'test', categorie: 'Accroche', priorite: 2, texte: 'Si on passe au 9:16, alors le coût baisse, parce que le 9:16 occupe l’écran.', meta: 'm', action: { libelle: 'Voir', href: '/adsmap/lots/l1' }, conclusion: null },
      { cle: '2', colonne: 'test', categorie: 'Texte', priorite: 1, texte: 'Si on tutoie, alors le clic tient, parce que les concurrents tutoient.', meta: 'm', action: { libelle: 'Voir', href: '/adsmap/lots/l2' }, conclusion: null },
    ]} />
  ),
  'resultats/boucle': () => (
    <Boucle sousNav={NAV} kpis={[]}
      prochaine={{ titre: 'Conclure le lot #1', phrase: 'p', bouton: 'Conclure le lot', href: '/adsmap/lots/l1' }}
      idees={[1, 2].map((i) => ({ id: `i${i}`, icone: 'chat', teinte: 'bleu' as const, origine: 'Suite', texte: `Idée ${i}`, categorie: 'Accroche', action: { libelle: 'Formuler', href: `/adsmap/suites?depuis=${i}` } }))}
      ajouter="/adsmap/suites"
      preparation={[3, 4].map((i) => ({ id: `p${i}`, titre: `Lot #${i}`, categorie: 'Visuel', action: { libelle: 'Compléter', href: `/adsmap/lots/l${i}` }, preparation: { part: 50, texte: 'Préparation 2/4' } }))}
      diffusion={[5, 6].map((i) => ({ id: `d${i}`, titre: `Lot #${i}`, categorie: 'Format', action: { libelle: 'Suivre', href: `/adsmap/lots/l${i}` }, image: IMG, r916: false, part: 43, jour: 'J6 / 14', bilan: 'b' }))}
      analyse={[7, 8].map((i) => ({ id: `a${i}`, titre: `Lot #${i}`, categorie: 'Accroche', pubs: [], detail: 'd', statut: { libelle: 'À conclure', classe: 'g' }, action: { libelle: 'Conclure', href: `/adsmap/lots/l${i}` } }))}
      apprentissages={[]} alimenter={[]} />
  ),
  'resultats/apprentissages': () => (
    <Apprentissages sousNav={NAV} cartes={[
      { id: '1', niveau: 3, icone: 'text', etat: 'valide', titre: 'La question retient', preuve: null, pied: 'Lot #1', usage: null, action: { libelle: 'Itérer', href: '/adsmap/suites?depuis=1' } },
      { id: '2', niveau: 2, icone: 'img', etat: 'valide', titre: 'Le 9:16 coûte moins', preuve: null, pied: 'Lot #2', usage: null, action: { libelle: 'Itérer', href: '/adsmap/suites?depuis=2' } },
    ]} />
  ),
  'resultats/vue-ensemble': () => (
    <VueEnsemble sousNav={NAV} sous="s" accroche={{ avant: '', fort: '', apres: '' }} kpis={[]} vedette={null} commencer={{ libelle: 'Préparer un lot', href: '/adsmap/lots' }}
      autres={[1, 2].map((i) => ({ id: `o${i}`, alerte: false, statut: { libelle: 'En cours', classe: 'c' as const }, titre: `Lot #${i}`, pubs: [], progression: null, texte: 't', action: { libelle: 'Suivre', href: `/adsmap/lots/l${i}` } }))} />
  ),
  'resultats/partage': () => (
    <Partage sousNav={NAV} sous="s" erreur={null} liens={[
      { id: 'a', token: 'tok-un', expiresAt: null, createdAt: '', expired: false },
      { id: 'b', token: 'tok-deux', expiresAt: null, createdAt: '', expired: false },
    ]} />
  ),
  'resultats/tri': () => (
    <Tri sousNav={NAV} sous="s" erreur={null} fusion={false}
      vue={{ nodes: [noeud('n1', 'Parents pressés'), noeud('n2', 'Sportifs du matin')], counts: { persona: 2, desire: 0, angle: 0, concept: 0 }, matched: { persona: 2, desire: 0, angle: 0, concept: 0 }, q: '', limit: 20 }} />
  ),
  'resultats/carte': () => (
    <Carte sousNav={NAV} sous="s" aretes={[]} tronquee={false} erreur={null} construire
      noeuds={[
        { id: 'pe1', kind: 'persona', label: 'Parents pressés', parentId: null, status: 'validated', childCount: 0, mechanism: null },
        { id: 'pe2', kind: 'persona', label: 'Sportifs du matin', parentId: null, status: 'validated', childCount: 0, mechanism: null },
      ]} />
  ),
  'projet/lignee': () => <CanvasLibre c={canevasLignee('resultat:va1')} cibler={() => {}} />,
  'studios/prompts': () => (
    <Prompts sousNav={SOUS_NAV_STUDIOS} categories={[{ cle: 'iterer', libelle: 'Itérer · 2' }]} contexte={null} prompts={[prompt(1), prompt(2)]} vide={{ titre: '', texte: '' }} />
  ),
  'studios/iterations': () => (
    <Studios sousNav={SOUS_NAV_STUDIOS} projets={[]} nouveau={{ href: '/studio/projets/nouveau' }} peutArchiver={false} vide={null}
      iterations={{ etat: 'liste', cartes: [carteIter(1), carteIter(2)], autre: { href: '/studio/iterer', titre: 'Itérer sur une autre créa', sous: 'x' } }} />
  ),
};
