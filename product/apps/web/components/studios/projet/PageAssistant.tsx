'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssistantProjet, type ProprietesAssistantProjet } from './AssistantProjet';
import { FenetreAssistant } from './FenetreAssistant';

export function PageAssistant(props: ProprietesAssistantProjet) {
  const [titre, setTitre] = useState('Que voulez-vous créer ?');
  const router = useRouter();
  const fermer = () => router.push('/studio/projets');
  return <FenetreAssistant onFermer={fermer} titre={titre}><AssistantProjet {...props} onFermer={fermer} onTitreChange={setTitre} /></FenetreAssistant>;
}
