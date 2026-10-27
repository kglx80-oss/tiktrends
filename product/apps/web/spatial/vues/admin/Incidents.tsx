import { Lien, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Incidents » · le journal des échecs techniques (`error_log`, ancien
 * `/admin/incidents`). PRÉSENTATIONNEL · lecture seule. D'abord les causes
 * (réseau ? quota ? clé ?) et les zones touchées, le détail ligne à ligne
 * ensuite · pour voir un fournisseur dérailler AVANT qu'un client le signale.
 */
export const PERIODES_INCIDENTS = [1, 7, 30] as const;

export interface PropsIncidents {
  bandeau: BandeauAdmin;
  jours: number;
  total: number;
  causes: ReadonlyArray<{ cle: string; libelle: string; n: number; part: number; dernier: string; conseil: string | null }>;
  zones: ReadonlyArray<{ zone: string; n: number }>;
  lignes: ReadonlyArray<{ id: string; zone: string; cause: string; espace: string | null; quand: string; detail: string }>;
  limite: number;
}

export function Incidents(p: PropsIncidents) {
  return (
    <Vue>
      <TeteAdmin titre="Incidents techniques" sous="incidents" actif="/admin/incidents" bandeau={p.bandeau} />
      <div className="kc" style={{ alignItems: 'center', marginBottom: 14 }}>
        <nav className="seg" aria-label="Période">
          {PERIODES_INCIDENTS.map((j) => <Lien key={j} href={`/admin/incidents?j=${j}`} aria-current={j === p.jours ? 'page' : undefined}>{j} j</Lien>)}
        </nav>
        <small className="faint">Chaque échec rencontré par un client, regroupé par cause · conservation 30 jours.</small>
      </div>
      <Kpis items={[
        { lbl: `Échecs · ${p.jours} j`, v: p.total.toLocaleString('fr-FR'), c: p.total ? 'w' : 'up', d: p.total ? 'à examiner' : 'aucun' },
        { lbl: 'Causes distinctes', v: String(p.causes.length) },
        { lbl: 'Zones touchées', v: String(p.zones.length) },
      ]} />
      {p.total === 0 ? (
        <section className="tile sec" data-etat="vide"><b>Aucun incident sur {p.jours} jour{p.jours > 1 ? 's' : ''}.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>Toutes les générations ont abouti, ou le journal vient d’être mis en service.</p></section>
      ) : (
        <>
          <div className="agrid2 sec">
            <section className="tile">
              <div className="sech"><h2>Par cause</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.total} échec{p.total > 1 ? 's' : ''}</span></div>
              <div className="atable">
                {p.causes.map((c) => (
                  <div className="atr" key={c.cle} data-cause={c.cle} style={{ gridTemplateColumns: '1.2fr 1.4fr .5fr .9fr' }}>
                    <span><b>{c.libelle}</b>{c.conseil && <small className="faint" style={{ display: 'block', whiteSpace: 'normal' }}>{c.conseil}</small>}</span>
                    <span><Barre part={c.part} /></span><span><b>{c.n}</b></span><span className="faint">{c.dernier}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="tile">
              <div className="sech"><h2>Zones touchées</h2></div>
              <div className="kc">{p.zones.map((z) => <span className="chip" key={z.zone}><span className="mono">{z.zone}</span><b>{z.n}</b></span>)}</div>
            </section>
          </div>
          <section className="tile sec">
            <div className="sech"><h2>Derniers échecs</h2>{p.lignes.length >= p.limite && <span className="faint" style={{ fontSize: '12.5px' }}>{p.limite} les plus récents</span>}</div>
            <div className="atable">
              {p.lignes.map((l) => (
                <div className="atr" key={l.id} style={{ gridTemplateColumns: '1fr 2.4fr' }}>
                  <span><span className="mono">{l.zone}</span><small className="faint" style={{ display: 'block' }}>{l.quand}{l.espace ? ` · ${l.espace}` : ''}</small></span>
                  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}><Pill>{l.cause}</Pill> <span className="mono">{l.detail}</span></span>
                </div>
              ))}
              {p.lignes.length === 0 && <Vide>Aucune ligne.</Vide>}
            </div>
          </section>
        </>
      )}
    </Vue>
  );
}
