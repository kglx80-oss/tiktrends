import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { Hypothese } from './communs';

/**
 * La fiche d'un test (une ad de la carte) · le panneau d'arbitrage de l'ancienne
 * Adsmap, dans le langage de la fiche d'un lot (`.tile.verdict`, `.kpis`, `.tl`).
 * PRÉSENTATIONNEL · la page lit `adDetailAction` et décide ce que chaque section
 * a le droit de dire (`presentationTest`) · les gestes (arbitrer, itérer,
 * partager) arrivent par `actions`, branchés sur les actions existantes.
 *
 * L'ordre est celui de l'ancien panneau · comprendre le chiffre, en tirer un
 * enseignement, décider de la suite.
 */

export interface PropsFicheTest {
  titre: string;
  sous: string;
  /** D'où vient la créa (veille) · le lien seulement s'il vise juste. */
  provenance: { nom: string | null; url: string | null } | null;
  /** Ouverte depuis une carte des Studios · le chemin du retour. */
  retour: { href: string; libelle: string } | null;
  resultat:
    | { type: 'mesure'; verdict: { libelle: string; classe: string }; relatif: boolean; etape: string | null; raison: string | null; chiffres: ReadonlyArray<{ l: string; v: string; sub?: string }>; protocole: string | null }
    | { type: 'vide'; texte: string; prochaine: { texte: string; lien: { href: string; libelle: string } | null } | null };
  hypothese: string | null;
  /** Le verdict retenu, une fois arbitré · `null` tant qu'il ne l'est pas. */
  arbitre: { libelle: string; ecart: boolean } | null;
  apprentissages: ReadonlyArray<{ id: string; texte: string; detail: string }>;
  filiation: { parent: { href: string; texte: string } | null; enfants: ReadonlyArray<{ href: string; texte: string; verdict: string | null }> };
  actions?: ReactNode;
}

export function FicheTest(p: PropsFicheTest) {
  const r = p.resultat;
  return (
    <Vue>
      <EnTete titre={p.titre} sous={p.sous} />
      {(p.retour || p.provenance) && (
        <div className="toolbar">
          {p.retour && <Lien className="btn sm" href={p.retour.href}><Ic n="back" />{p.retour.libelle}</Lien>}
          {p.provenance && (
            <span className="faint" style={{ fontSize: '12.5px' }}>
              Inspiré d’une source de veille{p.provenance.nom ? <> · {p.provenance.url ? <a href={p.provenance.url} target="_blank" rel="noopener noreferrer">{p.provenance.nom}</a> : <b>{p.provenance.nom}</b>}</> : ''}
            </span>
          )}
        </div>
      )}
      <section className="tile verdict" aria-label="Ce que le test a donné">
        <div className="ico" style={{ width: 56, height: 56, borderRadius: 18, background: '#ffffff12', color: 'var(--fg2)' }}>
          <Ic n={r.type === 'mesure' ? 'chart' : 'cal'} s={false} />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="lbl">Ce que le test a donné</div>
          {r.type === 'mesure' ? (
            <>
              <div className="big num" style={{ fontSize: 34 }}>{r.verdict.libelle}</div>
              {r.raison && <p className="muted">{r.raison}</p>}
            </>
          ) : (
            <>
              <p className="muted">{r.texte}</p>
              {r.prochaine && <p className="faint" style={{ fontSize: '12.5px' }}>{r.prochaine.texte}</p>}
              {r.prochaine?.lien && <Lien className="btn sm" href={r.prochaine.lien.href} style={{ justifySelf: 'start' }}>{r.prochaine.lien.libelle}</Lien>}
            </>
          )}
        </div>
        {r.type === 'mesure' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${r.verdict.classe}`}>{r.verdict.libelle}</span>
            {r.relatif && <span className="pill w" title="Protocole non respecté : la conclusion ne vaut qu’au sein du lot">Comparaison relative</span>}
            {r.etape && <span className="pill">Bloque sur {r.etape}</span>}
          </span>
        )}
      </section>
      {r.type === 'mesure' && (
        <>
          <div className="kpis rvk">
            {r.chiffres.map((c) => (
              <div className="tile kpi" key={c.l}><div className="lbl">{c.l}</div><div className="v">{c.v}</div>{c.sub && <small>{c.sub}</small>}</div>
            ))}
          </div>
          {r.protocole && <p className="faint" style={{ fontSize: '12.5px', margin: '-4px 0 14px' }}>{r.protocole}</p>}
        </>
      )}
      <section className="tile sec" aria-label="Hypothèse et apprentissages">
        <div className="lbl">Hypothèse</div>
        <p style={{ marginTop: 4 }}>{p.hypothese ? <Hypothese texte={p.hypothese} /> : <span className="muted">Aucune hypothèse écrite · le résultat de ce test ne pourra être attribué à rien.</span>}</p>
        {p.arbitre && (
          <p className="muted" style={{ marginTop: 10, fontSize: '13px' }}>
            Verdict retenu · <b>{p.arbitre.libelle}</b>.{p.arbitre.ecart ? ' Différent du calcul · le motif est consigné.' : ''}
          </p>
        )}
        {p.apprentissages.length > 0 && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>Apprentissages</div>
            <div className="tl">
              {p.apprentissages.map((a) => (
                <div className="ev" key={a.id}><span className="ico"><Ic n="bulb" /></span><span>{a.texte}<br /><span className="faint" style={{ fontSize: '11.5px' }}>{a.detail}</span></span><span /></div>
              ))}
            </div>
          </>
        )}
        {(p.filiation.parent || p.filiation.enfants.length > 0) && (
          <>
            <div className="lbl" style={{ marginTop: 12 }}>Filiation</div>
            <div className="tl">
              {p.filiation.parent && (
                <div className="ev"><span className="ico"><Ic n="back" /></span><span>{p.filiation.parent.texte}</span><Lien className="btn sm" href={p.filiation.parent.href}>Ouvrir</Lien></div>
              )}
              {p.filiation.enfants.map((e) => (
                <div className="ev" key={e.href}><span className="ico"><Ic n="loop" /></span><span>{e.texte}{e.verdict && <span className="faint"> · {e.verdict}</span>}</span><Lien className="btn sm" href={e.href}>Ouvrir</Lien></div>
              ))}
            </div>
          </>
        )}
      </section>
      {p.actions}
    </Vue>
  );
}
