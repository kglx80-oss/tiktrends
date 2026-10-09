'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import {
  libelleCoutTexteEstime, NOTE_BORNE_TEXTE, raisonAjoutTexte, TYPES_TEXTE, LIBELLES_TYPE_TEXTE, LIBELLES_TYPE_TEXTE_PLURIEL, VARIANTES_MAX, VARIANTES_DEFAUT,
  type TexteStudio, type TypeTexte, type VarianteTexte, type ErreurStudio,
} from '@tiktrends/core';
import type { VueTextes } from '../../../lib/studios/textes/textes';
import { ecrireTextes, enregistrerTextes, exporterTextes, injecterTexte } from '../../../app/actions/studios/textes';
import { panneau, carte, titre, sousTitre, etiquette, texte, mini, boutonPrimaire, boutonSecondaire, desactive, champ, signal, pastille, rangee, CIBLE } from '../propositions/styles';
import { Comparaison } from './Comparaison';

/**
 * Textes IA d'un projet (cahier §4.7) · hooks, corps, CTA, scripts liés au
 * MÊME brief que les studios.
 *
 *  · Écrire avec l'IA : coût maximal annoncé AVANT le clic (jamais gratuit),
 *    bouton désactivé avec sa raison quand l'IA n'est pas disponible ; les
 *    variantes reviennent ici, rien n'entre dans le projet sans « Retenir ».
 *  · Écrire à la main : toujours ouvert, mêmes règles (allégation = fait du brief).
 *  · Retenus : édition, retrait, copie, comparaison, export (Markdown, CSV,
 *    JSON) sans média, injection dans UN calque texte choisi (proposition).
 *
 * Chaque enregistrement crée une version (409 si le projet a bougé : rien
 * n'est écrasé). Le texte venu du modèle est rendu comme TEXTE (jamais du HTML).
 */

type Edition = Pick<TexteStudio, 'type' | 'langue' | 'texte' | 'sources'>;
const libelleType = (t: TexteStudio['type']) => (t === 'libre' ? 'Texte libre' : LIBELLES_TYPE_TEXTE[t]);

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page · rien n’a été écrasé. Recharge pour repartir de la version courante (tes variantes non retenues seront à redemander).';
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

/**
 * L8-A · brouillon gardé à travers un rechargement après conflit de version.
 * Mesuré : « Recharger la version courante » rechargeait la page et le texte
 * en cours d'écriture était perdu. Il est rangé dans l'onglet (sessionStorage,
 * jamais partagé) juste avant le rechargement, puis rendu une seule fois.
 */
export const cleBrouillonTextes = (projectId: string) => `tt-studio-textes-brouillon-${projectId}`;
interface Brouillon { manuel: Edition; edition: { id: string; valeur: string } | null }
function lireBrouillon(projectId: string): Brouillon | null {
  try {
    const brut = window.sessionStorage.getItem(cleBrouillonTextes(projectId));
    if (!brut) return null;
    window.sessionStorage.removeItem(cleBrouillonTextes(projectId));
    const b = JSON.parse(brut) as Brouillon;
    return b && typeof b.manuel?.texte === 'string' ? b : null;
  } catch { return null; }
}
function ecrireBrouillon(projectId: string, b: Brouillon): void {
  try { window.sessionStorage.setItem(cleBrouillonTextes(projectId), JSON.stringify(b)); } catch { /* stockage refusé · rien à garder */ }
}

async function copier(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

export function EcranTextes({ vue }: { vue: VueTextes }) {
  const id = useId();
  const [version, setVersion] = useState(vue.version);
  const [retenus, setRetenus] = useState<TexteStudio[]>(vue.textes);
  const [proposees, setProposees] = useState<VarianteTexte[]>([]);
  const [ecartees, setEcartees] = useState<Array<{ id: string; raison: string }>>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [type, setType] = useState<TypeTexte>('hook');
  const limite = vue.limites.find((l) => l.type === type)!;
  const [nombre, setNombre] = useState(VARIANTES_DEFAUT);
  const [max, setMax] = useState<Record<string, number>>({});
  const maxType = max[type] ?? limite.max;
  const [manuel, setManuel] = useState<Edition>({ type: 'hook', langue: 'fr', texte: '', sources: [] });
  const [edition, setEdition] = useState<{ id: string; valeur: string } | null>(null);
  const [calque, setCalque] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; conflit?: boolean; lien?: boolean } | null>(null);
  const d = vue.disponibilite;

  useEffect(() => {
    const b = lireBrouillon(vue.projet.id);
    if (!b || (!b.manuel.texte.trim() && !b.edition)) return;
    setManuel(b.manuel);
    if (b.edition && vue.textes.some((t) => t.id === b.edition!.id)) setEdition(b.edition);
    setRetour({ ok: true, texte: 'Version courante rechargée · ton brouillon est remis en place, rien n’est encore enregistré.' });
    // Lecture au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const recharger = () => { ecrireBrouillon(vue.projet.id, { manuel, edition }); window.location.reload(); };
  const faits = vue.brief?.faits ?? [];
  const libelleFait = (fid: string) => faits.find((f) => f.id === fid)?.claim ?? 'fait absent de cette version';

  async function sauver(liste: Edition[], ok: string): Promise<boolean> {
    setEnCours('sauver');
    setRetour(null);
    try {
      const r = await enregistrerTextes({ projectId: vue.projet.id, baseVersionId: version.id, textes: liste });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT' }); return false; }
      setVersion({ id: r.version.id, n: r.version.n });
      setRetenus(r.textes);
      setRetour({ ok: true, texte: r.inchange ? 'Aucun changement à enregistrer.' : `${ok} · version ${r.version.n}.` });
      return true;
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été enregistré.' });
      return false;
    } finally { setEnCours(null); }
  }

  async function ecrire() {
    setEnCours('ecrire');
    setRetour(null);
    setQuestions([]);
    try {
      const r = await ecrireTextes({ projectId: vue.projet.id, baseVersionId: version.id, type, nombre, maxCaracteres: maxType, langue: 'fr' });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT' }); return; }
      if (r.statut === 'questions') { setQuestions(r.questions); return; }
      setProposees(r.variantes);
      setEcartees(r.ecartees);
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été facturé deux fois, réessaie plus tard.' });
    } finally { setEnCours(null); }
  }

  async function exporter(format: 'markdown' | 'csv' | 'json') {
    setEnCours(`export-${format}`);
    setRetour(null);
    try {
      const r = await exporterTextes({ projectId: vue.projet.id, versionId: version.id, format });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r) }); return; }
      const url = URL.createObjectURL(new Blob([r.contenu], { type: `${r.typeMime};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url; a.download = r.nomFichier; a.click();
      URL.revokeObjectURL(url);
      setRetour({ ok: true, texte: `Export ${r.nomFichier} · aucun média lancé, rien de facturé.` });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · aucun fichier exporté. Vérifie ta connexion puis réessaie.' });
    } finally { setEnCours(null); }
  }

  async function injecter(t: TexteStudio) {
    const layerId = calque[t.id] ?? vue.calques[0]?.id;
    if (!layerId) return;
    setEnCours(`injecter-${t.id}`);
    setRetour(null);
    try {
      const r = await injecterTexte({ projectId: vue.projet.id, baseVersionId: version.id, layerId, texte: t.texte });
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT' }); return; }
      const nom = vue.calques.find((c) => c.id === layerId)?.nom ?? layerId;
      setRetour({ ok: true, texte: `Proposition créée pour le calque « ${nom} » · rien n’est appliqué tant que tu ne l’appliques pas depuis la page du projet.`, lien: true });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · aucune proposition créée. Vérifie ta connexion puis réessaie.' });
    } finally { setEnCours(null); }
  }

  const tous = [
    ...retenus.map((t) => ({ cle: `r-${t.id}`, libelle: `Retenu · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`, texte: t.texte })),
    ...proposees.map((t, i) => ({ cle: `p-${t.id}`, libelle: `Proposé ${i + 1} · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`, texte: t.texte })),
  ];
  const ecritureBloquee = !d.disponible || !vue.peutEcrire || enCours !== null || !vue.brief;
  const raisonAjout = raisonAjoutTexte({ peutEcrire: vue.peutEcrire, briefPresent: !!vue.brief, enCours: enCours !== null, texte: manuel.texte });
  const ajoutBloque = raisonAjout !== null;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {retour && (
        <div role={retour.ok ? 'status' : 'alert'} style={signal(retour.ok ? 'ok' : retour.conflit ? 'warn' : 'err')}>
          <span style={{ fontWeight: 600 }}>{retour.ok ? 'Fait · ' : retour.conflit ? 'Conflit de version · ' : 'Refusé · '}</span>{retour.texte}
          {retour.lien && <> <Link href={`/studio/projets/${vue.projet.id}`} style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Ouvrir le projet</Link></>}
          {retour.conflit && <div style={{ marginTop: 8 }}><button type="button" style={boutonSecondaire} onClick={recharger}>Recharger la version courante</button></div>}
        </div>
      )}

      <section aria-labelledby={`${id}-brief`} style={panneau} data-zone="brief">
        <h2 id={`${id}-brief`} style={titre}>Le brief partagé</h2>
        {vue.brief ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={texte}><strong style={{ color: 'var(--ink)' }}>Objectif · </strong>{vue.brief.objectif || 'à préciser'}</p>
            <p style={texte}><strong style={{ color: 'var(--ink)' }}>Hypothèse · </strong>{vue.brief.hypothese ?? 'aucune'}</p>
            <p style={texte}><strong style={{ color: 'var(--ink)' }}>Variable testée · </strong>{vue.brief.variable || 'à préciser'}</p>
            <details>
              <summary style={{ ...mini, cursor: 'pointer', minHeight: CIBLE, display: 'flex', alignItems: 'center' }}>{faits.length} fait{faits.length > 1 ? 's' : ''} citables par les allégations</summary>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>{faits.map((f) => <li key={f.id} style={mini}><code>{f.id}</code> · {f.claim}</li>)}</ul>
            </details>
          </div>
        ) : <p style={texte} data-etat="sans-brief">{vue.briefIllisible ? 'Le brief de cette version est illisible.' : 'Ce projet n’a pas encore de brief · les textes s’écrivent à partir du brief.'}</p>}
      </section>

      <section aria-labelledby={`${id}-ia`} style={panneau} data-zone="ecrire-ia">
        <h2 id={`${id}-ia`} style={titre}>Écrire avec l’IA</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor={`${id}-type`} style={etiquette}>Type</label>
            <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as TypeTexte)} style={champ}>{TYPES_TEXTE.map((t) => <option key={t} value={t}>{LIBELLES_TYPE_TEXTE[t]}</option>)}</select>
          </div>
          <div>
            <label htmlFor={`${id}-nombre`} style={etiquette}>Variantes</label>
            <input id={`${id}-nombre`} type="number" min={1} max={VARIANTES_MAX} value={nombre} onChange={(e) => setNombre(Math.min(VARIANTES_MAX, Math.max(1, Number(e.target.value) || 1)))} style={champ} />
          </div>
          <div>
            <label htmlFor={`${id}-max`} style={etiquette}>Caractères au plus</label>
            <input id={`${id}-max`} type="number" min={1} max={limite.max} value={maxType} onChange={(e) => setMax((m) => ({ ...m, [type]: Math.min(limite.max, Math.max(1, Number(e.target.value) || 1)) }))} style={champ} aria-describedby={`${id}-max-aide`} />
          </div>
        </div>
        <p id={`${id}-max-aide`} style={mini}>{limite.mesuree ? `${limite.max} : palier mesuré où la police de l’accroche atteint son plancher.` : `${limite.max} : borne du contrat, aucune limite mesurée pour ce type · resserre-la si besoin.`}</p>
        <p style={mini} data-cout="texte">Appel texte payant · {libelleCoutTexteEstime(d.coutMaxUsd)} · {NOTE_BORNE_TEXTE}, imputé au plafond de dépense. Aucun média, aucun crédit, rien d’enregistré sans « Retenir ».</p>
        {!d.disponible && <p role="note" style={{ ...texte, color: 'var(--ink)' }}><span style={{ color: 'var(--warn)', fontWeight: 600 }}>Indisponible · </span>{d.raison}</p>}
        <div style={rangee}>
          <button type="button" disabled={ecritureBloquee} aria-busy={enCours === 'ecrire'} style={{ ...boutonPrimaire, ...(ecritureBloquee ? desactive : {}) }} onClick={ecrire}>
            {enCours === 'ecrire' ? 'Écriture…' : `Écrire ${nombre} ${nombre > 1 ? LIBELLES_TYPE_TEXTE_PLURIEL[type] : LIBELLES_TYPE_TEXTE[type].toLowerCase()}`}
          </button>
          {!d.disponible && <a href={`#${id}-manuel`} style={{ ...boutonSecondaire, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Écrire à la main</a>}
        </div>
        {questions.length > 0 && <div role="status" style={signal('info')}>Il manque une précision : {questions.join(' · ')}</div>}
        {proposees.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} aria-label="Variantes proposées">
            {proposees.map((v, i) => (
              <li key={v.id} style={carte} data-variante={i + 1}>
                <div style={rangee}><span style={pastille('var(--accent-strong)')}>{LIBELLES_TYPE_TEXTE[v.type]} {i + 1}</span><span style={mini}>{v.longueur} / {maxType} caractères</span></div>
                <p style={{ ...texte, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{v.texte}</p>
                {v.sources.length > 0 && <p style={mini}>Allégations fondées sur : {v.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</p>}
                {v.horsVariable && <p style={{ ...mini, color: 'var(--warn)' }}>Change « {v.variable} » et non la variable du test · le test ne l’isolerait pas.</p>}
                <div style={rangee}>
                  <button type="button" style={boutonSecondaire} disabled={enCours !== null || !vue.peutEcrire} onClick={async () => { if (await sauver([...retenus, v], 'Texte retenu')) setProposees((p) => p.filter((x) => x.id !== v.id)); }}>Retenir</button>
                  <button type="button" style={boutonSecondaire} onClick={async () => setRetour({ ok: await copier(v.texte), texte: 'Texte copié.' })}>Copier</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {ecartees.length > 0 && (
          <div style={signal('warn')}>
            <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Écartées par le contrôle du serveur :</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{ecartees.map((x) => <li key={x.id} style={mini}>{x.id} · {x.raison}</li>)}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-manuel-titre`} id={`${id}-manuel`} style={panneau} data-zone="ecrire-main">
        <h2 id={`${id}-manuel-titre`} style={titre}>Écrire à la main</h2>
        <p style={sousTitre}>Aucun appel, aucun coût · les mêmes règles : une allégation cite un fait du brief.</p>
        {vue.peutEcrire ? (
          <>
            <div>
              <label htmlFor={`${id}-mtype`} style={etiquette}>Type</label>
              <select id={`${id}-mtype`} value={manuel.type} onChange={(e) => setManuel((m) => ({ ...m, type: e.target.value as TypeTexte }))} style={champ}>{TYPES_TEXTE.map((t) => <option key={t} value={t}>{LIBELLES_TYPE_TEXTE[t]}</option>)}</select>
            </div>
            <div>
              <label htmlFor={`${id}-mtexte`} style={etiquette}>Texte</label>
              <textarea id={`${id}-mtexte`} rows={3} value={manuel.texte} maxLength={12_000} onChange={(e) => setManuel((m) => ({ ...m, texte: e.target.value }))} style={{ ...champ, resize: 'vertical' }} />
            </div>
            {faits.length > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={etiquette}>Faits qui fondent les allégations (facultatif)</legend>
                <p style={{ ...mini, marginBottom: 6 }}>Faits déclarés du produit et mesures · une observation d’une annonce concurrente ne fonde aucune allégation de la marque.</p>
                <div style={{ display: 'grid', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                  {faits.filter((f) => f.kind === 'declared' || f.kind === 'measured').map((f) => (
                    <label key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: CIBLE, fontSize: 14, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
                      <input type="checkbox" style={{ width: 20, height: 20, flex: '0 0 auto' }} checked={manuel.sources.includes(f.id)} onChange={(e) => setManuel((m) => ({ ...m, sources: e.target.checked ? [...m.sources, f.id] : m.sources.filter((x) => x !== f.id) }))} />
                      {f.claim}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div style={rangee}>
              <button type="button" disabled={ajoutBloque} aria-describedby={raisonAjout ? `${id}-ajout-raison` : undefined} style={{ ...boutonPrimaire, ...(ajoutBloque ? desactive : {}) }}
                onClick={async () => { if (await sauver([...retenus, manuel], 'Texte ajouté')) setManuel({ type: manuel.type, langue: 'fr', texte: '', sources: [] }); }}>Ajouter aux textes retenus</button>
              {raisonAjout && <span id={`${id}-ajout-raison`} style={mini} data-raison="ajout">{raisonAjout}</span>}
            </div>
          </>
        ) : <p style={mini}>Ton rôle permet de lire et d’exporter, pas d’écrire.</p>}
      </section>

      <section aria-labelledby={`${id}-retenus`} style={panneau} data-zone="retenus">
        <h2 id={`${id}-retenus`} style={titre}>Textes retenus ({retenus.length})</h2>
        <p style={sousTitre}>Rangés dans le brief du projet · les studios les lisent au même endroit.</p>
        {retenus.length === 0 ? <p style={texte} data-etat="sans-texte">Aucun texte retenu.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {retenus.map((t) => (
              <li key={t.id} style={carte} data-texte={t.type}>
                <div style={rangee}><span style={pastille('var(--ok)')}>{libelleType(t.type)}</span>{t.langue && <span style={mini}>{t.langue}</span>}</div>
                {edition?.id === t.id ? (
                  <>
                    <label htmlFor={`${id}-ed-${t.id}`} style={etiquette}>Modifier le texte</label>
                    <textarea id={`${id}-ed-${t.id}`} rows={3} value={edition.valeur} onChange={(e) => setEdition({ id: t.id, valeur: e.target.value })} style={{ ...champ, resize: 'vertical' }} />
                    <div style={rangee}>
                      <button type="button" style={boutonPrimaire} disabled={enCours !== null || !edition.valeur.trim()} onClick={async () => { if (await sauver(retenus.map((x) => (x.id === t.id ? { ...x, texte: edition.valeur } : x)), 'Texte modifié')) setEdition(null); }}>Enregistrer</button>
                      <button type="button" style={boutonSecondaire} onClick={() => setEdition(null)}>Annuler</button>
                    </div>
                  </>
                ) : <p style={{ ...texte, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{t.texte}</p>}
                {t.sources.length > 0 && <p style={mini}>Sources : {t.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</p>}
                <div style={rangee}>
                  <button type="button" style={boutonSecondaire} onClick={async () => setRetour({ ok: await copier(t.texte), texte: 'Texte copié.' })}>Copier</button>
                  {vue.peutEcrire && edition?.id !== t.id && <button type="button" style={boutonSecondaire} onClick={() => setEdition({ id: t.id, valeur: t.texte })}>Modifier</button>}
                  {vue.peutEcrire && <button type="button" style={boutonSecondaire} disabled={enCours !== null} onClick={() => sauver(retenus.filter((x) => x.id !== t.id), 'Texte retiré')}>Retirer</button>}
                </div>
                {vue.peutEcrire && (vue.calques.length ? (
                  <div style={{ ...rangee, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label htmlFor={`${id}-cq-${t.id}`} style={etiquette}>Calque texte</label>
                      <select id={`${id}-cq-${t.id}`} value={calque[t.id] ?? vue.calques[0]!.id} onChange={(e) => setCalque((c) => ({ ...c, [t.id]: e.target.value }))} style={champ}>
                        {vue.calques.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                      </select>
                    </div>
                    <button type="button" style={boutonSecondaire} disabled={enCours !== null} onClick={() => injecter(t)}>Proposer dans ce calque</button>
                  </div>
                ) : <p style={mini} data-etat="sans-calque">Aucun calque texte dans la mise en page de ce projet · l’injection viendra avec l’éditeur.</p>)}
              </li>
            ))}
          </ul>
        )}
        <Comparaison textes={tous} />
      </section>

      <section aria-labelledby={`${id}-export`} style={panneau} data-zone="export">
        <h2 id={`${id}-export`} style={titre}>Copier et exporter</h2>
        <p style={sousTitre}>Pour produire ailleurs · aucune génération, aucun crédit, aucun média.</p>
        <div style={rangee}>
          <button type="button" style={boutonSecondaire} disabled={retenus.length === 0} onClick={async () => setRetour({ ok: await copier(retenus.map((t) => `${libelleType(t.type)} · ${t.texte}`).join('\n\n')), texte: 'Tous les textes retenus sont copiés.' })}>Copier tous les textes</button>
          {vue.peutExporter && (['markdown', 'csv', 'json'] as const).map((f) => (
            <button key={f} type="button" style={boutonSecondaire} disabled={enCours !== null} onClick={() => exporter(f)}>{f === 'markdown' ? 'Exporter en Markdown' : f === 'csv' ? 'Exporter en CSV' : 'Exporter en JSON'}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
