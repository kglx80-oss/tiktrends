'use client';

import { useRouter } from 'next/navigation';
import { AssistantProjet, type ProprietesAssistantProjet } from './AssistantProjet';
import { FenetreAssistant } from './FenetreAssistant';

export function PageAssistant(props: ProprietesAssistantProjet) {
  const router = useRouter();
  const fermer = () => router.push('/studio/projets');
  return <FenetreAssistant onFermer={fermer}><AssistantProjet {...props} onFermer={fermer} /></FenetreAssistant>;
}
