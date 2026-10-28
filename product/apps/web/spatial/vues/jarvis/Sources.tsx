import { MOTEURS_JARVIS, type GroupeMemoire } from '@tiktrends/core';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { DecrireCreas, EntrainementJarvis, ReglesJarvis } from './sources-client';

/**
 * « Sources de Jarvis » · écran sans fragment de maquette (vague 3), composé
 * avec le langage de l'écran Jarvis (tuiles, `.kfig`, `.pill`, `.bar`). Ce que
 * Jarvis sait de la marque active et d'où il le tient · l'état réel de chaque
 * couche (`jarvisSnapshot`), la mémoire mesurée (offre Plus · `adsmap`), le
 * contexte envoyé à chaque réponse (identité, consignes, accroches,
 * connaissances), de quoi nourrir la mémoire (décrire les créas, coût annoncé
 * avant le clic) et, pour le fondateur seul, l'exploitation (serveur, dépense)
 * et les réglages maison (entraînement, règles). Tout est lu · rien n'est
 * inventé, une valeur absente est dite.
 */

export interface CoucheJarvis { cle: string; titre: string; quoi: string; etat: 'on' | 'partial' | 'off' | 'always'; libelleEtat: string; detail: string; geste: { libelle: string; href: string } | null }

export interface ContexteSources {
  identite: string | null;
  regles: string | null;
  accroches: { resume: string; lignes: Array<{ texte: string; poids: string; ton: '' | 'g' | 'w' | 'r' }>; marche: boolean } | null;
  connaissances: { inclus: Array<{ ref: string; titre: string; type: string; tronquee: boolean }>; horsPlace: number } | null;
}

export interface PropsSources {
  marque: { id: string; nom: string } | null;
  couches: CoucheJarvis[];
  /** La mémoire mesurée · `null` quand l'offre ne la donne pas (`adsmap`). */
  memoire: { taux: string; tauxDetail: string; ads: number; signaux: number; groupes: GroupeMemoire[]; brut: string; vide: string } | null;
  contexte: ContexteSources | null;
  testsMesures: number;
  /** Fondateur seul · `null` sinon. */
  fondateur: {
    serveur: { ok: boolean; resume: string; detail: string } | null;
    depense: { bloquee: boolean; resume: string; aReconcilier: string | null } | null;
    apprentissages: string; entraineLe: string | null; regles: string;
  } | null;
}

const TON: Record<CoucheJarvis['etat'], '' | 'g' | 'w' | 'c'> = { on: 'g', partial: 'w', off: '', always: 'c' };

export function SourcesJarvis(p: PropsSources) {
  if (!p.marque) {
    return (
      <Vue>
        <EnTete titre="Sources de Jarvis" sous="Ce que Jarvis sait de ta marque, et d’où il le tient" outils="credits" />
        <section className="tile">
          <div className="dempty">
            <span className="ico"><Ic n="folder" s={false} /></span>
            <h3>Sélectionne une marque active</h3>
            <p className="muted">Jarvis apprend marque par marque · sa mémoire n’a de sens que rapportée à une marque précise.</p>
            <Lien className="btn pri sm" href="/brands">Choisir une marque</Lien>
          </div>
        </section>
      </Vue>
    );
  }
  const f = p.fondateur;
  return (
    <Vue>
      <EnTete titre="Sources de Jarvis" sous={`Ce que Jarvis sait de ${p.marque.nom}, et d’où il le tient`} outils="credits" />
      <p className="muted" style={{ fontSize: '13px', margin: '0 0 6px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        Les essais, l’attribution et le marché se lisent à leur destination (Résultats, Veille).
        <Lien className="btn sm" href="/jarvis" style={{ marginLeft: 'auto' }}><Ic n="back" />Retour à la conversation</Lien>
      </p>

      {f?.serveur && (
        <section className="sec">
          <div className="tile" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`pill ${f.serveur.ok ? 'g' : 'w'}`} style={{ marginLeft: 0 }}>Ce serveur</span>
            <span style={{ fontSize: '13px', flex: '1 1 260px' }}>{f.serveur.resume}</span>
            <small className="faint">{f.serveur.detail}</small>
          </div>
        </section>
      )}

      <section className="sec" aria-label="Couches de Jarvis">
        <div className="sech"><h2>Ce qui tourne, en ce moment</h2><span className="faint" style={{ fontSize: '12.5px' }}>Chaque couche dit si elle est alimentée, et le geste qui l’allume</span></div>
        <div className="grid3">
          {p.couches.map((c) => (
            <div className="tile" key={c.cle} data-couche={c.cle} style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
              <div className="member"><strong>{c.titre}</strong><span className={`pill ${TON[c.etat]}`}>{c.libelleEtat}</span></div>
              <p className="muted" style={{ fontSize: '12.5px' }}>{c.quoi}</p>
              {c.detail && <small className="faint">{c.detail}</small>}
              {c.geste && <Lien className="btn sm" href={c.geste.href} style={{ justifySelf: 'start' }}>{c.geste.libelle}</Lien>}
            </div>
          ))}
        </div>
      </section>

      {p.memoire ? (
        <section className="sec" aria-label="Mémoire mesurée">
          <div className="sech"><h2>Ce qu’il a appris de cette marque</h2><span className="faint" style={{ fontSize: '12.5px' }}>Mesuré sur tes tests · historique, indicatif</span></div>
          {p.memoire.groupes.length === 0 ? (
            <div className="tile"><div className="dempty"><h3>Rien d’appris pour l’instant</h3><p className="muted">{p.memoire.vide}</p></div></div>
          ) : (
            <>
              <div className="grid3">
                <div className="tile kfig"><span className="lbl">Taux de réussite validé</span><span className="v">{p.memoire.taux}</span><span className="d" style={{ color: 'var(--fg3)' }}>{p.memoire.tauxDetail}</span></div>
                <div className="tile kfig"><span className="lbl">Ads suivies</span><span className="v">{p.memoire.ads}</span><span className="d" style={{ color: 'var(--fg3)' }}>dans la carte</span></div>
                <div className="tile kfig"><span className="lbl">Signaux exploitables</span><span className="v">{p.memoire.signaux}</span><span className="d" style={{ color: 'var(--fg3)' }}>au moins 3 tests</span></div>
              </div>
              <div className="grid2" style={{ marginTop: 14 }}>
                {p.memoire.groupes.map((g) => (
                  <div className="tile" key={g.dimension} style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                    <strong>{g.libelle}</strong>
                    {g.lignes.map((l) => (
                      <div key={l.cle} style={{ display: 'grid', gap: 4 }}>
                        <small className="faint" style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.cle}>{l.cle}</span>{l.tests}</small>
                        <div className={`bar${l.auDessus ? ' w' : ''}`}><i><b style={{ width: `${Math.round(l.taux * 100)}%` }} /></i><span>{l.part}</span></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {p.memoire.brut && (
                <details className="tile" style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '12.5px' }}>Voir la mémoire de performance utilisée pour la génération</summary>
                  <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>Part MESURÉE du contexte, injectée telle quelle · les autres éléments ne sont pas affichés ici.</p>
                  <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: '11.5px', marginTop: 8 }}>{p.memoire.brut}</pre>
                </details>
              )}
            </>
          )}
          <DecrireCreas />
        </section>
      ) : (
        <section className="sec">
          <div className="tile" style={{ display: 'grid', gap: 8 }}>
            <strong>La mémoire mesurée demande l’offre Plus</strong>
            <p className="muted" style={{ fontSize: '12.5px' }}>Les couches ci-dessus tournent déjà. Ce qui s’ajoute avec les Résultats, c’est ce que Jarvis apprend de tes propres tests · les chiffres, les accroches qui ont gagné, et la vérification qu’il améliore vraiment les résultats.</p>
            <Lien className="btn pri sm" href="/billing" style={{ justifySelf: 'start' }}>Voir les formules</Lien>
          </div>
        </section>
      )}

      {p.contexte && (
        <section className="sec" id="contexte" aria-label="Contexte de marque">
          <div className="sech"><h2>Ce qu’il reçoit à chaque réponse</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.testsMesures > 0 ? `Il répond avec ${p.testsMesures} test(s) mesuré(s) de ${p.marque.nom}` : `Aucun test mesuré sur ${p.marque.nom} · il le dira plutôt que de meubler`}</span></div>
          <div className="grid2">
            <div className="tile" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
              <div className="member"><strong>La marque</strong><span className="pill">portée · marque</span></div>
              <p className={p.contexte.identite ? '' : 'muted'} style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>{p.contexte.identite ?? 'Identité pas encore renseignée · description, promesse, audience.'}</p>
              <Lien className="btn sm" href={`/brands/${p.marque.id}`} style={{ justifySelf: 'start' }}>Modifier la marque</Lien>
            </div>
            <div className="tile" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
              <div className="member"><strong>Consignes créatives</strong><span className="pill">portée · marque</span></div>
              <p className={p.contexte.regles ? '' : 'muted'} style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>{p.contexte.regles ?? 'Aucune consigne maison · Jarvis suit alors ses règles générales.'}</p>
              <Lien className="btn sm" href={`/brands/${p.marque.id}/regles`} style={{ justifySelf: 'start' }}>Ouvrir les règles</Lien>
            </div>
            {p.contexte.accroches && (
              <div className="tile" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                <div className="member"><strong>Accroches</strong><span className="pill">portée · marque</span></div>
                <p className="muted" style={{ fontSize: '12.5px' }}>{p.contexte.accroches.resume}</p>
                {p.contexte.accroches.lignes.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span className={`pill ${h.ton}`} style={{ marginLeft: 0, fontSize: 10 }}>{h.poids}</span><span style={{ fontSize: '12.5px', flex: '1 1 200px' }}>« {h.texte} »</span>
                  </div>
                ))}
                {p.contexte.accroches.marche && <small className="faint">Les accroches de concurrents ne sont jamais recopiées · Jarvis en reprend la mécanique, pas les mots.</small>}
              </div>
            )}
            {p.contexte.connaissances && (
              <div className="tile" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                <div className="member"><strong>Connaissances de l’équipe</strong><span className="pill">portée · plateforme</span></div>
                {p.contexte.connaissances.inclus.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: '12.5px' }}>
                    {p.contexte.connaissances.inclus.map((k) => <li key={k.ref}>{k.titre} <small className="faint">· {k.type}{k.tronquee ? ' · tronquée' : ''}</small></li>)}
                  </ul>
                ) : <p className="muted" style={{ fontSize: '12.5px' }}>Aucune connaissance publiée par l’équipe pour cette marque.</p>}
                {p.contexte.connaissances.horsPlace > 0 && <small style={{ color: 'var(--warn)' }}>{p.contexte.connaissances.horsPlace} autre(s) n’ont pas tenu dans la place réservée.</small>}
                <small className="faint">Une connaissance retirée n’entre plus dans les réponses suivantes · les réponses déjà données ne sont pas réécrites.</small>
              </div>
            )}
          </div>
        </section>
      )}

      {f?.depense && (
        <section className="sec" aria-label="Ce que Jarvis coûte">
          <div className="tile" style={{ display: 'grid', gap: 6 }}>
            <div className="member"><strong>Ce que Jarvis coûte</strong><Lien className="btn sm" href="/admin/depenses" style={{ marginLeft: 'auto' }}>Détail</Lien></div>
            <p style={{ fontSize: '12.5px', color: f.depense.bloquee ? 'var(--bad)' : undefined }}>{f.depense.resume} Aucun appel ne part sans passer par ce plafond · y compris les tiens.</p>
            {f.depense.aReconcilier && (
              <p data-rappel-reconciliation style={{ fontSize: '12.5px', color: 'var(--warn)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>À réconcilier · {f.depense.aReconcilier}</span><Lien className="btn sm" href="/admin/depenses#a-reconcilier">Rapprocher</Lien>
              </p>
            )}
          </div>
        </section>
      )}

      {f && (
        <section className="sec" aria-label="Réglages maison">
          <div className="sech"><h2>Réglages maison</h2><span className="faint" style={{ fontSize: '12.5px' }}>Ta couche par-dessus les modèles · visible de toi seul</span></div>
          <EntrainementJarvis marque={p.marque.nom} initial={f.apprentissages} entraineLe={f.entraineLe} />
          <ReglesJarvis marque={p.marque.nom} initial={f.regles} />
          <div className="grid3" style={{ marginTop: 14 }}>
            {MOTEURS_JARVIS.map((m) => (
              <div className="tile" key={m.nom} style={{ display: 'grid', gap: 4 }}>
                <span className="pill c" style={{ marginLeft: 0, justifySelf: 'start' }}>{m.tag}</span><strong>{m.nom}</strong><small className="muted">{m.role}</small>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: '12px', marginTop: 10 }}>Les moteurs sont interchangeables (surchargeables par configuration) : Jarvis reste ta couche, quel que soit le fournisseur.</p>
        </section>
      )}
    </Vue>
  );
}
