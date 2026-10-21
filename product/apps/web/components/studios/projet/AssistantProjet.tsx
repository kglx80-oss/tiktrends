'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ETAPES_RAIL, etatRailProjet, etapeProjetPrecedente, etapeProjetSuivante, etapeRequiertProjet, etapeRail,
  etapeDisponible, saisieBriefVide, verifierCreationAssistant,
  OBJECTIFS_V5, PLATEFORMES_V5, LIBELLES_OBJECTIF_V5, LIBELLES_PLATEFORME_V5, LIBELLES_TYPE_PROJET,
  TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, OBJECTIF_MAX, CIBLE_TACTILE_MIN, CHEMIN_PROJETS,
  contenuVide, messageHorsLigneStudio, construireBriefV5, ALLOWED_PATHS_BRIEF,
  type EtapeAssistant, type EtatNouveauProjet, type TypeNouveauProjet, type SaisieBriefV5,
  type ObjectifType, type PlateformeV5, type ReferenceAdsmap, type ContenuVersion, type BriefCanonique,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { ajouterSourcesAuProjet, lireProjetDetail } from '../../../app/actions/studios/sources';
import type { DevisImageVue } from '../../../lib/studios/image/parcours';
import css from './AssistantProjet.module.css';
import { PhotoProduitAssistant } from './PhotoProduitAssistant';
import { PanneauAssistant } from './PanneauAssistant';
import { DepartDepuisSource } from './DepartDepuisSource';
import { lireDepartAssistant, type DepartAssistant, type OrigineDepartAssistant } from '../../../app/actions/studios/departs-assistant';
import { Icon } from '../../Icon';
import { lbl, surface } from '../../ui';
import { usePropositionsBrief } from './usePropositionsBrief';
import { EtapeStrategie } from './EtapeStrategie';
import { ConfirmationLotImages } from './ConfirmationLotImages';
import type { VueLotImages } from '../../../lib/studios/image/lot-images';
import { EtapeDirection } from './EtapeDirection';
import { EtapeLivrableAssistant } from './EtapeLivrableAssistant';
import { EtapeFormatDevis } from './EtapeFormatDevis';
import { EtapeConfirmation } from './EtapeConfirmation';
import { EtatCreationAssistant } from './EtatCreationAssistant';

/**
 * L'assistant de création V5 (coquille `studioWizard`) porté sur les VRAIES
 * actions. Quatre étapes câblées · départ, brief (écrit le brief structuré V5 à
 * la création), puis stratégie et direction, qui opèrent sur le projet CRÉÉ via
 * le vrai cycle de propositions (relecture avant application, aucune écriture
 * sans geste). Le devis confirmé précède la création suivie en lecture seule.
 *
 * La règle (quelles étapes, transitions, complétude, contenu du brief, forme
 * des changements) vit au noyau (`studios/ux/assistant-projet`) ; ce composant
 * n'en est que le rendu. Rien ici n'appelle de modèle ni ne dépense : seule la
 * proposition Jarvis (payante, sous plafond, annoncée) part d'une action serveur.
 */

const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const lien: CSSProperties = { color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN };

export interface ProjetCourant { id: string; versionCourante: { id: string; n: number } }

export interface ProprietesAssistantProjet {
  etat: EtatNouveauProjet;
  initial: { type: TypeNouveauProjet; titre: string; intention: string };
  /** Personas Adsmap de la marque active · lecture, portée. Vide = « Aucun persona » seul. */
  personas: ReferenceAdsmap[];
  onFermer?: () => void;
  onTitreChange?: (titre: string) => void;
  accessoiresBrief?: ReactNode;
  contexteInitial?: { depart: DepartAssistant | null; references: DepartAssistant[]; notes: string[]; retourVeille: { href: string } | null };
  produits?: { id: string; nom: string; photos: { assetId: string; apercu: string | null; position: number }[] }[];
}

export function AssistantProjet(p: ProprietesAssistantProjet) {
  const router = useRouter();
  const [etape, setEtape] = useState<EtapeAssistant>('start');
  const onTitreChange = p.onTitreChange;
  const [type, setType] = useState<TypeNouveauProjet>(p.initial.type);
  const titreEtape = etape === 'format' && type === 'video' ? 'Storyboard & devis' : etape === 'format' && type === 'text' ? 'Textes & devis' : { start: 'Que voulez-vous créer ?', brief: 'Le brief', strategie: 'La stratégie', direction: 'La direction', format: 'Formats & devis', confirm: 'Confirmer la génération', creation: 'Vos créations' }[etape];
  useEffect(() => { onTitreChange?.(titreEtape); }, [titreEtape, onTitreChange]);
  const [titre, setTitre] = useState(p.initial.titre);
  const [saisie, setSaisie] = useState<SaisieBriefV5>({ ...saisieBriefVide(), intention: p.initial.intention });
  const lectureNavigation = useRef(0);
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);
  const [incertain, setIncertain] = useState(false);
  const [photoOuverte, setPhotoOuverte] = useState(false);
  const [catalogue, setCatalogue] = useState(p.produits ?? []);
  const [panneau, setPanneau] = useState<OrigineDepartAssistant | null>(null);
  const [depart, setDepart] = useState<DepartAssistant | null>(p.contexteInitial?.depart ?? null);
  const [references, setReferences] = useState<DepartAssistant[]>(p.contexteInitial?.references ?? []);
  const [sourcesAffectees, setSourcesAffectees] = useState<string[]>([]);
  const [photoEpinglee, setPhotoEpinglee] = useState('');
  const [productId, setProductId] = useState('');
  const [photoId, setPhotoId] = useState('');
  const [projet, setProjet] = useState<ProjetCourant | null>(null);
  const [brief, setBrief] = useState<BriefCanonique | null>(null);
  // Lot 2c · le devis serveur réel, posé à l'étape format, confirmé à l'étape confirm.
  const [lot, setLot] = useState<VueLotImages | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [devis, setDevis] = useState<DevisImageVue | null>(null);

  if (p.etat.etat !== 'pret') {
    return (
      <section data-zone="assistant-projet" data-etat={p.etat.etat} style={{ ...surface, background: 'var(--surface)', padding: 20, display: 'grid', gap: 10, maxWidth: 720 }}>
        <p style={note}>{p.etat.message}{p.etat.etat === 'sans-marque' && <> <a href={p.etat.lien.href} style={lien}>{p.etat.lien.libelle}</a></>}</p>
        <a href={CHEMIN_PROJETS} style={lien}>Voir les projets</a>
      </section>
    );
  }
  const marque = p.etat.marque;
  const apercuProduitUrl = catalogue.find((p) => p.id === productId)?.photos.find((photo) => photo.assetId === photoId)?.apercu ?? undefined;
  const maj = (c: Partial<SaisieBriefV5>) => setSaisie((s) => ({ ...s, ...c }));

  async function relireProjet(): Promise<BriefCanonique | null> {
    if (!projet) return null;
    const sequence = ++lectureNavigation.current;
    try {
      const r = await lireProjetDetail({ projectId: projet.id });
      if (sequence !== lectureNavigation.current) return null;
      if (!r.ok || r.detail.briefIllisible || !r.detail.brief) {
        setErreur({ message: r.ok ? 'Le brief de cette version ne peut pas être relu.' : r.message });
        return null;
      }
      if (r.detail.version.id !== projet.versionCourante.id) { setDevis(null); setLot(null); }
      setBrief(r.detail.brief);
      setProjet({ id: projet.id, versionCourante: { id: r.detail.version.id, n: r.detail.version.n } });
      return r.detail.brief;
    } catch {
      if (sequence === lectureNavigation.current) setErreur({ message: 'Le projet n’a pas pu être relu. Réessaie avant de modifier son contenu.' });
      return null;
    }
  }
  async function rafraichir() { await relireProjet(); }

  async function creer(destination: EtapeAssistant | 'photo' | 'quitter' = 'strategie') {
    if (incertain || encours) return;
    const v = verifierCreationAssistant({ type, titre, saisie });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    if (destination !== 'photo' && productId && !photoId) { setErreur({ message: 'Choisis une photo du produit avant de continuer.' }); return; }
    setEncours(true);
    setErreur(null);
    const contenu: ContenuVersion = { ...contenuVide(), brief: v.brief as unknown as ContenuVersion['brief'] };
    try {
      if (depart?.origine === 'iteration') {
        const relu = await lireDepartAssistant('iteration', depart.id);
        if (!relu.ok) { setErreur({ message: relu.message }); setEncours(false); return; }
      }
      let courant = projet;
      if (!courant) {
        const r = await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre, contenu });
        if (!r.ok) { setEncours(false); setErreur({ message: r.message, traceId: r.traceId }); return; }
        courant = { id: r.projet.id, versionCourante: { id: r.version.id, n: r.version.n } };
        // Conserver immédiatement le projet : un refus d’épinglage ne doit pas le recréer.
        setProjet(courant);
        setBrief(v.brief);
      }
      if (projet && brief) {
        // Ne remplacer que les champs éditables du formulaire ; références, style,
        // composition, hypothèse et textes conservent leur version courante.
        const ancien = construireBriefV5(saisieDepuisBrief(brief));
        const champs = ['objective', 'audience', 'invariants', 'objectifType', 'plateformes', 'personaRef', 'angle', 'concept'] as const;
        const modifie = champs.filter((cle) => JSON.stringify(ancien[cle]) !== JSON.stringify(v.brief[cle]));
        if (modifie.length) {
          const suivant = { ...brief };
          for (const cle of modifie) {
            if (v.brief[cle] === undefined) delete (suivant as unknown as Record<string, unknown>)[cle];
            else (suivant as unknown as Record<string, unknown>)[cle] = v.brief[cle];
          }
          const { creerPropositionManuelle, appliquerProposition } = await import('../../../app/actions/studios/propositions');
          const proposition = await creerPropositionManuelle({ projectId: courant.id, baseVersionId: courant.versionCourante.id, cible: 'brief', changes: [{ op: 'replace', path: '/brief', newValue: suivant, reason: 'Modification du brief dans l’assistant' }], explication: 'Champs du brief relus et confirmés dans l’assistant', allowedPaths: ALLOWED_PATHS_BRIEF });
          if (!proposition.ok) { setErreur({ message: proposition.message, traceId: proposition.traceId }); setEncours(false); return; }
          if (proposition.statut !== 'proposee') { setErreur({ message: 'La modification du brief n’a pas été préparée.' }); setEncours(false); return; }
          const applique = await appliquerProposition({ proposalId: proposition.proposition.id, projectId: courant.id, baseVersionId: courant.versionCourante.id });
          if (!applique.ok) { setErreur({ message: applique.message, traceId: applique.traceId }); setEncours(false); return; }
          courant = { ...courant, versionCourante: applique.version };
          setProjet(courant);
          setBrief(suivant);
          setDevis(null); setLot(null);
        }
      }
      if (productId && photoId && photoEpinglee !== `${productId}:${photoId}`) {
        const { epinglerProduit } = await import('../../../app/actions/studios/produit');
        const epingle = await epinglerProduit({ projectId: courant.id, baseVersionId: courant.versionCourante.id, productId, photoId });
        if (!epingle.ok) { setErreur({ message: epingle.message, traceId: epingle.traceId }); setEncours(false); return; }
        courant = { ...courant, versionCourante: { id: epingle.version.id, n: epingle.version.n } };
        setProjet(courant);
        setPhotoEpinglee(`${productId}:${photoId}`);
        const relu = await lireProjetDetail({ projectId: courant.id });
        if (relu.ok && relu.detail.brief && !relu.detail.briefIllisible) setBrief(relu.detail.brief);
      }
      const nouvelles = references.filter((r) => !sourcesAffectees.includes(r.id));
      if (nouvelles.length) {
        const affecte = await ajouterSourcesAuProjet({ projectId: courant.id, sources: nouvelles.flatMap((r) => r.sources) });
        if (!affecte.ok) { setErreur({ message: affecte.message }); setEncours(false); return; }
        setSourcesAffectees((avant) => [...avant, ...nouvelles.map((r) => r.id)]);
      }
      setEncours(false);
      if (destination === 'photo') { setEtape('brief'); setPhotoOuverte(true); }
      else if (destination === 'quitter') p.onFermer?.();
      else setEtape(destination);
    } catch {
      setEncours(false);
      setIncertain(true);
      setErreur({ message: projet ? 'La réponse a été interrompue. Le résultat est inconnu : recharge le projet avant toute nouvelle modification.' : messageHorsLigneStudio('creation') });
    }
  }

  // Navigation du rail · avant création, start/brief seulement ; après, les
  // étapes qui opèrent sur le projet (le brief est verrouillé une fois écrit).
  const peutAller = (id: EtapeAssistant): boolean =>
    !encours && !incertain && (projet ? ((id !== 'creation' || !!jobId) && (id === 'brief' || (etapeRequiertProjet(id) && etapeDisponible(id)))) : (etatRailProjet(id, etape, brief) === 'done'));

  async function aller(id: EtapeAssistant) {
    if (encours || incertain || id === etape) return;
    if (etape === 'brief' && projet) { await creer(id); return; }
    const actuel = projet ? await relireProjet() : brief;
    if (projet && !actuel) return;
    if (id === 'brief' && actuel) setSaisie(saisieDepuisBrief(actuel));
    setEtape(id);
  }

  const ouvrirProjet = () => { if (projet) router.push(`/studio/projets/${projet.id}`); };

  return (
    <section data-zone="assistant-projet" data-etape={etape} className={`${css.wz} ${etape === 'start' ? css.nostep : ''}`}>
      {etape !== 'start' && <div inert={panneau !== null || photoOuverte} style={{ display: 'contents' }}><Rail etape={etape} brief={brief} peutAller={peutAller} onAller={aller} titre={titre} marque={marque.nom} type={type} /></div>}

      <div className={css.wzmain} inert={panneau !== null || photoOuverte}>
        {(!['format', 'confirm', 'creation'].includes(etape) || (etape === 'format' && (type === 'video' || type === 'text'))) && <div className={css.wzhead}>
          <span className={css.eyebrow}>{etape === 'start' ? 'Démarrage' : `Étape ${etape === 'brief' ? 1 : etape === 'strategie' ? 2 : etape === 'direction' ? 3 : etape === 'creation' ? 5 : 4} sur 5`}</span>
          <h2>{titreEtape}</h2>
          <p>{{ start: 'Un projet réunit le brief, les références, la direction, les créations et les exports.', brief: 'Décrivez l’objectif. Jarvis s’appuie sur ces éléments à chaque étape.', strategie: 'Jarvis relie votre audience à un désir, puis propose des angles. Rien n’est appliqué sans votre choix.', direction: 'Une proposition à partir de l’angle choisi. Modifiez ce que vous voulez avant de valider.', format: 'Choisissez le format. Le devis serveur correspond à vos paramètres.', confirm: 'Vérifiez les paramètres et le coût avant tout débit.', creation: 'Vos créations' }[etape]}</p>
        </div>
        }
        <div className={css.wzcontent}>
        {etape === 'start' && p.contexteInitial && <>
          {p.contexteInitial.notes.length > 0 && <div role="status">{p.contexteInitial.notes.map((message, i) => <p className={css.note} key={i}>{message}</p>)}</div>}
          {p.contexteInitial.retourVeille && <a href={p.contexteInitial.retourVeille.href} style={lien}>Retour à la Veille</a>}
        </>}
        {etape === 'start' && (
          <Depart marque={marque.nom} type={type} onType={setType} onContinuer={() => setEtape('brief')} depart={depart} onZero={() => { setDepart(null); setReferences([]); }} onSource={setPanneau} />
        )}
        {etape === 'brief' && (
          <Brief marque={marque.nom} type={type} titre={titre} onTitre={setTitre} saisie={saisie} maj={maj} personas={p.personas} titreVerrouille={!!projet} verrouille={incertain} accessoires={p.accessoiresBrief ?? <ProduitBrief produits={catalogue} produitEpingle={!!photoEpinglee} productId={productId} photoId={photoId} onProduit={(id) => { setProductId(id); setPhotoId(''); }} onPhoto={setPhotoId} references={references} onReferences={() => setPanneau('veille')} onImporter={() => void creer('photo')} occupe={encours || incertain} />} />
        )}
        {etape === 'strategie' && projet && brief && (
          <AssistantPostCreation etape="strategie" projet={projet} brief={brief} marqueId={marque.id} sources={references.flatMap((r) => r.sources)} apercuProduitUrl={apercuProduitUrl} onProjetChange={rafraichir} />
        )}
        {etape === 'direction' && projet && brief && (
          <AssistantPostCreation etape="direction" projet={projet} brief={brief} marqueId={marque.id} sources={references.flatMap((r) => r.sources)} apercuProduitUrl={apercuProduitUrl} onProjetChange={rafraichir} />
        )}
        {etape === 'format' && projet && (type === 'video' || type === 'text') && <EtapeLivrableAssistant projectId={projet.id} type={type} onRetour={() => void aller('direction')} />}
        {etape === 'format' && projet && brief && type !== 'video' && type !== 'text' && (
          <EtapeFormatDevis
            {...{ apercuProduitUrl }}
            projectId={projet.id} version={projet.versionCourante} brief={brief}
            onBriefChange={rafraichir}
            onDevisPret={(d) => { setLot(null); setDevis(d); setEtape('confirm'); }}
            onLotPret={(l) => { setDevis(null); setLot(l); setEtape('confirm'); }}
            onRetour={() => void aller('direction')}
          />
        )}
        {etape === 'confirm' && lot && <ConfirmationLotImages lot={lot} apercuProduitUrl={apercuProduitUrl} onModifier={() => {setLot(null);setEtape('format');}} onLance={(ids) => {setJobIds(ids);setJobId(ids[0] ?? null);setLot(null);setEtape('creation');}} />}
        {etape === 'confirm' && projet && devis && type !== 'video' && type !== 'text' && (
          <EtapeConfirmation
            projectId={projet.id}
            {...{ apercuProduitUrl }}
            devis={devis}
            onModifier={() => { setDevis(null); setEtape('format'); }}
            onLance={(job) => { setJobIds([job.id]); setJobId(job.id); setDevis(null); setEtape('creation'); }}
          />
        )}

        {etape === 'creation' && projet && jobId && <EtatCreationAssistant projectId={projet.id} jobId={jobId} jobIds={jobIds} onFermer={p.onFermer ?? ouvrirProjet} />}

        {erreur && <p role="alert" data-etat="erreur" style={{ margin: 0, color: 'var(--err-text)', fontSize: 13.5 }}>{erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}</p>}

        </div>
        {etape !== 'format' && etape !== 'confirm' && etape !== 'creation' && (
          <Pied
            etape={etape}
            encours={encours}
            incertain={incertain}
            aProjet={!!projet}
            onFermer={p.onFermer}
            onEnregistrer={etape === 'brief' ? () => void creer('quitter') : p.onFermer}
            onCreer={() => void creer()}
            onVersBrief={() => setEtape('brief')}
            onReculer={() => { const prec = etapeProjetPrecedente(etape); if (prec && peutAller(prec)) aller(prec); }}
            onAvancer={() => { const suiv = etapeProjetSuivante(etape); if (suiv) void aller(suiv); }}
          />
        )}
      </div>
      {photoOuverte && <PanneauAssistant titre="Ajouter une photo produit" onFermer={() => setPhotoOuverte(false)}><PhotoProduitAssistant projectId={projet?.id ?? null} productId={productId} onChoisie={(r) => {
        setProjet({ id: r.projectId, versionCourante: r.version }); setCatalogue(r.produits); setProductId(r.produit.id); setPhotoId(r.photo.assetId); setPhotoEpinglee(`${r.produit.id}:${r.photo.assetId}`); setDevis(null); setLot(null); void rafraichir(); setPhotoOuverte(false);
      }} /></PanneauAssistant>}
      {panneau && <DepartDepuisSource origine={panneau} onFermer={() => setPanneau(null)} onChoisir={(choix) => {
        if (etape === 'start') { setDepart(choix); setTitre(choix.titre); if (choix.intention) maj({ intention: choix.intention }); }
        if (choix.sources.length) setReferences((avant) => avant.some((r) => r.id === choix.id) ? avant : avant.length < 10 ? [...avant, choix] : avant);
        setPanneau(null);
      }} />}
    </section>
  );
}

/* ─────────────────── Sous-arbre post-création (propositions) ─────────────── */

function AssistantPostCreation({ etape, projet, brief, marqueId, sources, apercuProduitUrl, onProjetChange }: {
  etape: 'strategie' | 'direction';
  projet: ProjetCourant;
  brief: BriefCanonique;
  marqueId: string;
  sources: unknown[];
  apercuProduitUrl?: string;
  onProjetChange: () => void;
}) {
  const cycle = usePropositionsBrief(projet.id, projet.versionCourante);
  const onApplied = () => { void onProjetChange(); };
  // La création depuis zéro n'attache aucune source · les suggestions
  // d'hypothèses (Veille) restent honnêtement inactives (pas de bouton mort).
  return etape === 'strategie'
    ? <EtapeStrategie brief={brief} cycle={cycle} onApplied={onApplied} sources={sources} marqueId={marqueId} />
    : <EtapeDirection brief={brief} cycle={cycle} onApplied={onApplied} apercuProduitUrl={apercuProduitUrl} />;
}

/* ─────────────────────────────── Le pied ────────────────────────────────── */

function Pied({ etape, encours, incertain, aProjet, onFermer, onEnregistrer, onCreer, onVersBrief, onReculer, onAvancer }: {
  etape: EtapeAssistant; encours: boolean; incertain: boolean; aProjet: boolean;
  onFermer?: () => void;
  onEnregistrer?: () => void;
  onCreer: () => void; onVersBrief: () => void; onReculer: () => void; onAvancer: () => void;
}) {
  return (
    <>
      <footer className={css.wzfoot}>
        <div className={css.row}>
          {etape === 'start' && (onFermer ? <button type="button" onClick={onFermer}>Annuler</button> : <a href={CHEMIN_PROJETS} className={css.secondary}>Annuler</a>)}
          {etape === 'brief' && <button type="button" data-bouton="retour" onClick={onReculer} >‹ Retour</button>}
          {etape === 'direction' && <button type="button" data-bouton="retour-strategie" onClick={onReculer} >‹ Stratégie</button>}
          {etape === 'strategie' && <button type="button" data-bouton="retour-brief" onClick={onReculer}>‹ Retour</button>}
        </div>
        <div className={css.row}>
          {aProjet && onEnregistrer && <button type="button" disabled={encours || incertain} onClick={onEnregistrer}>Enregistrer et quitter</button>}
          {etape === 'start' && <button type="button" data-bouton="vers-brief" onClick={onVersBrief} className={css.primary}>Commencer le brief</button>}
          {etape === 'brief' && <button type="button" data-bouton="creer-projet" onClick={onCreer} disabled={encours || incertain} className={css.primary}>{encours ? 'Création…' : 'Continuer vers la stratégie'}</button>}
          {etape === 'strategie' && aProjet && <button type="button" data-bouton="vers-direction" onClick={onAvancer} className={css.primary}>Continuer vers la direction</button>}
          {etape === 'direction' && aProjet && <button type="button" data-bouton="vers-format" onClick={onAvancer} className={css.primary}>Continuer vers le format</button>}
        </div>
      </footer>
      {etape === 'brief' && <p style={{ ...note, fontSize: 12.5, margin: 0 }}>Gratuit · le brief est enregistré à la création, rien n’est généré tant que tu ne lances rien.</p>}

    </>
  );
}

/* ─────────────────────────────── Le rail ─────────────────────────────────── */

function Rail({ etape, brief, peutAller, onAller, titre, marque, type }: {
  etape: EtapeAssistant; brief: BriefCanonique | null; peutAller: (e: EtapeAssistant) => boolean; onAller: (e: EtapeAssistant) => void;
  titre: string; marque: string; type: TypeNouveauProjet;
}) {
  const courante = etapeRail(etape);
  const pictos = ["M6 3h9l4 4v14H6ZM14 3v5h5M9 13h6M9 17h4", "M4 6h4v4H4ZM16 4h4v4h-4ZM16 16h4v4h-4ZM8 8l8-2M8 9l8 9", "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 4 1 5-2a9 9 0 0 0-7-11ZM7.5 11h.01M10 7h.01M15 7.5h.01", "M4 5h7v14H4ZM14 5h6v6h-6ZM14 14h6v5h-6Z", "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"];
  return <nav data-zone="assistant-rail" aria-label="Étapes de l’assistant" className={css.wzrail}>
    <div className={css.wzbrand}><span className={css.eyebrow}>Nouveau projet</span><strong>{titre.trim() || 'Votre projet'}</strong><small>{marque} · {LIBELLES_TYPE_PROJET[type]}</small></div>
    <ol className={css.wzsteps}>{ETAPES_RAIL.map((def, i) => {
      const st = etatRailProjet(def.id, courante, brief);
      const contenu = <><span className={css.wzic}>{st === 'done' ? <Icon name="check" size={16} /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d={pictos[i]} /></svg>}</span><span>{def.libelle}</span></>;
      return <li key={def.id} className={st === 'current' ? css.current : st === 'done' ? css.done : undefined} data-rail-etape={def.id} data-etat={st} aria-current={st === 'current' ? 'step' : undefined} {...(st === 'bientot' ? { 'data-bientot': 'true', 'aria-label': `${def.libelle} · bientôt` } : {})}>
        {peutAller(def.id) && st !== 'current' ? <button type="button" data-aller={def.id} onClick={() => onAller(def.id)}>{contenu}</button> : <span className={css.wzstep}>{contenu}</span>}
      </li>;
    })}</ol>
    <div className={css.wzrecap}><dl><div><dt>Angle</dt><dd>{brief?.angle || 'À définir'}</dd></div><div><dt>Direction</dt><dd>{brief?.concept || 'À définir'}</dd></div></dl>
      <span className={css.wzsaved}>{brief ? <><Icon name="check" size={13} /> Brief enregistré</> : 'Brief non enregistré'}</span>
    </div>
  </nav>;
}

function Depart({ marque, type, onType, onContinuer, depart, onZero, onSource }: { depart: DepartAssistant | null; onZero: () => void; onSource: (origine: OrigineDepartAssistant) => void; marque: string; type: TypeNouveauProjet; onType: (t: TypeNouveauProjet) => void; onContinuer: () => void }) {
  const descriptions = { ads: 'Visuel + textes d’annonce, Meta et TikTok', image: 'Visuel produit ou lifestyle', video: 'Storyboard, voix, sous-titres, MP4', text: 'Accroches, texte principal, CTA' };
  return <div className={css.wzstart}>
    <div className={css.wzrow}><label className={css.field}><span>Marque</span><select value={marque} disabled aria-label="Marque active"><option>{marque}</option></select></label></div>
    <h3 className={css.wzlabel}>Livrable</h3>
    <div data-champ="type" role="radiogroup" aria-label="Livrable" className={`${css.wtiles} ${css.four}`}>
      {TYPES_NOUVEAU_PROJET.map((t) => <label key={t} className={css.wtile} onDoubleClick={onContinuer}>
        <input type="radio" name="livrable" data-type={t} checked={type === t} onChange={() => onType(t)} />
        <span className={css.wtileic}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d={{ ads: 'M4 4h16v16H4ZM4 15l5-5 4 4 3-3 4 4', image: 'M4 4h16v16H4ZM8.5 9.5h.01M20 16l-5-5-9 9', video: 'M3 6h13v12H3ZM16 10l5-3v10l-5-3', text: 'M5 6h14M5 10h14M5 14h9M5 18h6' }[t]} /></svg></span>
        <strong>{t === 'ads' ? 'Publicité' : LIBELLES_TYPE_PROJET[t]}</strong><small>{descriptions[t]}</small><span className={css.wtilecheck}><Icon name="check" size={13} /></span>
      </label>)}
    </div>
    <h3 className={css.wzlabel}>Point de départ</h3>
    <div className={`${css.wtiles} ${css.three}`}>
      <label className={css.wtile}><input type="radio" checked={!depart} onChange={onZero} name="depart" /><span className={css.wtileic}><Icon name="plus" size={22} /></span><strong>Partir de zéro</strong><small>Vous écrivez le brief, Jarvis aide</small><span className={css.wtilecheck}><Icon name="check" size={13} /></span></label>
      <button type="button" className={css.wtile} onClick={() => onSource('veille')} aria-pressed={depart?.origine === 'veille'}><span className={css.wtileic}><Icon name="search" size={22} /></span><strong>Depuis la Veille</strong><small>Ouvrez une annonce sauvegardée pour reprendre sa source et son analyse.</small></button>
      <button type="button" className={css.wtile} onClick={() => onSource('iteration')} aria-pressed={depart?.origine === 'iteration'}><span className={css.wtileic}><Icon name="refresh" size={22} /></span><strong>Itérer sur un test</strong><small>Ouvrez un test dans Adsmap pour reprendre son apprentissage.</small></button>
    </div>
  </div>;
}

/* ───────────────────────────── Étape brief ───────────────────────────────── */

function Brief({ titre, onTitre, saisie, maj, personas, accessoires, verrouille, titreVerrouille }: {
  marque: string; type: TypeNouveauProjet; titre: string; onTitre: (v: string) => void;
  saisie: SaisieBriefV5; maj: (c: Partial<SaisieBriefV5>) => void; personas: ReferenceAdsmap[]; accessoires?: ReactNode; verrouille: boolean; titreVerrouille: boolean;
}) {
  const togglePlateforme = (pf: PlateformeV5) => {
    const set = new Set(saisie.plateformes);
    if (set.has(pf)) set.delete(pf); else set.add(pf);
    maj({ plateformes: PLATEFORMES_V5.filter((x) => set.has(x)) });
  };
  return (
    <div data-zone="assistant-brief" className={css.wzgrid2}>
      <fieldset disabled={verrouille} className={css.briefFields}>
      <label className={css.field}>
        <span>Nom du projet</span>
        <input disabled={titreVerrouille} data-champ="titre" value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} onChange={(e) => onTitre(e.target.value)} className={css.control} />
      </label>

      <label className={css.field}>
        <span>Votre intention</span>
        <textarea data-champ="intention" value={saisie.intention} maxLength={OBJECTIF_MAX} rows={4} onChange={(e) => maj({ intention: e.target.value })} placeholder="Ce que ce projet doit produire ou vérifier"  />
      </label>

      <label className={css.field}>
        <span>Audience</span>
        <input data-champ="audience" value={saisie.audience} maxLength={2000} onChange={(e) => maj({ audience: e.target.value })} placeholder="À qui s’adresse cette publicité · facultatif" className={css.control} />
      </label>

      <fieldset data-champ="objectif-type" style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <legend style={lbl}>Objectif · facultatif</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {OBJECTIFS_V5.map((o: ObjectifType) => {
            const choisi = saisie.objectifType === o;
            return (
              <label key={o} data-objectif={o} className={css.pill}>
                <input type="radio" name="objectif-type" value={o} checked={choisi} onChange={() => maj({ objectifType: o })} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{LIBELLES_OBJECTIF_V5[o]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset data-champ="plateformes" style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <legend style={lbl}>Plateformes · facultatif</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PLATEFORMES_V5.map((pf: PlateformeV5) => {
            const coche = saisie.plateformes.includes(pf);
            return (
              <label key={pf} data-plateforme={pf} className={css.pill}>
                <input type="checkbox" checked={coche} onChange={() => togglePlateforme(pf)} />
                <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{LIBELLES_PLATEFORME_V5[pf]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className={css.field}>
        <span>Contraintes et mentions obligatoires · facultatif</span>
        <textarea data-champ="contraintes" value={saisie.contraintes} maxLength={OBJECTIF_MAX} rows={3} onChange={(e) => maj({ contraintes: e.target.value })} placeholder="Une par ligne · chacune devient un invariant du brief"  />
      </label>
      <details className={css.advanced}><summary>Persona, angle et concept · facultatifs</summary>
      <label className={css.field}>
        <span>Pour qui ? · persona facultatif</span>
        <select data-champ="persona" value={saisie.persona?.id ?? ''} onChange={(e) => maj({ persona: personas.find((x) => x.id === e.target.value) ?? null })} className={css.control}>
          <option value="">Aucun persona</option>
          {personas.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
        </select>
        {personas.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aucun persona Adsmap pour cette marque · tu peux en créer depuis la fiche marque.</span>}
      </label>

      <label className={css.field}>
        <span>Angle · facultatif</span>
        <input data-champ="angle" value={saisie.angle} maxLength={2000} onChange={(e) => maj({ angle: e.target.value })} placeholder="L’idée qui porte la publicité" className={css.control} />
      </label>

      <label className={css.field}>
        <span>Concept · facultatif</span>
        <input data-champ="concept" value={saisie.concept} maxLength={2000} onChange={(e) => maj({ concept: e.target.value })} placeholder="La traduction visuelle de l’angle" className={css.control} />
      </label>

      </details>

      </fieldset>
      <div className={css.wzcol}>
        {accessoires ?? <>
        <div className={css.wzproduct}><div className={css.emptyPreview}>Aucun produit sélectionné</div><div className={css.wzproductinfo}><strong>Produit</strong><small>Le produit et sa photo se sélectionnent dans le parcours produit du projet créé.</small></div></div>
        <h3 className={css.wzlabel}>Références</h3><p className={css.note}>Aucune référence associée à ce départ de zéro.</p>
        </>}
      </div>
    </div>
  );
}

function ProduitBrief({ produits, produitEpingle, productId, photoId, onProduit, onPhoto, references, onReferences, onImporter, occupe }: {
  onImporter: () => void; occupe: boolean; produitEpingle: boolean;
  references: DepartAssistant[]; onReferences: () => void;
  produits: NonNullable<ProprietesAssistantProjet['produits']>; productId: string; photoId: string;
  onProduit: (id: string) => void; onPhoto: (id: string) => void;
}) {
  const produit = produits.find((p) => p.id === productId);
  const photo = produit?.photos.find((p) => p.assetId === photoId);
  return <>
    <div className={css.wzproduct}>
      {photo?.apercu ? <img src={photo.apercu} alt={produit!.nom} /> : <div className={css.emptyPreview}>{produit ? 'Choisissez une photo produit' : 'Aucun produit sélectionné'}</div>}
      <div className={css.wzproductinfo}>
        <label className={css.field}><span>Produit</span><select disabled={occupe} data-champ="produit" value={productId} onChange={(e) => onProduit(e.target.value)}><option value="" disabled={produitEpingle}>Choisir un produit</option>{produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></label>
        {produit && <label className={css.field}><span>Photo produit</span><select disabled={occupe} data-champ="photo-produit" value={photoId} onChange={(e) => onPhoto(e.target.value)}><option value="">Choisir une photo</option>{produit.photos.map((p) => <option key={p.assetId} value={p.assetId}>Photo {p.position}</option>)}</select></label>}
        <small>{produit ? `${produit.photos.length} photo(s) disponible(s) · sélection explicite` : 'Produits de la marque active'}</small>
      </div>
    </div>
    <button type="button" onClick={onImporter} disabled={occupe}>Ajouter une photo produit</button>
    <h3 className={css.wzlabel}>Références</h3>
    {references.length ? <ul>{references.map((r) => <li key={r.id}>{r.titre}</li>)}</ul> : <p className={css.note}>Aucune référence sélectionnée.</p>}
    <button type="button" onClick={onReferences} disabled={references.length >= 10}>Depuis la Veille</button>
  </>;
}

function saisieDepuisBrief(brief: BriefCanonique): SaisieBriefV5 {
  return { intention: brief.objective, audience: brief.audience, contraintes: brief.invariants.join('\n'), objectifType: brief.objectifType ?? null, plateformes: brief.plateformes ?? [], persona: brief.personaRef ?? null, angle: brief.angle ?? '', concept: brief.concept ?? '' };
}
