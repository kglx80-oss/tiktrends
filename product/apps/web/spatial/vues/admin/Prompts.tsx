import { Vue } from '../../communs';
import { Kpis, TeteAdmin, type BandeauAdmin, type KpiAdmin } from './base';
import { BibliothequePrompts, type FamillePromptAffichee } from './prompts-client';

/**
 * « Bibliothèque IA » · `docs/spatial/reference/a-prompts.html`. PRÉSENTATIONNEL.
 *
 * Réel · le registre de prompts de la plateforme (`studio_prompt_versions`),
 * la release active (versions en production), les exécutions sur 30 jours
 * (`studio_prompt_runs`). Sans source · le taux de victoire d'un style (aucune
 * mesure ne relie un style à un résultat publicitaire) · la colonne montre la
 * mise en production à la place.
 */
export interface PropsPrompts {
  bandeau: BandeauAdmin;
  familles: readonly FamillePromptAffichee[];
  kpis: readonly KpiAdmin[];
}

const PIPELINE = [
  { icone: 'shield', libelle: 'Consignes communes' },
  { icone: 'bulb', libelle: 'Template' },
  { icone: 'brush', libelle: 'Recette de style' },
  { icone: 'tag', libelle: 'Fiche marque client' },
  { icone: 'spark', libelle: 'Génération' },
] as const;

export function Prompts(p: PropsPrompts) {
  return (
    <Vue>
      <TeteAdmin titre="Bibliothèque IA" sous="prompts" actif="/admin/prompts" bandeau={p.bandeau} />
      <BibliothequePrompts
        familles={p.familles}
        pipeline={PIPELINE}
        legende="Chaque génération des Studios compile ces couches depuis la release active. Les consignes communes s’appliquent toujours."
        kpis={<Kpis items={p.kpis} />}
        titreListe="Bibliothèque"
      />
    </Vue>
  );
}
