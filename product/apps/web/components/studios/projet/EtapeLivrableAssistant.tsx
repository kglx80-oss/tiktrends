'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {lireVideo} from '../../../app/actions/studios/video';
import {lireTextesProjet} from '../../../app/actions/studios/textes';
import {EcranVideo} from '../video/EcranVideo';
import {EcranTextes} from '../textes/EcranTextes';
import type {VueVideo} from '../../../lib/studios/video/lecture';
import type {VueTextes} from '../../../lib/studios/textes/textes';
import {btnGhost} from '../../ui';

/** Réemploie les ateliers sous leurs gardes serveur, jamais le parcours image par défaut. */
export function EtapeLivrableAssistant({projectId,type,onRetour}:{projectId:string;type:'video'|'text';onRetour:()=>void}) {
  const [vue,setVue]=useState<{projectId:string;type:'video';valeur:VueVideo}|{projectId:string;type:'text';valeur:VueTextes}|null>(null);
  const [erreur,setErreur]=useState<string|null>(null);
  const [chargement,setChargement]=useState(true);
  const sequence=useRef(0);
  const charger=useCallback(async()=>{
    const demande=++sequence.current;setChargement(true);setErreur(null);
    try {
      if(type==='video') {
        const r=await lireVideo({projectId});if(demande!==sequence.current)return;
        if(r.ok)setVue({projectId,type:'video',valeur:r.vue});else {setVue(null);setErreur(r.message)}
      } else {
        const r=await lireTextesProjet({projectId});if(demande!==sequence.current)return;
        if(r.ok)setVue({projectId,type:'text',valeur:r.vue});else {setVue(null);setErreur(r.message)}
      }
    } catch {if(demande===sequence.current){setVue(null);setErreur('Le studio n’a pas répondu. Actualise son état avant toute nouvelle demande.')}}
    finally {if(demande===sequence.current)setChargement(false)}
  },[projectId,type]);
  const invalider=useCallback(()=>{sequence.current++},[]);
  useEffect(()=>{setVue(null);void charger();return invalider},[charger,invalider]);
  return <section data-zone="assistant-livrable" data-type={type} style={{display:'grid',gap:16,minWidth:0}}>
    {chargement&&!vue&&<p role="status">Lecture du studio {type==='video'?'vidéo':'textes'}…</p>}
    {erreur&&<div role="alert"><p>{erreur}</p><button type="button" style={btnGhost} onClick={()=>void charger()}>Actualiser · sans génération</button></div>}
    {vue?.projectId===projectId&&vue.type==='video'&&type==='video'&&<EcranVideo key={projectId} vue={vue.valeur} onRecharger={charger}/>}
    {vue?.projectId===projectId&&vue.type==='text'&&type==='text'&&<EcranTextes key={projectId} vue={vue.valeur}/>}
    <footer style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'space-between'}}><button type="button" style={btnGhost} onClick={onRetour}>‹ Direction</button><Link href={`/studio/projets/${projectId}/${type==='video'?'video':'textes'}`}>Ouvrir le studio {type==='video'?'vidéo':'textes'}</Link></footer>
  </section>;
}
