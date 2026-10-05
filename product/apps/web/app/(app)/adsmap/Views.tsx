'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { surface } from '../../../components/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN, RETOUR_STUDIO, lireVueAdsmap, rechercheAdsmap, PARAM_VUE_ADSMAP, type VueAdsmap } from '@tiktrends/core';
import { AdDrawer } from './AdDrawer';
import dynamic from 'next/dynamic';
import { AdsMapTable } from './AdsMapTable';
import { Inbox } from './Inbox';
import { BuildPanel } from './BuildPanel';

/**
 * Trois lectures du même graphe.
 *
 * **À décider** répond à « qu'est-ce que je fais maintenant » · c'est l'onglet
 * par défaut, parce que c'est la question qu'on se pose vraiment en ouvrant
 * l'outil un lundi matin. La Table répond à « où en est ce test », la Carte à
 * « qu'est-ce qu'on n'a pas encore essayé ».
 *
 * Le canvas est chargé par `next/dynamic` avec `ssr: false` (décision D8) :
 * `@xyflow/react` et `elkjs` pèsent plus que tout le reste de l'application
 * réunie, et rien ne justifie de les servir à quelqu'un qui ne les ouvre pas.
 */

const Canvas = dynamic(() => import('./Canvas').then((m) => m.Canvas), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement de la carte…</p>,
});

export function Views({ batches, canBuild = false, testProfond = null, marque = '' }: {
  batches: Array<{ id: string; number: number; status: string; ads: number }>;
  canBuild?: boolean;
  /** Le test visé par un lien profond (carte du Studio · I1), déjà vérifié dans la marque active. */
  testProfond?: { adId: string; depuisStudio: boolean; introuvable: boolean } | null;
  marque?: string;
}) {
  const router = useRouter();
  // La vue vit dans l'URL (`?vue=`) · lue au montage côté navigateur (le
  // rendu serveur part de « À décider »), puis REMPLACÉE à chaque changement
  // d'onglet · Retour depuis une fiche retrouve la vue (recette #106b).
  const [vue, setVue] = useState<VueAdsmap>('decider');
  // Le panneau du lien profond · ouvert d'office, refermé en retirant le
  // paramètre (un rechargement ne le rouvre pas, le retour navigateur si).
  const [profondOuvert, setProfondOuvert] = useState(!!testProfond && !testProfond.introuvable);
  const retour = testProfond?.depuisStudio ? RETOUR_STUDIO : undefined;
  // À la fermeture, le focus revient au début du contenu Adsmap (le premier
  // onglet) · ouvert par lien profond, le panneau n'a pas de déclencheur dans
  // la page à qui le rendre, et le clavier repartirait du haut du document.
  const premierOnglet = useRef<HTMLButtonElement>(null);
  const fermerProfond = () => {
    setProfondOuvert(false);
    // La vue choisie survit à la fermeture du lien profond, et l'URL perd
    // `?ad=` par l'API native (synchronisée par Next) · un `router.replace`
    // vers le même chemin ne se terminait pas (recette #106b · même-chemin).
    window.history.replaceState(null, '', `${window.location.pathname}${rechercheAdsmap(window.location.search, { fiche: null })}`);
    setTimeout(() => premierOnglet.current?.focus(), 0);
  };
  // Onglets déjà ouverts · la Table n'est montée qu'à la première visite, puis
  // gardée. Muter pendant le rendu serait un effet de bord · on passe par l'état.
  const [ouverts, setOuverts] = useState<string[]>(['decider']);
  const montrer = (v: VueAdsmap) => {
    setVue(v);
    setOuverts((o) => (o.includes(v) ? o : [...o, v]));
  };
  const aller = (v: VueAdsmap) => {
    montrer(v);
    window.history.replaceState(null, '', `${window.location.pathname}${rechercheAdsmap(window.location.search, { vue: v })}`);
  };
  useEffect(() => {
    const v = lireVueAdsmap(new URLSearchParams(window.location.search).get(PARAM_VUE_ADSMAP));
    if (v !== 'decider') montrer(v);
  }, []);

  return (
    <>
      {/* Lien profond vers un test qui n'est pas dans la marque active · on le
          dit et on rend la main, sans ouvrir le test d'une autre marque. */}
      {testProfond?.introuvable && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 13px', margin: '0 0 10px', ...surface, background: 'var(--surface)', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          <span style={{ flex: 1, minWidth: 200 }}>Ce test est introuvable dans Adsmap pour {marque || 'la marque active'} · il a pu être supprimé, ou appartient à une autre marque.</span>
          {retour && <Link href={retour.href} style={lienRetour}>‹ {retour.libelle}</Link>}
        </div>
      )}
      {testProfond && !testProfond.introuvable && profondOuvert && (
        <AdDrawer adId={testProfond.adId} onClose={fermerProfond} onChanged={() => router.refresh()} peutPartager={canBuild} retour={retour} origine="lien-profond" />
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button type="button" ref={premierOnglet} onClick={() => aller('decider')} aria-pressed={vue === 'decider'} style={onglet(vue === 'decider')}>À décider</button>
        <button type="button" onClick={() => aller('table')} aria-pressed={vue === 'table'} style={onglet(vue === 'table')}>Table</button>
        <button type="button" onClick={() => aller('carte')} aria-pressed={vue === 'carte'} style={onglet(vue === 'carte')}>Carte</button>
      </div>

      {vue === 'decider' && <Inbox peutPartager={canBuild} />}

      {/* La Table reste montée quand on la quitte : y revenir ne doit pas
          recharger mille lignes ni perdre les filtres posés. Elle n'est en
          revanche montée qu'à la première visite · l'onglet par défaut est la
          file, et personne n'a à payer le chargement d'une table qu'il n'ouvre pas. */}
      {ouverts.includes('table') && (
        <div style={{ display: vue === 'table' ? 'block' : 'none' }}>
          <AdsMapTable batches={batches} peutPartager={canBuild} />
        </div>
      )}
      {vue === 'carte' && (
        <>
          <Canvas peutPartager={canBuild} />
          {/* La construction vit sous la Carte : c'est là qu'on voit les branches
              vides, donc là qu'on a envie de les remplir. */}
          {canBuild && <BuildPanel />}
        </>
      )}
    </>
  );
}

const lienRetour: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 13px', borderRadius: 999,
  border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
};

const onglet = (actif: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN,
  padding: '7px 18px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: '1px solid ' + (actif ? 'transparent' : 'var(--line-2)'),
  background: actif ? 'var(--grad-accent)' : 'var(--surface)',
  color: actif ? 'var(--on-accent)' : 'var(--ink-2)',
});
