import { EnTete, SousNav, Vue } from '../../communs';
import type { ActionFormulaire } from './base';
import { AnnonceRetour } from './interactifs';
import { ChoixPersona, type PersonaVue } from './personas-client';

/**
 * « Personas » · `docs/spatial/reference/clients.html` (maquette : `vClients`).
 * PRÉSENTATIONNEL · les personas viennent de `personas`, les scénarios d'usage
 * de `scenarios`. Ce que la base ne porte pas (part des acheteurs, canaux) n'est
 * pas affiché · la case dit ce qui manque.
 */

export type { PersonaVue } from './personas-client';

export interface PropsPersonas {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  nom: string;
  personas: readonly PersonaVue[];
  scenarios: ReadonlyArray<{ titre: string; contexte: string | null }>;
  /** Jarvis ouvert à la personne · `null` sinon (raison au survol). */
  jarvis: string | null;
  creerPub: string | null;
  ajouterPersona: ActionFormulaire | null;
  ajouterScenario: ActionFormulaire | null;
  retours: Record<string, string>;
}

export function Personas(p: PropsPersonas) {
  return (
    <Vue>
      <EnTete titre="Personas" sous={`Les personnes à qui ${p.nom} parle · Jarvis écrit pour elles`} />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}/personas`} />
      <ChoixPersona brandId={p.brandId} personas={p.personas} scenarios={p.scenarios} jarvis={p.jarvis} creerPub={p.creerPub} ajouterPersona={p.ajouterPersona} ajouterScenario={p.ajouterScenario} />
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
