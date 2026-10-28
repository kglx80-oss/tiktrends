import type { CSSProperties } from 'react';
import { CLASSE_NIVEAU_SCORE, styleTableDefilante, type BilanAvanceAccueil, type DiversiteCreative, type MetriquesMetaAnalytics } from '@tiktrends/core';
import { Anneau, EnTete, Ic, Lien, SousNav, Vue } from '../../communs';

/**
 * La vue « Analytics » de l'Accueil Spatial (`/dashboard?vue=analytics`) · hors
 * maquette, composée avec ses classes (`.sec`, `.sech`, `.dkpis`, `.tile`,
 * `.bar`, `.atable`, `.pill`). PRÉSENTATIONNEL · la page lit les sources sous
 * le droit Analytics (refus AVANT toute lecture), le bilan sous son propre
 * droit Adsmap. Portée de l'ancienne vue Analytics, sans son aperçu de
 * démonstration (aucun chiffre sans source).
 */

export interface OngletAccueil { href: string; libelle: string; actif: boolean }

export type PropsAnalytics = { onglets: readonly OngletAccueil[] } & (
  | { etat: 'refus'; message: string }
  | {
    etat: 'ouvert';
    meta: MetriquesMetaAnalytics | null;
    encart: { titre: string; texte: string; cta: { libelle: string; href: string } } | null;
    diversite: DiversiteCreative | null;
    bilan: BilanAvanceAccueil | null;
  }
);

const petit = (taille: string, plus: CSSProperties = {}): CSSProperties => ({ fontSize: taille, ...plus });
const COULEUR = { bon: 'var(--good)', mauvais: 'var(--bad)' } as const;
const couleur = (ton: 'bon' | 'mauvais' | null) => (ton ? { color: COULEUR[ton] } : undefined);
const LOGO_META: CSSProperties = { background: '#0467df', width: 34, height: 34, fontSize: 13 };
const COLONNES_TOP = '1fr 90px 90px 100px';

/** Une barre de part (`div.bar`) · libellé au-dessus, valeur à droite. */
function Part({ libelle, texte, part }: { libelle: string; texte: string; part: number }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span className="muted" style={petit('12px', { textTransform: 'capitalize' })}>{libelle}</span>
      <div className="bar"><i><b style={{ width: `${Math.round(Math.max(0, Math.min(1, part)) * 100)}%` }} /></i><span style={petit('12px')}>{texte}</span></div>
    </div>
  );
}

function Meta({ m }: { m: MetriquesMetaAnalytics }) {
  return (
    <section className="sec" data-section="meta">
      <div className="sech">
        <span className="logo2" style={LOGO_META}>M</span>
        <div><h2>Key Metrics</h2><p className="faint" style={petit('12.5px')}>{m.sous}</p></div>
      </div>
      <div className="dkpis">
        {m.kpis.map((k) => (
          <div className="tile dk" key={k.libelle}>
            <span className="lbl">{k.libelle}</span>
            <span className="v num">{k.valeur}</span>
            {k.variation && <span className="d" style={couleur(k.ton)}>{k.variation}</span>}
          </div>
        ))}
      </div>
      {m.repartitions.length > 0 && (
        <div className="agrid2" style={{ marginTop: 14 }}>
          {m.repartitions.map((r) => (
            <div className="tile" key={r.titre}>
              <div className="lbl">{r.titre}</div>
              <div style={{ display: 'grid', gap: 9, marginTop: 8 }}>{r.lignes.map((l) => <Part key={l.cle} libelle={l.cle} texte={l.texte} part={l.part} />)}</div>
            </div>
          ))}
        </div>
      )}
      {m.topAds.length > 0 && (
        <div className="tile" style={{ marginTop: 14 }}>
          <div className="lbl">Top créas (par ROAS)</div>
          <div className="atable" data-table="top-roas" style={styleTableDefilante(420)}>
            <div className="atr ath" style={{ gridTemplateColumns: COLONNES_TOP }}><span>Créa</span><span>ROAS</span><span>CPA</span><span>Dépense</span></div>
            {m.topAds.map((a, i) => (
              <div className="atr" style={{ gridTemplateColumns: COLONNES_TOP }} key={a.nom + i}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{a.nom}</b></span>
                <span style={a.roasBon ? { color: 'var(--good)', fontWeight: 600 } : undefined}>{a.roas}</span><span>{a.cpa}</span><span>{a.depense}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Diversite({ d }: { d: DiversiteCreative }) {
  return (
    <section className="sec" data-section="diversite">
      <div className="sech">
        <span className="ico"><Ic n="spark" /></span>
        <div><h2>Diversité créative</h2><p className="faint" style={petit('12.5px')}>Tes générations et les tags de tes assets</p></div>
      </div>
      <div className="agrid2">
        <div className="tile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Anneau part={d.score} taille={60} libelle={d.score} />
            <div style={{ display: 'grid', gap: 4 }}>
              <span className={`pill ${CLASSE_NIVEAU_SCORE[d.niveau]}`} style={{ justifySelf: 'start' }}>{d.libelleNiveau}</span>
              <span className="faint" style={petit('12px')}>{d.total} créa(s) analysée(s)</span>
            </div>
          </div>
          <div className="lbl">Répartition des gabarits</div>
          {d.gabarits.length === 0
            ? <p className="muted" style={petit('12.5px')}>Génère des pubs pour voir la diversité.</p>
            : <div style={{ display: 'grid', gap: 9, marginTop: 8 }}>{d.gabarits.map((g) => <Part key={g.cle} libelle={g.libelle} texte={String(g.n)} part={g.part} />)}</div>}
        </div>
        <div className="tile">
          <div className="lbl">Top tags créatifs (IA)</div>
          {d.tags.length === 0
            ? <p className="muted" style={petit('12.5px')}>Tague tes assets (bouton « Analyser » dans Assets) pour voir tes thèmes dominants.</p>
            : <div style={{ display: 'grid', gap: 9, marginTop: 8 }}>{d.tags.map((t) => <Part key={t.tag} libelle={t.tag} texte={String(t.n)} part={t.part} />)}</div>}
        </div>
      </div>
    </section>
  );
}

function Bilan({ b }: { b: BilanAvanceAccueil }) {
  return (
    <section className="sec" data-section="bilan" aria-label="Bilan avancé de Jarvis">
      <div className="sech">
        <span className="ico"><Ic n="flask" /></span>
        <div>
          <h2>Bilan avancé · Jarvis</h2>
          <p className="faint" style={petit('12.5px')}>{b.marque} · est-ce que Jarvis fait bouger tes résultats ? Deux lectures qui se vérifient elles-mêmes · l’évolution dans le temps, et les créas générées avec sa mémoire comparées à celles sans.</p>
        </div>
      </div>
      {b.tendance && (
        <div className="tile" data-bloc="tendance" style={{ marginBottom: 14 }}>
          <div className="sech" style={{ margin: '0 0 8px' }}><h2 style={{ fontSize: 15 }}>Est-ce que ça marche mieux qu’avant ?</h2><span className="pill">{b.tendance.jours}</span></div>
          <p style={petit('13px', { fontWeight: 600, ...couleur(b.tendance.ton) })}>{b.tendance.resume}</p>
          <p className="faint" style={petit('11.5px', { marginTop: 8 })}>Deux périodes qui se touchent, datées sur la création de la créa · pas sur son verdict, qui arrive des semaines plus tard. Ça répond à « est-ce que ça va mieux », pas à « grâce à quoi » : le produit, le marché et la saison bougent en même temps.</p>
        </div>
      )}
      <div className="tile" id="attribution" data-bloc="attribution">
        <div className="sech" style={{ margin: '0 0 8px' }}><h2 style={{ fontSize: 15 }}>Est-ce que Jarvis améliore vraiment les résultats ?</h2><span className="pill">Attribution</span></div>
        <p className="muted" style={petit('12.5px')}>Les créas générées <b>avec</b> la mémoire, comparées à celles générées <b>sans</b>, sur les tests arbitrés. On ne cherche pas quelle accroche a produit quelle gagnante · c’est indécidable · mais si l’ensemble fait bouger le taux.</p>
        <p style={petit('13px', { fontWeight: 600, marginTop: 10, ...couleur(b.attribution.ton) })}>{b.attribution.resume}</p>
        {b.attribution.manque && <p className="faint" style={petit('11.5px', { marginTop: 8 })}>{b.attribution.manque}</p>}
        {b.attribution.exclus && <p className="faint" style={petit('11.5px', { marginTop: 8 })}>{b.attribution.exclus}</p>}
        {b.attribution.parts.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {b.attribution.parts.map((x) => (
              <div key={x.cle} style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', fontSize: '12px' }}>
                <span className="muted" style={{ width: 180 }}>{x.libelle}</span>
                <b style={couleur(x.ton)}>{x.ecart}</b>
                <span className="faint">{x.detail}</span>
              </div>
            ))}
            <p className="faint" style={petit('11px')}>Ces trois lignes ne s’additionnent pas · une génération peut bénéficier des trois, ce sont trois comparaisons distinctes.</p>
          </div>
        )}
        <p className="faint" style={petit('11px', { marginTop: 10 })}>Ce n’est pas une expérience contrôlée : le groupe témoin est plus ancien, et une marque qui progresse progresserait de toute façon. On ne conclut donc que si les intervalles de confiance ne se chevauchent pas.</p>
      </div>
    </section>
  );
}

export function Analytics(p: PropsAnalytics) {
  const actif = p.onglets.find((o) => o.actif)?.href ?? '';
  return (
    <Vue>
      <EnTete titre="Analytics" sous="Vue agrégée de tes créas · dépense, efficacité, diversité" />
      {p.onglets.length > 0 && <SousNav items={p.onglets} actif={actif} />}
      {p.etat === 'refus' ? (
        <section className="tile sec" role="status" data-vue="analytics-refusee" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="ico"><Ic n="lock" /></span>
          <p className="muted" style={petit('13px')}>{p.message}</p>
        </section>
      ) : (
        <div data-vue="analytics" style={{ display: 'contents' }}>
          {p.meta ? <Meta m={p.meta} /> : p.encart && (
            <section className="sec" data-section="encart-meta">
              <div className="tile" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="logo2" style={LOGO_META}>M</span>
                <div style={{ flex: 1, minWidth: 220 }}><strong>{p.encart.titre}</strong><p className="muted" style={petit('12.5px')}>{p.encart.texte}</p></div>
                <Lien className="btn sm pri" href={p.encart.cta.href}>{p.encart.cta.libelle}</Lien>
              </div>
            </section>
          )}
          {p.diversite && <Diversite d={p.diversite} />}
          {p.bilan && <Bilan b={p.bilan} />}
          {!p.meta && !p.encart && !p.diversite && !p.bilan && (
            <section className="tile sec"><p className="muted" style={petit('13px')}>Rien à lire pour l’instant · les KPI Meta, la diversité de tes générations et le bilan de Jarvis apparaissent ici dès qu’une marque active a des données.</p></section>
          )}
        </div>
      )}
    </Vue>
  );
}
