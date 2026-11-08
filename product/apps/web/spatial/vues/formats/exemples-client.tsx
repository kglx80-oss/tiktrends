'use client';

import { useMemo } from 'react';
import { FILTRES_LOCAUX_VIDES, compteLocal, controlesLocaux, filtrerLocal, pucesLocales, type PubLocale } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';
import { BasculeLocale, ChoixLocal, EtatFiltresLocaux, VideLocal, useFiltresLocauxAdresse } from '../veille/filtres-locaux-client';
import type { ExempleFormat } from './PageFormat';

/**
 * Lot 7 V5 (VB FO07) · les exemples d'un style, filtrables sur place ·
 * plateforme, pays, diffusion minimale, marques suivies. Les exemples sont
 * DÉJÀ lus (sauvegardes classées, les plus durables d'abord) · aucun appel à
 * la source. Un filtre qui ne séparerait rien reste fermé, raison écrite.
 */
const lire = (e: ExempleFormat): PubLocale => e.filtre ?? {};

export function ExemplesFormat({ exemples }: { exemples: readonly ExempleFormat[] }) {
  const [f, setF] = useFiltresLocauxAdresse();
  const ctl = useMemo(() => controlesLocaux(exemples.map(lire)), [exemples]);
  const visibles = useMemo(() => filtrerLocal(exemples, f, lire), [exemples, f]);
  const actifs = pucesLocales(f).length;
  return (
    <>
      <section className="tile" data-filtres-locaux aria-label="Filtrer les exemples" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ChoixLocal libelle="Plateforme" controle={ctl.plateforme} valeur={f.plateforme} tous="Toutes les plateformes" changer={(v) => setF((x) => ({ ...x, plateforme: v }))} />
          <ChoixLocal libelle="Pays" controle={ctl.pays} valeur={f.pays} tous="Tous les pays" changer={(v) => setF((x) => ({ ...x, pays: v }))} />
          <ChoixLocal libelle="Diffusion" controle={ctl.diffusion} valeur={f.diffusionMin === null ? null : String(f.diffusionMin)} tous="Toutes les durées" changer={(v) => setF((x) => ({ ...x, diffusionMin: v === null ? null : Number(v) }))} />
          <BasculeLocale libelle="Marques suivies seulement" controle={ctl.suivies} actif={f.suiviesSeulement} changer={(v) => setF((x) => ({ ...x, suiviesSeulement: v }))} />
        </div>
        <EtatFiltresLocaux f={f} changer={setF} compte={`${compteLocal(visibles.length, exemples.length, actifs)} · sur les exemples affichés`} />
      </section>
      {visibles.length === 0 ? <VideLocal chargees={exemples.length} reinitialiser={() => setF({ ...FILTRES_LOCAUX_VIDES })} /> : (
        <div className="vfeed">
          {visibles.map((e) => (
            <article className="vitem" key={e.id}>
              <div className="who"><span className="av" style={{ background: e.annonceur.couleur }}>{e.annonceur.initiale}</span>{e.annonceur.nom}<span className="faint">{e.pays ?? ''}</span></div>
              <div style={{ position: 'relative' }}><div className="comp">{e.vignette ? <img src={e.vignette} alt={`Annonce de ${e.annonceur.nom}`} /> : null}</div>{e.longue && <span className="scale">30 j +</span>}</div>
              <div className="vmeta"><span>{e.diffusion}</span></div>
              <div className="acts">
                <Lien className="btn sm" href="/saved"><Ic n="bookmark" />Dans tes sauvegardes</Lien>
                <Lien className="btn sm" href={e.iterer}><Ic n="loop" />Itérer dans ce style</Lien>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
