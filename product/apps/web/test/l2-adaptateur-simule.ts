import type { AdaptateurModele, AppelModele } from '../lib/studios/prompts/adaptateur';

/**
 * Fournisseur SIMULÉ · réservé aux tests (il ne vit que sous `test/`).
 *
 * Il ne sort jamais du processus, ne coûte rien, et enregistre chaque requête
 * RÉELLEMENT reçue (les trois messages compilés) : on vérifie ainsi ce qui
 * serait parti vers le modèle, pas ce qu'on croit avoir assemblé. Il est marqué
 * `simule: true` · le résolveur le refuse hors environnement de test.
 */
export function adaptateurSimule(repondre: (a: AppelModele) => unknown): AdaptateurModele & { recues: AppelModele[] } {
  const recues: AppelModele[] = [];
  return {
    nom: 'simule-test',
    simule: true,
    recues,
    modelePour: (profil) => (profil === 'reasoning_structured' ? 'modele-simule' : null),
    async appeler(a) {
      recues.push(a);
      const r = repondre(a);
      const texte = typeof r === 'string' ? r : JSON.stringify(r);
      return { texte, modele: 'modele-simule', jetonsEntree: Math.ceil(JSON.stringify(a.messages).length / 4), jetonsSortie: Math.ceil(texte.length / 4), coutUsd: 0 };
    },
  };
}

/** Une sortie `ready` conforme et sémantiquement juste pour `jarvis.route`. */
export const SORTIE_JARVIS_ROUTE = {
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { intent: 'help', targetIds: [], proposedAction: 'Ouvrir le studio', nextTemplateKey: '', reply: 'Voici la prochaine étape.' },
};

export const ENTREE_JARVIS_ROUTE = { message: 'Que faire ensuite ?', availableActions: ['brief.build'], selectionId: null };
