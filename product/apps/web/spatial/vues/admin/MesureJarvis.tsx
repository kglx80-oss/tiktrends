import { BORNE_EXTRAIT_JARVIS, CHEMIN_MESURE_JARVIS, EXEMPLES_PAR_PAGE_JARVIS, type VueMesureJarvis } from '@tiktrends/core';
import { Lien, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Jarvis · mesure de l'extraction » (lot 5 quater V5) · la règle de
 * « Créer l'itération » rejouée sur les VRAIES réponses stockées de l'espace
 * (`vueMesureJarvis`, noyau) · n, taux « rien de sûr » et son intervalle, le
 * banc en regard, la répartition par cause, des exemples anonymisés.
 * PRÉSENTATIONNEL · LECTURE SEULE · des liens (filtre, pages), aucun bouton,
 * aucun formulaire, aucun appel au modèle.
 */
export type PropsMesureJarvis =
  | { bandeau: BandeauAdmin; etat: 'indisponible'; raison: string }
  | { bandeau: BandeauAdmin; etat: 'pret'; vue: VueMesureJarvis };

const CIBLE = { minHeight: 44, display: 'inline-flex', alignItems: 'center' } as const;

export function MesureJarvis(p: PropsMesureJarvis) {
  return (
    <Vue>
      <TeteAdmin titre="Jarvis · mesure de l’extraction" sous="jarvis" actif={CHEMIN_MESURE_JARVIS} bandeau={p.bandeau} />
      <div className="kc" style={{ alignItems: 'center', marginBottom: 14 }}>
        <small className="faint">La règle qui présélectionne une variable sous une réponse de Jarvis, rejouée sur les réponses déjà enregistrées de ton espace · aucun modèle appelé, rien d’écrit, rien de dépensé.</small>
      </div>
      {p.etat === 'indisponible' ? (
        <section className="tile sec" data-etat="indisponible"><b>Mesure indisponible.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>{p.raison}</p></section>
      ) : <Pret v={p.vue} />}
    </Vue>
  );
}

function Pret({ v }: { v: VueMesureJarvis }) {
  return (
    <>
      <Kpis items={[
        { lbl: 'Réponses lues', v: String(v.n), d: v.tronque ? `les ${v.borne} plus récentes · les plus anciennes ne sont pas lues` : `toutes celles de l’espace (borne ${v.borne})` },
        { lbl: 'Rien de sûr', v: v.taux ? `${v.taux.pct} %` : '·', d: v.taux ? `intervalle à 95 % · ${v.taux.bas} à ${v.taux.haut} %` : 'aucune réponse', c: '' },
        { lbl: 'Banc écrit à la main', v: `${v.banc.pct} %`, d: `${v.banc.rienDeSur} sur ${v.banc.n} réponses-types` },
      ]} />
      <section className="tile sec" data-comparaison="">
        <span style={{ fontSize: '12.5px' }}>{v.comparaison}</span>
      </section>
      <section className="tile sec">
        <div className="sech"><h2>Pourquoi la règle se tait</h2><span className="faint" style={{ fontSize: '12.5px' }}>une réponse, une cause · la première que la règle rencontre</span></div>
        <div className="atable">
          {v.causes.map((c) => (
            <div className="atr" key={c.cle} data-cause={c.cle} style={{ gridTemplateColumns: '1.6fr 1.2fr .5fr .6fr' }}>
              <span><Lien href={c.href} style={CIBLE} aria-current={v.filtre === c.cle ? 'true' : undefined}>{c.cle === 'sure' ? <Pill c="g">{c.libelle}</Pill> : <b>{c.libelle}</b>}</Lien></span>
              <span><Barre part={c.part} /></span>
              <span><b data-n="">{c.n}</b></span>
              <span className="faint">{c.part} %</span>
            </div>
          ))}
        </div>
        <small className="faint" style={{ display: 'block', marginTop: 8, fontSize: '11.5px' }}>« Pub ambiguë » ne compte que les réponses qui nomment elles-mêmes plusieurs variantes · une réponse enregistrée ne garde pas le lot qui lui était joint, c’est donc une borne basse.</small>
      </section>
      <section className="tile sec" data-exemples="">
        <div className="sech">
          <h2>Exemples{v.filtre ? ` · ${v.causes.find((c) => c.cle === v.filtre)?.libelle ?? ''}` : ''}</h2>
          <span className="faint" style={{ fontSize: '12.5px' }}>{v.exemplesPossibles} parmi tes propres réponses · {EXEMPLES_PAR_PAGE_JARVIS} par page · extraits de {BORNE_EXTRAIT_JARVIS} signes au plus, sans adresse ni nom de marque</span>
        </div>
        {v.filtre && <Lien href={CHEMIN_MESURE_JARVIS} style={CIBLE} data-tout="">Toutes les causes</Lien>}
        <div className="atable">
          {v.exemples.map((e) => (
            <div className="atr" key={e.rang} data-exemple={e.classe} style={{ gridTemplateColumns: '.4fr .8fr 1.1fr 3fr' }}>
              <span className="faint">{e.rang}</span>
              <span className="faint">{e.le}</span>
              <span><b>{e.libelle}</b>{e.variables ? <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{e.variables}</small> : null}</span>
              <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', fontSize: '12.5px' }} data-extrait="">{e.extrait}</span>
            </div>
          ))}
          {v.exemples.length === 0 && <Vide>Aucun exemple · les réponses des autres membres sont comptées, jamais montrées.</Vide>}
        </div>
        {v.pages > 1 && (
          <nav className="kc" aria-label="Pages des exemples" style={{ alignItems: 'center', marginTop: 10 }}>
            {v.precedente && <Lien className="btn sm" href={v.precedente} style={CIBLE} data-page="precedente">Page précédente</Lien>}
            <span className="faint" style={{ fontSize: '12.5px' }}>Page {v.page} sur {v.pages}</span>
            {v.suivante && <Lien className="btn sm" href={v.suivante} style={CIBLE} data-page="suivante">Page suivante</Lien>}
          </nav>
        )}
      </section>
    </>
  );
}
