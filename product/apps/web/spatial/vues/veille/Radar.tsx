import { AUCUNE_NOUVEAUTE_SEMAINE, type ChiffresClesMeta, type ligneRadarCreatif } from '@tiktrends/core';
import { ChiffresCles } from '../accueil/ChiffresCles';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { SousNavVeille, Vignette } from './base';
import { BoutonSuivi } from './client';
import { BriefMarque, DecouverteCategorie, GestesNouveautes, GrammaireMarche } from './radar-client';

/**
 * « Radar » · `docs/spatial/reference/radar.html`. Le suivi des marques que
 * l'espace suit (`followed_brands`) et des nouvelles pubs que le suivi a
 * relevées chez elles (`brand_tracker_events`) · rien d'autre. Fermé à cet
 * espace, l'écran montre la vraie condition (offre ou rôle) et les seules
 * sorties qui existent · aucun achat simulé, aucun essai inventé.
 */
export interface AlerteRadar { titre: string; texte: string; action: { href: string; libelle: string } }
export interface MarqueRadar {
  cle: string; nom: string; initiale: string; fond: string; site: string; vignettes: ReadonlyArray<string | null>; nouveautes: string | null; voir: string;
  /** Vague 3 · les gestes de l'ancien onglet « Marques suivies » · brief, ne plus suivre, liens externes. Absents, la carte de la maquette. */
  gestes?: { plateforme: string; biblio: { href: string; libelle: string } | null; siteWeb: string | null };
}
export interface PropsRadar {
  ouvert: boolean;
  pastilleRadar: string | null;
  alertes: ReadonlyArray<AlerteRadar>;
  marques: ReadonlyArray<MarqueRadar>;
  /** Ouvert · la ligne sous les alertes (offre qui l'inclut). */
  inclus: string;
  /** Fermé · l'offre qui ouvre le Radar, et ce que cette session peut faire. */
  verrou: { titre: string; texte: string; passer: { href: string; libelle: string } | { raison: string }; superposition: { titre: string; sous: string } } | null;
  /**
   * Vague 3 · le Radar créatif de l'ancien écran · tes créas Meta notées A→D
   * (`brands.ads_insights`, jamais d'exemple). `null` sans synchronisation · le
   * geste réel est de brancher Meta Ads. Absent, l'écran est celui de la maquette.
   */
  /** Vague 3 · « Vérifier maintenant », « Tout marquer vu » et l'exploration de la catégorie (ancien onglet Sauvegardes). */
  suivi?: { scan: { actif: boolean; raison: string | null }; nonVues: number; explorer: boolean };
  creatif?: { maj: string | null; resume: ReadonlyArray<{ libelle: string; classe: string; n: number }>; lignes: ReadonlyArray<LigneRadarCreatif> } | null;
  /**
   * L'état de la connexion Meta · LE libellé partagé avec l'Accueil et la vue
   * Analytics (`etatConnexionMeta`), et ce qui manque au Radar créatif sans le
   * contredire (`manqueRadarCreatif`). Absent (pas de marque active), le texte générique.
   */
  connexionMeta?: { libelle: string; manque: { texte: string; action: string } };
  /** LES chiffres clés Meta (`chiffresClesMeta`) · absents sans le droit Analytics. */
  chiffres?: ChiffresClesMeta;
}

function Alertes({ alertes, ouvert }: { alertes: ReadonlyArray<AlerteRadar>; ouvert: boolean }) {
  return (
    <section className="tile" style={{ display: 'grid', gap: '12px', marginBottom: '16px', borderColor: '#ffd48a55', background: 'linear-gradient(140deg,#ffd48a1c,transparent 55%),var(--glass2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span className="orb" style={{ width: '32px', height: '32px', fontSize: '12.5px' }}>J</span>
        <h2 style={{ margin: 0, flex: 1, minWidth: '200px' }}>Ce que le suivi a repéré cette semaine</h2>
        <span className="pill" style={{ borderColor: 'color-mix(in srgb,var(--warn) 40%,transparent)', color: 'var(--warn)' }}><Ic n="bell" />{alertes.length ? `${alertes.length} alerte${alertes.length > 1 ? 's' : ''}` : 'Aucune alerte'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: '10px' }}>
        {alertes.map((a) => (
          <article key={a.titre} style={{ display: 'grid', gap: '8px', alignContent: 'start', padding: '14px', borderRadius: '18px', background: 'var(--clair-voile-carte,#0d1424b3)', border: '1px solid var(--edge2)' }}>
            <strong style={{ font: '600 14px/1.3 var(--sfd)', textWrap: 'pretty' }}>{a.titre}</strong>
            <p className="muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.45 }}>{a.texte}</p>
            <Lien className={`btn sm ${ouvert ? 'pri' : ''}`.trim()} href={ouvert ? a.action.href : '/radar'} style={{ justifySelf: 'start', marginTop: 'auto' }} tabIndex={ouvert ? undefined : -1}>{a.action.libelle}</Lien>
          </article>
        ))}
        {alertes.length === 0 && <p className="muted" style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.45 }}>Aucune nouvelle pub chez tes marques suivies ces 7 derniers jours.</p>}
      </div>
    </section>
  );
}

function Suivi({ marques, ouvert }: { marques: ReadonlyArray<MarqueRadar>; ouvert: boolean }) {
  return (
    <>
      <div className="sech"><h2>Marques suivies</h2><Lien className="btn sm" href="/veille/concurrents" style={{ marginLeft: 'auto' }} tabIndex={ouvert ? undefined : -1}><Ic n="plus" />Suivre une marque</Lien></div>
      <div className="grid3">
        {marques.map((m) => (
          <div className="tile" style={{ display: 'grid', gap: '12px' }} key={m.cle}>
            <div className="member">
              <span className="av" style={{ background: m.fond, width: '44px', height: '44px' }}>{m.initiale}</span>
              <div><h3>{m.nom}</h3><span className="faint" style={{ fontSize: '11.5px' }}>{m.site}</span></div>
              {/* Le suivi relève les nouveautés de TOUTE marque suivie · il n'existe pas d'interrupteur par marque · l'état réel est montré, pas modifiable. */}
              <button type="button" className="sw2" role="switch" aria-checked="true" disabled aria-label={`Alertes ${m.nom} · toujours actives tant que la marque est suivie`} title="Le suivi est actif pour toute marque suivie · retire-la pour l’arrêter" style={{ marginLeft: 'auto' }} />
            </div>
            <div className="kc">{m.vignettes.map((v, i) => <span key={i} style={{ width: '56px' }}><Vignette image={v} /></span>)}</div>
            <div className="member">
              {m.nouveautes ? <span className="pill c" style={{ fontSize: '11.5px' }}>{m.nouveautes}</span> : <span className="faint" style={{ fontSize: '11.5px' }}>{AUCUNE_NOUVEAUTE_SEMAINE}</span>}
              <Lien className="btn sm" href={m.voir} style={{ marginLeft: 'auto' }} tabIndex={ouvert ? undefined : -1}>Voir</Lien>
            </div>
            {ouvert && m.gestes && (
              <div className="kc" style={{ flexWrap: 'wrap' }} data-gestes-marque>
                <BriefMarque platform={m.gestes.plateforme} nom={m.nom} />
                <BoutonSuivi plateforme={m.gestes.plateforme} nom={m.nom} initial />
                {m.gestes.biblio && <a className="btn sm" href={m.gestes.biblio.href} target="_blank" rel="noopener noreferrer">{m.gestes.biblio.libelle}</a>}
                {m.gestes.siteWeb && <a className="btn sm" href={m.gestes.siteWeb} target="_blank" rel="noopener noreferrer">Site</a>}
              </div>
            )}
          </div>
        ))}
      </div>
      {marques.length === 0 && <p className="muted" style={{ fontSize: '13px' }}>Tu ne suis encore aucune marque · « Suivre » sur le détail d’une pub ou dans Concurrents.</p>}
      <div className="sech sec"><h2>Recherches enregistrées</h2></div>
      <div className="mtable">
        <div className="mrow h"><span>Recherche</span><span>Critères</span><span>Alerte</span><span>Nouveautés</span><span /></div>
        <div className="mrow"><span className="faint" style={{ gridColumn: '1/-1' }}>Les recherches enregistrées ne sont pas encore disponibles · tes critères de Veille vivent dans l’adresse de la page.</span></div>
      </div>
    </>
  );
}

export type LigneRadarCreatif = ReturnType<typeof ligneRadarCreatif>;

/** Le Radar créatif · tes créas notées, la recommandation et le lien vers un projet. */
function RadarCreatif({ c, connexion, chiffres }: { c: NonNullable<PropsRadar['creatif']> | null; connexion: PropsRadar['connexionMeta']; chiffres?: ChiffresClesMeta }) {
  const etat = connexion?.libelle ?? 'Meta Ads';
  return (
    <section className="sec" aria-label="Radar créatif" data-section="radar-creatif">
      <div className="sech"><h2>Radar créatif · tes créas notées</h2><span className="faint" style={{ fontSize: '12.5px' }}>{c ? `${etat} · 30 derniers jours${c.maj ? ` · créas relevées le ${c.maj}` : ''}` : connexion?.libelle ?? 'Aucune créa relevée'}</span></div>
      {chiffres && <div style={{ marginBottom: 12 }}><ChiffresCles c={chiffres} /></div>}
      {!c ? (
        <div className="tile member">
          <p className="muted" style={{ fontSize: '12.5px', flex: 1 }}>Chaque créa est notée Hook, Hold, CTR et Conv (A à D, comparées aux autres créas de ton compte), puis rangée en recommandation · scaler, pousser, itérer, rafraîchir, couper. {connexion?.manque.texte ?? 'Il faut tes vraies créas Meta Ads.'}</p>
          <Lien className="btn sm pri" href="/connections" style={{ marginLeft: 'auto' }}>{connexion?.manque.action ?? 'Ouvrir Connexions'}</Lien>
        </div>
      ) : (
        <>
          <div className="kc" style={{ marginBottom: 10 }}>{c.resume.map((r) => <span key={r.libelle} className={`pill ${r.classe}`.trim()} style={{ marginLeft: 0 }}>{r.libelle} · {r.n}</span>)}</div>
          <div className="mtable">
            {c.lignes.map((l) => (
              <div className="tile" key={l.cle} style={{ display: 'grid', gap: 8 }} data-crea={l.cle}>
                <div className="member" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}><strong>{l.titre}</strong> <span className="pill" style={{ marginLeft: 4, fontSize: 10 }}>{l.plateforme}</span><br /><small className="faint">{l.detail}</small></div>
                  {l.notes.map((n) => <span key={n.cle} className={`pill ${n.classe}`} style={{ marginLeft: 0 }} title={`${n.libelle} · ${n.note}`}>{n.libelle} {n.note}</span>)}
                  <span className="faint" style={{ fontSize: '12px' }}>Score {l.score}</span>
                  <span className={`pill ${l.reco.classe}`.trim()} style={{ marginLeft: 0 }}>{l.reco.libelle}</span>
                </div>
                <div className="member" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {l.diagnostic.map((d, i) => <span key={i} className="chip">{d}</span>)}
                  <Lien className="btn sm" href={l.projet.href} style={{ marginLeft: 'auto' }}><Ic n="spark" />{l.projet.libelle}</Lien>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function Radar(p: PropsRadar) {
  const v = p.verrou;
  return (
    <Vue>
      <EnTete titre="Radar" sous="Le suivi de ton marché · les nouvelles pubs des marques que tu suis" />
      <SousNavVeille actif="/radar" pastilleRadar={p.pastilleRadar} />
      {p.ouvert || !v ? (
        <>
          <Alertes alertes={p.alertes} ouvert />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '-4px 0 14px' }}>
            <span className="faint" style={{ fontSize: '12px' }}>{p.inclus}</span>
            <Lien className="btn sm" href="/jarvis"><Ic n="chat" />Ouvrir Jarvis</Lien>
            {p.suivi && <GestesNouveautes scan={p.suivi.scan} nonVues={p.suivi.nonVues} />}
          </div>
          <Suivi marques={p.marques} ouvert />
          {p.suivi?.explorer && (
            <section className="sec" aria-label="Explorer ma catégorie">
              <div className="sech"><h2>Explorer ma catégorie</h2></div>
              <div className="grid2"><DecouverteCategorie /><GrammaireMarche /></div>
            </section>
          )}
          {p.creatif !== undefined && <RadarCreatif c={p.creatif} connexion={p.connexionMeta} chiffres={p.chiffres} />}
        </>
      ) : (
        <>
          <section className="tile" style={{ display: 'grid', gap: '18px', marginBottom: '16px', padding: '26px', borderColor: '#ffd48a66', background: 'radial-gradient(120% 140% at 100% 0%,#ffd48a2a,transparent 55%),radial-gradient(90% 120% at 0% 100%,#ff9f6e1c,transparent 60%),var(--glass2)' }}>
            <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '58px', height: '58px', borderRadius: '18px', background: 'linear-gradient(135deg,#ffd48a,#ff9f6e)', color: '#2a1a00', flex: 'none', boxShadow: '0 14px 30px -12px #ff9f6eaa' }}><Ic n="eye" s={false} /></span>
              <div style={{ flex: '1 1 320px', minWidth: 0, display: 'grid', gap: '6px' }}>
                <span className="lbl" style={{ margin: 0, color: 'var(--warn)' }}>{v.titre}</span>
                <h2 style={{ margin: 0, fontSize: '23.5px', letterSpacing: '-.02em', textWrap: 'balance' }}>Ne rate plus une pub de tes concurrents</h2>
                <p className="muted" style={{ margin: 0, fontSize: '14px', maxWidth: '620px', textWrap: 'pretty' }}>{v.texte}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: '10px' }}>
              {([['eye', 'Suivi des marques', 'Les nouvelles pubs des marques que tu suis, relevées pour toi'], ['bell', 'Alertes', 'Chaque nouveauté arrive dans tes notifications'], ['bulb', 'Action immédiate', 'De l’alerte à la pub, puis à l’itération dans Studios']] as const).map(([i, t, d]) => (
                <div key={t} style={{ display: 'grid', gap: '4px', padding: '12px 14px', borderRadius: '16px', background: '#ffffff0a', border: '1px solid var(--edge2)' }}>
                  <span style={{ color: 'var(--warn)' }}><Ic n={i} /></span><strong style={{ fontSize: '13.5px' }}>{t}</strong><small className="faint" style={{ fontSize: '12px' }}>{d}</small>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {'href' in v.passer
                ? <Lien className="btn pri" href={v.passer.href}><Ic n="spark" />{v.passer.libelle}</Lien>
                : <button className="btn pri" type="button" disabled title={v.passer.raison}><Ic n="spark" />{v.passer.raison}</button>}
              <Lien className="btn" href="/support">Une question sur les offres</Lien>
              <Lien className="btn sm" href="/veille" style={{ marginLeft: 'auto' }}>Revenir à la Veille</Lien>
            </div>
          </section>
          <div style={{ position: 'relative', borderRadius: '26px', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ filter: 'blur(5px) saturate(.8)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }}>
              <Alertes alertes={p.alertes} ouvert={false} />
              <Suivi marques={p.marques} ouvert={false} />
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: '10px', textAlign: 'center', background: 'linear-gradient(180deg,transparent,var(--clair-voile-verrou,#0b1220cc) 40%)' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '50%', background: '#ffd48a', color: '#2a1a00' }}><Ic n="lock" s={false} /></span>
              <strong style={{ font: '600 16.5px var(--sfd)' }}>{v.superposition.titre}</strong>
              <small className="faint">{v.superposition.sous}</small>
            </div>
          </div>
        </>
      )}
    </Vue>
  );
}
