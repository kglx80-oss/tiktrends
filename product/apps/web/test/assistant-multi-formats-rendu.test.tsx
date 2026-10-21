// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BriefCanonique } from '@tiktrends/core';
import { EtapeFormatDevis } from '../components/studios/projet/EtapeFormatDevis';
import { ConfirmationLotImages } from '../components/studios/projet/ConfirmationLotImages';
import type { VueLotImages } from '../lib/studios/image/lot-images';
const h = vi.hoisted(() => ({ multi: vi.fn(), simple: vi.fn(), manuel: vi.fn(), approuver: vi.fn() }));
vi.mock('../app/actions/studios/lot-formats', () => ({ preparerLotFormats: h.multi }));
vi.mock('../app/actions/studios/lot-images', () => ({ preparerLotImages: h.simple, approuverLotImages: h.approuver }));
vi.mock('../app/actions/studios/propositions', () => ({ creerPropositionManuelle: h.manuel, appliquerProposition: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
 lireParcoursImage: async () => ({ ok: true, vue: {version:{id:'v1',n:1}, format:{depuisBrief:true}, retenue:{verdict:{ok:true}}, controleVision:{disponible:false}, modes:[], disponibilite:{compilation:{disponible:true}}, enAttente:null} }),
 demanderDevisImage: vi.fn(), compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const brief: BriefCanonique = {objective:'Créer',audience:'',hypothesisId:null,testedVariable:'',facts:[],invariants:[],variables:[],references:[],composition:'',styleIntent:'',texts:[],formats:['4:5'],exclusions:[]};
const lot = {id:'lot',projectId:'p',versionId:'v1',nombre:4,type:'images-formats',formats:['4:5','4:5','9:16','9:16'],devis:[],totalCredits:20,totalUsdMicros:500000,qualification:{nature:'borne',libelle:'Maximum',raison:null},expiresAt:new Date('2099-01-01'),empreinte:'hash'} as VueLotImages;
let root: Root; let el: HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);h.multi.mockResolvedValue({ok:true,lot});});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
async function render(onLotPret=vi.fn(),version='v1') { await act(async()=>root.render(<EtapeFormatDevis projectId="p" version={{id:version,n:1}} brief={brief} onBriefChange={vi.fn()} onDevisPret={vi.fn()} onLotPret={onLotPret} onRetour={vi.fn()}/>)); return onLotPret; }
async function click(selector:string) {await act(async()=>el.querySelector<HTMLElement>(selector)!.click());}
async function nombre(n:number) {const select=el.querySelector('select')!;await act(async()=>{select.value=String(n);select.dispatchEvent(new Event('change',{bubbles:true}));});}
describe('formats du devis réel',()=>{
 it('deux formats et deux variantes : quatre sorties, sans réécrire la consigne primaire',async()=>{
  const onLot=await render();await click('[data-format="9:16"]');await nombre(2);
  expect(el.querySelector('[data-format="4:5"]')?.getAttribute('aria-checked')).toBe('true');
  expect(el.textContent).toContain('4 images');await click('[data-bouton="voir-devis"]');
  expect(h.multi).toHaveBeenCalledWith({projectId:'p',formats:['4:5','9:16'],nombreParFormat:2,controleVision:false});
  expect(onLot).toHaveBeenCalledWith(lot);expect(h.simple).not.toHaveBeenCalled();expect(h.manuel).not.toHaveBeenCalled();expect(h.approuver).not.toHaveBeenCalled();
 });
 it('un seul format avec deux variantes conserve le devis de lot simple',async()=>{
  h.simple.mockResolvedValue({ok:true,lot:{...lot,type:'images-meme-consigne',nombre:2}});
  const onLot=await render();await nombre(2);await click('[data-bouton="voir-devis"]');
  expect(h.simple).toHaveBeenCalledWith({projectId:'p',nombre:2,controleVision:false});expect(h.multi).not.toHaveBeenCalled();expect(onLot).toHaveBeenCalledTimes(1);
 });
 it('conserve au moins un format et borne la quantité à quatre',async()=>{
  await render();await click('[data-format="4:5"]');expect(el.querySelector('[data-format="4:5"]')?.getAttribute('aria-checked')).toBe('true');
  expect([...el.querySelectorAll('option')].map(o=>o.value)).toEqual(['1','2','3','4']);
 });
 it('refuse un devis reçu après changement de version du projet',async()=>{
  let resolve!: (value:unknown)=>void;h.multi.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const onLot=await render();await click('[data-format="9:16"]');await click('[data-bouton="voir-devis"]');
  await render(onLot,'v2');await act(async()=>resolve({ok:true,lot}));
  expect(onLot).not.toHaveBeenCalled();expect(el.querySelector('[role="alert"]')).not.toBeNull();
 });
 it('montre le refus serveur de cadrage sans inventer de devis',async()=>{
  h.multi.mockResolvedValue({ok:false,message:'La consigne impose un autre cadrage.'});const onLot=await render();await click('[data-format="9:16"]');await click('[data-bouton="voir-devis"]');
  expect(el.querySelector('[role="alert"]')?.textContent).toContain('autre cadrage');expect(onLot).not.toHaveBeenCalled();
 });
 it('la confirmation affiche les formats attestés sans répéter les variantes',async()=>{
  await act(async()=>root.render(<ConfirmationLotImages lot={lot} onModifier={vi.fn()} onLance={vi.fn()}/>));
  expect(el.textContent).toContain('Formats : 4:5 · 9:16');expect(el.textContent).toContain('4 images');expect(h.approuver).not.toHaveBeenCalled();
 });
});
