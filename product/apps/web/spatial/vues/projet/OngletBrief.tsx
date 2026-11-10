'use client';

import { Fragment, useId, useState } from 'react';
import { PORTEES_AIDE_PROJET, messageHorsLigneStudio } from '@tiktrends/core';
import { exporterBrief } from '../../../app/actions/studios/sources';
import { Anneau, Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { BoutonAideRaccourcis } from '../../coquille/Raccourcis';
import { Message } from './briques';
import { boutonAction } from './action-serveur';
import { Propositions } from './Propositions';
import type { PropsBriefProjet } from './types';

/**
 * Onglet « Brief & références » · la rangée de la maquette (Brief,
 * Références, Fiche marque, `div.grid3`), puis tout ce que la fiche V5 portait
 * et que la maquette ne dessine pas, dans les mêmes tuiles Spatial : ce qui
 * manque, propositions, historique des versions, ateliers du projet (produit,
 * textes, identités et voix, image, vidéo, export), export du brief.
 * Rien n'est écrit à la visite.
 */
export function OngletBrief(p: PropsBriefProjet & { cibleJarvis?: { cible: string; libelle: string; jeton: number } | null }) {
  // Chaque tuile est une région nommée par son titre (`aria-labelledby`) · un lecteur d'écran la trouve dans la liste des régions.
  const id = useId();
  const t = (cle: string) => `${id}-${cle}`;
  return (
    <>
      <div className="grid3">
        <section className="tile" aria-labelledby={t('brief')}>
          <div className="lbl" id={t('brief')}>{p.titreBrief}</div>
          {p.etatBrief === 'ok' ? (
            <dl className="kv2">
              {p.champs.map((c) => (
                <Fragment key={c.libelle}>
                  <dt>{c.libelle}</dt>
                  <dd>{c.options ? c.valeurs.map((v) => <span key={v} className="opt2 on">{v}</span>) : c.valeurs.join(' · ')}</dd>
                </Fragment>
              ))}
            </dl>
          ) : (
            <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>
              {p.etatBrief === 'illisible' ? 'Le brief de cette version n’a pas la forme attendue · il n’est pas affiché.' : 'Pas encore de brief pour cette version · cadre-le avec Jarvis ou modifie-le à la main dans les propositions.'}
            </p>
          )}
        </section>

        <section className="tile" aria-labelledby={t('references')}>
          <div className="lbl" id={t('references')}>Références</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {p.references.map((r) => (
              <div className="prow" key={r.id} data-source={r.id} data-statut={r.provenance?.statut}>
                {r.apercu && <img src={r.apercu} alt="" />}
                <div className="t">
                  <strong style={{ fontSize: '12.5px' }}>{r.titre}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{r.detail}</small>
                  {r.provenance && (
                    <details style={{ fontSize: '11.5px' }} open={r.provenance.statut !== 'active'}>
                      <summary className="faint">{r.provenance.etat}</summary>
                      {r.provenance.lignes.map((l) => <small key={l} className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{l}</small>)}
                    </details>
                  )}
                </div>
                {r.href && <Lien className="btn sm" href={r.href} aria-label={`${r.libelleLien} · ${r.titre}`}>{r.libelleLien}</Lien>}
              </div>
            ))}
            {p.produit && (
              <div className="prow">
                {p.produit.photo && <img src={p.produit.photo} alt="" />}
                <div className="t"><strong style={{ fontSize: '12.5px' }}>{p.produit.nom}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Produit · {p.produit.instantane}</small></div>
                {p.produit.href && <Lien className="btn sm" href={p.produit.href}>Photos</Lien>}
              </div>
            )}
            {p.references.length === 0 && !p.produit && <p className="faint" style={{ fontSize: '12.5px' }}>Aucune référence liée à ce projet.</p>}
            {p.sourcesIllisibles && <p className="faint" style={{ fontSize: '11.5px' }} data-sources-illisibles="">{p.sourcesIllisibles}</p>}
            {p.veilleHref && <Lien className="btn sm" href={p.veilleHref}><Ic n="plus" />Ajouter depuis la Veille</Lien>}
          </div>
        </section>

        <section className="tile" aria-labelledby={t('fiche')}>
          <div className="lbl" id={t('fiche')}>Fiche marque</div>
          {p.fiche ? (
            <>
              <div className="bhead" style={{ marginTop: 10 }}>
                <Anneau part={p.fiche.score} taille={56} libelle={`${p.fiche.score} %`} classe="g" />
                <p className="muted" style={{ fontSize: '12.5px' }}>{p.fiche.texte}</p>
              </div>
              {p.fiche.href && <Lien className="btn sm" href={p.fiche.href} style={{ marginTop: 12 }}>Ouvrir la fiche</Lien>}
            </>
          ) : <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>La fiche de la marque n’a pas pu être lue pour ce projet.</p>}
        </section>
      </div>

      {p.produit && (p.produit.faits.length > 0 || p.produit.manques.length > 0) && (
        <section className="tile sec" aria-labelledby={t('produit')}>
          <div className="lbl" id={t('produit')}>Produit · {p.produit.nom}</div>
          <div className="tl">
            {p.produit.faits.map((f) => <div className="ev" key={f}><span className="ico"><Ic n="tag" /></span><span>{f}</span><span /></div>)}
            {p.produit.manques.map((m) => <div className="ev" key={m}><span className="ico"><Ic n="warn" /></span><span>{m}</span><span className="pill w">manquant</span></div>)}
          </div>
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>Instantané du {p.produit.instantane} · les faits ne bougent pas si la fiche produit change.</p>
        </section>
      )}

      <div className="grid2 sec">
        <section className="tile" aria-labelledby={t('manques')}>
          <div className="lbl" id={t('manques')}>Ce qui manque</div>
          {p.manques.length === 0 ? <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Rien · le brief est complet.</p> : (
            <div className="tl">
              {p.manques.map((m) => <div className="ev" key={m.cle} data-manque={m.cle}><span className="ico"><Ic n={m.bloquant ? 'warn' : 'bulb'} /></span><span>{m.libelle}</span><span className={`pill ${m.bloquant ? 'w' : ''}`}>{m.bloquant ? 'à faire' : 'conseillé'}</span></div>)}
            </div>
          )}
        </section>

        <section className="tile" aria-labelledby={t('ateliers')}>
          <div className="lbl" id={t('ateliers')}>Ateliers du projet</div>
          <div className="tl">
            {p.atelier.map((a) => (
              <div className="ev" key={a.segment} data-atelier={a.segment}>
                <span className="ico"><Ic n={ICONE_ATELIER[a.segment] ?? 'grid'} /></span>
                <span>{a.libelle}{a.mention ? <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{a.mention}</small> : null}</span>
                {a.href ? <Lien className="btn sm" href={a.href} aria-label={`Ouvrir l’atelier ${a.libelle}`}>Ouvrir</Lien> : <span className="pill">Non activé</span>}
              </div>
            ))}
            {/* Lot 13 bis (PC D16) · l'entrée « Raccourcis » des anciennes Options du projet · l'aide FILTRÉE sur l'éditeur, le canvas, les fenêtres et les mentions. */}
            <div className="ev" data-options-raccourcis="">
              <span className="ico"><Ic n="q" /></span>
              <span>Raccourcis clavier du projet<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Éditeur de créa, canvas, fenêtres et panneaux, mentions</small></span>
              <BoutonAideRaccourcis libelle="Raccourcis" portees={PORTEES_AIDE_PROJET} />
            </div>
          </div>
        </section>
      </div>

      {/* Focalisable par programme · « Relire et décider » (panneau Jarvis) y pose le focus en changeant d'onglet. */}
      <section className="tile sec" id="propositions" tabIndex={-1} aria-labelledby={t('propositions')}>
        <div className="lbl" id={t('propositions')}>Propositions</div>
        <Propositions projectId={p.projectId} initial={p.propositions.initial} versionCourante={p.propositions.versionCourante} cibleDemandee={p.cibleJarvis ?? null} />
      </section>

      <div className="grid2 sec">
        <section className="tile" aria-labelledby={t('versions')}>
          <div className="lbl" id={t('versions')}>Historique des versions</div>
          <div className="tl">
            {p.versions.map((v) => (
              <div className="ev" key={v.id} data-version-n={v.n}>
                <span className="ico"><Ic n={v.courante ? 'check' : 'loop'} /></span>
                <span>Version {v.n} · {v.date}{v.raison ? <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.raison}</small> : null}</span>
                {v.vue ? <span className="pill c">{v.courante ? 'Courante · ouverte' : 'Ouverte'}</span> : <Lien className="btn sm" href={v.href} aria-label={v.courante ? `Courante · ouvrir la version ${v.n}` : `Consulter la version ${v.n}`}>{v.courante ? 'Courante' : 'Consulter'}</Lien>}
              </div>
            ))}
          </div>
        </section>

        <section className="tile" aria-labelledby={t('ailleurs')}>
          <div className="lbl" id={t('ailleurs')}>Produire ailleurs</div>
          <ExporterBrief projectId={p.projectId} versionId={p.versionId} {...p.exportBrief} />
        </section>
      </div>
    </>
  );
}

const ICONE_ATELIER: Record<string, string> = { image: 'brush', produit: 'tag', textes: 'text', video: 'phone', identites: 'users', export: 'down' };

/** Le brief exporté (Markdown, JSON, copie) · lecture pure côté serveur, aucun crédit (même action que la V5). */
function ExporterBrief({ projectId, versionId, autorise, possible }: { projectId: string; versionId: string; autorise: boolean; possible: boolean }) {
  const { toast } = useSpatial();
  const [etat, setEtat] = useState<{ ton: 'ok' | 'err'; texte: string; horsLigne?: boolean } | null>(null);
  const [enCours, setEnCours] = useState<'markdown' | 'copie' | 'json' | null>(null);

  async function exporter(format: 'markdown' | 'json', copier = false) {
    setEnCours(copier ? 'copie' : format); setEtat(null);
    let r: Awaited<ReturnType<typeof exporterBrief>>;
    try { r = await exporterBrief({ projectId, versionId, format }); } catch {
      setEnCours(null); setEtat({ ton: 'err', texte: messageHorsLigneStudio('export'), horsLigne: true }); return;
    }
    setEnCours(null);
    if (!r.ok) { setEtat({ ton: 'err', texte: `${r.message} · identifiant support : ${r.traceId}` }); return; }
    if (copier) {
      try { await navigator.clipboard.writeText(r.contenu); toast('Brief copié · colle-le dans l’outil de ton choix.'); setEtat({ ton: 'ok', texte: 'Brief copié.' }); }
      catch { setEtat({ ton: 'err', texte: 'Copie refusée par le navigateur · utilise le téléchargement.' }); }
      return;
    }
    const url = URL.createObjectURL(new Blob([r.contenu], { type: `${r.typeMime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = r.nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setEtat({ ton: 'ok', texte: `Téléchargé · ${r.nomFichier}` });
  }

  if (!possible) return <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Pas de brief à exporter pour cette version.</p>;
  if (!autorise) return <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Ton rôle ne permet pas d’exporter · demande un rôle Membre.</p>;
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {/* Pendant la lecture, le bouton pressé garde le focus (`aria-disabled`, `aria-busy`) et ignore un second clic ; les deux autres sont fermés. */}
      <div className="kc">
        <button className="btn sm pri" type="button" data-export-brief="markdown"
          {...boutonAction({ presse: enCours === 'markdown', occupe: enCours !== null, surClic: () => void exporter('markdown') })}><Ic n="down" />{enCours === 'markdown' ? 'Export…' : 'Exporter le brief'}</button>
        <button className="btn sm" type="button" data-export-brief="copie"
          {...boutonAction({ presse: enCours === 'copie', occupe: enCours !== null, surClic: () => void exporter('markdown', true) })}><Ic n="copy" />{enCours === 'copie' ? 'Copie…' : 'Copier le brief'}</button>
        <button className="btn sm" type="button" data-export-brief="json"
          {...boutonAction({ presse: enCours === 'json', occupe: enCours !== null, surClic: () => void exporter('json') })}>{enCours === 'json' ? 'Export…' : 'Exporter en JSON'}</button>
      </div>
      <p className="faint" style={{ fontSize: '11.5px' }}>Gratuit · aucune génération. Le fichier suffit pour produire avec un autre outil.</p>
      {/* Sans réponse du serveur, rien n'a été refusé · la pastille dit « Hors ligne ». */}
      {etat && <Message ton={etat.ton} horsLigne={etat.horsLigne}>{etat.texte}</Message>}
    </div>
  );
}
