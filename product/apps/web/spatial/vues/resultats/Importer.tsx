'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIBELLE_VERDICT, libelleStatutTest, mentionColonnesAbsentes, modeleImport,
  type GuideColonnes, type Remontee, type VerdictValue,
} from '@tiktrends/core';
import { syncAdsMapAction } from '../../../app/actions/adsmap';
import { applyImportAction, previewImportAction, type PreviewResult } from '../../../app/actions/adsmap-import';
import { applyMesuresAction, previewMesuresAction, type ApercuMesures, type ResultatEcritureMesures } from '../../../app/actions/adsmap-mesures';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import type { SousNavResultats } from './communs';

/**
 * « Importer des résultats » · `docs/spatial/reference/importer.html`, balisage à
 * l'identique. Réel de bout en bout :
 *  · Meta Ads · la connexion de la marque (compte + jeton) · « Mesurer
 *    maintenant » lance la vraie synchro (`syncAdsMapAction`), son compte rendu
 *    est affiché tel quel, décevant compris ;
 *  · TikTok et Google · aucun connecteur publicitaire n'existe · « Bientôt »,
 *    sans bouton actif ;
 *  · le dépôt · le tableau historique (CSV de Google Sheets) · analysé d'abord
 *    (`previewImportAction`, rien n'est écrit), importé ensuite seulement
 *    (`applyImportAction`, admin) ;
 *  · un refus dit QUOI corriger · les intitulés lus dans l'en-tête et les
 *    colonnes attendues absentes (`guideColonnes`, noyau), rendus comme texte,
 *    et « Télécharger le modèle » (`modeleImport` · l'en-tête de l'export) ;
 *  · un aperçu accepté dit les colonnes absentes, dont rien ne sera importé ;
 *  · l'export Meta Ads (CSV, Ads Manager) · les MESURES (lot 4 V5) · analysé
 *    d'abord (`previewMesuresAction` · rattachées, à confirmer, ambiguës, non
 *    rattachées, chacune avec sa raison), écrit ensuite seulement
 *    (`applyMesuresAction` · idempotent, verdicts des lots recalculés) · une
 *    proposition approchée n'est écrite que cochée ;
 *  · les remontées · le journal (connexion Meta, imports d'export) et les lots
 *    repris du tableau.
 */

const COULEUR = { meta: '#0467df', csv: '#0467df', tableau: '#34a853' } as const;
const COLONNES_APERCU = 'minmax(0,1.3fr) minmax(0,1.3fr) 110px minmax(0,1fr) auto';
const LETTRE = { meta: 'M', csv: 'M', tableau: 'S' } as const;
const COLONNES_MESURES = 'minmax(0,1.4fr) minmax(0,1fr) 128px minmax(0,1.6fr)';
type Mode = 'meta' | 'tableau';
const jourCourt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const periode = (p: { debut: string; fin: string }) => (p.debut === p.fin ? jourCourt(p.debut) : `${jourCourt(p.debut)} → ${jourCourt(p.fin)}`);
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
/** Un intitulé lu ou attendu · saisi par l'utilisateur, rendu comme TEXTE (jamais en balisage), retour à la ligne permis. */
const PASTILLE = { whiteSpace: 'normal', maxWidth: '100%', overflowWrap: 'anywhere' } as const;

function telechargerModele() {
  // Le contenu vient du noyau (`modeleImport` → `toCsv`) · l'écran ne l'écrit pas.
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([modeleImport()], { type: 'text/csv;charset=utf-8' }));
  lien.download = 'modele-import-resultats.csv';
  lien.click();
  URL.revokeObjectURL(lien.href);
}

/** Des intitulés en pastilles, chacun entre guillemets français. */
function Intitules({ liste, ton }: { liste: readonly string[]; ton?: 'r' }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {liste.map((h, i) => <span key={i} className={ton ? `pill ${ton}` : 'pill'} style={PASTILLE}>« {h} »</span>)}
    </div>
  );
}

export interface PropsImporter {
  sousNav: SousNavResultats;
  meta: { connecte: boolean; mesure: string | null };
  remontees: ReadonlyArray<Remontee & { quand: string }>;
}

function choisirFichier(): Promise<File | null> {
  // Un champ fichier créé à la demande · aucun élément ajouté au balisage de la maquette.
  return new Promise((ok) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = '.csv,text/csv';
    champ.onchange = () => ok(champ.files?.[0] ?? null);
    champ.click();
  });
}

export function Importer(p: PropsImporter) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [mesure, setMesure] = useState<{ occupe: boolean; texte: string | null }>({ occupe: false, texte: null });
  const [csv, setCsv] = useState<{ nom: string; texte: string } | null>(null);
  const [apercu, setApercu] = useState<PreviewResult | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [guide, setGuide] = useState<GuideColonnes | null>(null);
  const [fait, setFait] = useState(false);
  const [mode, setMode] = useState<Mode>('meta');
  const [mesures, setMesures] = useState<ApercuMesures | null>(null);
  const [guideMesures, setGuideMesures] = useState<{ lus: string[]; manquantes: string[] } | null>(null);
  const [confirmees, setConfirmees] = useState<ReadonlySet<string>>(new Set());
  const [ecrit, setEcrit] = useState<ResultatEcritureMesures['ecrit'] | null>(null);

  async function mesurer() {
    if (mesure.occupe) return;
    setMesure({ occupe: true, texte: null });
    const r = await syncAdsMapAction();
    setMesure({ occupe: false, texte: r.error ?? r.summary ?? 'Mesure terminée.' });
    if (!r.error) router.refresh();
  }

  function choisirMode(m: Mode) {
    if (occupe || m === mode) return;
    setMode(m); setCsv(null); setErreur(null); setGuide(null); setApercu(null); setFait(false);
    setMesures(null); setGuideMesures(null); setConfirmees(new Set()); setEcrit(null);
  }

  async function lire(f: File | null) {
    if (!f) return;
    setErreur(null); setGuide(null); setApercu(null); setFait(false);
    setMesures(null); setGuideMesures(null); setConfirmees(new Set()); setEcrit(null);
    const texte = await f.text();
    setCsv({ nom: f.name, texte });
    setOccupe(true);
    if (mode === 'meta') {
      const m = await previewMesuresAction(texte);
      setOccupe(false);
      if (m.error || !m.apercu) { setErreur(m.error ?? 'Lecture impossible.'); setGuideMesures(m.guide ?? null); return; }
      setMesures(m.apercu);
      return;
    }
    const r = await previewImportAction(texte);
    setOccupe(false);
    if (r.error) { setErreur(r.error); setGuide(r.guide ?? null); return; }
    setApercu(r);
  }

  async function ecrireMesures() {
    if (occupe || !csv || !mesures) return;
    setOccupe(true); setErreur(null);
    const r = await applyMesuresAction(csv.texte, [...confirmees], csv.nom);
    setOccupe(false);
    if (r.error || !r.ecrit) { setErreur(r.error ?? 'Écriture impossible.'); return; }
    setEcrit(r.ecrit);
    toast(`Mesures écrites · ${pl(r.ecrit.ads, 'variante', 'variantes')} · ${pl(r.ecrit.verdicts, 'verdict recalculé', 'verdicts recalculés')}`);
    router.refresh();
  }

  async function importer() {
    if (occupe || !csv) return;
    setOccupe(true); setErreur(null);
    const r = await applyImportAction(csv.texte);
    setOccupe(false);
    if (r.error) { setErreur(r.error); return; }
    setFait(true);
    toast(`Tableau importé · ${r.report?.ads ?? 0} variantes reprises`);
    router.refresh();
  }

  const rep = apercu?.report;
  const absentes = apercu?.guide ? mentionColonnesAbsentes(apercu.guide) : null;
  const t = mesures?.totaux;
  const aEcrire = t ? t.rattachees + mesures!.annonces.filter((a) => a.etat === 'a_confirmer' && confirmees.has(a.cle)).length : 0;
  const texteZone = occupe ? (ecrit === null && mesures ? 'Écriture…' : 'Lecture…')
    : erreur ?? (mode === 'meta'
      ? (ecrit ? `Mesures écrites · ${pl(ecrit.ads, 'variante', 'variantes')} · rien n’est doublé à un nouvel import du même fichier.`
        : t ? `${pl(mesures!.lignesLues, 'ligne lue', 'lignes lues')} · ${pl(t.annonces, 'annonce', 'annonces')} · ${t.rattachees} rattachée${t.rattachees > 1 ? 's' : ''}, ${t.aConfirmer} à confirmer, ${t.ambigues} ambiguë${t.ambigues > 1 ? 's' : ''}, ${t.nonRattachees} non rattachée${t.nonRattachees > 1 ? 's' : ''}. Rien n’est écrit avant de confirmer.`
          : 'Export CSV d’Ads Manager, en français ou en anglais · lignes rattachées aux variantes par leur identifiant Meta ou leur nom régie · rien n’est écrit avant de confirmer')
      : fait ? 'Import terminé · les lots repris apparaissent dans la liste.'
        : rep ? `${rep.rowsRead} lignes lues · ${rep.concepts} concepts, ${rep.ads} variantes, ${rep.batches} lots, ${rep.verdicts} verdicts · ${rep.warnings.length} écart${rep.warnings.length > 1 ? 's' : ''} signalé${rep.warnings.length > 1 ? 's' : ''}. Rien n’est écrit avant de confirmer.`
          : 'Export CSV de Google Sheets · chaque écart est listé avant que quoi que ce soit ne soit écrit');
  return (
    <Vue>
      <EnTete titre="Importer des résultats" sous="Les mesures remontent dans tes lots : c’est ce qui permet de conclure, puis d’itérer" />
      <SousNav items={p.sousNav} actif="/adsmap/import" />
      <div className="lbl" style={{ marginBottom: 10 }}>Connexion automatique · lecture seule · mesure chaque nuit</div>
      <div className="grid3">
        <div className="tile conn2">
          <span className="logo2" style={{ background: COULEUR.meta }}>M</span>
          <div className="t"><strong>Meta Ads</strong><small>Facebook et Instagram</small>
            <span className={`pill ${p.meta.connecte ? 'g' : ''}`} style={{ marginTop: 6 }}>{p.meta.connecte ? (p.meta.mesure ? `Mesuré ${p.meta.mesure}` : 'Connecté · jamais mesuré') : 'Non connecté'}</span>
          </div>
          {p.meta.connecte
            ? <button className="btn sm" type="button" disabled={mesure.occupe} onClick={mesurer} title={mesure.texte ?? undefined}>{mesure.occupe ? 'Mesure…' : 'Mesurer maintenant'}</button>
            : <Lien className="btn sm pri" href="/connections">Connecter</Lien>}
        </div>
        {([['T', '#111', 'TikTok Ads', 'TikTok for Business'], ['G', '#34a853', 'Google Ads', 'YouTube et Demand Gen']] as const).map(([l, c, t, s]) => (
          <div className="tile conn2" key={t}>
            <span className="logo2" style={{ background: c }}>{l}</span>
            <div className="t"><strong>{t}</strong><small>{s}</small><span className="pill" style={{ marginTop: 6 }}>Bientôt</span></div>
            <button className="btn sm" type="button" disabled title="Aucun connecteur publicitaire pour cette régie pour l’instant">Bientôt</button>
          </div>
        ))}
      </div>
      {mesure.texte && <p className="faint" role="status" style={{ fontSize: '12.5px', marginTop: 8 }}>{mesure.texte}</p>}
      <section className="sec grid2">
        <div className="drop" role="button" tabIndex={0} aria-label={mode === 'meta' ? 'Choisir un export Meta Ads (CSV)' : 'Choisir le tableau historique (CSV)'}
          onClick={() => { void choisirFichier().then(lire); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void choisirFichier().then(lire); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void lire(e.dataTransfer.files?.[0] ?? null); }}>
          <Ic n="down" s={false} />
          <strong>{csv ? csv.nom : mode === 'meta' ? 'Déposer un export Meta Ads (CSV)' : 'Déposer le tableau historique (CSV)'}</strong>
          <span className="faint" role="status" style={{ fontSize: '12.5px' }}>{texteZone}</span>
          <div className="seg" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button type="button" aria-pressed={mode === 'meta'} onClick={() => choisirMode('meta')}>Export Meta</button>
            <button type="button" aria-pressed={mode === 'tableau'} onClick={() => choisirMode('tableau')}>Tableau</button>
            <button type="button" disabled title="Aucun connecteur TikTok pour l’instant">Export TikTok · bientôt</button>
          </div>
          {mode === 'tableau' && rep && !fait && (
            <button className="btn sm pri" type="button" disabled={occupe} onClick={(e) => { e.stopPropagation(); void importer(); }}>Importer {rep.ads} variantes</button>
          )}
          {mode === 'meta' && mesures && !ecrit && (
            <button className="btn sm pri" type="button" data-geste="ecrire-mesures" style={{ minHeight: 44 }}
              disabled={!occupe && aEcrire === 0} aria-disabled={occupe || undefined} aria-busy={occupe || undefined}
              title={aEcrire === 0 ? 'Aucune annonce rattachée · rien à écrire' : undefined}
              onClick={(e) => { e.stopPropagation(); if (!occupe) void ecrireMesures(); }}
              onKeyDown={(e) => e.stopPropagation()}>
              {occupe ? 'Écriture…' : `Écrire les mesures de ${pl(aEcrire, 'annonce', 'annonces')}`}
            </button>
          )}
          {mode === 'meta' && mesures && !ecrit && aEcrire === 0 && <span className="faint" style={{ fontSize: '11.5px' }}>Aucune annonce rattachée · rien à écrire. Coche une proposition à confirmer, ou corrige le nom régie des ads.</span>}
        </div>
        <div className="tile">
          <div className="lbl">Dernières remontées</div>
          <div className="tl">
            {p.remontees.map((r) => (
              <div className="ev" key={`${r.source}-${r.le}-${r.texte}`}>
                <span className="logo2" style={{ background: COULEUR[r.source], width: 32, height: 32, fontSize: '11.5px' }}>{LETTRE[r.source]}</span>
                <span>{r.texte}</span><span className="faint" style={{ fontSize: '11.5px' }}>{r.quand}</span>
              </div>
            ))}
            {p.remontees.length === 0 && <div className="ev"><span /><span className="faint">Aucune mesure remontée pour cette marque.</span><span /></div>}
          </div>
        </div>
      </section>
      {mode === 'meta' && erreur && guideMesures && (
        <section className="tile sec" aria-label="Ce qu’il faut corriger">
          <h2>Ce qu’il faut corriger · rien n’est lu au-delà de l’en-tête</h2>
          <div className="lbl" style={{ marginTop: 10 }}>Intitulés lus dans l’en-tête</div>
          {guideMesures.lus.length > 0
            ? <Intitules liste={guideMesures.lus} />
            : <p className="faint" style={{ fontSize: '12.5px' }}>Aucun intitulé · la ligne d’en-tête est vide.</p>}
          {guideMesures.manquantes.length > 0 && <>
            <div className="lbl" style={{ marginTop: 12 }}>Colonne{guideMesures.manquantes.length > 1 ? 's' : ''} obligatoire{guideMesures.manquantes.length > 1 ? 's' : ''} absente{guideMesures.manquantes.length > 1 ? 's' : ''}</div>
            <Intitules liste={guideMesures.manquantes} ton="r" />
          </>}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Dans Ads Manager, onglet Publicités · Exporter › Exporter les données du tableau (CSV). Garde le nom de la publicité, la période, le montant dépensé, les impressions et les achats.</p>
        </section>
      )}
      {mode === 'meta' && mesures && !ecrit && t && (
        <section className="tile sec" aria-label="Ce qui sera écrit">
          <h2>Ce qui sera écrit · rien n’est encore écrit</h2>
          <p className="muted" style={{ fontSize: '12.5px' }}>{mesures.lecture} · {pl(mesures.reconnues.length, 'mesure reconnue', 'mesures reconnues')} · {pl(t.ads, 'variante recevra', 'variantes recevront')} des mesures · {pl(t.nouvelles, 'journée nouvelle', 'journées nouvelles')}, {pl(t.identiques, 'déjà importée à l’identique', 'déjà importées à l’identique')}, {pl(t.misesAJour, 'remplacée', 'remplacées')} par ce fichier.</p>
          {mesures.reconnues.length > 0 && <Intitules liste={mesures.reconnues} />}
          <p className="muted" role="note" data-regle="priorite-mesures" style={{ fontSize: '12.5px', marginTop: 10 }}>{mesures.priorite}</p>
          {mesures.notes.length > 0 && (
            <ul className="check2">
              {mesures.notes.map((n, i) => <li key={i}><span className="cb"><Ic n="warn" /></span><span>{n}</span><span /></li>)}
            </ul>
          )}
          <div className="mtable" style={{ marginTop: 12 }} data-tableau="annonces">
            <div className="mrow h" style={{ gridTemplateColumns: COLONNES_MESURES }}><span>Annonce du fichier</span><span>Variante</span><span>État</span><span>Pourquoi</span></div>
            {mesures.annonces.map((a) => (
              <div className="mrow" key={a.cle} data-etat={a.etat} style={{ gridTemplateColumns: COLONNES_MESURES }}>
                <span style={PASTILLE}>{a.nom ?? a.idMeta ?? 'annonce sans nom'}<small className="faint" style={{ display: 'block' }}>{periode(a.periode)} · {pl(a.lignes, 'ligne', 'lignes')}</small></span>
                <span className="muted" style={PASTILLE}>{a.cible ? `${a.cible.lot !== null ? `Lot #${a.cible.lot} · ` : 'Hors lot · '}${a.cible.variante}` : 'Aucune'}</span>
                <span className={`pill ${a.etat === 'rattachee' ? 'g' : a.etat === 'a_confirmer' ? 'w' : a.etat === 'ambigue' ? 'r' : ''}`} style={{ alignSelf: 'start' }}>{a.libelle}</span>
                <span className="muted" style={PASTILLE}>
                  {a.raison}{a.bilan ? ` · ${pl(a.bilan.nouvelles, 'journée nouvelle', 'journées nouvelles')}${a.bilan.identiques ? `, ${a.bilan.identiques} identique${a.bilan.identiques > 1 ? 's' : ''}` : ''}${a.bilan.misesAJour ? `, ${a.bilan.misesAJour} remplacée${a.bilan.misesAJour > 1 ? 's' : ''}` : ''}` : ''}
                  {a.etat === 'a_confirmer' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
                      <input type="checkbox" data-confirmer={a.cle} checked={confirmees.has(a.cle)} disabled={occupe}
                        onChange={(e) => { const n = new Set(confirmees); if (e.target.checked) n.add(a.cle); else n.delete(a.cle); setConfirmees(n); }} />
                      Confirmer ce rattachement
                    </label>
                  )}
                </span>
              </div>
            ))}
          </div>
          {mesures.ecartees.length > 0 && (
            <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Lignes écartées · {mesures.ecartees.map((e) => `ligne ${e.ligne} (${e.raison})`).join(', ')}{mesures.ecarteesMasquees ? `, et ${mesures.ecarteesMasquees} autre${mesures.ecarteesMasquees > 1 ? 's' : ''}` : ''}.</p>
          )}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Seules les ads de cette marque peuvent recevoir ces mesures. Une annonce ambiguë ou non rattachée n’est jamais écrite · colle son identifiant Meta sur l’ad, ou corrige son nom régie, puis réimporte.</p>
        </section>
      )}
      {mode === 'meta' && ecrit && (
        <section className="tile sec" role="status" aria-label="Mesures écrites">
          <p style={{ fontSize: '13px' }}><b>Mesures écrites.</b> {pl(ecrit.ads, 'variante', 'variantes')} · {pl(ecrit.nouvelles, 'journée nouvelle', 'journées nouvelles')}, {pl(ecrit.identiques, 'déjà là à l’identique', 'déjà là à l’identique')} (rien n’est doublé), {pl(ecrit.misesAJour, 'remplacée', 'remplacées')} · {pl(ecrit.verdicts, 'verdict recalculé', 'verdicts recalculés')}.{ecrit.meta ? ` ${pl(ecrit.meta, 'journée était', 'journées étaient')} déjà mesurée${ecrit.meta > 1 ? 's' : ''} par la connexion Meta · la connexion l’emporte.` : ''}</p>
          <div className="foot2" style={{ marginTop: 10 }}>
            {ecrit.lots.map((l) => <Lien key={l.id} className="btn sm pri" href={`/adsmap/lots/${encodeURIComponent(l.id)}`}>Ouvrir le lot #{l.numero}</Lien>)}
            <Lien className="btn sm" href="/adsmap/lots">Tous les lots</Lien>
          </div>
        </section>
      )}
      {mode === 'tableau' && erreur && guide && !apercu && (
        <section className="tile sec" aria-label="Ce qu’il faut corriger">
          <h2>Ce qu’il faut corriger · rien n’est lu au-delà de l’en-tête</h2>
          <div className="lbl" style={{ marginTop: 10 }}>Intitulés lus dans l’en-tête</div>
          {guide.lus.length > 0
            ? <Intitules liste={guide.lus} />
            : <p className="faint" style={{ fontSize: '12.5px' }}>Aucun intitulé · la ligne d’en-tête est vide.</p>}
          {guide.lusMasques > 0 && <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>et {guide.lusMasques} autre{guide.lusMasques > 1 ? 's' : ''}, non affiché{guide.lusMasques > 1 ? 's' : ''}</p>}
          {guide.obligatoiresAbsentes.length > 0 && <>
            <div className="lbl" style={{ marginTop: 12 }}>Colonne{guide.obligatoiresAbsentes.length > 1 ? 's' : ''} obligatoire{guide.obligatoiresAbsentes.length > 1 ? 's' : ''} absente{guide.obligatoiresAbsentes.length > 1 ? 's' : ''}</div>
            <Intitules liste={guide.obligatoiresAbsentes} ton="r" />
          </>}
          {guide.optionnellesAbsentes.length > 0 && <>
            <div className="lbl" style={{ marginTop: 12 }}>Autres colonnes du tableau absentes</div>
            <Intitules liste={guide.optionnellesAbsentes} />
          </>}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Chaque intitulé doit être dans sa propre colonne, en première ligne utile du fichier. Le modèle reprend l’en-tête exact de l’export Résultats.</p>
          <div className="foot2" style={{ marginTop: 10 }}>
            <button className="btn sm" type="button" style={{ minHeight: 44 }} onClick={telechargerModele}><Ic n="down" s={false} />Télécharger le modèle</button>
          </div>
        </section>
      )}
      {mode === 'tableau' && rep && !fait && (
        <section className="tile sec" aria-label="Ce qui sera créé">
          <h2>Ce qui sera créé · rien n’est encore écrit</h2>
          <p className="muted" style={{ fontSize: '12.5px' }}>{apercu?.lecture ? `${apercu.lecture} · ` : ''}{rep.rowsRead} lignes lues · {rep.ads} variantes, {rep.concepts} concepts, {rep.angles} angles, {rep.desires} désirs, {rep.batches} lots, {rep.verdicts} verdicts, {rep.learnings} apprentissages.{rep.rowsRead === rep.ads ? ` Aucune ligne perdue · ${rep.conceptsMerged} ligne(s) regroupée(s) en variantes d’un même concept.` : ''}</p>
          {absentes && <p className="muted" role="note" style={{ fontSize: '12.5px', marginTop: 6 }}>{absentes} L’import n’est pas bloqué.</p>}
          {rep.warnings.length > 0 && (
            <ul className="check2">
              {rep.warnings.map((w, i) => <li key={i}><span className="cb"><Ic n="warn" /></span><span>{w}</span><span /></li>)}
            </ul>
          )}
          {apercu?.sample && apercu.sample.length > 0 && (
            <div className="mtable" style={{ marginTop: 12 }}>
              <div className="mrow h" style={{ gridTemplateColumns: COLONNES_APERCU }}><span>Concept</span><span>Angle · désir</span><span>Statut</span><span>Verdict · date</span><span>Variante</span></div>
              {apercu.sample.map((r, i) => (
                <div className="mrow" key={i} style={{ gridTemplateColumns: COLONNES_APERCU }}>
                  <span>{r.concept}</span><span className="muted">{r.angle} · {r.desire}</span><span>{libelleStatutTest(r.status)}</span>
                  <span className="muted">{r.verdict ? (LIBELLE_VERDICT[r.verdict as VerdictValue]?.court ?? r.verdict) : 'Aucun'} · {r.date ?? 'sans date'}</span><span className="num">{r.variant}</span>
                </div>
              ))}
            </div>
          )}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Personas, désirs, angles et concepts arrivent « proposés » · à trier avant de compter. Les verdicts du tableau sont repris tels quels, marqués NON comparables (le protocole d’alors est inconnu).</p>
        </section>
      )}
      {mode === 'tableau' && fait && rep && (
        <section className="tile sec" role="status">
          <p style={{ fontSize: '13px' }}><b>Import terminé.</b> {rep.ads} ad(s), {rep.concepts} concept(s) et {rep.batches} lot(s) créés.{rep.demotedToDraft > 0 ? ` ${rep.demotedToDraft} ad(s) attendent leur hypothèse avant de pouvoir repartir en test.` : ''}</p>
          <div className="foot2" style={{ marginTop: 10 }}>
            <Lien className="btn sm pri" href="/adsmap/tri">Trier ce qui est arrivé</Lien>
            <Lien className="btn sm" href="/adsmap/tests">Ouvrir tous les tests</Lien>
          </div>
        </section>
      )}
    </Vue>
  );
}
