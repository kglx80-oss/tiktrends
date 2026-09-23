'use client';

import { useRef, useState, useTransition } from 'react';
import { generateAdsAction, cloneAdAction, suggestAnglesAction, archiveAdAction, getAdTextAction, updateAdTextAction, scoreCreativeAction, declineAdAction, type AdItem, type SavedAdRef, type AdText } from '../../../actions/ads';
import { demarrerGeneration, terminerGeneration } from '../../../../lib/generation-store';
import type { CreativeScore } from '@tiktrends/ai';
import { setProductImagesAction, importAllProductImagesAction } from '../../../actions/image';
import { type AdTemplate, type AdAngle } from '@tiktrends/ai';
import { IMAGE_MODELS, imageModelByKey, TEMPLATE_LABEL, AD_LAYOUTS, LAYOUT_LABEL, LAYOUT_HINT, generationOutcome, producedSomething, withParam, STUDIO_LABEL, STUDIO_HINT, CHANGE, tenuConstant, prixDeclinaison, costFor, STUDIO_VARIABLES, empechement, lignee, verdictDefauts, PRODUCTION_MODES, PRODUCTION_LABEL, PRODUCTION_RESUME, garanties, reserves, texteAttenduDansImage, type ProductionMode, DEFECT_LABEL, DEFECT_FIX, ESSAI_VARIABLES, ESSAI_LABEL, hypotheseEssai, tenuDansEssai, imagesPourEssai, economieEssai, creditsAnnoncesLot, essaiVisibleEnMode, ETAT_COPIE_LABEL, debriefDepuisControles, budgetReprises, moteurRecommande, moteurParDefaut, libelleGagnant, niveauScore, COULEUR_NIVEAU, controleCasse, templatesDabord, formatApercu, idsHomonymes, qualiteCarte, filtrerTriGalerie, CRITERES_DEFAUT, type CriteresGalerie, type EtatVerdictCarte, type DebriefLot, type VerdictCopie, type ConseilMoteur, type ConseilMode, type Outcome, type StudioVariable, type EssaiVariable, type GagnantMesure, type Suggestion, CIBLE_TACTILE_MIN, lienSourceVeille, type SourceVeille } from '@tiktrends/core';
import { Pager, PAGE_SIZE } from '../../../../components/Pager';
import { usePiegeFocus } from '../../../../components/use-piege-focus';
import { useIsMobile } from '../../../../components/useIsMobile';
import { Portail } from '../../../../components/Portail';
import { DropZone } from '../../../../components/DropZone';
import { RatingControl } from '../../../../components/CreativeActions';
import { CartePub } from './CartePub';
import { RailFicheCrea, toolBtn } from './RailFicheCrea';
import { BarreFiltresGalerie } from '../../../../components/BarreFiltresGalerie';
import { FOND_PASTILLE_MEDIA } from '../../../../components/ui';
import { Empty } from '../../../../components/Empty';
import { MiniatureAsset } from '../../../../components/MiniatureAsset';
import { Icon } from '../../../../components/Icon';
import { VerdictBadge } from '../../../../components/VerdictBadge';
import { Composer } from '../../../../components/Composer';
import { AssistantPub } from './AssistantPub';
import { DebriefLotPanel } from './DebriefLotPanel';
import { UniversePicker } from '../../../../components/UniversePicker';
import { usePreflight } from '../../../../components/usePreflight';
import { useScenes } from '../../../../components/useScenes';

// Pas d'`outline: none` · un champ atteint au clavier sans anneau de focus perd
// l'utilisateur au clavier. On garde l'anneau natif du navigateur.
const fld = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14 } as const;

/** Redimensionne une image (navigateur) en data URI jpeg · léger pour l'analyse vision. */
function fileToDataUri(file: File, maxSide = 1100, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Le nom vient du noyau · le serveur le renvoie dans la réserve de
// pré-lancement (« Avec « Avant / après » · … »), et deux listes de noms
// finiraient par ne plus désigner la même chose à l'écran et dans la phrase.
const TEMPLATES: { key: AdTemplate; label: string; icon: string }[] = [
  { key: 'problem_solution', label: TEMPLATE_LABEL.problem_solution, icon: 'spark' },
  { key: 'before_after', label: TEMPLATE_LABEL.before_after, icon: 'swap' },
  { key: 'testimonial', label: TEMPLATE_LABEL.testimonial, icon: 'star' },
  { key: 'benefits', label: TEMPLATE_LABEL.benefits, icon: 'check' },
  { key: 'ugc', label: TEMPLATE_LABEL.ugc, icon: 'phone' },
  { key: 'stat', label: TEMPLATE_LABEL.stat, icon: 'chart' },
  { key: 'offer', label: TEMPLATE_LABEL.offer, icon: 'tag' },
];
const OBJECTIVES = ['Ventes', 'Prospection', 'Retargeting', 'Notoriété', 'Trafic', 'Considération', 'Lancement produit', 'Promo / soldes', 'Collecte d’avis', 'Génération de leads'];
const TPL_LABEL: Record<AdTemplate, string> = {
  problem_solution: 'Problème / solution', before_after: 'Avant / après', testimonial: 'Témoignage', benefits: 'Bénéfices',
  ugc: 'UGC natif', stat: 'Chiffre-clé', offer: 'Offre / promo',
};


export function AdsStudio({ ready, aiReady, brandName, initial, products, personas, savedRefs, assets = [], initialMode = 'brand', initialAngle = '', initialRef = '', initialSource = null, adsmap = false, suggestion = null, budget = null, conseilMoteurs, conseilModes }: {
  ready: boolean; aiReady: boolean; brandName: string | null; initial: AdItem[];
  products: Array<{ id: string; name: string; hasImage: boolean; photoUrl?: string | null }>; personas: Array<{ id: string; name: string }>;
  savedRefs: SavedAdRef[];
  assets?: Array<{ id: string; name: string; url: string; thumbUrl?: string | null; isTemplate?: boolean }>;
  initialMode?: 'brand' | 'clone';
  initialAngle?: string;
  /** Pub de veille pré-sélectionnée comme référence de clone · vient de `?ref=`. */
  initialRef?: string;
  /**
   * La source de veille qui a ouvert le studio · recomposée depuis `?src`/`?srcnom`
   * en objet durable. Enregistrée sur chaque génération de la session, elle rend
   * la provenance traçable jusqu'à la création puis son test Adsmap (CDC v8).
   */
  initialSource?: SourceVeille | null;
  /** La carte ADSMAP est ouverte à cet espace · conditionne le bouton « Suivre ». */
  adsmap?: boolean;
  /**
   * Ce que l'outil conseille de tester · déduit de ce qui est déjà mesuré.
   *
   * `null` quand la carte n'est pas ouverte ou que la lecture a échoué · le
   * sélecteur s'affiche alors sans conseil, ce qui est l'état d'avant.
   */
  suggestion?: Suggestion | null;
  /** Le plafond de dépense en vigueur · null quand on n'a pas pu le lire. */
  budget?: { resume: string; bloque: boolean } | null;
  /** Ce que les relectures conseillent · vide tant qu'elles ne tranchent pas. */
  conseilMoteurs: ConseilMoteur;
  /** Le mode par défaut que la mesure conseille · composée si l'entière échoue mesurément ici. */
  conseilModes: ConseilMode;
}) {
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const toggleAsset = (id: string) => setAssetIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const [mode, setMode] = useState<'brand' | 'clone'>(initialMode);
  const [prods, setProds] = useState(products);
  // S'il n'y a qu'un seul produit, on le sélectionne d'office (évite le piège « Aucun »).
  const [productId, setProductId] = useState(products.length === 1 ? products[0]!.id : '');
  const [prodThumbs, setProdThumbs] = useState<string[]>([]);
  const [prodMsg, setProdMsg] = useState('');
  const [prodBusy, setProdBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkOk, setBulkOk] = useState(true);
  const prodImgInput = useRef<HTMLInputElement>(null);
  const [personaId, setPersonaId] = useState('');
  const [objective, setObjective] = useState('Ventes');
  const [offer, setOffer] = useState('');
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  const [angle, setAngle] = useState(initialAngle);
  const [universe, setUniverse] = useState('auto');
  // « auto » n'est pas une coquille · c'est le refus d'en choisir une, et c'est
  // le défaut. La rotation existe pour qu'un lot ne rende pas quatre fois la
  // même image ; imposer la même à tout un lot reste possible, sur demande.
  const [layout, setLayout] = useState('auto');
  /**
   * Le lot déclare-t-il ce qu'il teste ?
   *
   * Vide = lot libre : quatre gabarits, quatre mises en page, quatre ambiances.
   * Utile pour explorer, ça ne prouve rien · la gagnante a tout changé à la
   * fois, donc on ne sait pas quoi refaire.
   */
  const [essai, setEssai] = useState<'' | EssaiVariable>('');
  /**
   * Comment fabriquer la publicité.
   *
   * « Entière » par défaut · un essai côte à côte l'a montrée meilleure sur
   * l'étiquette, le français et la mise en page. La composée reste offerte, et
   * reste la seule à garantir les textes au caractère près.
   */
  // Le défaut suit la mesure · composée quand l'entière échoue mesurément pour
  // cette marque, sinon entière (le mode que le lot de contrôle a montré viable).
  // Le mesuré fixe l'état INITIAL une fois · le clic reste seul à changer ensuite.
  const [fabrication, setFabrication] = useState<ProductionMode>(conseilModes.defaut);
  // Changer de mode peut invalider l'essai en cours · « les accroches » et
  // « les mises en page » ne varient rien de visible en entière (le texte est
  // cuit dans l'image). On le réinitialise plutôt que de laisser un choix qui,
  // au clic « Générer », rendrait le même visuel N fois sous une étiquette d'essai.
  // Le moteur par défaut dépend du MODE · GPT Image 2 en entière (il écrit la
  // typo), Nano Banana en composée (fidélité produit). Tant que l'utilisateur
  // n'a pas choisi lui-même, le moteur DOIT suivre le mode · sinon, changer de
  // mode après l'arrivée laissait le moteur de l'autre mode sélectionné, alors
  // que la même liste l'annonce « recommandé » ailleurs · on payait la
  // génération avec le mauvais moteur. Dès qu'il a choisi, son choix tient.
  const [moteurChoisi, setMoteurChoisi] = useState(false);
  const choisirMoteur = (k: string) => { setModel(k); setMoteurChoisi(true); };
  const choisirFabrication = (m: ProductionMode) => {
    setFabrication(m);
    setEssai((e) => (e && !essaiVisibleEnMode(e, m) ? '' : e));
    if (!moteurChoisi) setModel(moteurParDefaut(m, conseilMoteurs.recommande));
  };
  /** Ce que le dernier lot a appliqué de ce qui avait été mesuré. */
  const [applique, setApplique] = useState('');
  // Le débrief du dernier lot entière · additionne les relectures des pubs qui
  // viennent d'arriver. `null` dès qu'aucune n'a été relue (lot composé), et
  // alors rien ne s'affiche.
  //
  // Il n'apparaît qu'APRÈS une génération de la session · pas reconstruit au
  // chargement. Reconstruit, il réapparaissait à chaque visite du studio, des
  // jours après le lot, en se lisant comme une alerte fraîche (« Reprendre 1 pub
  // cassée ») · le propriétaire l'a signalé, il ne comprenait pas pourquoi ce
  // message restait. Un débrief est le retour d'un geste qu'on vient de faire,
  // pas un bandeau permanent.
  const [debrief, setDebrief] = useState<DebriefLot | null>(null);
  const [count, setCount] = useState(4);
  const [angles, setAngles] = useState<AdAngle[]>([]);
  const [anglesBusy, startAngles] = useTransition();
  const [refUri, setRefUri] = useState('');
  // Pré-sélectionnée depuis la veille · le studio s'ouvre en clone avec cette
  // pub en référence. On ne garde que ce qui est vraiment dans `savedRefs` ·
  // une référence absente (sauvegarde retirée, hors des 40 récentes) laisserait
  // un clone sans image, donc un bouton qui échoue.
  const [savedAdId, setSavedAdId] = useState(initialRef && savedRefs.some((r) => r.id === initialRef) ? initialRef : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ads, setAds] = useState<AdItem[]>(initial);
  const [adsPage, setAdsPage] = useState(0);
  // Les critères de la barre de filtres locale · N06 (tranche 2). Un changement
  // ramène à la première page · sinon on tombe sur une page vide du sous-ensemble.
  const [criteres, setCriteres] = useState<CriteresGalerie>(CRITERES_DEFAUT);
  // La grille est en bas de page · on y amène le regard quand un lot arrive.
  const grille = useRef<HTMLDivElement>(null);
  const composeur = useRef<HTMLDivElement>(null);
  /**
   * Le composeur complet est replié.
   *
   * Il ouvrait la page en doublant le démarrage rapide · les mêmes gabarits,
   * le même produit, le même objectif, le même modèle, à dix centimètres
   * d'écart. Deux formulaires qui pilotent le MÊME état ne donnent pas deux
   * choix, ils donnent deux endroits où chercher celui qu'on a fait.
   *
   * Il garde ce que le démarrage rapide ne sait pas faire · cloner une pub,
   * charger une photo produit, rappeler une scène enregistrée.
   */
  const [avance, setAvance] = useState(false);
  /**
   * L'assistant · une décision par écran.
   *
   * « Composeur complet » ouvre désormais celui-ci. Le composeur à plat reste
   * accessible en dessous, pour qui le connaît · un assistant qui supprime le
   * chemin rapide punit celui qui savait déjà.
   */
  const [assistant, setAssistant] = useState(false);
  // La galerie filtrée · on réduit chaque pub à ses axes discrets (le noyau ne
  // connaît pas `AdItem`), on filtre/trie, puis on rétablit les cartes dans
  // l'ordre. Le détail, lui, s'ouvre PAR ID sur la liste complète · filtrer la
  // vue ne casse pas la navigation précédent/suivant.
  const bucketPerf = (v?: EtatVerdictCarte | null): 'gagnante' | 'en_mesure' | 'inconnue' | 'autre' =>
    v == null ? 'inconnue' : v === 'en_mesure' ? 'en_mesure' : (v === 'gagnante' || v === 'petite_gagnante') ? 'gagnante' : 'autre';
  const bucketQualite = (a: AdItem) => {
    const q = qualiteCarte({ ...(a.controle ?? {}), faits: a.faits ?? [], renduPorteTexte: texteAttenduDansImage(a.mode) });
    return !q.verifie ? 'non_verifiee' as const : q.pretADiffuser ? 'prete' as const : q.niveau === 'bloquant' ? 'a_revoir' as const : 'a_verifier' as const;
  };
  const parId = new Map(ads.map((a) => [a.id, a]));
  const adsFiltrees = filtrerTriGalerie(
    ads.map((a) => ({ id: a.id, titre: a.headline, format: a.template, date: a.createdAt, qualite: bucketQualite(a), performance: bucketPerf(a.verdict) })),
    criteres,
  ).map((it) => parId.get(it.id)!);
  const formatsPresents = [...new Set(ads.map((a) => a.template))];
  const pagedAds = adsFiltrees.slice(adsPage * PAGE_SIZE, (adsPage + 1) * PAGE_SIZE);
  const [preview, setPreview] = useState<string | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  // Le piège à focus partagé sur les deux fenêtres · focus entrant, Tab piégé,
  // Échap, retour au déclencheur. L'empilement est tenu par les gardes `actif` :
  // la lightbox (z-index 200) prend la main dès qu'elle est ouverte ; la vue
  // détail (110) n'est piégée QUE si la lightbox est fermée. Échap ferme donc
  // toujours la fenêtre du dessus, comme avant · une seule est active à la fois.
  usePiegeFocus(previewRef, { actif: preview != null, onFermer: () => setPreview(null) });
  usePiegeFocus(detailRef, { actif: detailIdx != null && preview == null, onFermer: () => setDetailIdx(null) });
  // Le détail EMPILE ses deux colonnes sous ce seuil · au-dessus, elles sont
  // côte à côte et la zone média doit être BORNÉE à la hauteur visible pendant
  // que le rail d'outils défile seul (sinon la colonne média s'étire à la
  // hauteur du rail et centre l'image hors du cadre · CDC v8 · F04).
  const detailEmpile = useIsMobile('(max-width: 575px)');
  const [varyBusy, setVaryBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Le défaut suit ce qu'on a MESURÉ chez la marque quand l'intervalle tranche ·
  // sinon le recommandé SELON LE MODE (GPT Image 2 en entière, où le moteur écrit
  // le texte ; Nano Banana en composée, où on l'écrit nous). Un seul drapeau
  // aveugle au mode proposait Nano partout, dont en entière où un lot de contrôle
  // l'a montré le mauvais choix. Le changement n'est pas silencieux · l'écran du
  // volume dit ce qui est retenu, et lequel.
  const [model, setModel] = useState(moteurParDefaut(fabrication, conseilMoteurs.recommande));
  const modelSpec = imageModelByKey(model);
  /**
   * Combien de publicités un essai produira RÉELLEMENT.
   *
   * Un essai de mise en page est borné par le nombre de coquilles · en demander
   * cinq en produirait deux identiques, et le contrôle refuserait le lot entier
   * APRÈS l'avoir payé. Le serveur applique la même borne · l'écran doit
   * annoncer le même chiffre, sinon il promet ce qui n'arrivera pas.
   */
  const countEssai = essai === 'mise_en_page' ? Math.min(count, AD_LAYOUTS.length) : count;
  // La scène reprise · consignée à la génération, c'est ce qui lui bâtit un
  // bilan. Toute frappe la libère : un texte retouché n'est plus la scène.
  const [sceneId, setSceneId] = useState('');
  // Ce que la mémoire dit de la description AVANT de payer la génération ·
  // le brief de pré-lancement n'arrivait qu'une fois la créa posée dans un lot,
  // c'est-à-dire après l'avoir fabriquée. Ici, il économise les deux.
  // Les gabarits cochés entrent dans la vérification · sans eux, la seule
  // réserve possible portait sur l'accroche, et « ce gabarit-là n'a jamais rien
  // donné ici » ne pouvait pas être dit.
  const preflight = usePreflight(angle, { templates, format: 'static', layout });
  const { scenes, enregistrer, erreur: sceneErreur, conseil } = useScenes('image');
  const refInput = useRef<HTMLInputElement>(null);

  const detailAd = detailIdx != null ? ads[detailIdx] ?? null : null;

  // Les pubs cassées du dernier lot · même lot que le débrief (ads[0].lot), même
  // règle d'écart éliminatoire (controleCasse, tenue dans le noyau). On garde
  // leurs INDEX dans `ads` pour ouvrir la première d'un clic depuis le débrief.
  const dernierLot = ads[0]?.lot;
  const indicesCasses = dernierLot == null ? [] : ads
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.lot === dernierLot && controleCasse(a.controle))
    .map(({ i }) => i);

  // Reprendre un gagnant · on pré-sélectionne la valeur dans le composeur et on
  // ouvre l'assistant, au lieu de laisser deviner « applique ce qui a gagné ».
  const appliquerGagnant = (g: GagnantMesure): void => {
    if (g.variable === 'mise_en_page') setLayout(g.valeur);
    else if (g.variable === 'univers') setUniverse(g.valeur);
    setMode('brand'); setAssistant(true); setError('');
  };

  const [editText, setEditText] = useState(false);
  const [textForm, setTextForm] = useState<AdText | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const [ratio, setRatio] = useState<'4:5' | '1:1' | '9:16'>('4:5');
  // Une entière porte son texte dans l'image · elle n'a qu'un format (l'origine),
  // consulté ET exporté à l'identique · une composée s'adapte vraiment au cadre.
  const fmtApercu = formatApercu(detailAd?.mode, ratio);
  // a.url porte déjà une version (?v=) qui suit les textes : la grille, l'aperçu et
  // le téléchargement se rafraîchissent ensemble après une édition. Pour une
  // entière on ne force aucun cadre · l'aperçu montre l'origine, donc l'aperçu et
  // le fichier exporté sont identiques.
  const detailSrc = detailAd ? (fmtApercu.choixCadre ? withParam(detailAd.url, 'r', ratio) : detailAd.url) : '';
  // La grille demande des vignettes · elle affiche des cartes de 240 px, et la
  // maquette est proportionnelle depuis qu'un test mesure les pixels rendus.
  // On AJOUTE un paramètre, on ne concatène pas · l'adresse d'une pub porte
  // déjà `?v=`, celle d'une référence de la bibliothèque non. Coller « &t=1 »
  // sur `/api/asset/<id>` donnait un identifiant inexistant et une vignette
  // cassée.
  const vignette = (u: string) => withParam(u, 't', 1);

  async function openTextEditor(a: AdItem) {
    setEditText(true); setTextForm(null);
    const r = await getAdTextAction(a.id);
    if (r.text) setTextForm(r.text);
  }
  async function applyText(a: AdItem) {
    if (!textForm || textBusy) return;
    setTextBusy(true); setError('');
    const r = await updateAdTextAction(a.id, textForm);
    setTextBusy(false);
    if (r.error) { setError(r.error); return; }
    // Nouvelle URL versionnée : remplace la carte pour que la vignette suive.
    // Si le texte a changé, la mesure a été retirée en base · on l'efface aussi
    // de la carte pour que la grille repasse « en mesure » sans rechargement.
    if (r.url) setAds((list) => list.map((x) => (x.id === a.id
      ? { ...x, headline: textForm.headline || x.headline, url: r.url!, ...(r.mesureReinitialisee ? { score: undefined, controle: null } : {}) }
      : x)));
    setEditText(false); setScoreFor(null);
  }

  const [scoring, setScoring] = useState(false);
  const [scoreData, setScoreData] = useState<CreativeScore | null>(null);
  /** Le verdict de copie · vide hors mode « entière », où il n'y a rien à relire. */
  const [copieData, setCopieData] = useState<VerdictCopie | null>(null);
  const [scoreFor, setScoreFor] = useState<string | null>(null);

  async function runScore(a: AdItem, force = false) {
    if (scoring) return;
    setScoring(true); setError('');
    const r = await scoreCreativeAction(a.id, force ? { force: true } : undefined);
    setScoring(false);
    if (r.error) { setError(r.error); return; }
    if (r.score) {
      setScoreData(r.score); setCopieData(r.copie ?? null); setScoreFor(a.id);
      // Reflète le score sur la carte (pastille) sans recharger.
      setAds((list) => list.map((x) => (x.id === a.id ? { ...x, score: r.score!.score } : x)));
    }
  }

  function copyLink(path: string) {
    try { void navigator.clipboard.writeText(location.origin + path); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard indispo */ }
  }

  // « Varier » : régénère des variantes de cette créa (même gabarit + son accroche comme angle).
  async function vary(a: AdItem) {
    if (varyBusy) return;
    setVaryBusy(true); setError('');
    const res = await generateAdsAction({ productId: productId || undefined, personaId: personaId || undefined, objective, templates: [a.template], angle: a.headline, count: 3, model, sourceVeille: a.sourceVeille ?? undefined });
    setVaryBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.ads?.length) { setAds((list) => [...res.ads!, ...list]); setDetailIdx(0); setAdsPage(0); }
  }

  /**
   * Décliner : UNE chose change, tout le reste est tenu.
   *
   * C'est l'inverse de « Varier », qui produit trois créas entières et change
   * donc tout à la fois · quand la mesure arrive, elle n'attribue l'écart à
   * rien. Ici la scène déjà payée reste, et la déclinaison se place juste après
   * son parent dans la grille pour qu'on les compare côte à côte.
   */
  const [declineBusy, setDeclineBusy] = useState<StudioVariable | null>(null);
  async function decline(a: AdItem, variable: StudioVariable) {
    if (declineBusy) return;
    setDeclineBusy(variable); setError('');
    const r = await declineAdAction({ id: a.id, variable, model });
    setDeclineBusy(null);
    if (r.error) { setError(r.error); return; }
    if (r.ad) {
      setAds((list) => {
        const i = list.findIndex((x) => x.id === a.id);
        if (i < 0) return [r.ad!, ...list];
        return [...list.slice(0, i + 1), r.ad!, ...list.slice(i + 1)];
      });
      // On ouvre la déclinaison · sinon rien à l'écran ne dit qu'elle existe.
      setDetailIdx((idx) => (idx == null ? idx : idx + 1));
    }
  }

  const selected = prods.find((p) => p.id === productId) || null;

  function toggle(t: AdTemplate) {
    setTemplates((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  async function archive(id: string) {
    setAds((list) => list.filter((a) => a.id !== id)); // retrait optimiste
    await archiveAdAction({ id });
  }

  function proposeAngles() {
    if (anglesBusy) return;
    setError('');
    startAngles(async () => {
      const r = await suggestAnglesAction({ productId: productId || undefined });
      if (r.error) setError(r.error);
      else setAngles(r.angles ?? []);
    });
  }

  function markHasImage(photoUrl?: string | null) {
    // On met à jour la MÊME référence que l'assistant et le moteur liront ·
    // vignette et « photo présente » restent cohérentes après un ajout (N01).
    setProds((list) => list.map((p) => (p.id === productId ? { ...p, hasImage: true, ...(photoUrl ? { photoUrl } : {}) } : p)));
  }

  async function addProductFiles(files: File[]) {
    if (!productId) { setError('Sélectionne d\'abord un produit ci-dessus.'); return; }
    const imgs = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type)).slice(0, 6);
    if (!imgs.length) { setError('Formats acceptés : jpg, png, webp.'); return; }
    setError(''); setProdMsg(''); setProdBusy(true);
    try {
      const uris = await Promise.all(imgs.map((f) => fileToDataUri(f, 1280)));
      const r = await setProductImagesAction({ productId, dataUris: uris, append: true });
      if (r.error) setError(r.error);
      else { const th = r.imageUrls ?? uris; setProdThumbs(th); markHasImage(th[0] ?? null); setProdMsg(`${th.length} photo(s) produit enregistrée(s). Elles serviront de référence.`); }
    } catch (err) { setError((err as Error).message); }
    setProdBusy(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void addProductFiles(files);
  }

  async function importAll() {
    if (bulkBusy) return;
    setError(''); setBulkMsg(''); setBulkBusy(true);
    const r = await importAllProductImagesAction();
    if (r.error) setError(r.error);
    else {
      if (r.updatedIds.length) setProds((list) => list.map((p) => (r.updatedIds.includes(p.id) ? { ...p, hasImage: true } : p)));
      const allDone = r.updated === 0 && !r.note;
      setBulkOk(r.updated > 0 || allDone);
      setBulkMsg(r.updated > 0 ? `${r.updated} photo(s) produit récupérée(s) depuis le site.` : (r.note || 'Toutes les photos produit sont déjà récupérées ✓'));
    }
    setBulkBusy(false);
  }

  async function onRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError('Formats acceptés : jpg, png, webp.'); return; }
    try { setRefUri(await fileToDataUri(file)); setSavedAdId(''); } catch (err) { setError((err as Error).message); }
  }

  function onDropRef(uris: string[]) {
    const uri = uris[0];
    if (!uri || !/^data:/.test(uri)) return;
    setError(''); setRefUri(uri); setSavedAdId('');
  }

  const hasRef = !!refUri || !!savedAdId;

  /**
   * Le retour d'une génération, traduit en une seule décision.
   *
   * La règle vient du noyau · un lot vide sans erreur n'est plus un succès
   * silencieux. C'est exactement ce qu'on obtenait avant : on cliquait, on
   * attendait, aucune image n'apparaissait, et rien ne disait pourquoi.
   */
  function applyResult(res: { error?: string; ads?: AdItem[]; requested?: number; essaiRompu?: string; appliquee?: string }): Outcome {
    const out = generationOutcome({ error: res.error, got: res.ads?.length ?? 0, requested: res.requested });
    if (res.ads?.length) setAds((list) => [...res.ads!, ...list]);
    setError(out.kind === 'error' ? out.message : '');
    // Le lot devait être un essai et n'a pas pu en être un · les publicités
    // sont là, la comparaison n'est pas valable. Le taire laisserait conclure
    // sur un lot dont on sait qu'il ne prouve rien.
    const rompu = res.essaiRompu ? `Ce lot ne compte pas comme un essai · ${res.essaiRompu}` : '';
    setNotice(out.kind === 'partial' ? out.message : rompu);
    // Ce que le lot a APPLIQUÉ de ce qui avait été mesuré · un lot qui n'est
    // plus une rotation égale sans rien dire se lit comme un hasard bizarre.
    if (res.appliquee) setApplique(res.appliquee);
    // Le débrief du lot · additionne les relectures des SEULES pubs qui
    // viennent d'arriver, pas de toute la grille. La règle (traduire un contrôle
    // en relecture, puis compter sans conclure) vit dans le noyau · ici on ne
    // fait que lui passer la matière. `null` si aucune n'a été relue, ce qui
    // efface aussi le débrief du lot précédent.
    setDebrief(debriefDepuisControles((res.ads ?? []).map((a) => a.controle)));
    return out;
  }

  /**
   * Lance la génération.
   *
   * `m` est passé explicitement · `run` lisait `mode` dans l'état, et le
   * démarrage rapide appelait `setMode('brand')` juste avant. Un `setState` ne
   * prend pas effet dans le même tour : depuis l'onglet « Cloner une pub
   * gagnante », le démarrage rapide partait donc dans la branche clone et
   * échouait sur une référence qu'on ne lui avait jamais demandée.
   */
  async function run(m: 'brand' | 'clone' = mode): Promise<Outcome> {
    if (busy) return { kind: 'error', message: 'Une génération est déjà en cours.' };
    setError(''); setNotice('');
    if (m === 'clone' && !hasRef) {
      const message = 'Choisis une pub de référence (veille ou upload).';
      setError(message);
      return { kind: 'error', message };
    }
    if (m === 'brand' && !templates.length) {
      const message = 'Choisis au moins un gabarit.';
      setError(message);
      return { kind: 'error', message };
    }
    // Le bouton reste sur « Génération… » tant que `busy` est vrai. Les actions
    // RENVOIENT normalement { error }, et alors tout se dénoue. Mais si l'une
    // LÈVE au lieu de renvoyer — coupure réseau, exception du fournisseur non
    // rattrapée côté serveur, délai de la requête serveur — le `await` propage,
    // `setBusy(false)` était sauté, et l'appelant (`onGenerer`) n'attrape pas.
    // Une seule exception figeait alors le bouton POUR TOUJOURS, sans un mot ·
    // c'est exactement « l'outil ne fonctionne plus », un échec rendu muet.
    //
    // Le `finally` garantit qu'on rend la main quoi qu'il arrive ; le `catch`
    // rend l'échec VISIBLE et le bouton de nouveau cliquable. On ne répare pas
    // la panne serveur ici · on refuse qu'elle passe pour une panne de l'outil.
    setBusy(true);
    // Déclaré au store d'app · l'indicateur « ça tourne » reste visible même si
    // on quitte le studio. Retiré dans le `finally`, qui s'exécute quoi qu'il
    // arrive (la promesse survit au démontage du composant).
    const jobId = demarrerGeneration(count, m === 'clone' ? 'Clone' : 'Pubs IA');
    try {
      const res = m === 'clone'
        ? await cloneAdAction({
            referenceDataUri: refUri || undefined, savedAdId: savedAdId || undefined,
            productId: productId || undefined, personaId: personaId || undefined,
            objective, universe, count, model,
            // En mode clone la description n'est pas un angle · c'est une consigne
            // libre, et elle est vraiment transmise. Un champ que le générateur
            // ignore est pire qu'un champ absent : on croit avoir dirigé.
            direction: angle.trim() || undefined,
            presetId: sceneId || undefined,
          })
        : await generateAdsAction({ productId: productId || undefined, personaId: personaId || undefined, objective, templates, angle: angle.trim() || undefined, universe, layout: layout === 'auto' ? undefined : layout, count, assetIds: assetIds.length ? assetIds : undefined, offer: offer.trim() || undefined, model, essai: essai || undefined, mode: fabrication, sourceVeille: initialSource ?? undefined });
      return apresLot(applyResult(res));
    } catch (e) {
      const message = `La génération s'est interrompue · ${(e as Error)?.message || 'erreur inattendue'}. Réessaie · si ça persiste, c'est côté serveur, pas ton lot.`;
      setError(message);
      return { kind: 'error', message };
    } finally {
      setBusy(false);
      terminerGeneration(jobId);
    }
  }

  /**
   * Amener les créas sous les yeux.
   *
   * La grille est en bas de page · un lot qui arrive pendant qu'on regarde le
   * formulaire ne se voit pas, et « rien ne s'est passé » est la conclusion
   * raisonnable quand rien ne bouge dans le champ de vision.
   */
  function apresLot(out: Outcome): Outcome {
    if (out.kind !== 'error') {
      setAdsPage(0);
      requestAnimationFrame(() => grille.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    return out;
  }

  /** Ce que l'assistant lit · les règles vivent dans le noyau, pas ici. */
  const etatAssistant = {
    productId, aPhotoProduit: !!selected?.hasImage,
    aDesProduits: prods.length > 0,
    angle, offre: offer, gabarits: templates, direction: universe === 'auto' ? '' : universe,
    mode: fabrication, nombre: count, moteur: model,
  };

  return (
    <div>
      {/* L'assistant est monté au PREMIER NIVEAU, jamais dans un panneau.
           Il vivait sous `<div hidden={!avance}>` : ouvrir l'assistant posait
           bien `assistant = true`, mais son ancêtre restait masqué, donc rien
           n'apparaissait. Le bandeau semblait mort · il ne l'était pas, il
           ouvrait une fenêtre à l'intérieur d'un tiroir fermé.

           Une fenêtre modale n'a aucune raison d'être l'enfant d'un panneau
           qu'on replie : ce qu'elle recouvre, c'est l'écran entier. */}
      <AssistantPub
        ouvert={assistant}
        onFermer={() => setAssistant(false)}
        etat={etatAssistant}
        produits={prods}
        libelleGabarit={(t) => TPL_LABEL[t]}
        selecteurStyle={<UniversePicker value={universe} onChange={setUniverse} compact />}
        conseilMoteurs={conseilMoteurs}
        gabaritsDispo={Object.keys(TPL_LABEL) as AdTemplate[]}
        onProduit={setProductId}
        onGabarit={toggle}
        onAngle={setAngle}
        onOffre={setOffer}
        onDirection={(v) => setUniverse(v || 'auto')}
        onMode={(v) => choisirFabrication(v as ProductionMode)}
        onNombre={setCount}
        onMoteur={choisirMoteur}
        busy={busy}
        erreur={error}
        budget={budget}
        onGenerer={() => { void run('brand').then((out) => { if (producedSomething(out)) setAssistant(false); }); }}
      />

      {/* Hero CTA · démarrage rapide (façon Atria) */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, marginBottom: 20, padding: '22px 24px', border: '1px solid var(--accent-strong)', background: 'linear-gradient(120deg, rgba(255,60,120,.16), rgba(255,140,66,.08) 60%, var(--surface))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--accent-strong)' }}>DÉMARRAGE RAPIDE</div>
            <h2 style={{ margin: '4px 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Génère des pubs à tester, en 1 clic</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', maxWidth: 520, lineHeight: 1.5 }}>
              Pars d’un format repéré sur le marché, on applique ta marque{brandName ? <> <b>{brandName}</b></> : null} et ton produit, puis on génère plusieurs variantes.
            </p>
          </div>
          {/* Deux entrées, et la seconde est la SEULE chose que le démarrage
              rapide ne sait pas faire · c'est ce qui justifie qu'un second
              formulaire existe encore, et il n'a plus à être ouvert pour être
              trouvé. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={!ready} onClick={() => { setMode('brand'); setAssistant(true); setError(''); }} style={{
              padding: '14px 24px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 15, cursor: ready ? 'pointer' : 'default',
              background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: ready ? 1 : .5, boxShadow: '0 10px 30px -8px rgba(255,60,120,.5)', whiteSpace: 'nowrap',
            }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}><Icon name="sparkles" size={16} /> Créer des pubs</span></button>
            <button type="button" disabled={!ready} onClick={() => { setMode('clone'); setAvance(true); setError(''); requestAnimationFrame(() => composeur.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} style={{
              padding: '14px 20px', borderRadius: 999, fontWeight: 700, fontSize: 14, cursor: ready ? 'pointer' : 'default',
              border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', opacity: ready ? 1 : .5, whiteSpace: 'nowrap',
            }}>Cloner une pub qui tient</button>
          </div>
        </div>
      </div>

      {/* Le mode expert · un seul repli, clairement secondaire.
           Le chemin principal est l'assistant (« Créer des pubs » ci-dessus),
           une décision par écran, moteur et mode réglés au mieux mesuré. Ici
           vit ce que l'assistant ne fait pas · cloner une pub, charger une photo
           produit, rappeler une scène, forcer objectif et persona. On ne déplie
           que pour forcer un réglage. */}
      <div ref={composeur} style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', marginBottom: 28, scrollMarginTop: 16 }}>
        <button type="button" onClick={() => setAvance((v) => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '14px 22px',
          border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)' }}>Réglages avancés</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            · cloner une pub, photo produit, scènes, objectif, persona
          </span>
          {/* Armé en clone mais replié, la référence chargée deviendrait
              invisible · on le dit dans l'en-tête. */}
          {mode === 'clone' && (
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', padding: '2px 8px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap' }}>
              Clonage armé
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{avance ? 'Replier' : 'Déplier ›'}</span>
        </button>

        <div hidden={!avance} style={{ padding: '0 22px 22px' }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={18} /></span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Pubs IA en attente du moteur d’image.</b> Elle s’active dès que le moteur est configuré sur le serveur.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['brand', 'Depuis la marque'], ['clone', 'Cloner une pub qui tient']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => { setMode(k); setError(''); }} aria-pressed={mode === k} style={{
              fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? 'var(--on-accent)' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
        </div>

        {/* Récupération auto au chargement ; ce rappel n'apparaît que s'il reste des photos manquantes. */}
        {prods.some((p) => !p.hasImage) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 5 }}><Icon name="image" size={15} /></span>Photos produit : <b>{prods.filter((p) => p.hasImage).length}/{prods.length}</b> · certaines manquent.
            </span>
            <button type="button" onClick={importAll} disabled={!ready || bulkBusy} style={{ ...miniBtn, opacity: ready && !bulkBusy ? 1 : .6 }}>
              {bulkBusy ? 'Récupération…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="link" size={14} /> Réessayer depuis le site</span>}
            </button>
            {bulkMsg && <span style={{ fontSize: 11.5, color: bulkOk ? '#9fe6b3' : '#f5b043' }}>{bulkMsg}</span>}
          </div>
        )}

        {/* La barre de composition · la même que dans les studios Image et
            Vidéo. On écrit d'abord, on règle ensuite, et le prix est sur le
            bouton. Ce qui reste en dessous est structurel — gabarits, photo,
            références — et ne se met pas en pastille sans devenir illisible. */}
        <Composer
          value={angle}
          onChange={(v) => { setAngle(v); setSceneId(''); }}
          placeholder={mode === 'brand'
            ? 'Décris l’angle ou la scène que tu imagines · ex : Focus sans caféine ni crash, pour créateurs en surrégime'
            : 'Consigne libre pour le clonage · ex : garde la structure mais passe en extérieur, lumière du matin'}
          disabled={!ready}
          busy={busy}
          // L'angle est facultatif : les gabarits suffisent à lancer une série.
          // Exiger un texte dont le générateur peut se passer serait inventer
          // une contrainte.
          requireText={false}
          scenes={scenes}
          onPickScene={(sc) => setSceneId(sc.id)}
          onSaveScene={enregistrer}
          advice={conseil(sceneId)}
          preflight={preflight}
          controls={[
            ...(prods.length ? [{
              key: 'produit', title: 'Produit mis en scène', icon: 'box',
              options: [{ value: '', label: 'Aucun produit' }, ...prods.map((p) => ({ value: p.id, label: `${p.name}${p.hasImage ? ' · photo' : ''}` }))],
              value: productId,
              onChange: (v: string) => { setProductId(v); setProdThumbs([]); setProdMsg(''); },
            }] : []),
            ...(personas.length ? [{
              key: 'persona', title: 'À qui on parle', icon: 'user',
              options: [{ value: '', label: 'Persona · auto' }, ...personas.map((p) => ({ value: p.id, label: p.name }))],
              value: personaId, onChange: setPersonaId,
            }] : []),
            {
              key: 'objectif', title: 'Objectif de la série', icon: 'target',
              options: OBJECTIVES.map((o) => ({ value: o, label: o })),
              value: objective, onChange: setObjective,
            },
            {
              key: 'quantite', title: 'Nombre de variantes', icon: 'layers',
              options: [1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: `${n} pub${n > 1 ? 's' : ''}` })),
              value: String(count), onChange: (v: string) => setCount(Number(v)),
            },
            {
              key: 'modele', title: 'Moteur d’image', icon: 'sparkles',
              // Ce que la mesure dit VRAIMENT · le moteur qui tient le mieux la
              // copie (plus faible taux de réécriture d'accroche), pas « le plus
              // performant ». « Gagne le marché » se mesure ailleurs (verdict) ·
              // promettre la performance sur un signal de fidélité serait mentir.
              options: IMAGE_MODELS.map((m) => ({ value: m.key, label: `${m.label}${fabrication === 'entiere' && conseilMoteurs.recommande === m.key ? ' · tient le mieux ta copie ici' : moteurRecommande(fabrication) === m.key ? ' · recommandé' : ''}` })),
              value: model, onChange: choisirMoteur,
            },
          ]}
          extra={
            <>
              {mode === 'brand' && (
                <button type="button" onClick={proposeAngles} disabled={!ready || anglesBusy} style={pastilleAction(ready && !anglesBusy)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={15} /> {anglesBusy ? 'Analyse veille…' : `Proposer des angles · ${costFor('suggest')} cr.`}</span>
                </button>
              )}
              {templates.includes('offer') && (
                <input value={offer} onChange={(e) => setOffer(e.target.value)} disabled={!ready}
                  aria-label="Offre" placeholder="Offre · ex : -20 %, code LANCEMENT"
                  style={{ ...fld, width: 'auto', flex: '1 1 190px', minWidth: 150, padding: '7px 12px', fontSize: 12.5, borderRadius: 999 }} />
              )}
            </>
          }
          cost={{
            // Un essai d'accroches ou de mises en page ne produit QU'UNE image ·
            // la barre suit donc le débit réel (`creditsAnnoncesLot`, même source
            // que `prixEssai` côté serveur), au lieu du plein tarif d'un lot.
            credits: creditsAnnoncesLot(essai || null, count, modelSpec.credits),
            // En entière, la reprise des pubs cassées se réserve · on l'annonce
            // ici, avant le clic, plafond et remboursement compris.
            note: `${modelSpec.label} · ${modelSpec.credits} crédits par pub · ${modelSpec.note}`
              + (fabrication === 'entiere' && !essai && budgetReprises(count) > 0
                ? ` · reprise des pubs cassées jusqu’à +${modelSpec.credits * budgetReprises(count)} cr., remboursés si inutilisés`
                : ''),
          }}
          onGenerate={run}
          // Ce qui manque, dit SOUS le bouton et avant le clic.
          //
          // Les gabarits démarrent vides. Le bouton avait donc l'air actif, le
          // clic était refusé, et « Choisis au moins un gabarit » s'affichait
          // ailleurs sur la page · hors du champ de vision de qui vient de
          // cliquer. « Le bouton ne fonctionne pas » est exactement ce qu'on
          // voit dans ce cas.
          blocage={mode === 'brand' && !templates.length ? 'Coche au moins un gabarit ci-dessus.' : ''}
          generateLabel={mode === 'clone' ? `Cloner en ${count}` : 'Générer les pubs'}
        />

        {/* Les angles proposés · sous la barre, ils remplissent la description. */}
        {mode === 'brand' && angles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {angles.map((a, i) => (
              <button key={i} type="button" onClick={() => { setAngle(a.title); setSceneId(''); }} title={a.rationale} style={{
                fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', maxWidth: 300,
                border: `1px solid ${angle === a.title ? 'transparent' : 'var(--line-2)'}`,
                background: angle === a.title ? 'var(--grad-accent)' : 'transparent', color: angle === a.title ? 'var(--on-accent)' : 'var(--ink-2)',
              }}>{a.title}</button>
            ))}
          </div>
        )}

        {sceneErreur && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{sceneErreur}</div>}

        <h3 style={{ margin: '24px 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--ink-2)', letterSpacing: '.02em' }}>
          Réglages de la série
        </h3>

        {!productId && prods.some((p) => p.hasImage) && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.07)', fontSize: 12.5, color: '#f5b043' }}>
            <span style={{ display: 'inline-flex', verticalAlign: '-3px', marginRight: 5, color: '#ffb3c0' }}><Icon name="alert" size={15} /></span>Sélectionne ton <b>produit</b> ci-dessus (pas « Aucun ») pour que ton vrai packaging apparaisse dans les pubs.
          </div>
        )}

        {productId && (
          <div
            onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => prodImgInput.current?.click()}
            style={{
              display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: 14, borderRadius: 14, cursor: 'pointer',
              border: `1.5px dashed ${dragOver ? 'var(--accent-strong)' : selected?.hasImage ? 'rgba(120,220,150,.5)' : 'rgba(245,166,35,.5)'}`,
              background: dragOver ? 'var(--accent-soft)' : selected?.hasImage ? 'rgba(120,220,150,.07)' : 'rgba(245,166,35,.07)',
            }}
          >
            <input ref={prodImgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) void addProductFiles(fs); e.currentTarget.value = ''; }} disabled={!ready || prodBusy} style={{ display: 'none' }} />
            {prodThumbs.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {prodThumbs.slice(0, 4).map((u, i) => (
                   
                  <img key={i} src={u} alt="" style={{ width: 56, height: 56, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--line-2)' }} />
                ))}
              </div>
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexShrink: 0 }}><Icon name={selected?.hasImage ? 'image' : 'upload'} size={26} /></div>
            )}
            <div style={{ flex: '1 1 240px', minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                {selected?.hasImage || prodThumbs.length ? 'Photo(s) produit prête(s) ✓ · ton vrai packaging sera utilisé' : 'Glisse-dépose une ou plusieurs photos de ton produit'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                Glisser-déposer ici, ou clique pour choisir. Plusieurs angles = meilleure fidélité (jpg, png, webp).
              </div>
              {prodBusy && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--muted)' }}>Traitement…</div>}
              {prodMsg && <div style={{ marginTop: 6, fontSize: 11.5, color: '#9fe6b3' }}>{prodMsg}</div>}
            </div>
          </div>
        )}

        {/* Univers visuel · commun aux deux modes.

             C'était une rangée de libellés avec une pastille de couleur. On ne
             choisit pas une ambiance en lisant « Éditorial premium » · on la
             reconnaît, et le seul moyen de vérifier était de payer une
             génération pour voir. */}
        {/* La mise en page décide de la COMPOSITION, l'univers décide de
            l'AMBIANCE. Deux décisions de forme · elles vont ensemble. */}
        {/* Comment on fabrique · le choix se fait sur ce que chaque mode TIENT,
            pas sur son nom. Les deux garantissent le produit ; une seule
            garantit les textes, et l'autre rend mieux. */}
        <label style={lbl}>Fabrication</label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
          {PRODUCTION_MODES.map((m) => {
            const on = fabrication === m;
            return (
              <button key={m} type="button" disabled={!ready} onClick={() => choisirFabrication(m)} aria-pressed={on} style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: ready ? 'pointer' : 'default',
                fontWeight: on ? 800 : 600, opacity: ready ? 1 : .55,
                border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                background: on ? 'var(--grad-accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-2)',
              }}>{PRODUCTION_LABEL[m]}{conseilModes.mesure && conseilModes.defaut === m ? ' · conseillé' : ''}</button>
            );
          })}
        </div>
        {/* L'adoption du mode mesuré est ANNONCÉE, jamais silencieuse · un défaut
            qui suit la mesure sans le dire se lit comme un bug. Montré tant que le
            mode conseillé est en place · un clic vers l'autre mode l'efface. */}
        {conseilModes.mesure && fabrication === conseilModes.defaut && (
          <p style={{ margin: '0 0 10px', padding: '9px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 11.5, fontWeight: 600, color: '#ffca6b', lineHeight: 1.5 }}>
            {conseilModes.motif}
          </p>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          {PRODUCTION_RESUME[fabrication]}<br />
          <b style={{ color: '#7ee8bf' }}>Garanti</b> · {garanties(fabrication).join(' · ')}.<br />
          <b style={{ color: '#ffca6b' }}>Pas garanti</b> · {reserves(fabrication).join(' · ')}.
        </p>

        {/* Ce que le lot a APPLIQUÉ · mesurer et appliquer en silence revient
            à mesurer en cachette, et le lot suivant a l'air d'un hasard. */}
        {applique && (
          <p style={{ margin: '0 0 12px', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(126,232,191,.3)', background: 'var(--paper)', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            <b style={{ color: '#7ee8bf' }}>Appliqué</b> · {applique}
          </p>
        )}

        {/* Le conseil d'itération (« prochaine hypothèse ») vit désormais près de
            la grille de résultats, visible sans déplier · fermer la boucle là où
            on voit ce qu'on vient de produire. Il n'est plus dupliqué ici. */}

        {/* Ce que le lot cherche à savoir · écrit AVANT d'être payé. */}
        <label style={lbl}>Ce lot teste <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· une seule chose varie, le reste est tenu</span></label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
          {[{ key: '' as const, label: 'Rien · lot libre', dispo: true },
            ...ESSAI_VARIABLES.map((k) => ({ key: k, label: ESSAI_LABEL[k], dispo: essaiVisibleEnMode(k, fabrication) }))].map((e) => {
            const on = essai === e.key;
            // « Les accroches » / « Les mises en page » ne varient rien de visible
            // en entière · on les grise et on dit pourquoi, plutôt que de laisser
            // fabriquer quatre fois le même visuel sous une étiquette d'essai.
            const actif = ready && e.dispo;
            return (
              <button key={e.key || 'libre'} type="button" disabled={!actif} onClick={() => setEssai(e.key)} aria-pressed={on}
                title={e.dispo ? undefined : `Indisponible en « ${PRODUCTION_LABEL.entiere} » · le texte est cuit dans l'image, tenir la scène rendrait le même visuel. Repasse en composée pour tester ${e.label.toLowerCase()}.`}
                style={{
                  padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: actif ? 'pointer' : 'default',
                  fontWeight: on ? 800 : 600, opacity: actif ? 1 : .5,
                  border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                  background: on ? 'var(--grad-accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-2)',
                }}>{e.label}</button>
            );
          })}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          {essai ? (
            <>
              <b style={{ color: 'var(--ink-2)' }}>{hypotheseEssai(essai, countEssai)}</b><br />
              Tenu : {tenuDansEssai(essai).join(', ')}.
              {' '}{imagesPourEssai(essai, countEssai) === 1
                ? <>Une seule image est produite pour les {countEssai} · <b style={{ color: 'var(--ink-2)' }}>{economieEssai(essai, countEssai, modelSpec.credits)} crédits de moins</b> qu’un lot libre.</>
                : <>Une image par ambiance, donc {countEssai}.</>}
            </>
          ) : (
            <>Quatre paris indépendants. Quand la mesure arrivera, la gagnante aura changé d’accroche <i>et</i> de composition <i>et</i> d’ambiance · on saura qu’elle a marché, pas pourquoi.</>
          )}
        </p>

        <label style={lbl}>Mise en page <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· la composition de la pub</span></label>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {[{ key: 'auto', label: 'Variées (auto)', hint: 'Un lot ne répète jamais la même · c’est le réglage par défaut.' },
            ...AD_LAYOUTS.map((k) => ({ key: k, label: LAYOUT_LABEL[k], hint: LAYOUT_HINT[k] }))].map((l) => {
            const on = layout === l.key;
            return (
              <button key={l.key} type="button" disabled={!ready} title={l.hint} onClick={() => setLayout(l.key)} aria-pressed={on} style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: ready ? 'pointer' : 'default',
                fontWeight: on ? 800 : 600, opacity: ready ? 1 : .55,
                border: `1px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                background: on ? 'var(--grad-accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-2)',
              }}>{l.label}</button>
            );
          })}
        </div>

        <label style={lbl}>Univers visuel <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· l'ambiance des visuels</span></label>
        <div style={{ marginBottom: 16 }}>
          <UniversePicker value={universe} onChange={setUniverse} disabled={!ready} />
        </div>

        {mode === 'brand' ? (
          <>
            {/* Références Assets · quand rien n'est coché, l'IA utilise automatiquement la bibliothèque. */}
            {assets.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Références (Assets) <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {assetIds.length ? `${assetIds.length} sélectionnée(s)` : 'auto · toute la bibliothèque'}{assets.some((a) => a.isTemplate) ? ' · ★ templates de l’agence en tête' : ''}</span></label>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {/* Les templates curés par l'agence tombent sous les yeux d'abord. */}
                  {templatesDabord(assets).map((a) => {
                    const on = assetIds.includes(a.id);
                    return (
                      <button key={a.id} type="button" onClick={() => toggleAsset(a.id)} aria-pressed={on} title={a.isTemplate ? `${a.name} · template de l’agence` : a.name} style={{ position: 'relative', flex: '0 0 auto', width: 62, height: 62, borderRadius: 10, overflow: 'hidden', padding: 0, cursor: 'pointer', border: `2px solid ${on ? 'var(--accent-strong)' : (a.isTemplate ? 'var(--accent-strong)' : 'var(--line-2)')}`, background: 'var(--paper)', opacity: on ? 1 : 0.85 }}>
                        {/* Même miniature que la bibliothèque · un lien cassé tombe
                            sur l'icône de type, jamais l'image cassée du navigateur. */}
                        <MiniatureAsset kind="image" url={a.url} thumbUrl={a.thumbUrl} name={a.name} cadreStyle={{ width: '100%', height: '100%', aspectRatio: 'auto' }} />
                        {a.isTemplate && <span title="Template de l’agence" style={{ position: 'absolute', top: 2, left: 2, display: 'inline-flex', color: 'var(--on-accent)', background: 'var(--grad-accent)', borderRadius: '50%', width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}><Icon name="star" size={9} /></span>}
                        {on && <span style={{ position: 'absolute', top: 2, right: 2, width: 15, height: 15, borderRadius: '50%', background: 'var(--grad-accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={10} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label style={lbl}>Gabarits <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· exécutions autorisées ({templates.length} sélectionné{templates.length > 1 ? 's' : ''})</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 4 }}>
              {TEMPLATES.map((t) => {
                const on = templates.includes(t.key);
                return (
                  <button key={t.key} type="button" disabled={!ready} onClick={() => toggle(t.key)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 13px', borderRadius: 14, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
                    border: `1.5px solid ${on ? 'transparent' : 'var(--line-2)'}`,
                    background: on ? 'var(--grad-accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-2)',
                  }}>
                    <Icon name={t.icon} size={22} />
                    <span style={{ fontSize: 12.5, fontWeight: on ? 800 : 600 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <DropZone onImages={onDropRef} onError={setError} disabled={!ready || busy} hint="Déposer la pub à cloner" style={{ padding: 14, border: '1px solid var(--line-2)', background: 'rgba(255,255,255,.02)' }}>
            <label style={lbl}>Pub gagnante à cloner <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· l'IA reprend l'angle + la structure, sur TON produit, en {count} variation{count > 1 ? 's' : ''} · <b style={{ color: 'var(--ink-2)' }}>glisse-dépose la capture</b></span></label>

            {savedRefs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Depuis ta Veille (sauvegardes)</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {savedRefs.map((r) => {
                    const on = savedAdId === r.id;
                    return (
                      <button key={r.id} type="button" disabled={!ready || busy} onClick={() => { setSavedAdId(on ? '' : r.id); setRefUri(''); }} title={r.brandName ?? ''} style={{
                        padding: 0, borderRadius: 10, flexShrink: 0, cursor: ready && !busy ? 'pointer' : 'default', background: 'transparent',
                        border: `2px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                      }}>
                        { }
                        <img src={r.imageUrl} alt="" style={{ width: 74, height: 94, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {refUri ? (
                 
                <img src={refUri} alt="" style={{ width: 96, height: 120, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line-2)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 96, height: 120, borderRadius: 10, border: '1px dashed var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexShrink: 0 }}><Icon name="trophy" size={26} /></div>
              )}
              <div style={{ flex: '1 1 240px', minWidth: 220 }}>
                <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={onRefFile} disabled={!ready || busy} style={{ display: 'none' }} />
                <button type="button" onClick={() => refInput.current?.click()} disabled={!ready || busy} style={{
                  fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 999, cursor: ready && !busy ? 'pointer' : 'default',
                  border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', opacity: ready ? 1 : .55,
                }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="upload" size={14} /> {refUri ? 'Changer la capture' : 'Importer une capture'}</span></button>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {savedRefs.length ? 'Choisis une pub de ta Veille ci-dessus, ou importe une capture.' : "Capture d'une pub qui marche (concurrent, veille, bibliothèque)."} L'IA en déduit l'angle + le gabarit et produit {count} variation{count > 1 ? 's' : ''} sur ta marque et ton produit.
                </p>
              </div>
            </div>
          </DropZone>
        )}

        </div>

        {/* Hors du repli · un message rangé dans un panneau fermé est un message
            absent, et c'est précisément ce qui donnait « il ne se passe rien ». */}
        {/* `busy` et `error` restent près du composeur · c'est là qu'on est
            quand la génération tourne ou échoue (un échec ne défile pas). Le
            `notice` d'un lot ARRIVÉ (partiel, essai rompu), lui, décrit les
            créas qui viennent d'atterrir dans la grille · après génération, le
            regard défile vers la grille, donc le notice descend avec, sinon il
            reste hors du champ de vision. Il est rendu près de la grille. */}
        {(busy || error) && (
          <div style={{ padding: '0 22px 18px' }}>
            {busy && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{mode === 'clone' ? 'Analyse de la référence, déclinaison en variations et composition… (~20-40 s)' : 'Écriture des concepts, génération des scènes et composition… (~20-40 s)'}</p>}
            {error && <div role="alert" style={{ marginTop: 10, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
          </div>
        )}
      </div>

      {/* La boucle, fermée SUR PLACE · après un lot, l'hypothèse suivante à
          tester s'affiche ici, déduite de ce qui est DÉJÀ mesuré (aucun modèle
          appelé). Un clic l'arme et rouvre l'assistant · le prix est annoncé
          avant de générer, et l'on ne part pas sur Adsmap pour itérer. Elle
          vivait dans les réglages avancés, repliés · donc invisible au moment
          exact où elle sert. `null` quand la mesure ne tranche pas · le silence
          est une réponse. */}
      {suggestion && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 16px', padding: '12px 15px', borderRadius: 14,
          border: `1px solid ${suggestion.avantTout ? 'rgba(255,90,120,.35)' : 'var(--line-2)'}`,
          background: 'linear-gradient(120deg, rgba(255,60,120,.08), var(--surface))',
        }}>
          <span style={{ display: 'inline-flex', color: suggestion.avantTout ? '#ffb3c0' : 'var(--accent-strong)' }}><Icon name={suggestion.avantTout ? 'alert' : 'swap'} size={17} /></span>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: suggestion.avantTout ? '#ffb3c0' : 'var(--accent-strong)' }}>
              {suggestion.avantTout ? 'AVANT DE TESTER' : ads.length > 0 ? 'PROCHAINE HYPOTHÈSE' : 'JARVIS CONSEILLE'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 2, lineHeight: 1.4 }}>{suggestion.question}</div>
            {suggestion.pourquoi && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{suggestion.pourquoi}</div>}
            {suggestion.avantTout && <div style={{ fontSize: 11.5, color: '#ffb3c0', marginTop: 4, lineHeight: 1.4 }}>{suggestion.avantTout}</div>}
          </div>
          {/* Ce que la mesure a DÉJÀ tranché gagnant · nommé, et réappliquable d'un
              clic. Avant, l'outil disait « applique ce qui a gagné » sans jamais
              dire quoi · le gagnant vivait dans le cumul, l'écran ne le lisait pas. */}
          {suggestion.gagnants.length > 0 && (
            <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)' }}>GAGNANTS MESURÉS</span>
              {suggestion.gagnants.map((g) => (
                <button key={g.variable + g.valeur} type="button" disabled={!ready}
                  onClick={() => appliquerGagnant(g)}
                  title={`Reprendre ${ESSAI_LABEL[g.variable].toLowerCase()} · gagnant sur ${g.essais} essais`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, border: '1px solid rgba(126,232,191,.4)', background: 'rgba(126,232,191,.08)', color: 'var(--ink)', fontSize: 11.5, fontWeight: 600, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .5 }}>
                  <span style={{ color: 'var(--muted)' }}>{ESSAI_LABEL[g.variable]} ·</span>
                  <b style={{ color: '#7ee8bf' }}>{libelleGagnant(g)}</b>
                  <span style={{ color: 'var(--muted)', fontWeight: 700 }}>· appliquer</span>
                </button>
              ))}
            </div>
          )}
          {suggestion.variable && suggestion.variable !== essai && (
            <button type="button" disabled={!ready} onClick={() => { setEssai(suggestion.variable!); setMode('brand'); setAssistant(true); setError(''); }} style={{
              padding: '11px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: ready ? 'pointer' : 'default',
              background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: ready ? 1 : .5, whiteSpace: 'nowrap',
            }}>Tester {ESSAI_LABEL[suggestion.variable].toLowerCase()} ›</button>
          )}
        </div>
      )}

      <div ref={grille} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, scrollMarginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Tes pubs {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{ads.length}</span>
      </div>
      {/* La nuance du dernier lot (partiel, essai rompu) · rendue ICI, au point
          d'atterrissage du défilement post-génération, pour ne pas rester hors
          champ en haut de page. */}
      {notice && <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', color: '#f5b043' }}>{notice}</div>}
      {/* Le lot entière, lu d'un coup · les trois questions qui décident si le
          mode est viable, additionnées sur les pubs qui viennent d'arriver.
          Rien tant qu'aucune n'a été relue. */}
      <DebriefLotPanel d={debrief} nCassees={indicesCasses.length} onReprendre={indicesCasses.length ? () => setDetailIdx(indicesCasses[0]!) : undefined} onClose={() => setDebrief(null)} />
      {ads.length === 0 ? (
        <Empty
          tone="wait" title="Aucune pub pour l’instant."
          why="Lance ta première série ci-dessus · les pubs générées s’empilent ici, avec leur concept et leur accroche."
        />
      ) : (
        (() => {
        // Les titres partagés par une autre pub du lot · calculés sur TOUT le lot
        // (pas seulement la page), pour distinguer deux accroches identiques même
        // à cheval sur deux pages (CDC v7 · N06).
        const homonymes = idsHomonymes(ads.map((a) => ({ id: a.id, titre: a.headline })));
        return (
        <>
          <BarreFiltresGalerie
            criteres={criteres}
            onChange={(c) => { setCriteres(c); setAdsPage(0); }}
            formats={formatsPresents}
            formatLabel={(f) => TPL_LABEL[f as keyof typeof TPL_LABEL] ?? f}
            nGarde={adsFiltrees.length}
            nTotal={ads.length}
          />
          {adsFiltrees.length === 0 ? (
            <Empty
              tone="wait" title="Aucune pub ne correspond à ces filtres."
              why="Élargis la recherche ou efface les filtres pour retrouver tes pubs."
            />
          ) : (
          <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {pagedAds.map((a) => {
            // Le détail s'ouvre par ID sur la liste COMPLÈTE · filtrer la vue ne
            // déplace pas la navigation précédent/suivant.
            const idx = ads.findIndex((x) => x.id === a.id);
            // Un distingueur seulement quand le titre se confond · date + heure,
            // toujours différentes d'une génération à l'autre.
            const sousTitre = homonymes.has(a.id)
              ? new Date(a.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : undefined;
            // Filiation et essai · une déclinaison qui ne se présente pas comme
            // telle est une créa de plus dans la grille · on la lit alors à l'œil
            // au lieu de la lire comme la réponse à une question posée.
            // La provenance de veille · d'où vient cette création (CDC v8). Le lien
            // vers la bibliothèque de l'annonceur est DÉRIVÉ (jamais stocké), et
            // n'apparaît que s'il vise juste · sinon le nom seul, ou la seule
            // mention de la source quand l'annonceur est inconnu.
            const src = a.sourceVeille ?? null;
            const lienSrc = lienSourceVeille(src);
            const meta = (a.variable || a.essai || src) ? (
              <>
                {a.variable && <span style={filiation}>↳ {STUDIO_LABEL[a.variable].toLowerCase()}</span>}
                {a.essai && <span style={{ ...filiation, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="scale" size={12} /> essai · {ESSAI_LABEL[a.essai].toLowerCase()}</span>}
                {src && (
                  <span style={{ ...filiation, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="search" size={12} />
                    {src.annonceur ? (
                      <>inspiré de · {lienSrc
                        ? <a href={lienSrc.url} target="_blank" rel="noopener noreferrer" title={lienSrc.label} style={{ color: 'var(--ink-2)', fontWeight: 700, textDecoration: 'none' }}>{src.annonceur}</a>
                        : <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{src.annonceur}</b>}</>
                    ) : 'inspiré d’une source de veille'}
                  </span>
                )}
              </>
            ) : undefined;
            // Pourquoi Jarvis l'a proposée · calculé depuis la mémoire, pas rédigé
            // par le modèle · une proposition qui s'explique se conteste.
            const note = a.rationale && a.rationale.length > 0 ? (
              <div style={{ display: 'grid', gap: 3 }}>
                {a.rationale.map((r, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.45 }}>{r}</p>
                ))}
              </div>
            ) : undefined;
            return (
              <CartePub key={a.id} ad={a} format={TPL_LABEL[a.template]} sousTitre={sousTitre} meta={meta} note={note}
                vignetteUrl={vignette(a.url)} fullUrl={a.url}
                onOpen={() => setDetailIdx(idx)} onArchive={() => archive(a.id)} trackable={adsmap} />
            );
          })}
          </div>
          <Pager page={adsPage} total={adsFiltrees.length} onPage={setAdsPage} /></>
          )}
        </>
        );
        })()
      )}

      {preview && (
        <Portail><div ref={previewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Aperçu plein écran" onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,4,8,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          <img src={preview} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }} />
          <button type="button" onClick={() => setPreview(null)} aria-label="Fermer" style={{ position: 'fixed', top: 18, right: 20, width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div></Portail>
      )}

      {/* Vue détail d'une créa (façon Atria) : grand aperçu + outils à droite + navigation */}
      {detailAd && (
        <Portail><div onMouseDown={() => setDetailIdx(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(6,4,8,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {/* À l'étroit (mobile), le détail EMPILE au lieu de garder deux colonnes ·
              l'aperçu réclame min(320px,100%), donc il passe au-dessus du rail
              d'outils sous ~550px et l'image retrouve une largeur utile (S23, CDC
              v8 · N06). Le dialogue défile en vertical pour que les outils et la
              fermeture restent atteignables une fois empilés. Desktop inchangé. */}
          {/* Côte à côte (desktop) · le dialogue NE défile PAS en bloc · la zone
              média est bornée à la hauteur visible et le rail défile seul. Empilé
              (≤575px) · le dialogue défile en un bloc pour atteindre outils et
              fermeture. C'est ce qui empêche l'image d'être centrée hors cadre. */}
          <div ref={detailRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Détail de la pub · ${detailAd.headline}`} onMouseDown={(e) => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 0, width: 'min(980px, 96vw)', maxHeight: '92vh', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, overflowX: 'hidden', overflowY: detailEmpile ? 'auto' : 'hidden', boxShadow: '0 30px 90px -20px rgba(0,0,0,.8)' }}>
            {/* Aperçu + navigation */}
            <div style={{ flex: 1, minWidth: 'min(320px, 100%)', maxHeight: detailEmpile ? '46vh' : '92vh', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', padding: 18 }}>
              {detailIdx != null && detailIdx > 0 && (
                <button type="button" onClick={() => { setDetailIdx((i) => Math.max(0, (i ?? 0) - 1)); setEditText(false); setScoreFor(null); }} aria-label="Précédent" style={navArrow('left')}>‹</button>
              )}
              { }
              {/* Clic (ou Entrée/Espace) → zoom plein écran · la lightbox
                  existait mais rien ne l'ouvrait. Elle passe au-dessus de la
                  modale (z-index 200 > 110). */}
              <img src={detailSrc} alt={detailAd.headline}
                role="button" tabIndex={0} title="Agrandir en plein écran"
                onClick={() => setPreview(detailSrc)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreview(detailSrc); } }}
                style={{ maxWidth: '100%', maxHeight: detailEmpile ? '42vh' : '78vh', borderRadius: 10, objectFit: 'contain', cursor: 'zoom-in' }} />
              {detailIdx != null && detailIdx < ads.length - 1 && (
                <button type="button" onClick={() => { setDetailIdx((i) => Math.min(ads.length - 1, (i ?? 0) + 1)); setEditText(false); setScoreFor(null); }} aria-label="Suivant" style={navArrow('right')}>›</button>
              )}
              {/* Sélecteur de ratio · seulement quand le cadre est un vrai choix
                  (composée). Une entière n'a qu'un format · on le dit plutôt que
                  d'offrir des cadres qui ne recomposent rien. */}
              {fmtApercu.choixCadre ? (
                <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, background: FOND_PASTILLE_MEDIA, padding: 5, borderRadius: 999 }}>
                  {(['9:16', '4:5', '1:1'] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setRatio(r)} style={{
                      minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center',
                      fontSize: 11.5, fontWeight: 800, padding: '5px 13px', borderRadius: 999, cursor: 'pointer', border: 'none',
                      background: ratio === r ? 'var(--grad-accent)' : 'transparent', color: ratio === r ? 'var(--on-accent)' : '#fff',
                    }}>{r}</button>
                  ))}
                </div>
              ) : (
                <span style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 11.5, fontWeight: 800, padding: '5px 13px', borderRadius: 999, background: FOND_PASTILLE_MEDIA, color: '#fff' }}>Format d’origine</span>
              )}
              <span style={{ position: 'absolute', top: 12, left: 16, fontSize: 11.5, color: 'var(--muted)', background: FOND_PASTILLE_MEDIA, padding: '3px 10px', borderRadius: 999 }}>{(detailIdx ?? 0) + 1} / {ads.length}</span>
            </div>

            {/* Rail d'actions · défile SEUL sur desktop (borné à la hauteur du
                dialogue), pendant que la zone média reste en place (F04). Les
                actions sont rangées en quatre rubriques nommées · Itérer,
                Modifier, Contrôler, Exporter (RailFicheCrea). */}
            <RailFicheCrea
                maxHeight={detailEmpile ? undefined : '92vh'}
                onClose={() => setDetailIdx(null)}
                editText={editText}
                textPret={!!textForm}
                textBusy={textBusy}
                champsTexte={textForm && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <TextField label="Kicker" value={textForm.kicker ?? ''} onChange={(v) => setTextForm((f) => ({ ...f!, kicker: v }))} />
                    <TextField label="Accroche" value={textForm.headline ?? ''} onChange={(v) => setTextForm((f) => ({ ...f!, headline: v }))} area />
                    <TextField label="Sous-titre" value={textForm.subhead ?? ''} onChange={(v) => setTextForm((f) => ({ ...f!, subhead: v }))} area />
                    <TextField label="CTA" value={textForm.cta ?? ''} onChange={(v) => setTextForm((f) => ({ ...f!, cta: v }))} />
                    <TextField label="Badge (offre)" value={textForm.badge ?? ''} onChange={(v) => setTextForm((f) => ({ ...f!, badge: v }))} />
                  </div>
                )}
                onAppliquerTexte={() => applyText(detailAd)}
                onAnnulerTexte={() => setEditText(false)}
                templateLabel={TPL_LABEL[detailAd.template]}
                verdict={<VerdictBadge etat={detailAd.verdict} />}
                declinaison={detailAd.variable ? { label: STUDIO_LABEL[detailAd.variable].toLowerCase(), change: CHANGE[detailAd.variable], garde: tenuConstant(detailAd.variable).join(', ') } : null}
                lignee={<Lignee id={detailAd.id} ads={ads} onOuvrir={(i) => setDetailIdx(i)} />}
                headline={detailAd.headline}
                declinaisons={STUDIO_VARIABLES.map((v) => {
                  const prix = prixDeclinaison(v, modelSpec.credits, costFor('suggest'));
                  // Un bouton absent laisse croire que la fonction n'existe pas ·
                  // un bouton grisé qui s'explique se comprend.
                  const bloque = empechement(v, !!detailAd.sceneBrief);
                  return {
                    key: v,
                    label: STUDIO_LABEL[v],
                    prixLabel: prix === 0 ? 'gratuit' : `${prix} cr.`,
                    contrat: bloque || <>Change {CHANGE[v]} · garde {tenuConstant(v).join(', ')}</>,
                    disabled: !!declineBusy || !!bloque || (v !== 'mise_en_page' && !aiReady),
                    busy: declineBusy === v,
                    autreBusy: !!declineBusy && declineBusy !== v,
                    title: bloque || STUDIO_HINT[v],
                    onClick: () => decline(detailAd, v),
                  };
                })}
                onVarier={() => vary(detailAd)}
                varierBusy={varyBusy}
                varierDisabled={!ready}
                varierCredits={modelSpec.credits * 3}
                onEditerTexte={() => openTextEditor(detailAd)}
                score={scoreFor === detailAd.id && scoreData ? (
                  <ScoreCard s={scoreData} copie={copieData} onRedo={() => runScore(detailAd, true)} busy={scoring} />
                ) : (
                  <button type="button" onClick={() => runScore(detailAd)} disabled={scoring || !aiReady} style={{ ...toolBtn, marginBottom: 0, borderColor: 'var(--accent-strong)', color: 'var(--accent-strong)', fontWeight: 800 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={14} /> {scoring ? 'Analyse Jarvis…' : typeof detailAd.score === 'number' ? `Voir le Score Jarvis (${detailAd.score}/100)` : 'Score Jarvis · 2 cr.'}</span>
                  </button>
                )}
                pertinence={<RatingControl genId={detailAd.id} rating={detailAd.rating} />}
                onCopierLien={() => copyLink(detailSrc)}
                lienCopie={copied}
                telechargementHref={detailSrc}
                telechargementLabel={fmtApercu.libelleTelechargement}
                noteFormat={fmtApercu.note}
                onArchiver={() => { archive(detailAd.id); setDetailIdx((i) => (i != null && i >= ads.length - 1 ? null : i)); }}
              />
          </div>
        </div></Portail>
      )}
    </div>
  );
}

function ScoreCard({ s, copie, onRedo, busy }: { s: CreativeScore; copie?: VerdictCopie | null; onRedo: () => void; busy: boolean }) {
  const col = COULEUR_NIVEAU[niveauScore(s.score)];
  const r = 22, c = 2 * Math.PI * r, off = c - (s.score / 100) * c;
  const defauts = verdictDefauts(s.defauts);
  const Bar = ({ k, v }: { k: string; v: number }) => (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)' }}><span>{k}</span><b style={{ color: 'var(--ink-2)' }}>{v}</b></div>
      <div style={{ height: 4, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${v}%`, background: col }} /></div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${col}55`, borderRadius: 12, background: 'rgba(255,255,255,.02)', padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line-2)" strokeWidth="5" />
            <circle cx="28" cy="28" r={r} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
          </svg>
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{s.score}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          {/* « Pronostic » sur l'étiquette · le Score Jarvis est une prédiction,
               pas le résultat mesuré du marché (CDC S07). */}
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: col }}>SCORE JARVIS · PRONOSTIC</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.35, marginTop: 2 }}>{s.verdict}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <Bar k="Hook / scroll-stop" v={s.hook} />
        <Bar k="Clarté" v={s.clarity} />
        <Bar k="Adéquation" v={s.relevance} />
        {/* La note regarde l'image depuis peu · une note produite à l'aveugle
            ne doit pas afficher une barre « visuel » à zéro comme si le visuel
            était nul, elle doit dire qu'elle n'a pas regardé. */}
        {s.vu ? <Bar k="Visuel" v={s.visuel} /> : null}
      </div>
      {!s.vu && (
        <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>
          Note établie sur les textes seuls · l’image n’a pas pu être composée pour cette analyse.
        </p>
      )}
      {/* Les ratés de fabrication · c'est le tri qu'on faisait à l'œil. */}
      {defauts.defauts.length > 0 && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: defauts.grave ? 'rgba(255,90,120,.10)' : 'rgba(245,166,35,.10)', border: `1px solid ${defauts.grave ? 'rgba(255,90,120,.35)' : 'rgba(245,166,35,.3)'}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: defauts.grave ? '#ff9db0' : '#ffca6b', letterSpacing: '.04em' }}>
            {defauts.grave ? 'SCÈNE À REFAIRE' : 'DÉFAUT DE FABRICATION'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{defauts.resume}</div>
          <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
            {defauts.defauts.map((d) => (
              <div key={d}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 700 }}>{DEFECT_LABEL[d]}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>{DEFECT_FIX[d]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* A-t-elle écrit NOS mots ?
           En mode « entière », c'est le modèle d'images qui pose la typographie.
           On lui a demandé de recopier ce qu'il voit, et on compare ici, en
           code. Rien ne s'affiche quand tout est exact · une copie
           irréprochable n'a pas besoin d'un encadré pour le dire. */}
      {copie && copie.resume && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: copie.grave ? 'rgba(255,90,120,.10)' : 'rgba(245,166,35,.10)', border: `1px solid ${copie.grave ? 'rgba(255,90,120,.35)' : 'rgba(245,166,35,.3)'}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: copie.grave ? '#ff9db0' : '#ffca6b', letterSpacing: '.04em' }}>
            {copie.grave ? 'LA PUB NE DIT PLUS CE QU’ON VOULAIT' : 'ÉCARTS DE COPIE'}
            {copie.fidelite !== null && <span style={{ fontWeight: 700, color: 'var(--muted)' }}> · {Math.round(copie.fidelite * 100)} % exact</span>}
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {copie.lignes.filter((l) => l.etat !== 'exacte').map((l) => (
              <div key={l.role}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  <b style={{ color: 'var(--ink-2)' }}>{l.role}</b> · {ETAT_COPIE_LABEL[l.etat]}
                </div>
                {/* On montre les deux · « réécrite » sans montrer quoi oblige à
                     rouvrir l'image pour comprendre. */}
                <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.4 }}>Demandé · « {l.attendu} »</div>
                <div style={{ fontSize: 11, color: '#ff9db0', lineHeight: 1.4 }}>
                  {l.lu ? <>Lu · « {l.lu} »</> : 'Rien de comparable dans l’image.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {s.fix && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(245,166,35,.10)', border: '1px solid rgba(245,166,35,.3)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#ffca6b', letterSpacing: '.04em' }}>À CORRIGER</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>{s.fix}</div>
        </div>
      )}
      <button type="button" onClick={onRedo} disabled={busy} style={{ ...toolBtn, marginTop: 10, marginBottom: 0, fontSize: 11.5 }}>{busy ? 'Analyse…' : '↻ Re-scorer'}</button>
    </div>
  );
}

function TextField({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  // Anneau de focus natif conservé · pas d'`outline: none` sur un champ clavier.
  const st: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'inherit' };
  return (
    <label style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{label}</span>
      {area
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...st, resize: 'vertical' }} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} style={st} />}
    </label>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
const miniBtn = { fontSize: 12, fontWeight: 800, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)' } as const;
/** Repère de filiation · discret, mais lisible d'un coup d'œil dans la grille. */
const filiation = { display: 'inline-block', marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--muted)' } as const;
const navArrow = (side: 'left' | 'right'): React.CSSProperties => ({ position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)', width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 2 });

/** Pastille d'action secondaire · même forme que celles de la barre de composition. */
function pastilleAction(actif: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
    cursor: actif ? 'pointer' : 'default', border: '1px solid var(--line-2)',
    background: 'transparent', color: 'var(--accent-strong)', opacity: actif ? 1 : .55,
  };
}

/**
 * La lignée d'une publicité · d'où elle vient, ce qui a changé à chaque pas.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * On sait décliner, et chaque enfant porte sa filiation. Mais une famille de
 * tests reste DISPERSÉE dans la grille : v1 en haut, v2 quatre cartes plus
 * loin, v3 sur la page suivante. On les compare à l'œil, c'est-à-dire pas du
 * tout.
 *
 * Ici la chaîne se lit d'un coup, et chaque maillon s'ouvre.
 *
 * Elle ne s'affiche qu'à partir de deux maillons · une publicité seule n'a pas
 * de lignée, et lui en dessiner une serait du décor.
 */
function Lignee({ id, ads, onOuvrir }: { id: string; ads: AdItem[]; onOuvrir: (i: number) => void }) {
  const chaine = lignee(id, ads.map((a) => ({ id: a.id, parentId: a.parentId, variable: a.variable })));
  if (chaine.length < 2) return null;
  return (
    <div style={{ margin: '9px 0 0', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', color: 'var(--muted)' }}>LIGNÉE</div>
      <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
        {chaine.map((m, i) => {
          const idx = ads.findIndex((a) => a.id === m.id);
          const ici = m.id === id;
          return (
            <button key={m.id} type="button" onClick={() => { if (idx >= 0) onOuvrir(idx); }} disabled={idx < 0 || ici}
              style={{
                display: 'flex', gap: 6, alignItems: 'baseline', textAlign: 'left', padding: '2px 0',
                border: 'none', background: 'transparent', cursor: idx >= 0 && !ici ? 'pointer' : 'default',
                color: ici ? 'var(--ink)' : 'var(--ink-2)', fontWeight: ici ? 800 : 600, fontSize: 11.5,
              }}>
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>v{i + 1}</span>
              <span>{m.variable ? STUDIO_LABEL[m.variable].toLowerCase() : 'originale'}</span>
              {ici && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· celle-ci</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
