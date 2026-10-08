import type { PlanCas } from '@tiktrends/core';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { SCENARIOS, type EtatCas, type Jeu } from '../lib/studios/benchmark/scenarios';
import { exigerPiecesConformes, type AdaptateurModele, type AppelModele } from '../lib/studios/prompts/adaptateur';
import type { ExecuteurMedias } from '../lib/studios/benchmark/campagne';
import { jsonCanonique } from '../lib/studios/prompts/noyau';

/**
 * Outils des tests F-D · un adaptateur « réel » ESPION (`simule: false`, ne
 * sort pas du processus, 0 $) qui répond, pour chaque appel, la réponse écrite
 * dans `scenarios.ts` pour l'étape dont les entrées sont dans le message
 * RÉELLEMENT reçu (gabarit compilé), dans l'ordre du plan. Il applique le
 * contrat des pièces natives comme l'adaptateur réel.
 */
export function espionScenarios(jeu: Jeu, plans: readonly PlanCas[]) {
  const attendus = plans.flatMap((p) => p.deroule.flatMap((d) => (d.etape.nature === 'tache' ? [{ cas: p.id, etapeId: d.etape.id, sortie: d.sortie, templateKey: d.etape.templateKey }] : [])));
  let i = 0;
  const appels: AppelModele[] = [];
  const etatVide = (): EtatCas => ({ jeu, resultats: new Map(), medias: new Map(), mesures: {}, octets: new Map(), joints: new Map() });
  const a: AdaptateurModele = {
    nom: 'espion-reel', simule: false,
    modelePour: (p) => (p === 'reasoning_structured' || p === 'vision_analysis' ? 'claude-sonnet-5' : null),
    async appeler(x) {
      exigerPiecesConformes(x);
      appels.push(x);
      const user = x.messages.find((m) => m.role === 'user')?.contenu ?? '';
      for (let k = i; k < attendus.length; k++) {
        const e = attendus[k]!;
        if (`studio-prompt:${e.templateKey}` !== x.action) continue;
        const fab = SCENARIOS[e.cas]?.taches[e.etapeId];
        const rep = SCENARIOS[e.cas]?.simule[e.etapeId];
        if (!fab || !rep) continue;
        const entree = fab(jeu, e.sortie, etatVide());
        if (!user.includes(jsonCanonique(entree.taskInputs, 'js'))) continue;
        i = k + 1;
        return { texte: JSON.stringify(rep(e.sortie, entree)), modele: 'claude-sonnet-5', jetonsEntree: 100, jetonsSortie: 100, coutUsd: 0 };
      }
      throw new Error(`aucune réponse écrite pour ${x.action}`);
    },
  };
  return { a, appels };
}

/** Exécuteur média factice des deux profils · rejoue les pixels écrits des scénarios, sous la barrière de la campagne. */
export function executeurFactice(jeu: Jeu): ExecuteurMedias & { demandes: string[] } {
  const demandes: string[] = [];
  return {
    nom: 'factice-test', profils: ['image_generation', 'animation'], demandes,
    async produire(d) {
      demandes.push(`${d.cas}/${d.etapeId}#${d.sortie}`);
      const g = SCENARIOS[d.cas]?.mediasSimules?.[d.etapeId];
      const etat: EtatCas = { jeu, resultats: new Map(), medias: new Map(), mesures: {} };
      const images = g ? g(etat, d.sortie) : [];
      return Promise.all(images.map(async (img) => ({ octets: await encoder(img), mime: 'image/png' })));
    },
  };
}
