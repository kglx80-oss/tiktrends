'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  vueVariantes, libelleCoutRelecture,
  type DonneesVariantes, type CarteVariante, type BlocVersion, type ErreurStudio,
} from '@tiktrends/core';
import { creerVariante, iterer } from '../../../app/actions/studios/variantes';
import { rattacherVarianteAuTest, relireApprentissage } from '../../../app/actions/studios/tests';
import { FormulaireTest, valeursInitiales, type ValeursTest } from './FormulaireTest';
import {
  bloc, sousBloc, titre2, titre3, texte, petit, mono, grille, rangee, pastille, point, vignette,
  boutonPrimaire, boutonSecondaire, desactive,
} from './styles';

/**
 * Le panneau client de « Variantes et tests ». Il ne DÉCIDE rien : la vue vient
 * du noyau (`vueVariantes`), les gestes appellent les actions serveur, qui
 * revérifient tout. Après un geste réussi, la page est relue (`router.refresh`).
 *
 * États (cahier 01 §5) : vide, premier usage, données partielles, rempli,
 * génération active, chargement (bouton occupé), hors ligne, erreur récupérable
 * (identifiant support, saisies conservées), accès refusé (lecture seule),
 * quota insuffisant (plafond IA), résultat périmé (branche antérieure), conflit
 * de version (itérer sur une base périmée), succès, échec qualité (écartée).
 */

export interface EtatRecette {
  /** Ouvre le formulaire d'une variante · recette des états. */
  formulaireOuvert?: string | null;
  erreurFormulaire?: ErreurStudio | null;
  message?: { ton: 'ok' | 'err' | 'warn'; texte: string; traceId?: string } | null;
  horsLigne?: boolean;
}

const aujourdHui = () => new Date().toISOString().slice(0, 10);

function Pastille({ ton, children }: { ton: string; children: string }) {
  return <span style={pastille(ton)}><span aria-hidden="true" style={point(ton)} />{children}</span>;
}

const tonQualite = (q: string) => (q === 'Accepté' ? 'ok' : q === 'Écarté' ? 'err' : 'warn');

/** Aucune route ne sert encore les médias studio · cadre aux proportions exactes, identifié par son empreinte. */
function Vignette({ ratio, legende }: { ratio: string; legende: string }) {
  return <div style={vignette(ratio)} role="img" aria-label={`${legende} · aperçu à brancher`} />;
}

export function PanneauVariantes({ donnees, recette = {} }: { donnees: DonneesVariantes; recette?: EtatRecette }) {
  const router = useRouter();
  const vue = vueVariantes(donnees);
  const [ouvert, setOuvert] = useState<string | null>(recette.formulaireOuvert ?? null);
  const [message, setMessage] = useState<EtatRecette['message']>(recette.message ?? null);
  const [horsLigne, setHorsLigne] = useState<boolean>(recette.horsLigne ?? false);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [, demarrer] = useTransition();

  useEffect(() => {
    if (recette.horsLigne !== undefined) return;
    const maj = () => setHorsLigne(typeof navigator !== 'undefined' && navigator.onLine === false);
    maj();
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, [recette.horsLigne]);

  const signaler = (r: { ok: true } | ErreurStudio, succes: string) => {
    if (r.ok) { setMessage({ ton: 'ok', texte: succes }); router.refresh(); return; }
    setMessage({ ton: r.code === 'BUDGET_EXCEEDED' || r.code === 'VERSION_CONFLICT' ? 'warn' : 'err', texte: r.message, traceId: r.traceId });
  };
  const geste = (cle: string, f: () => Promise<void>) => {
    if (horsLigne || occupe) return;
    setOccupe(cle);
    setMessage(null);
    demarrer(async () => { try { await f(); } finally { setOccupe(null); } });
  };

  const parVariante = new Map(donnees.variantes.map((v) => [v.id, v]));
  const choisir = (assetId: string) => geste(`choisir:${assetId}`, async () => {
    const r = await creerVariante({ assetId });
    signaler(r, r.ok ? `${r.variante.libelle} est maintenant une variante${r.deja ? ' (déjà choisie)' : ''}.` : '');
  });
  const envoyerTest = (variantId: string) => async (v: ValeursTest) => {
    const r = await rattacherVarianteAuTest({ variantId, saisie: v });
    if (r.ok) {
      setOuvert(null);
      signaler(r, r.deja ? 'Cette variante était déjà rattachée · fiche Adsmap inchangée.' : 'Variante rattachée · la fiche Adsmap est en brouillon.');
      return { ok: true as const };
    }
    return r;
  };
  const relire = (c: CarteVariante) => geste(`relire:${c.id}`, async () => {
    const lien = parVariante.get(c.id)?.test?.linkId;
    if (!lien || donnees.relecture.coutMaxUsd === null) return;
    const r = await relireApprentissage({ linkId: lien, coutAnnonceUsd: donnees.relecture.coutMaxUsd });
    if (r.ok && r.indisponible) { setMessage({ ton: 'warn', texte: r.indisponible.message }); return; }
    signaler(r, 'Relecture enregistrée · la conclusion reste celle que les données permettent.');
  });
  const itererDepuis = (c: CarteVariante) => geste(`iterer:${c.id}`, async () => {
    const r = await iterer({ variantId: c.id, baseVersionId: donnees.projet.versionCouranteId });
    if (!r.ok && r.code === 'VERSION_CONFLICT') {
      setMessage({ ton: 'warn', texte: 'Le projet a changé depuis l’ouverture de cette page · recharge-la, puis itère à nouveau. Rien n’a été écrasé.', traceId: r.traceId });
      return;
    }
    signaler(r, r.ok ? `Nouveau brief (version ${r.version.n}) créé depuis ${c.libelle} · ${r.variableGardee ? 'même variable' : 'variable suivante'}, sources et hypothèse gardées. Aucune génération lancée.` : '');
  });

  return (
    <section aria-labelledby="titre-variantes" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <h2 id="titre-variantes" style={{ ...titre2, margin: 0 }}>Variantes et tests</h2>
        <p style={{ ...petit, overflowWrap: 'anywhere' }}>Projet · {vue.titreProjet}</p>
        {vue.etat !== 'vide' && <p style={texte}>{vue.message}</p>}
        <div style={rangee}>
          {vue.enCours > 0 && <Pastille ton="info">{`${vue.enCours} lot${vue.enCours > 1 ? 's' : ''} en cours`}</Pastille>}
          {!donnees.droits.proposer && <Pastille ton="neutre">Lecture seule</Pastille>}
          {horsLigne && <Pastille ton="warn">Hors ligne</Pastille>}
        </div>
        {!donnees.droits.proposer && <p style={petit}>Ton rôle permet de consulter les variantes et leurs tests, pas de les modifier.</p>}
        {horsLigne && <p role="status" style={petit}>Hors ligne · les gestes sont suspendus, rien n’est envoyé. Tes saisies restent en place.</p>}
      </header>

      {message && (
        <div role={message.ton === 'ok' ? 'status' : 'alert'} style={{ ...sousBloc, borderColor: message.ton === 'ok' ? 'var(--ok)' : message.ton === 'warn' ? 'var(--warn)' : 'var(--err)' }}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{message.texte}</p>
          {message.traceId && <p style={petit}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{message.traceId}</code></p>}
        </div>
      )}

      {vue.etat === 'vide' && (
        <div style={{ ...bloc, borderStyle: 'dashed' }}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Aucune sortie pour l’instant.</p>
          <p style={{ ...texte, marginTop: 6 }}>Lance un lot depuis le studio · chaque image produite apparaîtra ici avec sa version, et tu pourras choisir précisément celle à tester.</p>
        </div>
      )}

      {vue.variantes.length > 0 && (
        <section aria-labelledby="titre-liste-variantes" style={{ display: 'grid', gap: 12 }}>
          <h3 id="titre-liste-variantes" style={{ ...titre3, fontSize: 16 }}>Variantes choisies ({vue.variantes.length})</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {vue.variantes.map((c) => {
              const lue = parVariante.get(c.id)!;
              return (
                <article key={c.id} aria-labelledby={`var-${c.id}`} data-variante={c.id} style={{ ...bloc, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flex: '0 0 clamp(72px, 18vw, 200px)', minWidth: 0 }}>
                    <Vignette ratio={c.ratio} legende={`${c.libelle} · ${c.dimensions}`} />
                  </div>
                  <div style={{ display: 'grid', gap: 10, flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <h4 id={`var-${c.id}`} style={titre3}>{c.libelle}</h4>
                      <p style={{ ...mono, color: 'var(--muted)' }}>{c.empreinte} · {c.dimensions} · aperçu à brancher</p>
                      <div style={rangee}>
                        <Pastille ton={c.rangement === 'courante' ? 'accent' : 'neutre'}>{`${c.versionTitre}${c.rangement === 'courante' ? ' · courante' : ' · antérieure'}`}</Pastille>
                        <Pastille ton="ok">{`Technique · ${c.statutTechnique}`}</Pastille>
                        <Pastille ton={tonQualite(c.statutQualite)}>{`Qualité · ${c.statutQualite}`}</Pastille>
                      </div>
                      {c.noteRangement && <p style={petit}>{c.noteRangement}</p>}
                      {c.aRelire && <p style={petit}>Ce média n’a pas encore été accepté à la relecture · son statut qualité reste affiché à part.</p>}
                    </div>
                    <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
                      <div><dt style={{ ...petit, fontWeight: 700 }}>Hypothèse</dt><dd style={{ ...texte, margin: 0 }}>{c.hypothese}</dd></div>
                      <div><dt style={{ ...petit, fontWeight: 700 }}>Variable</dt><dd style={{ ...texte, margin: 0 }}>{c.variable}</dd></div>
                      <div><dt style={{ ...petit, fontWeight: 700 }}>Parente</dt><dd style={{ ...texte, margin: 0 }}>{c.parentLibelle ?? 'Aucune'}</dd></div>
                      <div><dt style={{ ...petit, fontWeight: 700 }}>Comparaison</dt><dd style={{ ...texte, margin: 0 }}>{c.comparaison}</dd></div>
                    </dl>

                    {c.test ? (
                      <div style={{ ...sousBloc, display: 'grid', gap: 8 }}>
                        <div style={{ ...rangee, justifyContent: 'space-between' }}>
                          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Test · {c.test.resume}</p>
                          <a href={c.test.adsmapHref} style={boutonSecondaire}>Ouvrir la fiche Adsmap</a>
                        </div>
                        <dl style={{ margin: 0, display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
                          {c.test.details.map((d) => <div key={d.libelle}><dt style={{ ...petit, fontWeight: 700 }}>{d.libelle}</dt><dd style={{ ...texte, margin: 0, overflowWrap: 'anywhere' }}>{d.valeur}</dd></div>)}
                        </dl>
                        {c.test.isolation && <p style={{ ...texte, color: 'var(--ink)' }}>{c.test.isolation}</p>}
                        <p style={petit}>Résultat Adsmap · {c.test.verdict}</p>
                      </div>
                    ) : (
                      <p style={petit}>Pas encore rattachée à un test.</p>
                    )}

                    {c.lecture && (
                      <div style={{ ...sousBloc, display: 'grid', gap: 6 }} data-lecture={c.lecture.inconclusif ? 'inconclusif' : 'conclusif'}>
                        <div style={rangee}><Pastille ton={c.lecture.inconclusif ? 'warn' : 'info'}>{c.lecture.conclusion}</Pastille><span style={petit}>Lecture des règles de mesure · sans coût</span></div>
                        <p style={{ ...texte, color: 'var(--ink)' }}>{c.lecture.phrase}</p>
                        <p style={petit}>{c.lecture.prudence}</p>
                        <p style={petit}>Prochaine variable proposée · {c.lecture.variableSuivante}</p>
                      </div>
                    )}
                    {c.relecture && (
                      <div style={{ ...sousBloc, display: 'grid', gap: 6 }}>
                        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Relecture IA du {c.relecture.le.slice(0, 10)} · {c.relecture.conclusion === 'inconclusif' ? 'Inconclusif' : c.relecture.conclusion === 'soutenue' ? 'Hypothèse soutenue' : 'Hypothèse non soutenue'}</p>
                        <p style={texte}>{c.relecture.apprentissage}</p>
                        {c.relecture.ecart && <p style={petit}>{c.relecture.ecart}</p>}
                      </div>
                    )}

                    {donnees.droits.proposer && (
                      <div style={rangee}>
                        {c.gestes.rattacher && ouvert !== c.id && (
                          <button type="button" onClick={() => setOuvert(c.id)} disabled={horsLigne} style={{ ...boutonPrimaire, ...(horsLigne ? desactive : {}) }}>Rattacher au test</button>
                        )}
                        {c.gestes.relire && donnees.relecture.disponible && donnees.relecture.coutMaxUsd !== null && (
                          <button type="button" onClick={() => relire(c)} disabled={horsLigne || occupe !== null} aria-busy={occupe === `relire:${c.id}`} style={{ ...boutonSecondaire, ...(horsLigne || occupe ? desactive : {}) }}>
                            {occupe === `relire:${c.id}` ? 'Relecture…' : `Relire avec l’IA · ${libelleCoutRelecture(donnees.relecture.coutMaxUsd)}`}
                          </button>
                        )}
                        {c.gestes.iterer && (
                          <button type="button" onClick={() => itererDepuis(c)} disabled={horsLigne || occupe !== null} aria-busy={occupe === `iterer:${c.id}`} style={{ ...boutonSecondaire, ...(horsLigne || occupe ? desactive : {}) }}>
                            {occupe === `iterer:${c.id}` ? 'Création du brief…' : 'Itérer · nouveau brief, sans génération'}
                          </button>
                        )}
                      </div>
                    )}
                    {donnees.droits.proposer && c.gestes.relire && !donnees.relecture.disponible && donnees.relecture.raison && (
                      <p style={petit}>Relecture IA indisponible · {donnees.relecture.raison}</p>
                    )}
                    {donnees.droits.proposer && !donnees.adsmap.acces && !c.test && (
                      <p style={petit}>Le rattachement à un test passe par Adsmap, disponible à partir de l’offre Plus.</p>
                    )}
                  </div>
                  {ouvert === c.id && (
                    <div style={{ flex: '1 1 100%', minWidth: 0 }}>
                    <FormulaireTest
                      idVariante={c.id}
                      initial={valeursInitiales({ hypothese: lue.hypothese, variable: lue.variable, protocole: donnees.adsmap.protocoleMarque, aujourdHui: aujourdHui() })}
                      options={{ protocoleDefaut: donnees.adsmap.protocoleMarque, offres: donnees.adsmap.offres, pages: donnees.adsmap.pages, aUnParent: lue.parentVariantId !== null }}
                      envoyer={envoyerTest(c.id)}
                      annuler={() => setOuvert(null)}
                      horsLigne={horsLigne}
                      erreurInitiale={recette.formulaireOuvert === c.id ? recette.erreurFormulaire ?? null : null}
                    />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {vue.versions.length > 0 && (
        <section aria-labelledby="titre-versions" style={{ display: 'grid', gap: 12 }}>
          <h3 id="titre-versions" style={{ ...titre3, fontSize: 16 }}>Sorties par version</h3>
          {vue.versions.map((b) => <BlocDeVersion key={b.id} b={b} choisir={choisir} occupe={occupe} horsLigne={horsLigne} />)}
        </section>
      )}
    </section>
  );
}

function BlocDeVersion({ b, choisir, occupe, horsLigne }: { b: BlocVersion; choisir: (assetId: string) => void; occupe: string | null; horsLigne: boolean }) {
  return (
    <section aria-labelledby={`ver-${b.id}`} style={{ ...bloc, display: 'grid', gap: 10 }} data-version={b.courante ? 'courante' : 'anterieure'}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h4 id={`ver-${b.id}`} style={titre3}>{b.titre}</h4>
        {b.note && <p style={petit}>{b.note}</p>}
      </div>
      {b.lots.map((l) => (
        <div key={l.jobId} style={{ ...sousBloc, display: 'grid', gap: 10 }}>
          <div style={rangee}>
            <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{l.titre}</p>
            <Pastille ton={l.actif ? 'info' : l.etatTechnique === 'Fichier enregistré' ? 'ok' : 'err'}>{`Technique · ${l.etatTechnique}`}</Pastille>
            {l.qualite && <Pastille ton={tonQualite(l.qualite)}>{`Qualité · ${l.qualite}`}</Pastille>}
          </div>
          {l.message && <p style={petit}>{l.message}</p>}
          {l.sorties.length > 0 && (
            <ul style={{ ...grille(130), listStyle: 'none', margin: 0, padding: 0 }}>
              {l.sorties.map((s) => (
                <li key={s.assetId} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <Vignette ratio={s.ratio} legende={`${s.libelle} · ${s.dimensions}`} />
                  <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{s.libelle}</p>
                  <p style={{ ...mono, color: 'var(--muted)' }}>{s.empreinte}</p>
                  {s.choisir ? (
                    <button type="button" onClick={() => choisir(s.assetId)} disabled={horsLigne || occupe !== null} aria-busy={occupe === `choisir:${s.assetId}`} style={{ ...boutonSecondaire, ...(horsLigne || occupe ? desactive : {}) }}>
                      {occupe === `choisir:${s.assetId}` ? 'Enregistrement…' : 'Choisir comme variante'}
                    </button>
                  ) : (
                    <p style={petit}>{s.raison}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
