'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KeyboardEventReact } from 'react';
import {
  CIBLE_TACTILE_MIN,
  ajouterForme, ajouterMedia, ajouterTexte, alignerCalque, annulerEtape, appliquerOperation, definirVerrou, definirVisibilite,
  documentInitial, dupliquerCalque, enregistrerEtape, historiqueInitial, impactEdition, memeValeur, modifierRemplissage,
  modifierTexte, patchDocument, prochainAnnuler, prochainRetablir, reappliquerModifications, redimensionnerSelonDocument,
  renommerCalque, reordonnerCalque, retablirEtape, statutEnregistrement, supprimerCalque, transformerCalque,
  type ContenuVersion, type DocumentStudio, type ErreurStudio, type FormatDocument, type FormatPropose,
  type HistoriqueCalques, type ProduitInitial, type ResultatOperation,
} from '@tiktrends/core';
import { enregistrerDocument } from '../../../app/actions/studios/projets';
import { relireDocumentEditeur } from '../../../lib/studios/editeur/actions';
import type { MediaEditeur } from '../../../lib/studios/editeur/types';
import { Icon } from '../../Icon';
import { Portail } from '../../Portail';
import { useIsMobile } from '../../useIsMobile';
import { usePiegeFocus } from '../../use-piege-focus';
import { h1 } from '../../ui';
import { DialogueConflit, type EtatConflit } from './DialogueConflit';
import { DialogueMedias } from './DialogueMedias';
import { DocumentVide } from './DocumentVide';
import { PanneauCalques } from './PanneauCalques';
import { PanneauProprietes, type ActionsProprietes } from './PanneauProprietes';
import { SurfaceDocument } from './SurfaceDocument';
import {
  effacerSauvegardeLocale, ecrireSauvegardeLocale, lireSauvegardeLocale, type SauvegardeLocale,
} from './sauvegarde-locale';
import { bouton, boutonInactif, boutonPrimaire, COULEUR_ETAT, legende, panneau } from './styles';

/**
 * Éditeur de calques du document image d'un projet (cahier §4.4 points 8 et
 * 10, §4.6, §10, §11.1). Non destructif et SANS génération : chaque geste
 * passe par une opération pure du noyau (`@tiktrends/core`, calques), qui rend
 * un document validé ; l'historique garde les documents ; « Enregistrer »
 * envoie le patch base → présent à `enregistrerDocument` (version immuable,
 * 409 sans écrasement). Aucune ligne de devis, de job ni de dépense.
 */

export interface PropsEditeur {
  projet: { id: string; titre: string; marque: string };
  version: { id: string; n: number };
  contenu: ContenuVersion;
  document: DocumentStudio | null;
  formatPropose: FormatPropose;
  produit: ProduitInitial | null;
  medias: MediaEditeur[];
  /** Aperçus des médias par identifiant · fournis par la page (route média L5-A). */
  apercus: Record<string, string>;
  peutEnregistrer: boolean;
}

interface Base { id: string; n: number; document: DocumentStudio | null }

const masque: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

export function EditeurCalques(props: PropsEditeur) {
  const { projet, contenu, formatPropose, produit, medias, apercus, peutEnregistrer } = props;
  const editable = peutEnregistrer;
  const mobile = useIsMobile();

  const [base, setBase] = useState<Base>({ id: props.version.id, n: props.version.n, document: props.document });
  const [h, setH] = useState<HistoriqueCalques | null>(props.document ? historiqueInitial(props.document) : null);
  const [selection, setSelection] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId: string } | null>(null);
  const [conflit, setConflit] = useState<EtatConflit | null>(null);
  const [conflitOuvert, setConflitOuvert] = useState(false);
  const [mediasOuvert, setMediasOuvert] = useState(false);
  const [annonce, setAnnonce] = useState('');
  const [vue, setVue] = useState<'calques' | 'apercu'>('calques');
  const [proprietesMobile, setProprietesMobile] = useState(false);
  const [secours, setSecours] = useState<SauvegardeLocale | null>(null);
  const [demandeEnregistrement, setDemandeEnregistrement] = useState(0);

  const present = h?.present ?? null;
  const calque = present && selection ? present.layers[selection] ?? null : null;
  const statut = statutEnregistrement({ base: base.document, present, enCours, conflit: conflit !== null, erreur: erreur !== null });
  const modifie = statut.etat === 'modifie' || statut.etat === 'erreur';
  const impact = present && modifie ? impactEdition({ ...contenu, document: base.document }, present) : null;
  const libelleAnnuler = h ? prochainAnnuler(h) : null;
  const libelleRetablir = h ? prochainRetablir(h) : null;

  /* ─────────────────────────── Copie de secours ─────────────────────────── */

  useEffect(() => {
    const s = lireSauvegardeLocale(projet.id);
    if (s && !memeValeur(s.document, props.document)) setSecours(s);
    // Lecture au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!present || !editable || secours) return;
    if (base.document && memeValeur(present, base.document)) return;
    const t = setTimeout(() => {
      ecrireSauvegardeLocale(projet.id, { baseVersionId: base.id, baseN: base.n, base: base.document, document: present });
    }, 600);
    return () => clearTimeout(t);
  }, [present, base, editable, secours, projet.id]);

  const reappSecours = secours && secours.baseVersionId !== base.id ? reappliquerModifications(secours.base, secours.document, base.document) : null;

  const restaurerSecours = () => {
    if (!secours) return;
    const doc = secours.baseVersionId === base.id ? secours.document : reappSecours?.ok ? reappSecours.document : null;
    if (!doc) return;
    setH(h ? enregistrerEtape(h, doc, 'Restaurer la copie de secours') : historiqueInitial(doc));
    setSecours(null);
    setAnnonce('Copie de secours restaurée · enregistre pour créer une version');
  };
  const ignorerSecours = () => { effacerSauvegardeLocale(projet.id); setSecours(null); };

  /* ─────────────────────────────── Gestes ───────────────────────────────── */

  const operer = (fn: (d: DocumentStudio) => ResultatOperation) => {
    if (!h || !editable) return;
    const r = fn(h.present);
    if (!r.ok) { setRefus(r.message); setAnnonce(r.message); return; }
    setRefus(null);
    if (r.changes.length === 0) return;
    setH(appliquerOperation(h, r));
    setSelection(r.calqueId);
    setErreur(null);
    setAnnonce(r.libelle);
  };

  const annuler = () => {
    if (!h || !libelleAnnuler) return;
    setH(annulerEtape(h));
    setRefus(null);
    setAnnonce(`Annulé · ${libelleAnnuler}`);
  };
  const retablir = () => {
    if (!h || !libelleRetablir) return;
    setH(retablirEtape(h));
    setRefus(null);
    setAnnonce(`Rétabli · ${libelleRetablir}`);
  };

  /* ───────────────────────────── Enregistrer ────────────────────────────── */

  const ouvrirConflit = async (r: ErreurStudio, mien: DocumentStudio) => {
    const etat: EtatConflit = {
      differences: r.conflit?.differences ?? [], versionCouranteId: r.conflit?.versionCouranteId ?? '',
      courant: null, reapplication: null, erreurRelecture: null,
    };
    setConflit(etat);
    setConflitOuvert(true);
    // Mes modifications restent sur l'appareil, quoi qu'on choisisse ensuite.
    ecrireSauvegardeLocale(projet.id, { baseVersionId: base.id, baseN: base.n, base: base.document, document: mien });
    let rel: Awaited<ReturnType<typeof relireDocumentEditeur>> | null = null;
    try { rel = await relireDocumentEditeur(projet.id); } catch { rel = null; }
    if (!rel || !rel.ok) {
      setConflit({ ...etat, erreurRelecture: rel ? `${rel.message} (identifiant support : ${rel.traceId})` : 'La version courante n’a pas pu être relue · vérifie ta connexion puis réessaie.' });
      return;
    }
    setConflit({ ...etat, courant: { version: rel.version, document: rel.document }, reapplication: reappliquerModifications(base.document, mien, rel.document) });
  };

  const enregistrer = async (doc: DocumentStudio | null = present, raison = libelleAnnuler ?? 'Création du document') => {
    if (!doc || !editable || enCours || conflit) return;
    const changes = patchDocument(base.document, doc, `Éditeur de calques · ${raison}`);
    if (changes.length === 0) return;
    setEnCours(true);
    setErreur(null);
    let r: Awaited<ReturnType<typeof enregistrerDocument>> | null = null;
    try {
      r = await enregistrerDocument({ projectId: projet.id, baseVersionId: base.id, changes, raison: `Éditeur de calques · ${raison}` });
    } catch {
      r = null;
    }
    setEnCours(false);
    if (!r) {
      setErreur({ message: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie. Tes modifications restent à l’écran et sur cet appareil.', traceId: '' });
      return;
    }
    if (r.ok) {
      setBase({ id: r.version.id, n: r.version.n, document: doc });
      if (!h) setH(historiqueInitial(doc));
      effacerSauvegardeLocale(projet.id);
      setSecours(null);
      setAnnonce(r.inchange ? 'Aucun changement à enregistrer' : `Enregistré · version ${r.version.n}`);
      return;
    }
    if (r.code === 'VERSION_CONFLICT') { void ouvrirConflit(r, doc); return; }
    setErreur({ message: r.message, traceId: r.traceId });
  };

  const recharger = () => {
    const c = conflit?.courant;
    if (!c) return;
    setBase({ id: c.version.id, n: c.version.n, document: c.document });
    setH(c.document ? historiqueInitial(c.document) : null);
    setConflit(null);
    setConflitOuvert(false);
    setSelection(null);
    setSecours(lireSauvegardeLocale(projet.id));
    setAnnonce(`Version ${c.version.n} rechargée`);
  };
  const reappliquer = () => {
    const c = conflit?.courant;
    const r = conflit?.reapplication;
    if (!c || !r?.ok) return;
    setBase({ id: c.version.id, n: c.version.n, document: c.document });
    setH(c.document ? enregistrerEtape(historiqueInitial(c.document), r.document, 'Réappliquer mes modifications') : historiqueInitial(r.document));
    setConflit(null);
    setConflitOuvert(false);
    setAnnonce(`Version ${c.version.n} rechargée · tes modifications sont réappliquées, enregistre pour les garder`);
  };

  const creer = (format: FormatDocument, avecProduit: boolean) => {
    void enregistrer(documentInitial(format, { produit: avecProduit ? produit : null }), 'Création du document');
  };

  /* ───────────────────────────── Raccourcis ─────────────────────────────── */

  const derniers = useRef({ annuler, retablir, enregistrer, bloque: false });
  derniers.current = { annuler, retablir, enregistrer, bloque: conflitOuvert || mediasOuvert };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || derniers.current.bloque) return;
      const k = e.key.toLowerCase();
      const cible = e.target as HTMLElement | null;
      const dansChamp = !!cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT' || cible.isContentEditable);
      if (k === 's') {
        e.preventDefault();
        // Quitter le champ applique sa saisie AVANT l'enregistrement (rendu suivant).
        if (dansChamp) cible.blur();
        setDemandeEnregistrement((n) => n + 1);
        return;
      }
      if (dansChamp) return; // annuler natif du champ
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); derniers.current.annuler(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); derniers.current.retablir(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (demandeEnregistrement > 0) void derniers.current.enregistrer();
  }, [demandeEnregistrement]);

  const clavierSurface = (e: KeyboardEventReact<HTMLDivElement>) => {
    if (e.key === 'Escape') { setSelection(null); return; }
    const pas = e.shiftKey ? 10 : 1;
    const d = ({ ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] } as Record<string, [number, number]>)[e.key];
    if (!d || !calque || !editable) return;
    e.preventDefault();
    operer((doc) => transformerCalque(doc, calque.id, { x: calque.x + d[0], y: calque.y + d[1] }));
  };

  /* ───────────────────────────── Propriétés ─────────────────────────────── */

  const actions: ActionsProprietes = {
    renommer: (nom) => calque && operer((d) => renommerCalque(d, calque.id, nom)),
    transformer: (t) => calque && operer((d) => transformerCalque(d, calque.id, t)),
    partLargeur: (p) => calque && operer((d) => redimensionnerSelonDocument(d, calque.id, p)),
    aligner: (m) => calque && operer((d) => alignerCalque(d, calque.id, m)),
    ordonner: (s) => calque && operer((d) => reordonnerCalque(d, calque.id, s)),
    texte: (m) => calque && operer((d) => modifierTexte(d, calque.id, m)),
    remplissage: (f) => calque && operer((d) => modifierRemplissage(d, calque.id, f)),
    visibilite: (v) => calque && operer((d) => definirVisibilite(d, calque.id, v)),
    verrou: (l) => calque && operer((d) => definirVerrou(d, calque.id, l)),
    dupliquer: () => calque && operer((d) => dupliquerCalque(d, calque.id)),
    supprimer: () => { if (calque) { operer((d) => supprimerCalque(d, calque.id)); setProprietesMobile(false); } },
  };

  const fermerProprietesMobile = () => setProprietesMobile(false);
  const refPanneauMobile = useRef<HTMLDivElement>(null);
  usePiegeFocus(refPanneauMobile, { actif: mobile && proprietesMobile && calque !== null, onFermer: fermerProprietesMobile });

  /* ─────────────────────────────── Rendu ────────────────────────────────── */

  const barre = (
    <header style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
      <Link href={`/studio/projets/${projet.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
        ‹ {projet.titre}
      </Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={h1}>Éditer l’image</h1>
          <p style={{ ...legende, marginTop: 4 }}>
            {projet.marque ? `${projet.marque} · ` : ''}version {base.n}{present ? ` · ${present.width} × ${present.height} px` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span
            role="status"
            data-statut={statut.etat}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: COULEUR_ETAT[statut.etat], minHeight: CIBLE_TACTILE_MIN }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: COULEUR_ETAT[statut.etat] }} />
            {statut.libelle}
          </span>
          {present && editable && (
            <>
              {/* `aria-disabled`, jamais `disabled` · un bouton désactivé PERD le focus (Chromium le rend à <body>) :
                  après le dernier « Annuler », ou pendant un enregistrement qui finit en 409, le clavier repartait en haut de page. */}
              <button type="button" onClick={annuler} aria-disabled={!libelleAnnuler} aria-keyshortcuts="Control+Z Meta+Z"
                title={libelleAnnuler ? `Annuler · ${libelleAnnuler} (Ctrl+Z)` : 'Rien à annuler'} data-action="annuler"
                style={{ ...bouton, ...(!libelleAnnuler ? boutonInactif : {}) }}>Annuler</button>
              <button type="button" onClick={retablir} aria-disabled={!libelleRetablir} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                title={libelleRetablir ? `Rétablir · ${libelleRetablir} (Ctrl+Maj+Z)` : 'Rien à rétablir'} data-action="retablir"
                style={{ ...bouton, ...(!libelleRetablir ? boutonInactif : {}) }}>Rétablir</button>
              <button type="button" onClick={() => void enregistrer()} aria-disabled={!modifie || enCours || conflit !== null} aria-keyshortcuts="Control+S Meta+S"
                data-action="enregistrer" style={{ ...boutonPrimaire, ...(!modifie || enCours || conflit !== null ? boutonInactif : {}) }}>
                <Icon name="save" size={15} />{enCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {conflit && !conflitOuvert && (
                <button type="button" onClick={() => setConflitOuvert(true)} style={{ ...bouton, color: 'var(--err)' }}>Voir le conflit</button>
              )}
            </>
          )}
        </div>
      </div>
      {present && editable && !mobile && (
        <p style={legende}>Raccourcis · Ctrl+Z annuler · Ctrl+Maj+Z rétablir · Ctrl+S enregistrer · flèches sur l’aperçu pour déplacer le calque choisi (Maj : 10 px). Chaque geste a aussi son bouton.</p>
      )}
    </header>
  );

  const bandeaux = (
    <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
      {!editable && (
        <p data-etat="lecture-seule" style={{ ...panneau, ...legende, color: 'var(--ink-2)' }}>
          <Icon name="lock" size={13} /> Lecture seule · ton rôle permet de consulter ce document, pas de le modifier.
        </p>
      )}
      {erreur && (
        <div role="alert" data-etat="erreur" style={{ ...panneau, display: 'grid', gap: 8, borderColor: 'var(--err)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}>{erreur.message}</p>
          {erreur.traceId && <p style={legende}>Identifiant support : {erreur.traceId}</p>}
          <div><button type="button" onClick={() => void enregistrer()} style={bouton}>Réessayer</button></div>
        </div>
      )}
      {secours && editable && (
        <div data-etat="copie-secours" style={{ ...panneau, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}>
            Une copie de secours de cet appareil contient des modifications non enregistrées
            {secours.baseVersionId === base.id ? '' : `, faites sur la version ${secours.baseN}`}
            {' '}({new Date(secours.enregistreeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}).
          </p>
          {reappSecours && !reappSecours.ok && (
            <p style={legende}>Elles touchent les mêmes éléments que la version courante · les restaurer en écraserait une partie, elles ne peuvent donc pas être restaurées.</p>
          )}
          <p style={legende}>Cette copie vit dans ce navigateur seulement · elle ne passe pas d’un appareil à l’autre.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(!reappSecours || reappSecours.ok) && <button type="button" onClick={restaurerSecours} style={boutonPrimaire}>Restaurer la copie</button>}
            <button type="button" onClick={ignorerSecours} style={bouton}>Ignorer et effacer la copie</button>
          </div>
        </div>
      )}
    </div>
  );

  const piedSurface = present && (
    <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
      {impact && (
        <p data-impact style={legende}>
          {impact.generations.length === 0
            ? 'Aucune génération d’image · ces modifications ne demandent qu’une recomposition du visuel.'
            : `Attention · ${impact.generations.length} génération(s) seraient nécessaires.`}
        </p>
      )}
      {modifie && editable && <p style={legende}>Copie de secours sur cet appareil seulement · enregistre pour créer une version du projet.</p>}
    </div>
  );

  const surface = present && (
    <SurfaceDocument
      doc={present}
      selection={selection}
      apercus={apercus}
      editable={editable}
      onSelect={setSelection}
      onDeplacer={(id, x, y) => operer((d) => transformerCalque(d, id, { x, y }))}
      onClavier={clavierSurface}
      hauteurMax={mobile ? '60vh' : '72vh'}
    />
  );

  const calques = present && (
    <PanneauCalques
      doc={present}
      selection={selection}
      editable={editable}
      onChoisir={(id) => { setSelection(id); setRefus(null); if (mobile) setProprietesMobile(true); }}
      onVisibilite={(id, v) => operer((d) => definirVisibilite(d, id, v))}
      onVerrou={(id, l) => operer((d) => definirVerrou(d, id, l))}
      onAjouterTexte={() => operer((d) => ajouterTexte(d))}
      onAjouterForme={(f) => operer((d) => ajouterForme(d, f))}
      onAjouterMedia={() => setMediasOuvert(true)}
    />
  );

  return (
    <div data-editeur="calques" data-mobile={mobile ? 'oui' : 'non'}>
      <p aria-live="polite" style={masque}>{annonce}</p>
      {barre}
      {bandeaux}

      {!present ? (
        <DocumentVide formatPropose={formatPropose} produitDisponible={produit !== null} peutEnregistrer={editable} enCours={enCours} onCreer={creer} />
      ) : mobile ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div role="tablist" aria-label="Vue de l’éditeur" style={{ display: 'flex', gap: 6 }}>
            {(['calques', 'apercu'] as const).map((v) => (
              <button key={v} type="button" role="tab" id={`onglet-${v}`} aria-selected={vue === v} aria-controls={`vue-${v}`} onClick={() => setVue(v)}
                style={{ ...bouton, flex: 1, ...(vue === v ? { borderColor: 'var(--accent-strong)', color: 'var(--accent-strong)' } : {}) }}>
                {v === 'calques' ? 'Calques' : 'Aperçu'}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`vue-${vue}`} aria-labelledby={`onglet-${vue}`}>
            {vue === 'calques' ? calques : (
              <div>
                {surface}
                {calque && (
                  <button type="button" onClick={() => setProprietesMobile(true)} style={{ ...bouton, marginTop: 10, width: '100%' }}>
                    Propriétés de « {calque.name} »
                  </button>
                )}
              </div>
            )}
          </div>
          {piedSurface}
          {proprietesMobile && calque && (
            <Portail>
              <div
                ref={refPanneauMobile}
                role="dialog"
                aria-modal="true"
                aria-label={`Propriétés de ${calque.name}`}
                tabIndex={-1}
                data-panneau-mobile="proprietes"
                style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', overflowY: 'auto', padding: 12 }}
              >
                <PanneauProprietes c={calque} doc={present} editable={editable} actions={actions} onFermer={fermerProprietesMobile} refus={refus} />
              </div>
            </Portail>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 270px) minmax(0, 1fr) minmax(260px, 320px)', gap: 16, alignItems: 'start' }}>
          {calques}
          <div style={{ minWidth: 0 }}>
            {surface}
            {piedSurface}
          </div>
          <PanneauProprietes c={calque} doc={present} editable={editable} actions={actions} refus={refus} />
        </div>
      )}

      {editable && present && (
        <DialogueMedias
          ouvert={mediasOuvert}
          medias={medias}
          apercus={apercus}
          onFermer={() => setMediasOuvert(false)}
          onChoisir={(m, kind) => {
            setMediasOuvert(false);
            operer((d) => ajouterMedia(d, { kind, assetId: m.assetId, sourceWidth: m.width, sourceHeight: m.height, nom: m.nom }));
          }}
        />
      )}
      {conflit && (
        <DialogueConflit
          ouvert={conflitOuvert}
          conflit={conflit}
          baseN={base.n}
          docs={[present, base.document]}
          onFermer={() => setConflitOuvert(false)}
          onRecharger={recharger}
          onReappliquer={reappliquer}
        />
      )}
    </div>
  );
}
