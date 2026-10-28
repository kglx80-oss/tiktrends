import type { FiltresOutilScale } from '@tiktrends/core';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { EtatVide, SousNavVeille, Vignette } from './base';
import { RequeteACopier, ScaleInteractif, type LigneScaleOutil } from './scale-client';

/**
 * « Ce qui scale » · `docs/spatial/reference/scale.html`. Les créas que les
 * marques gardent en ligne le plus longtemps (jours de diffusion RÉELS de la
 * source), classées par le noyau (`classerParDuree`).
 *
 * Vague 3 · `outils` porte les gestes de l'ancien swipe file · choisir la
 * niche (champ, niches proposées, rafraîchir quand le cache le permet), le
 * résumé de la niche, filtrer et trier, garder, suivre, ouvrir le site ou la
 * bibliothèque publicitaire, et six requêtes à copier. Absent, l'écran est
 * celui de la maquette.
 */
export interface LigneScale { cle: string; rang: number; image: string | null; accroche: string; detail: string; part: number; jours: string; cloner: string }

export interface OutilsScale {
  niche: string; pays: string;
  presets: ReadonlyArray<{ libelle: string; href: string; actif: boolean }>;
  /** L'état de la source · « à jour » ou « en cache », et le lien de rafraîchissement quand il est permis. */
  etat: string; rafraichir: string | null;
  stats: ReadonlyArray<{ libelle: string; valeur: string }>;
  lignes: ReadonlyArray<LigneScaleOutil>;
  initial: FiltresOutilScale;
  annonceurs: readonly string[];
  angles: ReadonlyArray<{ cle: string; libelle: string }>;
  requetes: readonly string[];
  /** Vague 4 · l'analyse d'UNE marque (domaine tapé) · son inventaire complet est dans les pubs du moment. */
  marque?: { terme: string; href: string } | null;
}

export function CeQuiScale({ sous, lignes, pastilleRadar, vide, outils }: { sous: string; lignes: ReadonlyArray<LigneScale>; pastilleRadar: string | null; vide: { titre: string; texte: string; action: { href: string; libelle: string } | null } | null; outils?: OutilsScale }) {
  return (
    <Vue>
      <EnTete titre="Ce qui scale" sous={sous} />
      <SousNavVeille actif="/veille/scale" pastilleRadar={pastilleRadar} />
      {outils && (
        <form className="tile" action="/veille/scale" method="get" autoComplete="off" style={{ display: 'grid', gap: 10, marginBottom: 14 }} aria-label="Choisir la niche">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label className="field" style={{ flex: '1 1 260px' }}>Niche, mot-clé ou site d’une marque<input name="q" defaultValue={outils.niche} maxLength={120} placeholder="Ex. skincare, ou marque.com" /></label>
            <input type="hidden" name="country" value={outils.pays} />
            <button className="btn pri" type="submit"><Ic n="search" />Analyser la niche</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {outils.presets.map((p) => <Lien key={p.href} className="chip" href={p.href} aria-current={p.actif ? 'true' : undefined}>{p.libelle}</Lien>)}
            <small className="faint" style={{ marginLeft: 'auto' }}>{outils.etat}</small>
            {outils.rafraichir && <Lien className="btn sm" href={outils.rafraichir}><Ic n="loop" />Rafraîchir</Lien>}
          </div>
        </form>
      )}
      {outils?.marque && (
        <p className="faint" data-analyse-marque style={{ fontSize: '12.5px', margin: '0 0 12px' }}>
          Analyse d’une marque · toutes les créas de <b>{outils.marque.terme}</b> qui montent, sans plafond. <Lien href={outils.marque.href}>Voir toutes ses pubs</Lien>
        </p>
      )}
      {outils && outils.lignes.length > 0 && (
        <div className="grid3" style={{ marginBottom: 14 }} aria-label="Résumé de la niche">
          {outils.stats.map((s) => <div className="tile kfig" key={s.libelle}><span className="lbl">{s.libelle}</span><span className="v">{s.valeur}</span></div>)}
        </div>
      )}
      {outils && outils.lignes.length > 0 ? (
        <ScaleInteractif lignes={outils.lignes} initial={outils.initial} annonceurs={outils.annonceurs} angles={outils.angles} />
      ) : lignes.length > 0 ? (
        <div className="scaleL">
          {lignes.map((l) => (
            <div className="srow" key={l.cle}>
              <span className="faint num">{l.rang}</span>
              <Vignette image={l.image} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.accroche}</strong>
                <span className="faint" style={{ fontSize: '11.5px' }}>{l.detail}</span>
              </div>
              <div className="dbar"><i><b style={{ width: `${l.part}%` }} /></i><span>{l.jours}</span></div>
              <Lien className="btn sm" href={l.cloner}><Ic n="copy" />Cloner</Lien>
            </div>
          ))}
        </div>
      ) : vide && <EtatVide titre={vide.titre} texte={vide.texte} action={vide.action} />}
      {outils && outils.lignes.length > 0 && (
        <section className="sec" aria-label="Requêtes à copier">
          <div className="sech"><h2>Six requêtes de veille prêtes à copier</h2><span className="faint" style={{ fontSize: '12.5px' }}>À coller dans Jarvis ou un Studio, pour continuer sur cette niche</span></div>
          <div className="grid2">{outils.requetes.map((t, i) => <RequeteACopier key={i} n={i + 1} texte={t} />)}</div>
        </section>
      )}
    </Vue>
  );
}
