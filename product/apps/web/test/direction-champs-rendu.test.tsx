// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect,vi} from 'vitest';
import {EtapeDirection} from '../components/studios/projet/EtapeDirection';
import type {CyclePropositionsBrief} from '../components/studios/projet/usePropositionsBrief';
import {lireLigneTexte,type BriefCanonique,type ChangementPatch} from '@tiktrends/core';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const brief:BriefCanonique={objective:'Produit',audience:'',hypothesisId:null,testedVariable:'',facts:[],invariants:[],variables:[],references:[],composition:'Produit au centre',styleIntent:'Pastel',texts:['Hook (fr) · Ancienne accroche · sources : fait1','CTA (fr) · Découvrir · sources : fait2','Corps (fr) · Texte secondaire','Hook (en) · Keep this'],formats:['4:5'],exclusions:[]};
async function monter(b=brief,permission=true){
 const changements:ChangementPatch[]=[];const adopter=vi.fn(async()=>{});const jarvis=vi.fn(async()=>{});
 const cycle:CyclePropositionsBrief={liste:{ok:true,projectId:'p',versionCourante:{id:'v',n:1},propositions:[],jarvis:{disponible:true,motif:null,raison:'',coutMaxUsd:.13,mentionCout:'Appel texte payant'},peutProposer:permission,cibles:[]},version:{id:'v',n:1},occupe:null,retour:null,recharger:async()=>{},demanderJarvis:jarvis,adopter,rejeter:async()=>{},ecrireManuel:async c=>{changements.push(c)}};
 const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);
 await act(async()=>{root.render(<EtapeDirection brief={b} cycle={cycle} onApplied={()=>{}} apercuProduitUrl="/api/brands/b/media?kind=photo"/>)});
 return {el,changements,adopter,jarvis,close:async()=>{await act(async()=>root.unmount());el.remove()}};
}
async function saisir(el:Element|null,value:string){const input=el as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
async function clic(el:Element|null){await act(async()=>{(el as HTMLButtonElement).click()})}
describe('direction · champs raccordés sans écraser le brief',()=>{
 it('concept optionnel : add puis proposition relue, pas application directe',async()=>{const h=await monter();await saisir(h.el.querySelector('[data-champ="concept-libre"]'),'Été doux');await clic(h.el.querySelector('[data-bouton="ecrire-concept"]'));expect(h.changements[0]).toMatchObject({op:'add',path:'/brief/concept',newValue:'Été doux'});expect(h.adopter).not.toHaveBeenCalled();expect(h.jarvis).not.toHaveBeenCalled();await h.close()});
 it('accroche modifiée : préserve CTA, corps, autres langues et sources',async()=>{const h=await monter();await saisir(h.el.querySelector('[data-champ="accroche-libre"]'),'Nouvelle accroche');await clic(h.el.querySelector('[data-bouton="ecrire-accroche"]'));const c=h.changements[0]!;expect(c.path).toBe('/brief/texts');const texts=c.newValue as string[];expect(lireLigneTexte(texts[0]!)).toMatchObject({type:'hook',langue:'fr',texte:'Nouvelle accroche',sources:['fait1']});expect(texts.slice(1)).toEqual(brief.texts.slice(1));expect(brief.texts[0]).toContain('Ancienne');expect(h.adopter).not.toHaveBeenCalled();await h.close()});
 it('CTA : canonical existant, sans altérer les autres lignes',async()=>{const h=await monter();await saisir(h.el.querySelector('[data-champ="cta-libre"]'),'Voir la routine');await clic(h.el.querySelector('[data-bouton="ecrire-cta"]'));const texts=h.changements[0]!.newValue as string[];expect(lireLigneTexte(texts[1]!)).toMatchObject({type:'cta',texte:'Voir la routine',sources:['fait2']});expect(texts.filter((_,i)=>i!==1)).toEqual(brief.texts.filter((_,i)=>i!==1));await h.close()});
 it('CTA absent : ajoute une ligne sans inventer un CTA ni remplacer le corps',async()=>{const h=await monter({...brief,texts:['Texte original']});expect((h.el.querySelector('[data-champ="cta-libre"]') as HTMLInputElement).value).toBe('');await saisir(h.el.querySelector('[data-champ="cta-libre"]'),'En savoir plus');await clic(h.el.querySelector('[data-bouton="ecrire-cta"]'));expect(h.changements[0]!.newValue).toEqual(['Texte original','CTA (fr) · En savoir plus']);expect(h.el.querySelector('img')?.alt).toContain('pas une image générée');await h.close()});
 it('sans droit : aucune proposition manuelle',async()=>{const h=await monter({...brief,concept:'Existant'},false);for(const name of ['concept','accroche','cta']){const button=h.el.querySelector(`[data-bouton="ecrire-${name}"]`) as HTMLButtonElement;expect(button.disabled).toBe(true);await clic(button)}expect(h.changements).toHaveLength(0);await h.close()});
});
