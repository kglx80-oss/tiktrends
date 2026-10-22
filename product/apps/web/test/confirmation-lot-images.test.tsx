// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConfirmationLotImages } from '../components/studios/projet/ConfirmationLotImages';
import type { VueLotImages } from '../lib/studios/image/lot-images';
const appel = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/studios/lot-images', () => ({ approuverLotImages: appel }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
const lot = {id:'lot',projectId:'projet',versionId:'v1',nombre:2,type:'images-meme-consigne',devis:[],totalCredits:30,totalUsdMicros:600000,qualification:{nature:'borne',libelle:'Coût maximal',raison:null},expiresAt:new Date('2099-01-01'),empreinte:'empreinte'} as VueLotImages;
beforeEach(()=>{window.sessionStorage.clear();appel.mockReset();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
async function monter(onLance=vi.fn()) { await act(async()=>root.render(<ConfirmationLotImages lot={lot} onModifier={vi.fn()} onLance={onLance}/>)); return onLance; }
async function cocher() { await act(async()=>el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()); }
async function lancer() { await act(async()=>[...el.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Confirmer et générer'))!.click()); }
describe('confirmation du lot réel',()=>{
 it('annonce le total et ne lance rien avant confirmation, puis transmet le manifeste exact',async()=>{
   appel.mockResolvedValue({ok:true,jobs:[{id:'j1'},{id:'j2'}],deja:false});
   const onLance=await monter();
   expect(el.textContent).toContain('2 images');
   await lancer(); expect(appel).not.toHaveBeenCalled();
   await cocher(); await lancer();
   expect(appel).toHaveBeenCalledTimes(1); expect(appel).toHaveBeenCalledWith({lotId:'lot',empreinte:'empreinte',creditsAnnonces:30,usdMicrosAnnonces:600000,confirme:true});
   expect(onLance).toHaveBeenCalledWith(['j1','j2']);
 });
 it('budget refusé : affiche le refus sans annoncer de création',async()=>{
   appel.mockResolvedValue({ok:false,code:'BUDGET_EXCEEDED',message:'Budget insuffisant pour le lot'});
   const onLance=await monter();await cocher();await lancer();
   expect(el.textContent).toContain('Budget insuffisant pour le lot');expect(onLance).not.toHaveBeenCalled();
 });
 it.each(['transport','serveur'])('incertitude %s : fermeture et remontage ne permettent pas une deuxième demande',async(mode)=>{
   if(mode==='transport')appel.mockRejectedValue(new Error('offline'));else appel.mockResolvedValue({ok:false,code:'PROVIDER_UNCERTAIN',message:'Résultat incertain'});
   await monter();await cocher();await lancer();
   await act(async()=>root.render(null));await monter();await cocher();await lancer();
   expect(appel).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('incertain');
 });
});
