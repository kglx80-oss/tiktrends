// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAppelPayant} from '../components/studios/projet/useAppelPayant';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;let el:HTMLDivElement;let appel:ReturnType<typeof useAppelPayant>;
function Vue({projet='p'}:{projet?:string}){appel=useAppelPayant(projet,'textes');return <button disabled={appel.bloque}>{appel.etat}</button>}
beforeEach(()=>{window.sessionStorage.clear();el=document.createElement('div');document.body.appendChild(el);root=createRoot(el)});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks()});
const monte=()=>act(async()=>root.render(<Vue/>));
it('SSR verrouillé sans accès navigateur requis',()=>{expect(renderToString(<Vue/>)).toContain('disabled');expect(renderToString(<Vue/>)).toContain('initializing')});
it('pending survit au démontage et refuse un doublon, réponse connue libère après remontage',async()=>{await monte();let token:string|null=null;await act(async()=>{token=appel.commencer()});expect(token).toBeTruthy();const finir=appel.terminer;await act(async()=>root.render(null));await monte();expect(appel.bloque).toBe(true);expect(appel.commencer()).toBeNull();await act(async()=>finir(token!));expect(appel.bloque).toBe(false)});
it('résultat inconnu survit à remontage et lecture sans déverrouillage implicite',async()=>{await monte();let token:string|null=null;await act(async()=>{token=appel.commencer();appel.terminer(token!,true)});await act(async()=>root.render(null));await monte();expect(appel.etat).toBe('uncertain');expect(appel.commencer()).toBeNull();expect(JSON.parse(window.sessionStorage.getItem('tt-appel-payant:p:textes')!)).toMatchObject({etat:'uncertain'});await act(async()=>root.render(<Vue projet="autre"/>));expect(appel.bloque).toBe(false)});
it('ancienne réponse ne libère jamais une autre tentative',async()=>{await monte();let ancien:string|null=null;let nouveau:string|null=null;await act(async()=>{ancien=appel.commencer();appel.terminer(ancien!);nouveau=appel.commencer();appel.terminer(ancien!)});expect(nouveau).not.toBe(ancien);expect(appel.bloque).toBe(true)});
it('mémoire de secours garde le verrou si sessionStorage est refusé',async()=>{vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('refus')});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('refus')});await monte();await act(async()=>{appel.commencer()});await act(async()=>root.render(null));await monte();expect(appel.bloque).toBe(true);expect(appel.commencer()).toBeNull()});
