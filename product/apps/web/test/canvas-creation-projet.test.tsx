// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BriefCanonique } from '@tiktrends/core';
import type { JobImageVue } from '../lib/studios/image/parcours';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { CanvasCreationProjet } from '../components/studios/projet/CanvasCreationProjet';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const brief: BriefCanonique = { objective:'Présenter le produit',audience:'',hypothesisId:null,testedVariable:'',facts:[],invariants:[],variables:[],references:[],composition:'Produit au centre',styleIntent:'Lumière naturelle',texts:[],formats:['4:5'],exclusions:[] };
const job = (id:string, etat:JobImageVue['etat']='completed'):JobImageVue=>({id,etat,libelleEtat:etat,message:'',raisonEchec:null,annulable:false,terminal:etat==='completed',qualite:'pending',libelleQualite:'À relire',creditsReserves:4,creditsRendus:null,media:{assetId:'asset-'+id,url:'/studio/medias/'+id,largeur:1080,hauteur:1350},creeLe:'2026-10-21'});
const props={brief,produit:'Sérum',jobs:[job('one')],graphe:<p>Graphe réel conservé</p>};
afterEach(()=>{document.body.innerHTML='';refresh.mockClear();});
describe('canvas visuel · médias livrés et commandes réelles',()=>{
 it('ne montre que les images effectivement livrées et ne les dit pas validées',()=>{
  const html=renderToStaticMarkup(<CanvasCreationProjet {...props} jobs={[job('one'),job('queued','queued')]}/>);
  expect(html).toContain('/studio/medias/one');expect(html).not.toContain('/studio/medias/queued');
  expect(html).toContain('À relire');expect(html).toContain('1080 × 1350');expect(html).toContain('toutes versions');expect(html).toContain('Graphe réel conservé');
 });
 it('ne fabrique ni média ni lien atelier quand aucun accès ne lui est transmis',()=>{
  const html=renderToStaticMarkup(<CanvasCreationProjet {...props} jobs={[]} erreur="Lecture refusée"/>);
  expect(html).not.toContain('<img');expect(html).not.toContain('Ouvrir l’éditeur');expect(html).not.toContain('Préparer une image');expect(html).toContain('Lecture refusée');
 });
 it('sélectionne le média exact et zoome sans aucune action serveur',async()=>{
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  await act(async()=>root.render(<CanvasCreationProjet {...props} editeurHref="/studio/projets/p/image"/>));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sélectionner la création 1"]')!.click());
  expect(host.querySelector<HTMLAnchorElement>('a[target="_blank"]')?.getAttribute('href')).toBe('/studio/medias/one');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Agrandir le zoom"]')!.click());
  expect(host.textContent).toContain('110 %');expect(host.querySelector('a[href="/studio/projets/p/image"]')?.textContent).toBe('Ouvrir l’éditeur');
  await act(async()=>root.unmount());
 });
 it('actualise sur geste puis affiche seulement le nouveau résultat serveur',async()=>{
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  await act(async()=>root.render(<CanvasCreationProjet {...props} jobs={[job('one','queued')]}/>));
  expect(host.querySelector('img')).toBeNull();expect(refresh).not.toHaveBeenCalled();
  expect(host.textContent).toContain('actualisez ce canvas');
  const actualiser=[...host.querySelectorAll('button')].find(b=>b.textContent==='Actualiser les créations')!;
  await act(async()=>actualiser.click());
  expect(refresh).toHaveBeenCalledTimes(1);expect(host.querySelector('img')).toBeNull();
  await act(async()=>root.render(<CanvasCreationProjet {...props} jobs={[job('one')]}/>));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/studio/medias/one');
  await act(async()=>root.unmount());
 });

});
