import { PageAssistant } from './PageAssistant';
import type { ProprietesAssistantProjet } from './AssistantProjet';
import type { DepartAssistant } from '../../../app/actions/studios/departs-assistant';

/** Données relues par la route serveur, jamais les paramètres URL bruts. */
export interface ContexteInitialAssistant {
  depart: DepartAssistant | null;
  references: DepartAssistant[];
  notes: string[];
  retourVeille: { href: string } | null;
}

/** Adaptateur serveur sans création, proposition, génération ou mutation. */
export function AssistantDepuisContexte(props: ProprietesAssistantProjet & { contexteInitial: ContexteInitialAssistant }) {
  return <PageAssistant {...props} />;
}
