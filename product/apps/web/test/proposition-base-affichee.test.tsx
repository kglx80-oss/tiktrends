// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({lister:vi.fn(),creer:vi.fn(),proposer:vi.fn()}));
vi.mock('../app/actions/studios/propositions',()=>({listerPropositions:m.lister,creerPropositionManuelle:m.creer,proposerBrief:m.proposer,appliquerProposition:vi.fn(),rejeterProposition:vi.fn()}));
import {usePropositionsBrief,type CyclePropositionsBrief} from '../components/studios/projet/usePropositionsBrief';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('proposition manuelle reste liée à la version du brief affiché même si la liste indique plus récent',async()=>{
 let cycle:CyclePropositionsBrief;function Vue(){cycle=usePropositionsBrief('p',{id:'version-affichee',n:1});return null}
 m.lister.mockResolvedValue({ok:true,versionCourante:{id:'version-externe',n:2},jarvis:{disponible:true},propositions:[]});m.creer.mockResolvedValue({ok:false,message:'Conflit de version'});
 const el=document.createElement('div');const root=createRoot(el);await act(async()=>root.render(<Vue/>));
 await act(async()=>cycle.ecrireManuel({op:'replace',path:'/brief/texts',newValue:['CTA ancien'],reason:'Édition'},'Édition'));
 expect(m.creer).toHaveBeenCalledWith(expect.objectContaining({baseVersionId:'version-affichee'}));await act(async()=>root.unmount());
});

it('proposition Jarvis : conserve le code incertain de la réponse serveur',async()=>{
 sessionStorage.clear();let cycle:CyclePropositionsBrief;function Vue(){cycle=usePropositionsBrief('p-incertain',{id:'v1',n:1});return null}
 m.lister.mockResolvedValue({ok:true,versionCourante:{id:'v1',n:1},jarvis:{disponible:true},propositions:[]});m.proposer.mockResolvedValue({ok:false,code:'PROVIDER_UNCERTAIN',message:'Fournisseur incertain'});
 const el=document.createElement('div');const root=createRoot(el);await act(async()=>root.render(<Vue/>));await act(async()=>cycle.demanderJarvis('Nouvel angle'));await act(async()=>root.render(null));await act(async()=>root.render(<Vue/>));await act(async()=>cycle.demanderJarvis('Nouvel angle'));expect(m.proposer).toHaveBeenCalledTimes(1);expect(JSON.parse(sessionStorage.getItem('tt-appel-payant:p-incertain:propositions-brief')!)).toMatchObject({etat:'uncertain'});await act(async()=>root.unmount());
});
