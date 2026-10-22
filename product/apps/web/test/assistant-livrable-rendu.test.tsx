// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const m=vi.hoisted(()=>({video:vi.fn(),textes:vi.fn()}));
vi.mock('../app/actions/studios/video',()=>({lireVideo:m.video}));
vi.mock('../app/actions/studios/textes',()=>({lireTextesProjet:m.textes}));
vi.mock('../components/studios/projet/VideoAssistant',()=>({VideoAssistant:({vue,onRecharger}:{vue:{titre:string};onRecharger:()=>void})=><div data-video>{vue.titre}<button onClick={onRecharger}>Relire vidéo</button></div>}));
vi.mock('../components/studios/projet/TextesAssistant',()=>({TextesAssistant:({vue}:{vue:{titre:string}})=><div data-textes>{vue.titre}</div>}));
import {EtapeLivrableAssistant} from '../components/studios/projet/EtapeLivrableAssistant';
let root:Root;let el:HTMLDivElement;
beforeEach(()=>{m.video.mockReset();m.textes.mockReset();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el)});
afterEach(async()=>{await act(async()=>root.unmount());el.remove()});
async function rendre(type:'video'|'text',projectId='p1'){await act(async()=>root.render(<EtapeLivrableAssistant projectId={projectId} type={type} onRetour={()=>{}}/>))}
describe('assistant : ateliers selon le livrable choisi',()=>{
 it('vidéo : lecture seule, vrai atelier et relecture locale après geste',async()=>{m.video.mockResolvedValueOnce({ok:true,vue:{titre:'Storyboard v1'}}).mockResolvedValueOnce({ok:true,vue:{titre:'Storyboard v2'}});await rendre('video');expect(m.video).toHaveBeenCalledTimes(1);expect(m.video).toHaveBeenCalledWith({projectId:'p1'});expect(m.textes).not.toHaveBeenCalled();expect(el.querySelector('[data-video]')?.textContent).toContain('Storyboard v1');expect(el.querySelector('a')?.getAttribute('href')).toBe('/studio/projets/p1/video');await act(async()=>{(el.querySelector('[data-video] button') as HTMLButtonElement).click()});expect(el.textContent).toContain('Storyboard v2');expect(m.video).toHaveBeenCalledTimes(2)});
 it('textes : atelier textes, aucune lecture vidéo ni devis image',async()=>{m.textes.mockResolvedValue({ok:true,vue:{titre:'Textes v3'}});await rendre('text');expect(m.textes).toHaveBeenCalledTimes(1);expect(m.textes).toHaveBeenCalledWith({projectId:'p1'});expect(m.video).not.toHaveBeenCalled();expect(el.querySelector('[data-textes]')?.textContent).toBe('Textes v3');expect(el.querySelector('a')?.getAttribute('href')).toBe('/studio/projets/p1/textes');expect(el.textContent).not.toMatch(/image|générer/i)});
 it('refus serveur : erreur affichée, aucun atelier utilisable ni chargement infini',async()=>{m.video.mockResolvedValue({ok:false,code:'FORBIDDEN',message:'Accès à ce projet refusé.'});await rendre('video');expect(el.querySelector('[role=alert]')?.textContent).toContain('Accès à ce projet refusé.');expect(el.querySelector('[data-video]')).toBeNull();expect(el.querySelector('[role=status]')).toBeNull()});
 it('réponse périmée vidéo ignorée après passage aux textes',async()=>{let resoudre!:(v:unknown)=>void;m.video.mockReturnValue(new Promise(r=>{resoudre=r}));m.textes.mockResolvedValue({ok:true,vue:{titre:'Textes actuels'}});await rendre('video');await rendre('text');await act(async()=>resoudre({ok:true,vue:{titre:'Vidéo périmée'}}));expect(el.textContent).toContain('Textes actuels');expect(el.textContent).not.toContain('Vidéo périmée')});
 it('erreur réseau : nouvelle lecture explicite, sans déclencher un autre atelier',async()=>{m.textes.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,vue:{titre:'Textes récupérés'}});await rendre('text');expect(el.querySelector('[role=alert]')).not.toBeNull();await act(async()=>{(el.querySelector('[role=alert] button') as HTMLButtonElement).click()});expect(el.textContent).toContain('Textes récupérés');expect(m.video).not.toHaveBeenCalled()});
});
