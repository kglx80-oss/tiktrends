'use client';
import {useCallback,useSyncExternalStore} from 'react';
type Etat='pending'|'uncertain';
type Tentative={etat:Etat;token:string};
const memoire=new Map<string,Tentative>();const abonnes=new Set<()=>void>();
const prefixe='tt-appel-payant:';
function lire(cle:string):Tentative|null {if(typeof window==='undefined')return null;try{const brut=window.sessionStorage.getItem(cle);if(brut){const r=JSON.parse(brut) as Tentative;if((r.etat==='pending'||r.etat==='uncertain')&&typeof r.token==='string'){memoire.set(cle,r);return r}}memoire.delete(cle);return null}catch{/* Le verrou en mémoire reste actif lorsque le stockage est refusé. */}return memoire.get(cle)??null}
function ecrire(cle:string,t:Tentative|null){if(t)memoire.set(cle,t);else memoire.delete(cle);try{if(t)window.sessionStorage.setItem(cle,JSON.stringify(t));else window.sessionStorage.removeItem(cle)}catch{/* mémoire de secours */}abonnes.forEach(f=>f())}
const suivre=(f:()=>void)=>{abonnes.add(f);return()=>{abonnes.delete(f)}};
export const MESSAGE_APPEL_PAYANT='Un appel est en cours ou son résultat est incertain. Consulte le suivi du projet et son coût avant toute nouvelle demande. Revenir à cette étape ne relance rien.';
/** Aucun secret ni montant supposé. Une réponse connue seule libère sa tentative. */
export function useAppelPayant(projectId:string,operation:string){
 const cle=`${prefixe}${projectId}:${operation}`;
 const etat=useSyncExternalStore(suivre,useCallback(()=>lire(cle)?.etat??'ready',[cle]),()=> 'initializing');
 const commencer=useCallback(()=>{if(lire(cle))return null;const token=crypto.randomUUID();ecrire(cle,{etat:'pending',token});return token},[cle]);
 const terminer=useCallback((token:string,incertain=false)=>{const courant=lire(cle);if(courant?.token!==token)return;ecrire(cle,incertain?{etat:'uncertain',token}:null)},[cle]);
 return {bloque:etat!=='ready',etat,commencer,terminer};
}

/** Une réponse HTTP reçue n’est pas forcément un résultat fournisseur connu. */
export function resultatPayantIncertain(r:{ok:boolean;code?:string}):boolean{return !r.ok&&r.code==='PROVIDER_UNCERTAIN'}
