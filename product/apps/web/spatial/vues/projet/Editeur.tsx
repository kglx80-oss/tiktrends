'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ClavierReact, type PointerEvent as PointeurReact, type ReactNode } from 'react';
import {
  FORMATS_DOCUMENT, FORMATS_EDITEUR, ORDRE_FORMATS, PART_PRODUIT_INITIALE, POLICES_EDITEUR,
  ajouterForme, ajouterMedia, ajouterTexte, alignerCalque, annulerEtape, appliquerOperation, bornesTailleTexte, calqueApresRetrait, calquesParZ,
  classeFormat, definirVerrou, definirVisibilite, deplacementVersDocument, documentInitial, dupliquerCalque, enregistrerEtape, formatDuDocument,
  historiqueInitial, iconeCalque, libelleZoom, longueurTexte, raccourciZoom, MARGE_ZONE_EDITEUR, memeValeur, modifierRemplissage, modifierTexte, noteCalques, nuancier, patchDocument,
  policeEditeur, prochainAnnuler, prochainRetablir, reappliquerModifications, renommerCalque, reordonnerCalque, retablirEtape,
  statutEnregistrement, supprimerCalque, titreInspecteur, transformerCalque, annonceRestauration, decisionRestauration,
  type CalqueStudio, type ContenuVersion, type DocumentStudio, type FormatDocument, type FormatPropose, type HistoriqueCalques,
  type ModeAlignement, type ProduitInitial, type ResultatOperation, type SensOrdre,
} from '@tiktrends/core';
import { createPortal } from 'react-dom';
import { enregistrerDocument } from '../../../app/actions/studios/projets';
import { listerVersionsDocument, relireDocumentEditeur, restaurerVersionDocument } from '../../../lib/studios/editeur/actions';
import type { MediaEditeur, VersionListee } from '../../../lib/studios/editeur/types';
import { useZoomEditeur } from '../../../lib/studios/editeur/use-zoom-editeur';
import { effacerSauvegardeLocale, ecrireSauvegardeLocale, lireSauvegardeLocale, type SauvegardeLocale } from '../../../lib/studios/editeur/sauvegarde-locale';
import { useSpatial } from '../../coquille/contexte';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { Message } from './briques';

/**
 * L'éditeur d'image · `docs/spatial/reference/editeur.html`, balisage à
 * l'identique (calques, canvas et format, inspecteur).
 *
 * Non destructif et SANS génération, comme l'éditeur V5 (`EditeurCalques`) :
 * chaque geste passe par une opération PURE du noyau (`calques/`), l'historique
 * garde les documents, « Enregistrer » envoie le patch base → présent à
 * `enregistrerDocument` (version immuable, 409 sans écrasement : recharger ou
 * réappliquer). Copie de secours sur l'appareil, versions et restauration.
 * Aucune ligne de devis, de job ni de dépense.
 *
 * La maquette ne dessine que le geste de l'accroche · les autres gestes de la
 * V5 (ajouter, déplacer, aligner, ordonner, verrouiller, dupliquer, supprimer,
 * versions) vivent dans la tuile « Gestes du calque », sous l'atelier.
 */

export interface PropsEditeur {
  projet: { id: string; titre: string; marque: string };
  version: { id: string; n: number };
  /** Contenu de la version (lu par la page · le calcul d'impact reste côté serveur). */
  contenu: ContenuVersion;
  document: DocumentStudio | null;
  formatPropose: FormatPropose;
  produit: ProduitInitial | null;
  medias: MediaEditeur[];
  apercus: Record<string, string>;
  peutEnregistrer: boolean;
  /** Couleurs de la fiche marque · proposées en premier. */
  couleursMarque: string[];
  exporterHref: string | null;
  variantesHref: string;
  /** Recette · calque choisi au premier rendu. */
  selectionInitiale?: string | null;
}

interface Base { id: string; n: number; document: DocumentStudio | null }
interface Conflit { versionCourante: { id: string; n: number } | null; document: DocumentStudio | null; reappliquable: DocumentStudio | null; erreur: string | null }

const FAMILLE = 'TT Editeur Sans';
let policesChargees = false;
function chargerPolices() {
  if (policesChargees || typeof window === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return;
  policesChargees = true;
  for (const p of POLICES_EDITEUR) {
    try { const f = new FontFace(FAMILLE, `url(${p.fichier})`, { weight: String(p.poids) }); document.fonts.add(f); void f.load().catch(() => undefined); } catch { /* repli système */ }
  }
}
const pct = (v: number, t: number) => `${(v / t) * 100}%`;

/** Téléphone · le seuil de la maquette (`max-width:760px`). Le rendu serveur vaut ordinateur, la lecture suit au montage. */
const MEDIA_TELEPHONE = '(max-width: 760px)';
function suivreTelephone(f: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MEDIA_TELEPHONE);
  mq.addEventListener('change', f);
  return () => mq.removeEventListener('change', f);
}
function useTelephone(): boolean {
  return useSyncExternalStore(suivreTelephone, () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MEDIA_TELEPHONE).matches, () => false);
}

/**
 * Un panneau PLEIN ÉCRAN du téléphone (calques, propriétés) · comme l'éditeur
 * V5 : modal, Échap ou « Fermer » le referment, le focus y reste piégé puis
 * revient à l'élément d'origine. Il ne fait qu'AFFICHER les mêmes contrôles.
 */
function PanneauPleinEcran({ titre, nom, onFermer, children }: { titre: string; nom: string; onFermer: () => void; children: ReactNode }) {
  const id = useId();
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLElement>('[data-fermer-panneau]')?.focus();
    return () => { precedent?.focus?.(); };
  }, []);
  // Rendu dans `body` · la fenêtre `main.win` (verre dépoli) forme son propre empilement, le dock du téléphone passerait dessus.
  return createPortal(
    <div className="paywrap" style={{ padding: 0, placeItems: 'stretch', zIndex: 61 }}>
      <div ref={boite} className="tile glass" role="dialog" aria-modal="true" aria-labelledby={id} data-panneau-mobile={nom} tabIndex={-1}
        style={{ borderRadius: 0, height: '100dvh', overflowY: 'auto', display: 'grid', gap: 14, alignContent: 'start' }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFermer(); return; }
          if (e.key !== 'Tab') return;
          const f = [...(boite.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') ?? [])];
          const premier = f[0]; const dernier = f[f.length - 1];
          if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
          else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
        }}>
        <div className="sech" style={{ margin: 0 }}>
          <h2 id={id}>{titre}</h2>
          <button className="btn sm" type="button" data-fermer-panneau="" style={{ marginLeft: 'auto' }} onClick={onFermer}><Ic n="x" />Fermer</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Editeur(props: PropsEditeur) {
  const { projet, produit, medias, apercus, peutEnregistrer: editable } = props;
  const { toast } = useSpatial();
  const [base, setBase] = useState<Base>({ id: props.version.id, n: props.version.n, document: props.document });
  const [h, setH] = useState<HistoriqueCalques | null>(props.document ? historiqueInitial(props.document) : null);
  const [selection, setSelection] = useState<string | null>(props.selectionInitiale ?? null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [conflit, setConflit] = useState<Conflit | null>(null);
  const [secours, setSecours] = useState<SauvegardeLocale | null>(null);
  const [formatNouveau, setFormatNouveau] = useState<FormatDocument>(props.formatPropose.format);
  const [avecProduit, setAvecProduit] = useState(!!produit);
  const [mediasOuverts, setMediasOuverts] = useState(false);
  const [versions, setVersions] = useState<{ etat: 'ferme' | 'chargement' | 'ok' | 'erreur'; liste: VersionListee[]; message?: string }>({ etat: 'ferme', liste: [] });
  const [brouillon, setBrouillon] = useState<{ id: string; texte: string } | null>(null);
  const [taille, setTaille] = useState<{ id: string; px: number } | null>(null);
  const [glisse, setGlisse] = useState<{ id: string; x0: number; y0: number; px: number; py: number; dx: number; dy: number; largeur: number } | null>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const telephone = useTelephone();
  const [panneau, setPanneau] = useState<'calques' | 'proprietes' | null>(null);

  useEffect(() => { chargerPolices(); }, []);

  const present = h?.present ?? null;
  const calque = present && selection ? present.layers[selection] ?? null : null;
  const statut = statutEnregistrement({ base: base.document, present, enCours, conflit: conflit !== null, erreur: erreur !== null });
  const modifie = statut.etat === 'modifie' || statut.etat === 'erreur';
  const annulable = h ? prochainAnnuler(h) : null;
  const retablissable = h ? prochainRetablir(h) : null;
  const pile = present ? calquesParZ(present) : [];
  const format = present ? formatDuDocument(present) : null;
  const couleurs = useMemo(() => nuancier(props.couleursMarque, present, 4), [props.couleursMarque, present]);
  // Zoom de la zone de travail · état d'AFFICHAGE seulement, jamais dans le document ni l'historique.
  const zoom = useZoomEditeur(present ? { width: present.width, height: present.height } : null);
  // Un panneau ouvert sur un calque disparu (suppression, restauration) se referme.
  useEffect(() => { if (panneau === 'proprietes' && !calque) setPanneau(null); }, [panneau, calque]);
  useEffect(() => { if (!telephone) setPanneau(null); }, [telephone]);

  /* ── Copie de secours (cet appareil seulement) ─────────────────────────── */
  useEffect(() => {
    const s = lireSauvegardeLocale(projet.id);
    if (s && !memeValeur(s.document, props.document)) setSecours(s);
    // Lecture au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!present || !editable || secours || (base.document && memeValeur(present, base.document))) return;
    const t = setTimeout(() => ecrireSauvegardeLocale(projet.id, { baseVersionId: base.id, baseN: base.n, base: base.document, document: present }), 600);
    return () => clearTimeout(t);
  }, [present, base, editable, secours, projet.id]);
  const reappSecours = secours && secours.baseVersionId !== base.id ? reappliquerModifications(secours.base, secours.document, base.document) : null;

  /* ── Gestes ─────────────────────────────────────────────────────────────── */
  const operer = (fn: (d: DocumentStudio) => ResultatOperation) => {
    if (!h || !editable) return;
    const r = fn(h.present);
    if (!r.ok) { const d = r.violations?.[0]?.raison; setRefus(d ? `${r.message} ${d}` : r.message); return; }
    setRefus(null);
    if (r.changes.length === 0) return;
    setH(appliquerOperation(h, r));
    setSelection(r.calqueId);
    setErreur(null);
  };
  const surCalque = (f: (d: DocumentStudio, id: string) => ResultatOperation) => calque && operer((d) => f(d, calque.id));

  async function enregistrer(doc: DocumentStudio | null = present, raison = annulable ?? 'Création du document') {
    if (!doc || !editable || enCours || conflit) return;
    const changes = patchDocument(base.document, doc, `Éditeur de calques · ${raison}`);
    if (changes.length === 0) return;
    setEnCours(true); setErreur(null);
    let r: Awaited<ReturnType<typeof enregistrerDocument>> | null = null;
    try { r = await enregistrerDocument({ projectId: projet.id, baseVersionId: base.id, changes, raison: `Éditeur de calques · ${raison}` }); } catch { r = null; }
    setEnCours(false);
    if (!r) { setErreur('Le serveur ne répond pas · vérifie ta connexion puis réessaie. Tes modifications restent à l’écran et sur cet appareil.'); return; }
    if (r.ok) {
      setBase({ id: r.version.id, n: r.version.n, document: doc });
      if (!h) setH(historiqueInitial(doc));
      effacerSauvegardeLocale(projet.id); setSecours(null);
      toast(r.inchange ? 'Aucun changement à enregistrer' : `Enregistré · version ${r.version.n}`);
      return;
    }
    if (r.code === 'VERSION_CONFLICT') {
      ecrireSauvegardeLocale(projet.id, { baseVersionId: base.id, baseN: base.n, base: base.document, document: doc });
      setConflit({ versionCourante: null, document: null, reappliquable: null, erreur: null });
      let rel: Awaited<ReturnType<typeof relireDocumentEditeur>> | null = null;
      try { rel = await relireDocumentEditeur(projet.id); } catch { rel = null; }
      if (!rel || !rel.ok) { setConflit({ versionCourante: null, document: null, reappliquable: null, erreur: rel ? `${rel.message} (identifiant support : ${rel.traceId})` : 'La version courante n’a pas pu être relue · vérifie ta connexion puis réessaie.' }); return; }
      const re = reappliquerModifications(base.document, doc, rel.document);
      setConflit({ versionCourante: rel.version, document: rel.document, reappliquable: re.ok ? re.document : null, erreur: null });
      return;
    }
    setErreur(`${r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`);
  }

  const trancherConflit = (reappliquer: boolean) => {
    if (!conflit?.versionCourante) return;
    const v = conflit.versionCourante;
    setBase({ id: v.id, n: v.n, document: conflit.document });
    if (reappliquer && conflit.reappliquable) setH(conflit.document ? enregistrerEtape(historiqueInitial(conflit.document), conflit.reappliquable, 'Réappliquer mes modifications') : historiqueInitial(conflit.reappliquable));
    else setH(conflit.document ? historiqueInitial(conflit.document) : null);
    setConflit(null); setSelection(null);
    toast(reappliquer ? `Version ${v.n} rechargée · tes modifications sont réappliquées, enregistre pour les garder` : `Version ${v.n} rechargée`);
  };

  /* ── Raccourcis · Ctrl+Z, Ctrl+Maj+Z, Ctrl+S, zoom Ctrl+ · Ctrl− · Ctrl+0 (comme la V5) ── */
  const derniers = useRef({ annuler: () => {}, retablir: () => {}, enregistrer: () => {}, zoomer: ((): boolean => false) as (a: Parameters<typeof zoom.agir>[0]) => boolean });
  derniers.current = {
    annuler: () => { if (h && annulable) setH(annulerEtape(h)); },
    retablir: () => { if (h && retablissable) setH(retablirEtape(h)); },
    enregistrer: () => { void enregistrer(); },
    zoomer: zoom.agir,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const cible = e.target as HTMLElement | null;
      const dansChamp = !!cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT');
      if (k === 's') { e.preventDefault(); if (dansChamp) cible.blur(); setTimeout(() => derniers.current.enregistrer(), 0); return; }
      // Zoom · Ctrl/⌘ + · − · 0, jamais pendant une saisie (la touche reste alors au navigateur) ni sans zone mesurée.
      const az = raccourciZoom({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, dansChamp });
      if (az) { if (derniers.current.zoomer(az)) e.preventDefault(); return; }
      if (dansChamp) return;
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); derniers.current.annuler(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); derniers.current.retablir(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Surface ───────────────────────────────────────────────────────────── */
  const debut = (e: PointeurReact<HTMLDivElement>, c: CalqueStudio) => {
    e.stopPropagation();
    setSelection(c.id);
    if (!editable || c.locked || !cadre.current) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* capture indisponible */ }
    setGlisse({ id: c.id, x0: c.x, y0: c.y, px: e.clientX, py: e.clientY, dx: 0, dy: 0, largeur: cadre.current.getBoundingClientRect().width });
  };
  const bouge = (e: PointeurReact<HTMLDivElement>) => {
    if (!glisse || !present) return;
    const d = deplacementVersDocument(e.clientX - glisse.px, e.clientY - glisse.py, glisse.largeur, present.width);
    setGlisse({ ...glisse, dx: d.x, dy: d.y });
  };
  const fin = () => {
    if (!glisse) return;
    const g = glisse;
    setGlisse(null);
    if (Math.abs(g.dx) >= 1 || Math.abs(g.dy) >= 1) operer((d) => transformerCalque(d, g.id, { x: g.x0 + g.dx, y: g.y0 + g.dy }));
  };
  const clavierSurface = (e: ClavierReact<HTMLDivElement>) => {
    if (e.key === 'Escape') { setSelection(null); return; }
    const pas = e.shiftKey ? 10 : 1;
    const d = ({ ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] } as Record<string, [number, number]>)[e.key];
    if (!d || !calque || !editable) return;
    e.preventDefault();
    operer((doc) => transformerCalque(doc, calque.id, { x: calque.x + d[0], y: calque.y + d[1] }));
  };

  const texte = calque?.kind === 'text' ? (brouillon?.id === calque.id ? brouillon.texte : calque.text) : '';
  const tailleTexte = calque?.kind === 'text' ? (taille?.id === calque.id ? taille.px : calque.fontSizePx) : 0;
  const validerTexte = () => { if (calque?.kind === 'text' && brouillon?.id === calque.id && brouillon.texte !== calque.text) surCalque((d, id) => modifierTexte(d, id, { text: brouillon.texte })); setBrouillon(null); };
  const validerTaille = () => { if (calque?.kind === 'text' && taille?.id === calque.id && taille.px !== calque.fontSizePx) surCalque((d, id) => modifierTexte(d, id, { fontSizePx: taille.px })); setTaille(null); };

  async function ouvrirVersions() {
    if (versions.etat === 'ok' || versions.etat === 'chargement') { setVersions({ etat: 'ferme', liste: [] }); return; }
    setVersions({ etat: 'chargement', liste: [] });
    let r: Awaited<ReturnType<typeof listerVersionsDocument>> | null = null;
    try { r = await listerVersionsDocument(projet.id); } catch { r = null; }
    setVersions(!r ? { etat: 'erreur', liste: [], message: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.' } : r.ok ? { etat: 'ok', liste: r.versions } : { etat: 'erreur', liste: [], message: `${r.message} (identifiant support : ${r.traceId})` });
  }
  async function restaurer(v: VersionListee) {
    setEnCours(true);
    let r: Awaited<ReturnType<typeof restaurerVersionDocument>> | null = null;
    try { r = await restaurerVersionDocument({ projectId: projet.id, versionId: v.id, baseVersionId: base.id }); } catch { r = null; }
    setEnCours(false);
    if (!r || !r.ok) { setErreur(r ? `${r.message} (identifiant support : ${r.traceId})` : 'Le serveur ne répond pas · la restauration n’a pas eu lieu.'); return; }
    setBase({ id: r.version.id, n: r.version.n, document: r.document });
    setH(r.document ? historiqueInitial(r.document) : null);
    setSelection(null);
    setVersions({ etat: 'ferme', liste: [] });
    toast(`Version ${r.restauree.n} restaurée · c’est maintenant la version ${r.version.n}.`);
  }

  const choisirCalque = (id: string) => { setSelection(id); if (telephone) setPanneau('proprietes'); };
  const listeCalques = (
    <>
      {pile.map((c) => (
        <button key={c.id} type="button" className="layer" data-layer={c.id} aria-pressed={selection === c.id} onClick={() => choisirCalque(c.id)}>
          <Ic n={iconeCalque(c)} />{c.name}<span className="faint">{c.locked && <Ic n="lock" />}</span>
        </button>
      ))}
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 8 }}>{noteCalques(present)}</p>
    </>
  );
  const inspecteur = (
    <>
            <div className="lbl">{titreInspecteur(calque)}</div>
            {calque?.kind === 'text' && present && (
              <>
                <label className="field">Texte<textarea id="stext" spellCheck={false} value={texte} disabled={!editable || calque.locked}
                  onChange={(e) => setBrouillon({ id: calque.id, texte: e.target.value })} onBlur={validerTexte} /></label>
                <span className="faint num" id="scount" style={{ fontSize: '11.5px' }}>{longueurTexte(texte)}</span>
                <label className="field">Taille du texte<input type="range" id="ssize" {...bornesTailleTexte(present, tailleTexte)} value={tailleTexte} disabled={!editable || calque.locked}
                  onChange={(e) => setTaille({ id: calque.id, px: Number(e.target.value) })} onPointerUp={validerTaille} onKeyUp={validerTaille} onBlur={validerTaille} /></label>
                <div className="field">Couleur du texte<div className="swatches">
                  {couleurs.map((c) => <button key={c} type="button" data-sw={c} aria-pressed={calque.color === c} style={{ background: c }} aria-label={`Couleur ${c}`} disabled={!editable || calque.locked} onClick={() => surCalque((d, id) => modifierTexte(d, id, { color: c }))} />)}
                </div></div>
              </>
            )}
            {calque?.kind === 'shape' && (
              <div className="field">Couleur de la forme<div className="swatches">
                {couleurs.map((c) => <button key={c} type="button" data-sw={c} aria-pressed={calque.fill === c} style={{ background: c }} aria-label={`Couleur ${c}`} disabled={!editable || calque.locked} onClick={() => surCalque((d, id) => modifierRemplissage(d, id, c))} />)}
              </div></div>
            )}
            {(calque?.kind === 'image' || calque?.kind === 'logo') && (
              <p className="muted" style={{ fontSize: 13 }}>{calque.id === 'produit' ? 'Photo produit issue du projet · référencée, jamais copiée ni régénérée.' : `${calque.kind === 'logo' ? 'Logo' : 'Média'} du projet · ${calque.width} × ${calque.height} px dans le document, référencé, jamais copié.`}</p>
            )}
            {!calque && <p className="muted" style={{ fontSize: 13 }}>{present ? 'Choisis un calque dans la liste ou sur l’aperçu pour le modifier.' : 'Crée d’abord le document.'}</p>}
            <div style={{ borderTop: '1px solid var(--edge2)', paddingTop: 14, display: 'grid', gap: 8 }}>
              <Lien className="btn pri" href={props.variantesHref}><Ic n="loop" />Tester des variantes</Lien>
              {props.exporterHref
                ? <Lien className="btn" href={props.exporterHref}><Ic n="down" />Exporter</Lien>
                : <button className="btn" type="button" disabled title="L’export n’est pas ouvert pour ton rôle ou ton espace"><Ic n="down" />Exporter</button>}
            </div>
    </>
  );

  return (
    <Vue>
      <EnTete titre="Éditeur" sous={`${projet.titre} · version ${base.n}${present ? ` · ${present.width} × ${present.height} px` : ''}`} />
      <div className="wshead">
        <Lien className="btn sm" href={`/studio/projets/${projet.id}`}><Ic n="back" />Retour au projet</Lien>
        {telephone && present && (
          <>
            <button className="btn sm" type="button" data-ouvrir-panneau="calques" aria-haspopup="dialog" onClick={() => setPanneau('calques')}><Ic n="grid" />Calques · {pile.length}</button>
            <button className="btn sm" type="button" data-ouvrir-panneau="proprietes" aria-haspopup="dialog" disabled={!calque} title={calque ? undefined : 'Choisis d’abord un calque'} onClick={() => setPanneau('proprietes')}>{calque ? `Propriétés de « ${calque.name} »` : 'Propriétés'}</button>
          </>
        )}
        {editable && present && (
          <>
            <span className={`pill ${statut.etat === 'enregistre' ? 'c' : statut.etat === 'modifie' ? '' : 'w'}`} role="status" style={{ marginLeft: 'auto' }}>{statut.etat === 'enregistre' && <Ic n="check" />}{statut.libelle}</span>
            <button className="btn sm" type="button" disabled={!annulable} title={annulable ? `Annuler · ${annulable} (Ctrl+Z)` : 'Rien à annuler'} onClick={() => derniers.current.annuler()}>Annuler</button>
            <button className="btn sm" type="button" disabled={!retablissable} title={retablissable ? `Rétablir · ${retablissable} (Ctrl+Maj+Z)` : 'Rien à rétablir'} onClick={() => derniers.current.retablir()}>Rétablir</button>
            <button className="btn sm pri" type="button" disabled={!modifie || enCours || conflit !== null} onClick={() => void enregistrer()}><Ic n="check" />{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
          </>
        )}
        {!editable && <span className="pill" style={{ marginLeft: 'auto' }}><Ic n="lock" />Lecture seule</span>}
      </div>

      {(erreur || refus || conflit || (secours && editable)) && (
        <div className="banner" role={erreur || conflit ? 'alert' : 'status'}>
          <span className="orb" style={{ width: 32, height: 32, fontSize: '12.5px' }}>J</span>
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>
            {erreur && <span>{erreur}</span>}
            {refus && <span>{refus}</span>}
            {conflit && (conflit.erreur ? <span>{conflit.erreur}</span> : conflit.versionCourante
              ? <span>Une autre session a enregistré la version {conflit.versionCourante.n}. Tes modifications sont gardées sur cet appareil · rien n’a été écrasé.</span>
              : <span>Conflit de version · lecture de la version courante…</span>)}
            {secours && editable && !conflit && (
              <span>Une copie de secours de cet appareil contient des modifications non enregistrées{secours.baseVersionId === base.id ? '' : `, faites sur la version ${secours.baseN}`} ({new Date(secours.enregistreeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}) · elle vit dans ce navigateur seulement.{reappSecours && !reappSecours.ok ? ' Elle touche les mêmes éléments que la version courante · elle ne peut pas être restaurée.' : ''}</span>
            )}
            <div className="kc">
              {erreur && <button className="btn sm" type="button" onClick={() => void enregistrer()}>Réessayer</button>}
              {conflit?.versionCourante && <button className="btn sm" type="button" onClick={() => trancherConflit(false)}>Recharger la version {conflit.versionCourante.n}</button>}
              {conflit?.reappliquable && <button className="btn sm pri" type="button" onClick={() => trancherConflit(true)}>Réappliquer mes modifications</button>}
              {secours && editable && !conflit && (!reappSecours || reappSecours.ok) && (
                <button className="btn sm pri" type="button" onClick={() => {
                  const doc = secours.baseVersionId === base.id ? secours.document : reappSecours?.ok ? reappSecours.document : null;
                  if (!doc) return;
                  setH(h ? enregistrerEtape(h, doc, 'Restaurer la copie de secours') : historiqueInitial(doc));
                  setSecours(null);
                  toast('Copie de secours restaurée · enregistre pour créer une version');
                }}>Restaurer la copie</button>
              )}
              {secours && editable && !conflit && <button className="btn sm" type="button" onClick={() => { effacerSauvegardeLocale(projet.id); setSecours(null); }}>Ignorer et effacer la copie</button>}
            </div>
          </div>
        </div>
      )}

      <div className="studio">
        {!telephone && <aside className="tile layers" aria-label="Calques">
          <div className="lbl" style={{ marginBottom: 6 }}>Calques</div>
          {listeCalques}
        </aside>}

        <div className="canvas">
          <div className="seg" role="group" aria-label="Format">
            {FORMATS_EDITEUR.map((f) => (
              <button key={f.format} type="button" data-sf={f.format} aria-pressed={present ? format === f.format : formatNouveau === f.format}
                disabled={!!present && format !== f.format} title={present ? 'Le format se choisit à la création du document' : FORMATS_DOCUMENT[f.format].libelle}
                onClick={() => { if (!present) setFormatNouveau(f.format); }}>{f.libelle}</button>
            ))}
          </div>
          <div style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center' }} id="art">
            {present ? (
              <ZoneZoom zoom={zoom} hauteur={telephone ? '60vh' : '520px'}>
              <div ref={cadre} className={`ad ${classeFormat(format)}`} role="group" tabIndex={0} aria-label={`Aperçu du document, ${present.width} × ${present.height} pixels, ${pile.length} calque${pile.length > 1 ? 's' : ''}`}
                onKeyDown={clavierSurface} onPointerDown={() => setSelection(null)} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin}
                style={{ position: 'relative', aspectRatio: `${present.width} / ${present.height}`, containerType: 'inline-size', touchAction: glisse ? 'none' : 'auto', ...(zoom.disposition ? { width: '100%', maxWidth: 'none' } : {}) }}>
                <div className="ph" style={{ position: 'relative' }}>
                  {pile.map((c, rang) => {
                    if (!c.visible) return null;
                    const g = glisse?.id === c.id ? glisse : null;
                    return (
                      <div key={c.id} data-calque={c.id} onPointerDown={(e) => debut(e, c)}
                        style={{ position: 'absolute', left: pct(g ? g.x0 + g.dx : c.x, present.width), top: pct(g ? g.y0 + g.dy : c.y, present.height), width: pct(c.width, present.width), height: pct(c.height, present.height), transform: c.rotationDeg ? `rotate(${c.rotationDeg}deg)` : undefined, opacity: c.opacity, zIndex: rang + 1, cursor: editable && !c.locked ? 'grab' : 'default', userSelect: 'none' }}>
                        <ContenuCalque c={c} doc={present} apercu={c.kind === 'image' || c.kind === 'logo' ? apercus[c.assetId] ?? null : null} />
                        {selection === c.id && <i className="sel" style={{ borderRadius: 0 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              </ZoneZoom>
            ) : (
              <div className="tile" style={{ display: 'grid', gap: 10, maxWidth: 420 }} data-etat="document-vide">
                <strong>Ce projet n’a pas encore de document image</strong>
                <p className="muted" style={{ fontSize: '12.5px' }}>
                  {editable ? 'Choisis un format ci-dessus pour créer le document à calques. Rien n’est généré : le document part vide, tu y poses ensuite textes, formes et médias du projet.' : 'Ton rôle permet de consulter les projets, pas d’en créer le document.'}
                </p>
                <p className="faint" style={{ fontSize: '11.5px' }}>{props.formatPropose.depuisBrief ? `Format lu dans le brief : « ${props.formatPropose.texte} ».` : `Le brief ne précise pas de format · ${FORMATS_DOCUMENT[props.formatPropose.format].libelle} proposé par défaut.`}</p>
                {editable && produit && (
                  <button type="button" className="chip" aria-pressed={avecProduit} onClick={() => setAvecProduit((v) => !v)}>Poser la photo produit, centrée, à {Math.round(PART_PRODUIT_INITIALE * 100)} % de la largeur</button>
                )}
                {editable && <button className="btn pri" type="button" disabled={enCours} onClick={() => void enregistrer(documentInitial(formatNouveau, { produit: avecProduit ? produit : null }), 'Création du document')}>{enCours ? 'Création…' : `Créer le document ${FORMATS_DOCUMENT[formatNouveau].libelle}`}</button>}
              </div>
            )}
          </div>
          <p className="faint" style={{ fontSize: '11.5px' }}>{calque?.locked ? 'Calque verrouillé : déverrouille-le pour le modifier.' : present ? `Calque sélectionné encadré · glisse-le ou utilise les flèches (Maj : 10 px).${telephone ? '' : ' Zoom · Ctrl + molette autour du pointeur, Ctrl+ et Ctrl− par paliers, Ctrl+0 ajuste · la molette seule déplace la vue.'}` : `Formats proposés : ${ORDRE_FORMATS.map((f) => FORMATS_DOCUMENT[f].libelle).join(', ')}.`}</p>
        </div>

        {!telephone && <aside className="tile insp">
          {inspecteur}
        </aside>}
      </div>

      {telephone && panneau === 'calques' && (
        <PanneauPleinEcran titre="Calques" nom="calques" onFermer={() => setPanneau(null)}>
          <div className="layers">{listeCalques}</div>
        </PanneauPleinEcran>
      )}
      {telephone && panneau === 'proprietes' && calque && (
        <PanneauPleinEcran titre={`Propriétés de « ${calque.name} »`} nom="proprietes" onFermer={() => setPanneau(null)}>
          <div className="insp">{inspecteur}</div>
          {editable && <GestesCalque calque={calque} operer={operer} retire={(suivant) => { setSelection(suivant); setPanneau(null); }} ordre={pile.map((c) => c.id).reverse()} />}
        </PanneauPleinEcran>
      )}

      {present && editable && (
        <section className="tile sec" aria-label="Gestes du calque">
          <div className="sech" style={{ margin: 0 }}><h2>Gestes du calque</h2><span className="faint" style={{ fontSize: '12.5px' }}>Chaque geste est annulable · rien n’est généré ni facturé</span></div>
          <div className="kc" style={{ marginTop: 10 }}>
            <button className="chip" type="button" onClick={() => operer((d) => ajouterTexte(d))}><Ic n="text" />Ajouter un texte</button>
            <button className="chip" type="button" onClick={() => operer((d) => ajouterForme(d))}><Ic n="spark" />Ajouter une forme</button>
            <button className="chip" type="button" aria-pressed={mediasOuverts} disabled={medias.length === 0} title={medias.length ? undefined : 'Aucun média du projet à poser'} onClick={() => setMediasOuverts((v) => !v)}><Ic n="img" />Média du projet</button>
            <button className="chip" type="button" aria-pressed={versions.etat !== 'ferme'} onClick={() => void ouvrirVersions()}><Ic n="loop" />Versions</button>
          </div>
          {mediasOuverts && (
            <div className="grid3" style={{ marginTop: 12 }}>
              {medias.map((m) => (
                <button key={m.assetId} type="button" className="prow" style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => { operer((d) => ajouterMedia(d, { kind: 'image', assetId: m.assetId, sourceWidth: m.width, sourceHeight: m.height, nom: m.nom })); setMediasOuverts(false); }}>
                  {apercus[m.assetId] && <img src={apercus[m.assetId]} alt="" />}
                  <span className="t"><strong style={{ fontSize: '12.5px' }}>{m.nom}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{m.width} × {m.height} px</small></span>
                </button>
              ))}
            </div>
          )}
          {calque && <GestesCalque calque={calque} operer={operer} retire={(suivant) => setSelection(suivant)} ordre={pile.map((c) => c.id).reverse()} />}
          {versions.etat !== 'ferme' && (
            <div className="mtable" style={{ marginTop: 12 }}>
              {versions.etat === 'chargement' && <p className="faint" style={{ fontSize: '12.5px' }}>Lecture des versions…</p>}
              {versions.etat === 'erreur' && <Message ton="err">{versions.message}</Message>}
              {versions.liste.map((v) => {
                const decision = decisionRestauration({ editable, modifie, enCours, conflit: conflit !== null, estCourante: v.id === base.id || v.courante });
                return (
                  <div key={v.id} className="mrow" style={{ gridTemplateColumns: '1fr 1.6fr auto' }}>
                    <strong>Version {v.n}{v.courante ? ' · courante' : ''}</strong>
                    <span className="faint">{new Date(v.creeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · {v.auteur} · {v.raison.replace(/^Éditeur de calques · /, '')}</span>
                    <button className="btn sm" type="button" disabled={!decision.permis} title={decision.permis ? annonceRestauration(v.n, base.n) : decision.raison ?? undefined} onClick={() => void restaurer(v)}>Restaurer</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </Vue>
  );
}

function ContenuCalque({ c, doc, apercu }: { c: CalqueStudio; doc: DocumentStudio; apercu: string | null }) {
  if (c.kind === 'text') {
    const p = policeEditeur(c.fontId);
    return (
      <div style={{ width: '100%', height: '100%', color: c.color, textAlign: c.align, lineHeight: c.lineHeight, fontFamily: p ? `'${FAMILLE}', 'Liberation Sans', Arial, sans-serif` : 'Arial, sans-serif', fontWeight: p?.poids ?? 400, fontSize: `${(c.fontSizePx / doc.width) * 100}cqw`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontKerning: 'none' }}>{c.text}</div>
    );
  }
  if (c.kind === 'shape') return <div aria-hidden style={{ width: '100%', height: '100%', background: c.fill, borderRadius: c.shape === 'ellipse' ? '50%' : 0 }} />;
  if (apercu) return <img src={apercu} alt={c.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />;
  return <div style={{ width: '100%', height: '100%', display: 'grid', placeContent: 'center', textAlign: 'center', fontSize: 'max(10px, 2.4cqw)' }}>{c.name} · aperçu indisponible</div>;
}

const ALIGNEMENTS: ReadonlyArray<[ModeAlignement, string]> = [['gauche', 'Gauche'], ['centre-horizontal', 'Centre'], ['droite', 'Droite'], ['haut', 'Haut'], ['centre-vertical', 'Milieu'], ['bas', 'Bas']];
const ORDRES: ReadonlyArray<[SensOrdre, string]> = [['premier-plan', 'Premier plan'], ['monter', 'Monter'], ['descendre', 'Descendre'], ['arriere-plan', 'Arrière-plan']];

function GestesCalque({ calque, operer, retire, ordre }: { calque: CalqueStudio; operer: (f: (d: DocumentStudio) => ResultatOperation) => void; retire: (suivant: string | null) => void; ordre: string[] }) {
  const [nom, setNom] = useState(calque.name);
  const [geo, setGeo] = useState({ x: calque.x, y: calque.y, width: calque.width, height: calque.height });
  useEffect(() => { setNom(calque.name); setGeo({ x: calque.x, y: calque.y, width: calque.width, height: calque.height }); }, [calque]);
  const id = calque.id;
  const champ = (cle: keyof typeof geo, libelle: string) => (
    <label className="field" key={cle}>{libelle}
      <input type="number" value={geo[cle]} disabled={calque.locked} onChange={(e) => setGeo((g) => ({ ...g, [cle]: Number(e.target.value) }))}
        onBlur={() => { if (geo[cle] !== calque[cle]) operer((d) => transformerCalque(d, id, { [cle]: geo[cle] })); }} />
    </label>
  );
  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      <div className="grid3">
        <label className="field">Nom du calque<input value={nom} onChange={(e) => setNom(e.target.value)} onBlur={() => { if (nom !== calque.name) operer((d) => renommerCalque(d, id, nom)); }} /></label>
        {champ('x', 'Position X (px)')}
        {champ('y', 'Position Y (px)')}
        {champ('width', 'Largeur (px)')}
        {champ('height', 'Hauteur (px)')}
        <label className="field">Opacité<input type="range" min={0} max={100} value={Math.round(calque.opacity * 100)} disabled={calque.locked} onChange={(e) => operer((d) => transformerCalque(d, id, { opacity: Number(e.target.value) / 100 }))} /></label>
      </div>
      <div className="kc">
        <span className="lbl">Aligner</span>
        {ALIGNEMENTS.map(([m, t]) => <button key={m} className="chip" type="button" disabled={calque.locked} onClick={() => operer((d) => alignerCalque(d, id, m))}>{t}</button>)}
      </div>
      <div className="kc">
        <span className="lbl">Ordre</span>
        {ORDRES.map(([s, t]) => <button key={s} className="chip" type="button" onClick={() => operer((d) => reordonnerCalque(d, id, s))}>{t}</button>)}
      </div>
      <div className="kc">
        <button className="chip" type="button" aria-pressed={!calque.visible} onClick={() => operer((d) => definirVisibilite(d, id, !calque.visible))}><Ic n="eye" />{calque.visible ? 'Masquer' : 'Afficher'}</button>
        <button className="chip" type="button" aria-pressed={calque.locked} onClick={() => operer((d) => definirVerrou(d, id, !calque.locked))}><Ic n="lock" />{calque.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
        <button className="chip" type="button" onClick={() => operer((d) => dupliquerCalque(d, id))}><Ic n="copy" />Dupliquer</button>
        <button className="chip" type="button" disabled={calque.locked} onClick={() => { const suivant = calqueApresRetrait(ordre, id); operer((d) => supprimerCalque(d, id)); retire(suivant); }}><Ic n="x" />Supprimer</button>
      </div>
    </div>
  );
}

/**
 * La zone de travail ZOOMABLE (portée de l'éditeur V5 · `ZoneTravail`) · le
 * document dans une boîte défilante et sa barre (− · valeur · + · Ajuster),
 * dans le `#art` de la maquette. − et + zooment par paliers autour du centre,
 * Ctrl/⌘ + molette autour du pointeur, « Ajuster » cadre le document entier,
 * la valeur ramène à 100 %. Avant la mesure (rendu serveur), le document garde
 * la taille de la maquette. Rien ne touche le document ni l'historique.
 */
function ZoneZoom({ zoom, hauteur, children }: { zoom: ReturnType<typeof useZoomEditeur>; hauteur: string; children: ReactNode }) {
  const { zoom: z, disposition: d, mode } = zoom;
  const mesure = z !== null;
  const valeur = mesure ? libelleZoom(z) : 'Ajusté';
  return (
    <>
      <div className="seg" role="toolbar" aria-label="Affichage du document" data-barre="zoom" style={{ marginBottom: 10 }}>
        <button type="button" data-zoom-action="moins" aria-label="Zoom arrière" aria-keyshortcuts="Control+- Meta+-" title="Zoom arrière (Ctrl −)" disabled={!mesure || zoom.auMin} onClick={() => zoom.agir('moins')}>−</button>
        <button type="button" data-zoom-action="reelle" aria-label={`Zoom ${valeur} · revenir à la taille réelle (100 %)`} title="Taille réelle (100 %)" disabled={!mesure} onClick={() => zoom.agir('reelle')}><span className="num" data-zoom-valeur="">{valeur}</span></button>
        <button type="button" data-zoom-action="plus" aria-label="Zoom avant" aria-keyshortcuts="Control+= Meta+= Control++ Meta++" title="Zoom avant (Ctrl +)" disabled={!mesure || zoom.auMax} onClick={() => zoom.agir('plus')}>+</button>
        <button type="button" data-zoom-action="ajuster" aria-pressed={mode === 'ajuste'} aria-keyshortcuts="Control+0 Meta+0" title="Cadrer le document entier dans la zone (Ctrl 0)" onClick={() => zoom.agir('ajuster')}>Ajuster</button>
      </div>
      <div ref={zoom.refZone} data-zone-travail="" data-zoom={mesure ? String(Math.round(z * 1000) / 1000) : 'css'} data-mode-zoom={mode}
        style={{ position: 'relative', width: '100%', height: hauteur, overflow: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
        {d ? (
          <div style={{ position: 'relative', width: d.contenu.largeur, height: d.contenu.hauteur }}>
            <div style={{ position: 'absolute', left: d.origine.x, top: d.origine.y, width: d.document.largeur }}>{children}</div>
          </div>
        ) : (
          <div style={{ boxSizing: 'border-box', height: '100%', padding: MARGE_ZONE_EDITEUR, display: 'grid', placeItems: 'center' }}>{children}</div>
        )}
      </div>
    </>
  );
}
