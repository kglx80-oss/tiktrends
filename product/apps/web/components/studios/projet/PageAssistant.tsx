'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssistantProjet, type ProprietesAssistantProjet, type GardeFermetureAssistant } from './AssistantProjet';
import { FenetreAssistant } from './FenetreAssistant';

export function PageAssistant(props: ProprietesAssistantProjet) {
  const [titre, setTitre] = useState('Que voulez-vous créer ?');
  const router = useRouter();
  const garde = useRef<GardeFermetureAssistant>(null);
  const fermer = () => router.push('/studio/projets');
  return <FenetreAssistant onFermer={() => { if (garde.current?.peutFermer()) fermer(); }} titre={titre}><AssistantProjet {...props} gardeFermetureRef={garde} onFermer={fermer} onTitreChange={setTitre} /></FenetreAssistant>;
}
