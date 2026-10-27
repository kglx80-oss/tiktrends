'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  cheminPorte, construireBriefV5, contenuVide, enTeteEtapeNouveau, etapeDisponible, etapeProjetPrecedente, etapeRequiertProjet,
  etapesNouveauSpatial, etatRailProjet, infoEtapeNouveau, messageHorsLigneStudio, numeroEtapeNouveau, saisieDepuisBrief,
  saisieBriefVide, verifierCreationAssistant,
  ALLOWED_PATHS_BRIEF, CHAMPS_FORMULAIRE_BRIEF, CHEMIN_PROJETS, ETAPES_NOUVEAU_SPATIAL, DEPARTS_SPATIAL, JARVIS_NOUVEAU, LIBELLES_OBJECTIF_V5, LIBELLES_PLATEFORME_V5,
  LIVRABLES_SPATIAL, OBJECTIFS_V5, OBJECTIF_MAX, PLATEFORMES_V5, TITRE_NOUVEAU_PROJET_MAX,
  type BriefCanonique, type ContenuVersion, type EtapeAssistant, type EtatNouveauProjet, type PlateformeV5, type ReferenceAdsmap,
  type SaisieBriefV5, type TypeNouveauProjet,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { ajouterSourcesAuProjet, lireProjetDetail } from '../../../app/actions/studios/sources';
import { lireDepartAssistant, type DepartAssistant, type OrigineDepartAssistant } from '../../../app/actions/studios/departs-assistant';
import { setActiveBrand } from '../../../app/actions/brands';
import type { DevisImageVue } from '../../../lib/studios/image/parcours';
import type { VueLotImages } from '../../../lib/studios/image/lot-images';
import { usePropositionsBrief } from '../../../lib/studios/propositions/use-propositions-brief';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { Ornement } from './Ornement';
import { TuileVide } from './briques';
import { DepartDepuisSource, PanneauAssistant, PhotoProduitAssistant } from './assistant/Panneaux';
import { Strategie } from './assistant/Strategie';
import { Direction, type EnregistrementDirection } from './assistant/Direction';
import { FormatDevis } from './assistant/FormatDevis';
import { ConfirmationDevis, ConfirmationLot } from './assistant/Confirmation';
import { Creations } from './assistant/Creations';

/**
 * « Nouveau projet » · l'assistant de création RÉEL dans l'écran Spatial
 * (`docs/spatial/reference/nouveau.html` pour l'étape 1, balisage à
 * l'identique). Porté de l'assistant V5 (`AssistantProjet`) sur les MÊMES
 * actions serveur, étape par étape :
 *
 *  1 · Que créer ? · marque, livrable, point de départ (zéro, une sauvegarde
 *      de la Veille, un test gagnant · relus au serveur) ;
 *  2 · Brief · brief STRUCTURÉ (intention, audience, type d'objectif,
 *      plateformes, contraintes, persona Adsmap, angle, concept, produit et
 *      photo, références) · « Continuer » crée le projet GRATUITEMENT
 *      (`creerProjet` avec le brief), puis épingle la photo et attache les
 *      références · un retour au brief réécrit seulement ce qui a changé, par
 *      une proposition appliquée ;
 *  3 · Stratégie & style · angles et direction par le cycle de propositions
 *      relues (Jarvis payant, prix affiché avant le clic) ;
 *  4 · Format & devis · formats et variantes (lot), consigne, devis serveur
 *      AVANT tout débit, confirmation, puis suivi des créations.
 *
 * Rien n'est généré ni débité à l'ouverture ; la seule dépense possible est
 * un clic explicite après un prix annoncé.
 */

export interface ProduitAssistant { id: string; nom: string; photos: Array<{ assetId: string; apercu: string | null; position: number }> }

export interface PropsNouveauProjet {
  sous: string;
  etat: EtatNouveauProjet;
  marques: ReadonlyArray<{ id: string; nom: string; active: boolean }>;
  ajouterMarque: string | null;
  initial: { type: TypeNouveauProjet; titre: string; intention: string; etape: 'start' | 'brief' };
  /** Le titre proposé par type · remplace le titre tant que la personne ne l'a pas modifié. */
  titresParDefaut: Readonly<Record<TypeNouveauProjet, string>>;
  /** Personas Adsmap de la marque active · lecture, portée. Vide = « Aucun persona » seul. */
  personas: ReferenceAdsmap[];
  produits: ProduitAssistant[];
  /** Ce que le lien reprend (relu au serveur) · le départ, les références, ce qui n'est pas repris. */
  contexte: { depart: DepartAssistant | null; references: DepartAssistant[]; notes: string[]; repris: string[]; retourVeille: { href: string } | null };
}

interface ProjetCourant { id: string; versionCourante: { id: string; n: number } }

export function NouveauProjet(p: PropsNouveauProjet) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [etape, setEtape] = useState<EtapeAssistant>(p.initial.etape);
  const [type, setType] = useState<TypeNouveauProjet>(p.initial.type);
  const [titre, setTitre] = useState(p.initial.titre);
  const titreTouche = useRef(p.initial.titre !== p.titresParDefaut[p.initial.type]);
  const [saisie, setSaisie] = useState<SaisieBriefV5>({ ...saisieBriefVide(), intention: p.initial.intention });
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);
  const [incertain, setIncertain] = useState(false);
  const [catalogue, setCatalogue] = useState<ProduitAssistant[]>(p.produits);
  const [panneau, setPanneau] = useState<OrigineDepartAssistant | null>(null);
  const [photoOuverte, setPhotoOuverte] = useState(false);
  const [depart, setDepart] = useState<DepartAssistant | null>(p.contexte.depart);
  const [references, setReferences] = useState<DepartAssistant[]>(p.contexte.references);
  const [sourcesAffectees, setSourcesAffectees] = useState<string[]>([]);
  const [photoEpinglee, setPhotoEpinglee] = useState('');
  const [productId, setProductId] = useState('');
  const [photoId, setPhotoId] = useState('');
  const [projet, setProjet] = useState<ProjetCourant | null>(null);
  const [brief, setBrief] = useState<BriefCanonique | null>(null);
  const [lot, setLot] = useState<VueLotImages | null>(null);
  const [devis, setDevis] = useState<DevisImageVue | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const lectureNavigation = useRef(0);
  const verrouNavigation = useRef(false);
  const directionEnregistrement = useRef<EnregistrementDirection>(null);
  // Chaque étape s'ouvre en haut de l'écran.
  useEffect(() => { document.querySelector('.view')?.scrollIntoView?.({ block: 'start' }); }, [etape]);

  if (p.etat.etat !== 'pret') {
    return (
      <Vue>
        <EnTete titre="Nouveau projet" sous={p.sous} />
        <div data-zone="assistant-projet" data-etat={p.etat.etat}>
          <TuileVide titre={p.etat.etat === 'sans-marque' ? 'Choisis une marque' : 'Lecture seule'} texte={p.etat.message}
            action={<Lien className="btn sm" href={p.etat.etat === 'sans-marque' ? p.etat.lien.href : CHEMIN_PROJETS} style={{ marginTop: 12 }}>{p.etat.etat === 'sans-marque' ? p.etat.lien.libelle : 'Voir les projets'}</Lien>} />
        </div>
      </Vue>
    );
  }
  const marque = p.etat.marque;
  const aller = (href: string) => { if (cheminPorte(href)) router.push(href); else window.location.assign(href); };
  const maj = (c: Partial<SaisieBriefV5>) => setSaisie((s) => ({ ...s, ...c }));
  const apercuProduitUrl = catalogue.find((x) => x.id === productId)?.photos.find((ph) => ph.assetId === photoId)?.apercu ?? undefined;
  const sources = references.flatMap((r) => r.sources);

  function choisirType(t: TypeNouveauProjet) {
    setType(t);
    if (!titreTouche.current) setTitre(p.titresParDefaut[t]);
  }

  async function changerMarque(id: string) {
    try { await setActiveBrand(id); router.refresh(); }
    catch { toast('La marque n’a pas pu être changée. Réessaie.'); }
  }

  /** Relit le brief de la version COURANTE (jamais une saisie périmée) · un devis d'une autre version tombe. */
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
      setErreur(null);
      setBrief(r.detail.brief);
      setProjet({ id: projet.id, versionCourante: { id: r.detail.version.id, n: r.detail.version.n } });
      return r.detail.brief;
    } catch {
      if (sequence === lectureNavigation.current) setErreur({ message: 'Le projet n’a pas pu être relu. Réessaie avant de modifier son contenu.' });
      return null;
    }
  }

  /** « Continuer » au brief · crée le projet (gratuit) ou réécrit les champs changés ; puis photo et références. */
  async function creer(destination: EtapeAssistant | 'photo' | 'quitter' = 'strategie') {
    if (incertain || encours) return;
    const v = verifierCreationAssistant({ type, titre, saisie });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    if (destination !== 'photo' && productId && !photoId) { setErreur({ message: 'Choisis une photo du produit avant de continuer.' }); return; }
    setEncours(true); setErreur(null);
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
        // Le projet est gardé tout de suite · un refus d'épinglage ne doit pas le recréer.
        setProjet(courant);
        setBrief(v.brief);
      }
      if (projet && brief) {
        // Seuls les champs du formulaire sont réécrits · références, style, composition, hypothèse et textes gardent leur version.
        const ancien = construireBriefV5(saisieDepuisBrief(brief));
        const modifie = CHAMPS_FORMULAIRE_BRIEF.filter((cle) => JSON.stringify(ancien[cle]) !== JSON.stringify(v.brief[cle]));
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
          setProjet(courant); setBrief(suivant); setDevis(null); setLot(null);
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
      if (destination === 'photo') setPhotoOuverte(true);
      else if (destination === 'quitter') aller(`/studio/projets/${courant.id}`);
      else setEtape(destination);
    } catch {
      setEncours(false); setIncertain(true);
      setErreur({ message: projet ? 'La réponse a été interrompue. Le résultat est inconnu : recharge le projet avant toute nouvelle modification.' : messageHorsLigneStudio('creation') });
    }
  }

  // Navigation · avant création, départ et brief seulement ; après, les étapes qui opèrent sur le projet.
  const peutAller = (id: EtapeAssistant): boolean =>
    !encours && !incertain && (projet
      ? ((id !== 'creation' || jobIds.length > 0) && (id === 'brief' || (etapeRequiertProjet(id) && etapeDisponible(id))))
      : id === 'start' || etatRailProjet(id, etape, brief) === 'done');

  async function enregistrerDirection() {
    if (verrouNavigation.current) return false;
    verrouNavigation.current = true; setEncours(true);
    try { return (await directionEnregistrement.current?.enregistrer()) ?? false; }
    finally { verrouNavigation.current = false; setEncours(false); }
  }

  async function allerA(id: EtapeAssistant) {
    if (encours || incertain || verrouNavigation.current || id === etape) return;
    if (etape === 'direction' && !(await enregistrerDirection())) return;
    if (etape === 'brief' && projet) { await creer(id); return; }
    const actuel = projet ? await relireProjet() : brief;
    if (projet && !actuel) return;
    if (id === 'brief' && actuel) setSaisie(saisieDepuisBrief(actuel));
    setEtape(id);
  }

  async function enregistrerEtQuitter() {
    if (!projet || encours || incertain || verrouNavigation.current) return;
    if (etape === 'brief') { await creer('quitter'); return; }
    if (etape === 'direction') {
      if (!(await enregistrerDirection())) return;
      if (!(await relireProjet())) return;
    }
    aller(`/studio/projets/${projet.id}`);
  }

  const reculer = () => { const prec = etapeProjetPrecedente(etape); if (prec && peutAller(prec)) void allerA(prec); };
  const tete = enTeteEtapeNouveau(etape, type);
  const etapes = etapesNouveauSpatial(etape);

  return (
    <Vue>
      <EnTete titre="Nouveau projet" sous={p.sous} />
        <nav className="steps" aria-label="Étapes" data-zone="assistant-projet" data-etape={etape}>
          {etapes.map((e, i) => (
            <Fragment key={e.n}>
              {i > 0 && <span className="sep" />}
              {e.classe === 'done' && peutAller(e.cible)
                ? <button type="button" className="done" data-aller={e.cible} onClick={() => void allerA(e.cible)}><b>✓</b>{e.libelle}</button>
                : <button type="button" className={e.classe} data-etape-spatiale={e.cible} disabled aria-current={e.classe === 'on' ? 'step' : undefined}><b>{e.classe === 'done' ? '✓' : e.n}</b>{e.libelle}</button>}
            </Fragment>
          ))}
        </nav>
        <section className="jfill">
          <span className="orb">J</span>
          <div className="jft"><strong>{JARVIS_NOUVEAU.titre}</strong><small>{JARVIS_NOUVEAU.sous}</small></div>
        </section>

        {etape !== 'start' && (
          <div className="sech" data-zone="tete-etape">
            <h2>{tete.titre}</h2>
            <span className="faint" style={{ fontSize: '12.5px' }}>{tete.texte}</span>
          </div>
        )}
        {(etape === 'strategie' || etape === 'direction') && projet && (
          <div className="seg" role="group" aria-label="Stratégie ou style" style={{ marginBottom: 18 }}>
            {(['strategie', 'direction'] as const).map((e) => (
              <button key={e} type="button" aria-pressed={etape === e} data-sous-etape={e} disabled={encours || incertain} onClick={() => void allerA(e)}>{e === 'strategie' ? 'Stratégie · angle' : 'Style · direction'}</button>
            ))}
          </div>
        )}

        {etape === 'start' && (
          <div className="wz">
            <section>
              <h2 style={{ marginBottom: 10 }}>Marque</h2>
              <div className="kc">
                {p.marques.map((m) => m.active
                  ? <span key={m.id} className="opt2 on">{m.nom}</span>
                  : <span key={m.id} className="opt2" role="button" tabIndex={0} onClick={() => void changerMarque(m.id)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); void changerMarque(m.id); } }}>{m.nom}</span>)}
                {p.ajouterMarque && <Lien className="opt2" href={p.ajouterMarque}><Ic n="plus" />Ajouter une marque</Lien>}
              </div>
            </section>
            <section>
              <h2 style={{ marginBottom: 10 }}>Livrable</h2>
              <div className="cards3" data-champ="type">
                {LIVRABLES_SPATIAL.map((l) => (
                  <button key={l.type} type="button" className="pickc" data-wliv={l.type} aria-pressed={type === l.type} onClick={() => choisirType(l.type)} onDoubleClick={() => setEtape('brief')}>
                    <span className="ico"><Ic n={l.icone} s={false} /></span><strong>{l.titre}</strong><small>{l.sous}</small>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h2 style={{ marginBottom: 10 }}>Point de départ</h2>
              <div className="cards3" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
                {DEPARTS_SPATIAL.map((d) => (
                  <button key={d.cle} type="button" className="pickc" data-wfrom={d.cle}
                    aria-pressed={d.origine === null ? !depart : depart?.origine === d.origine}
                    onClick={() => { if (d.origine) setPanneau(d.origine); else { setDepart(null); setReferences([]); } }}>
                    <span className="ico"><Ic n={d.icone} s={false} /></span><strong>{d.titre}</strong><small>{depart && depart.origine === d.origine ? depart.titre : d.sous}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {etape === 'brief' && (
          <Brief
            marque={marque.nom} titre={titre} onTitre={(t) => { titreTouche.current = true; setTitre(t); }} titreVerrouille={!!projet} verrouille={incertain}
            saisie={saisie} maj={maj} personas={p.personas}
            notes={[...p.contexte.repris, ...p.contexte.notes]} retourVeille={p.contexte.retourVeille}
            produit={<ProduitBrief produits={catalogue} produitEpingle={!!photoEpinglee} productId={productId} photoId={photoId} occupe={encours || incertain}
              onProduit={(id) => { setProductId(id); setPhotoId(''); }} onPhoto={setPhotoId} onImporter={() => void creer('photo')} />}
            references={<References references={references} onAjouter={() => setPanneau('veille')} />}
          />
        )}

        {(etape === 'strategie' || etape === 'direction') && projet && brief && (
          <PostCreation key={`${projet.id}:${etape}`} etape={etape} projet={projet} brief={brief} marqueId={marque.id} sources={sources}
            apercuProduitUrl={apercuProduitUrl} onProjetChange={() => void relireProjet()} onRelire={() => relireProjet().then(Boolean)} enregistrementRef={directionEnregistrement} />
        )}

        {etape === 'format' && projet && (type === 'video' || type === 'text') && (
          <AtelierLivrable projectId={projet.id} type={type} onRetour={() => void allerA('direction')} />
        )}
        {etape === 'format' && projet && brief && type !== 'video' && type !== 'text' && (
          <FormatDevis projectId={projet.id} version={projet.versionCourante} brief={brief} apercuProduitUrl={apercuProduitUrl}
            onBriefChange={async () => { await relireProjet(); }}
            onDevisPret={(d) => { setLot(null); setDevis(d); setEtape('confirm'); }}
            onLotPret={(l) => { setDevis(null); setLot(l); setEtape('confirm'); }}
            onRetour={() => void allerA('direction')} />
        )}
        {etape === 'confirm' && lot && (
          <ConfirmationLot lot={lot} apercuProduitUrl={apercuProduitUrl} onModifier={() => { setLot(null); setEtape('format'); }}
            onLance={(ids) => { setJobIds(ids); setLot(null); setEtape('creation'); }} />
        )}
        {etape === 'confirm' && projet && devis && (
          <ConfirmationDevis projectId={projet.id} devis={devis} apercuProduitUrl={apercuProduitUrl} onModifier={() => { setDevis(null); setEtape('format'); }}
            onLance={(job) => { setJobIds([job.id]); setDevis(null); setEtape('creation'); }} />
        )}
        {etape === 'creation' && projet && jobIds.length > 0 && <Creations projectId={projet.id} jobIds={jobIds} />}

        {erreur && <div className="banner" role="alert" data-etat="erreur" style={{ marginTop: 14 }}><Ic n="x" /><span>{erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}</span></div>}

        {['start', 'brief', 'strategie', 'direction'].includes(etape) && (
          <Ornement>
            {etape === 'start'
              ? <Lien className="btn" href={CHEMIN_PROJETS}>Annuler</Lien>
              : <button className="btn icon" type="button" aria-label="Étape précédente" data-bouton="retour" disabled={encours || !etapeProjetPrecedente(etape) || !peutAller(etapeProjetPrecedente(etape)!)} onClick={reculer}><Ic n="back" s={false} /></button>}
            <span className="info">{infoEtapeNouveau(etape)}</span>
            {projet && etape !== 'start' && <button className="btn" type="button" data-bouton="enregistrer-quitter" disabled={encours || incertain} onClick={() => void enregistrerEtQuitter()}>Enregistrer et quitter</button>}
            {etape === 'start' && <button className="btn pri" type="button" data-bouton="vers-brief" onClick={() => setEtape('brief')}>Écrire le brief</button>}
            {etape === 'brief' && <button className="btn pri" type="button" data-bouton="creer-projet" disabled={encours || incertain} onClick={() => void creer()}>{encours ? (projet ? 'Enregistrement…' : 'Création…') : 'Continuer vers la stratégie'}</button>}
            {etape === 'strategie' && <button className="btn pri" type="button" data-bouton="vers-direction" disabled={encours || incertain} onClick={() => void allerA('direction')}>Continuer vers le style</button>}
            {etape === 'direction' && <button className="btn pri" type="button" data-bouton="vers-format" disabled={encours || incertain} onClick={() => void allerA('format')}>{encours ? 'Enregistrement…' : 'Valider la direction'}</button>}
          </Ornement>
        )}

      {photoOuverte && (
        <PanneauAssistant titre="Ajouter une photo produit" onFermer={() => setPhotoOuverte(false)}>
          <PhotoProduitAssistant projectId={projet?.id ?? null} productId={productId} onChoisie={(r) => {
            setProjet({ id: r.projectId, versionCourante: r.version });
            setCatalogue(r.produits.map((x) => ({ id: x.id, nom: x.nom, photos: x.photos.map((ph) => ({ assetId: ph.assetId, apercu: ph.apercu, position: ph.position })) })));
            setProductId(r.produit.id); setPhotoId(r.photo.assetId); setPhotoEpinglee(`${r.produit.id}:${r.photo.assetId}`);
            setDevis(null); setLot(null); void relireProjet(); setPhotoOuverte(false);
          }} />
        </PanneauAssistant>
      )}
      {panneau && (
        <DepartDepuisSource origine={panneau} onFermer={() => setPanneau(null)} onChoisir={(choix) => {
          if (etape === 'start') { setDepart(choix); setTitre(choix.titre); titreTouche.current = true; if (choix.intention) maj({ intention: choix.intention }); }
          if (choix.sources.length) setReferences((avant) => (avant.some((r) => r.id === choix.id) ? avant : avant.length < 10 ? [...avant, choix] : avant));
          setPanneau(null);
        }} />
      )}
    </Vue>
  );
}

/* ───────────────────── Post-création · le cycle de propositions ───────────────────── */

function PostCreation({ etape, projet, brief, marqueId, sources, apercuProduitUrl, onProjetChange, onRelire, enregistrementRef }: {
  etape: 'strategie' | 'direction'; projet: ProjetCourant; brief: BriefCanonique; marqueId: string; sources: unknown[];
  apercuProduitUrl?: string; onProjetChange: () => void; onRelire: () => Promise<boolean>; enregistrementRef: React.Ref<EnregistrementDirection>;
}) {
  const cycle = usePropositionsBrief(projet.id, projet.versionCourante);
  return etape === 'strategie'
    ? <Strategie projectId={projet.id} brief={brief} cycle={cycle} onApplied={onProjetChange} sources={sources} marqueId={marqueId} />
    : <Direction onRelire={onRelire} enregistrementRef={enregistrementRef} projectId={projet.id} baseVersionId={projet.versionCourante.id} brief={brief} cycle={cycle} onApplied={onProjetChange} apercuProduitUrl={apercuProduitUrl} />;
}

/* ─────────────────────────────── Étape brief ─────────────────────────────── */

function Brief({ marque, titre, onTitre, titreVerrouille, verrouille, saisie, maj, personas, notes, retourVeille, produit, references }: {
  marque: string; titre: string; onTitre: (v: string) => void; titreVerrouille: boolean; verrouille: boolean;
  saisie: SaisieBriefV5; maj: (c: Partial<SaisieBriefV5>) => void; personas: ReferenceAdsmap[];
  notes: readonly string[]; retourVeille: { href: string } | null; produit: ReactNode; references: ReactNode;
}) {
  const basculerPlateforme = (pf: PlateformeV5) => {
    const set = new Set(saisie.plateformes);
    if (set.has(pf)) set.delete(pf); else set.add(pf);
    maj({ plateformes: PLATEFORMES_V5.filter((x) => set.has(x)) });
  };
  return (
    <div data-zone="assistant-brief" className="wz">
      {notes.map((n) => <div className="banner" key={n}><Ic n="spark" /><span>{n}</span></div>)}
      {retourVeille && <div className="kc"><Lien className="btn sm" href={retourVeille.href}><Ic n="back" />Retour à la Veille</Lien></div>}
      <div className="coach"><span className="orb">J</span><p>Le projet appartient à <b>{marque}</b>. Le créer est gratuit · le brief est enregistré à la création, rien n’est généré tant que tu ne lances rien.</p></div>
      <fieldset disabled={verrouille} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 22 }}>
        <section>
          <h2 style={{ marginBottom: 10 }}>Nom du projet</h2>
          <label className="field"><input data-champ="titre" value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} disabled={titreVerrouille} aria-label="Nom du projet" onChange={(e) => onTitre(e.target.value)} /></label>
        </section>
        <section>
          <h2 style={{ marginBottom: 10 }}>Ton intention</h2>
          <textarea className="ta" data-champ="intention" value={saisie.intention} maxLength={OBJECTIF_MAX} rows={4} aria-label="Ton intention"
            placeholder="Ce que ce projet doit produire ou vérifier" onChange={(e) => maj({ intention: e.target.value })} />
        </section>
        <section>
          <h2 style={{ marginBottom: 10 }}>Audience</h2>
          <label className="field"><input data-champ="audience" value={saisie.audience} maxLength={2000} aria-label="Audience" placeholder="À qui s’adresse cette publicité · facultatif" onChange={(e) => maj({ audience: e.target.value })} /></label>
        </section>
        <section data-champ="objectif-type">
          <h2 style={{ marginBottom: 10 }}>Objectif <span className="faint" style={{ fontSize: '12.5px', fontWeight: 500 }}>· facultatif</span></h2>
          <div className="kc" role="group" aria-label="Objectif">
            {OBJECTIFS_V5.map((o) => (
              <button key={o} type="button" className="chip" data-objectif={o} aria-pressed={saisie.objectifType === o}
                onClick={() => maj({ objectifType: saisie.objectifType === o ? null : o })}>{LIBELLES_OBJECTIF_V5[o]}</button>
            ))}
          </div>
        </section>
        <section data-champ="plateformes">
          <h2 style={{ marginBottom: 10 }}>Plateformes <span className="faint" style={{ fontSize: '12.5px', fontWeight: 500 }}>· facultatif</span></h2>
          <div className="kc" role="group" aria-label="Plateformes">
            {PLATEFORMES_V5.map((pf) => (
              <button key={pf} type="button" className="chip" data-plateforme={pf} aria-pressed={saisie.plateformes.includes(pf)} onClick={() => basculerPlateforme(pf)}>{LIBELLES_PLATEFORME_V5[pf]}</button>
            ))}
          </div>
        </section>
        <section>
          <h2 style={{ marginBottom: 10 }}>Contraintes et mentions obligatoires <span className="faint" style={{ fontSize: '12.5px', fontWeight: 500 }}>· facultatif</span></h2>
          <textarea className="ta" data-champ="contraintes" value={saisie.contraintes} maxLength={OBJECTIF_MAX} rows={3} aria-label="Contraintes et mentions obligatoires"
            placeholder="Une par ligne · chacune devient un invariant du brief" onChange={(e) => maj({ contraintes: e.target.value })} />
        </section>
        <section>
          <h2 style={{ marginBottom: 10 }}>Persona, angle et concept <span className="faint" style={{ fontSize: '12.5px', fontWeight: 500 }}>· facultatifs</span></h2>
          <div className="grid3" style={{ alignItems: 'start' }}>
            <label className="field">Pour qui ? · persona Adsmap
              <select data-champ="persona" value={saisie.persona?.id ?? ''} onChange={(e) => maj({ persona: personas.find((x) => x.id === e.target.value) ?? null })}>
                <option value="">Aucun persona</option>
                {personas.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
              </select>
              {personas.length === 0 && <span className="faint" style={{ fontWeight: 400 }}>Aucun persona Adsmap pour cette marque · tu peux en créer depuis la fiche marque.</span>}
            </label>
            <label className="field">Angle
              <input data-champ="angle" value={saisie.angle} maxLength={2000} placeholder="L’idée qui porte la publicité" onChange={(e) => maj({ angle: e.target.value })} />
            </label>
            <label className="field">Concept
              <input data-champ="concept" value={saisie.concept} maxLength={2000} placeholder="La traduction visuelle de l’angle" onChange={(e) => maj({ concept: e.target.value })} />
            </label>
          </div>
        </section>
      </fieldset>
      {produit}
      {references}
    </div>
  );
}

function ProduitBrief({ produits, produitEpingle, productId, photoId, onProduit, onPhoto, onImporter, occupe }: {
  produits: ProduitAssistant[]; produitEpingle: boolean; productId: string; photoId: string;
  onProduit: (id: string) => void; onPhoto: (id: string) => void; onImporter: () => void; occupe: boolean;
}) {
  const produit = produits.find((x) => x.id === productId);
  const photo = produit?.photos.find((x) => x.assetId === photoId);
  return (
    <section className="tile" aria-label="Produit" style={{ display: 'grid', gap: 12 }}>
      <div className="lbl">Produit et photo</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {photo?.apercu
          ? <img src={photo.apercu} alt={produit!.nom} style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 14 }} />
          : <p className="faint" style={{ fontSize: '12.5px', width: 96 }}>{produit ? 'Choisis une photo produit' : 'Aucun produit sélectionné'}</p>}
        <div style={{ display: 'grid', gap: 10, flex: 1, minWidth: 200 }}>
          <label className="field">Produit
            <select data-champ="produit" disabled={occupe} value={productId} onChange={(e) => onProduit(e.target.value)}>
              <option value="" disabled={produitEpingle}>{produits.length ? 'Choisir un produit · facultatif' : 'Aucun produit pour cette marque'}</option>
              {produits.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select>
          </label>
          {produit && (
            <label className="field">Photo produit
              <select data-champ="photo-produit" disabled={occupe} value={photoId} onChange={(e) => onPhoto(e.target.value)}>
                <option value="">Choisir une photo</option>
                {produit.photos.map((ph) => <option key={ph.assetId} value={ph.assetId}>Photo {ph.position}</option>)}
              </select>
            </label>
          )}
          <small className="faint">{produit ? `${produit.photos.length} photo(s) disponible(s) · sélection explicite, épinglée à la création` : 'Produits de la marque active'}</small>
        </div>
      </div>
      <div className="kc"><button className="btn sm" type="button" data-bouton="ajouter-photo" disabled={occupe} onClick={onImporter}><Ic n="img" />Ajouter une photo produit</button></div>
    </section>
  );
}

function References({ references, onAjouter }: { references: DepartAssistant[]; onAjouter: () => void }) {
  return (
    <section className="tile" aria-label="Références" style={{ display: 'grid', gap: 10 }}>
      <div className="lbl">Références</div>
      {references.length
        ? <div className="kc">{references.map((r) => <span key={r.id} className="pill c" data-reference={r.id}>{r.titre}</span>)}</div>
        : <p className="faint" style={{ fontSize: '12.5px' }}>Aucune référence sélectionnée.</p>}
      <div className="kc"><button className="btn sm" type="button" data-bouton="references-veille" disabled={references.length >= 10} onClick={onAjouter}><Ic n="plus" />Depuis la Veille</button></div>
    </section>
  );
}

/* ───────────── Format · vidéo et textes · l'atelier réel du projet ───────────── */

function AtelierLivrable({ projectId, type, onRetour }: { projectId: string; type: 'video' | 'text'; onRetour: () => void }) {
  const href = `/studio/projets/${projectId}/${type === 'video' ? 'video' : 'textes'}`;
  return (
    <div data-zone="assistant-livrable" data-type={type} className="wz">
      <section className="tile" style={{ display: 'grid', gap: 10 }}>
        <div className="lbl">{type === 'video' ? 'Atelier vidéo' : 'Atelier textes'}</div>
        <p className="muted" style={{ fontSize: '12.5px' }}>{type === 'video'
          ? 'Le storyboard, les plans, la voix et la musique se préparent dans l’atelier vidéo du projet, sur le brief et la direction que tu viens d’enregistrer. Chaque appel payant y affiche son prix avant le clic ; rien n’est lancé en l’ouvrant.'
          : 'Les accroches, le texte principal et les appels à l’action se rédigent dans l’atelier textes du projet, sur le brief et la direction que tu viens d’enregistrer. Chaque appel payant y affiche son prix avant le clic ; rien n’est lancé en l’ouvrant.'}</p>
      </section>
      <Ornement>
        <button className="btn icon" type="button" aria-label="Retour à la direction" data-bouton="retour-direction" onClick={onRetour}><Ic n="back" s={false} /></button>
        <span className="info">{`Étape ${numeroEtapeNouveau('format')} sur ${ETAPES_NOUVEAU_SPATIAL.length} · ouvrir l’atelier ne lance rien`}</span>
        <Lien className="btn pri" href={href}>{type === 'video' ? 'Ouvrir l’atelier vidéo' : 'Ouvrir l’atelier textes'}</Lien>
      </Ornement>
    </div>
  );
}
