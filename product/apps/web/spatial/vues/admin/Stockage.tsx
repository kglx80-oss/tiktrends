import type { VueInventaireStockage } from '@tiktrends/core';
import { Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Stockage · fichiers orphelins » · l'INVENTAIRE des fichiers déposés sous
 * `assets/<espace>/` qu'aucune ligne recensée ne pointe
 * (`RECENSEMENT_REFERENCES_STOCKAGE`, `inventaireOrphelins`, noyau).
 * PRÉSENTATIONNEL · LECTURE SEULE : aucun bouton, aucun formulaire, aucun
 * geste · une éventuelle purge demande un mandat du propriétaire.
 */
export type PropsStockage =
  | { bandeau: BandeauAdmin; etat: 'indisponible'; raison: string }
  | ({ bandeau: BandeauAdmin; etat: 'pret' } & VueInventaireStockage);

export function Stockage(p: PropsStockage) {
  return (
    <Vue>
      <TeteAdmin titre="Stockage · fichiers orphelins" sous="stockage" actif="/admin/stockage" bandeau={p.bandeau} />
      <div className="kc" style={{ alignItems: 'center', marginBottom: 14 }}>
        <small className="faint">Inventaire en lecture seule · un fichier n’est compté que s’il est rangé chez un espace connu, plus vieux que le délai de grâce, et qu’aucune donnée ne le pointe. Rien n’est supprimé depuis cet écran.</small>
      </div>
      {p.etat === 'indisponible' ? (
        <section className="tile sec" data-etat="indisponible"><b>Inventaire indisponible.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>{p.raison}</p></section>
      ) : (
        <>
          <Kpis items={p.kpis} />
          {p.avertissements.map((a) => (
            <section className="tile sec" data-etat="partiel" key={a}><Pill c="w">Partiel</Pill> <span style={{ fontSize: '12.5px' }}>{a}</span></section>
          ))}
          <div className="agrid2 sec">
            <section className="tile">
              <div className="sech"><h2>Par verdict</h2></div>
              <div className="atable">
                {p.motifs.map((m) => (
                  <div className="atr" key={m.cle} data-motif={m.cle} style={{ gridTemplateColumns: '1.6fr .6fr .8fr' }}>
                    <span><b>{m.libelle}</b></span><span><b>{m.nombre}</b></span><span className="faint">{m.volume}</span>
                  </div>
                ))}
                {p.motifs.length === 0 && <Vide>Aucun fichier sous les espaces.</Vide>}
              </div>
            </section>
            <section className="tile">
              <div className="sech"><h2>Par espace</h2></div>
              <div className="atable">
                {p.parEspace.map((e) => (
                  <div className="atr" key={e.espace} data-espace={e.espace} style={{ gridTemplateColumns: '1.3fr 1.2fr .5fr .8fr' }}>
                    <span><b>{e.nom}</b></span><span><Barre part={e.part} /></span><span><b>{e.nombre}</b></span><span className="faint">{e.volume}</span>
                  </div>
                ))}
                {p.parEspace.length === 0 && <Vide>Aucun candidat orphelin.</Vide>}
              </div>
            </section>
          </div>
          <section className="tile sec">
            <div className="sech"><h2>Les plus gros candidats</h2>{p.plusGros.length >= 50 && <span className="faint" style={{ fontSize: '12.5px' }}>50 les plus lourds</span>}</div>
            <div className="atable">
              {p.plusGros.map((o) => (
                <div className="atr" key={o.cle} data-cle={o.cle} style={{ gridTemplateColumns: '2.4fr 1fr .6fr .8fr' }}>
                  <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}><span className="mono">{o.cle}</span></span>
                  <span>{o.nom}</span><span><b>{o.volume}</b></span><span className="faint">{o.age}</span>
                </div>
              ))}
              {p.plusGros.length === 0 && <Vide>Aucun candidat · le silence est une réponse valable.</Vide>}
            </div>
          </section>
        </>
      )}
    </Vue>
  );
}
