// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {VueTextes} from '../lib/studios/textes/textes';
import type {VueVideo} from '../lib/studios/video/lecture';
import {TYPES_TEXTE,LIBELLES_TYPE_TEXTE,disponibiliteVideo,type PlanStudio} from '@tiktrends/core';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const m=vi.hoisted(()=>({ecrire:vi.fn(),sauver:vi.fn(),story:vi.fn(),appliquer:vi.fn()}));
vi.mock('../app/actions/studios/textes',()=>({ecrireTextes:m.ecrire,enregistrerTextes:m.sauver}));
vi.mock('../app/actions/studios/video',()=>({planifierStoryboard:m.story,appliquerOperationVideo:m.appliquer}));
vi.mock('../components/studios/textes/EcranTextes',()=>({EcranTextes:()=>null}));
vi.mock('../components/studios/video/EcranVideo',()=>({EcranVideo:()=>null,apercuDuGeste:()=>({refus:null,impact:{resume:'Les anciennes images deviennent obsolètes'},durees:{phrase:'15 secondes'}})}));
import {TextesAssistant} from '../components/studios/projet/TextesAssistant';
import {VideoAssistant} from '../components/studios/projet/VideoAssistant';
const tv:VueTextes={projet:{id:'p',title:'Projet',marque:'Marque'},version:{id:'v1',n:1},brief:{objectif:'Objectif',audience:'',hypothese:null,variable:'',faits:[],invariants:[],exclusions:[]},briefIllisible:false,textes:[],calques:[],limites:TYPES_TEXTE.map(type=>({type,libelle:LIBELLES_TYPE_TEXTE[type],max:300,mesuree:false})),disponibilite:{disponible:true,motif:null,raison:'',coutMaxUsd:.13},peutEcrire:true,peutExporter:true};
const vv:VueVideo={projet:{id:'p',titre:'Projet'},version:{id:'v1',n:1},contenu:{brief:null,productRef:null,styleRef:null,characterRefs:{},shots:{order:[],byId:{}},timeline:null,document:null},briefPresent:true,sansTexte:false,format:{largeur:1080,hauteur:1920,libelle:'9:16',depuisBrief:true},segments:[],dureeTotaleMs:0,keyframes:{},clips:{},mediasValides:[],musiques:[],disponibilite:disponibiliteVideo({peutGenerer:true,peutProposer:true,releasePubliee:true,fournisseurTexte:true,plafondAtteint:false,fournisseurImage:true,decodeurVideo:false,briefPresent:true}),coutTexteUsd:.14,prix:{credits:5,usdMicros:100000},prixClip:{credits:10,usdMicros:600000,dureeS:5},videoFinale:{possible:false,raison:'Les clips manquent.',nonInclus:['voix'],dureeMs:0,derniere:null},jobs:[]};
const plan:PlanStudio={shotId:'s',purpose:'Produit',subject:'Flacon',action:'Tourne',framing:'Gros plan',camera:'Fixe',lighting:'Doux',environment:'Studio',referenceIds:[],narration:'',onScreenText:[],speechMode:'none',estimatedDurationMs:3000};
let root:Root;let el:HTMLDivElement;
beforeEach(()=>{Object.values(m).forEach(f=>f.mockReset());el=document.createElement('div');document.body.appendChild(el);root=createRoot(el)});
afterEach(async()=>{await act(async()=>root.unmount());el.remove()});
async function render(node:React.ReactNode){await act(async()=>root.render(node))}
async function click(text:string){const b=Array.from(el.querySelectorAll('button')).find(b=>b.textContent===text)!;expect(b).toBeTruthy();await act(async()=>b.click())}
describe('livrables prototype raccordés',()=>{
 it('textes : prix avant clic et sauvegarde seulement après relecture',async()=>{m.ecrire.mockResolvedValue({ok:true,statut:'variantes',variantes:[{id:'t1',type:'hook',langue:'fr',texte:'Notre accroche',sources:[],longueur:14,horsVariable:false}],ecartees:[]});m.sauver.mockResolvedValue({ok:true,version:{id:'v2',n:2},textes:[],inchange:false});await render(<TextesAssistant vue={tv}/>);expect(m.ecrire).not.toHaveBeenCalled();expect(el.textContent).toContain('0,13');await click('Rédiger 3 variantes');expect(m.ecrire).toHaveBeenCalledWith({projectId:'p',baseVersionId:'v1',type:'hook',nombre:3,maxCaracteres:105,langue:'fr'});expect(m.sauver).not.toHaveBeenCalled();expect(el.textContent).toContain('Notre accroche');await click('Retenir');expect(m.sauver).toHaveBeenCalledTimes(1)});
 it('appel texte incertain : aucune relance automatique ou second clic payant',async()=>{m.ecrire.mockRejectedValue(new Error('offline'));await render(<TextesAssistant vue={tv}/>);await click('Rédiger 3 variantes');expect(el.textContent).toContain('incertain');await click('Rédiger 3 variantes');expect(m.ecrire).toHaveBeenCalledTimes(1)});
 it('texte désactivé : motif serveur et aucun appel',async()=>{await render(<TextesAssistant vue={{...tv,disponibilite:{...tv.disponibilite,disponible:false,raison:'Budget atteint'}}}/>);await click('Rédiger 3 variantes');expect(el.textContent).toContain('Budget atteint');expect(m.ecrire).not.toHaveBeenCalled()});
 it('vidéo : storyboard réel et relecture avant application sans génération',async()=>{m.story.mockResolvedValue({ok:true,statut:'propose',plans:[plan],totalMs:3000,avertissements:[]});m.appliquer.mockResolvedValue({ok:true});const reload=vi.fn(async()=>{});await render(<VideoAssistant vue={vv} onRecharger={reload}/>);expect(m.story).not.toHaveBeenCalled();expect(el.textContent).toContain('0,14');await click('Proposer le storyboard');expect(m.story).toHaveBeenCalledWith({projectId:'p',nbPlans:4,dureeCibleMs:15000,speechMode:'none'});expect(el.textContent).toContain('Flacon');expect(m.appliquer).not.toHaveBeenCalled();await click('Valider ce storyboard · sans génération');expect(m.appliquer).toHaveBeenCalledWith({projectId:'p',baseVersionId:'v1',operation:{type:'scenario',plans:[plan]}});expect(reload).toHaveBeenCalledTimes(1)});
 it('vidéo : sans droit de montage ne peut pas appliquer le storyboard',async()=>{m.story.mockResolvedValue({ok:true,statut:'propose',plans:[plan],totalMs:3000,avertissements:[]});await render(<VideoAssistant vue={{...vv,disponibilite:{...vv.disponibilite,montage:{disponible:false,raison:'Lecture seule'}}}} onRecharger={async()=>{}}/>);await click('Proposer le storyboard');await click('Valider ce storyboard · sans génération');expect(m.appliquer).not.toHaveBeenCalled()});
});
