'use server';

import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { resolvePreset } from './presets';
import { falFromEnv, falGenerateImage, type FalConfig } from '@tiktrends/integrations';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';
import { generateAdConcepts, cloneAdFromReference, suggestAdAngles, scoreCreative, controlePubEntiere, rewriteAdCopy, AD_TEMPLATES, VISUAL_UNIVERSES, type AdTemplate, type AdConcept, type CloneRefImage, type AdAngle, type CreativeScore } from '@tiktrends/ai';
import { costFor, imageModelByKey, falModelFor, layoutsForBatchFavori, appliquerEssais, layoutFor, layoutsFor, copyBudgetLine, layoutForCopy, imageTimeoutMs, conseilDelai, sceneFraming, sceneFramingPolyvalent, AD_LAYOUTS, type AdLayout, explainProposal, type StatRow, type HookEntry, type ImageModelSpec, STUDIO_LABEL, prixDeclinaison, miseSuivante, verifieDeclinaison, type StudioVariable, type DeclinaisonSnapshot, verdictDefauts, plafonner, STUDIO_VARIABLES, empechement, universSuivant, ESSAI_VARIABLES, prixEssai, verifieEssai, type EssaiVariable, type SceneLight, type CumulEssais, estMode, promptPubEntiere, exemplesParDirection, texteAttenduDansImage, verifieCopie, chainesImposees, type VerdictCopie, type ProductionMode, AD_DIRECTIONS, directionByKey, directionScenePrompt, budgetReprises, imagesAReserver, indicesARattraper, reprisePreferable, directionsBiais, durcirEntiere, type AdDirection } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { jarvisFullMemory, jarvisMemoryWithUse, jarvisStats, jarvisHooks } from '../../lib/jarvis-memory';
import { listBrandAssetImageUrls, resolveAssetImageUrls } from './assets';
import { renderAdPng, type AdRecipe } from '../../lib/ad-render';
import { logAndTranslate, logFailure } from '../../lib/error-log';
import { mesurerScene } from '../../lib/scene-light';
import { essaisViewAction, bilanCopieAction } from './adsmap-attribution';
import { tendancesLayoutMarcheAction } from './layout-marche';
import { delaiDepasse, inutileDeReessayer } from '../../lib/fal-retry';
import { guardedAnthropic, sousPlafond } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';
import { imageJointe } from '../../lib/image-jointe';

export interface AdItem {
  id: string; template: AdTemplate; headline: string; url: string; createdAt: string;
  rating?: import('./creatives').Rating; score?: number;
  /**
   * Ce que la relecture a constaté · lu par la grille pour le montrer sans clic.
   *
   * Une mesure rangée en base et visible seulement après avoir payé une analyse
   * n'est pas une mesure, c'est une archive. La grille doit dire, d'un coup
   * d'œil, laquelle de ces publicités dit encore ce qu'on voulait.
   */
  controle?: { copieResume: string; copieGrave: boolean; produitFidele: boolean | null; ecarts: string[]; texteLisible: boolean | null; problemesLisibilite: string[] } | null;
  /** Pourquoi Jarvis a proposé ça · une proposition muette se subit ou s'ignore. */
  rationale?: string[] | null;
  /**
   * La filiation · de qui elle descend, et ce qu'on y a changé.
   *
   * Une déclinaison qui ne se présente pas comme telle est une créa de plus
   * dans la grille · on la compare à l'œil au lieu de la lire comme la réponse
   * à une question posée.
   */
  parentId?: string | null;
  variable?: StudioVariable | null;
  /** Ce que le lot déclarait tester · lu par la grille pour le montrer. */
  essai?: EssaiVariable | null;
  /**
   * La scène a-t-elle son brief · ce qui décide si elle peut être redéclinée.
   *
   * On envoie un booléen, pas le brief · c'est une consigne interne au modèle,
   * et le navigateur n'en a rien à faire au-delà de savoir si le bouton s'ouvre.
   */
  sceneBrief?: boolean;
}
export interface AdsResult {
  error?: string; ads?: AdItem[]; requested?: number;
  /**
   * Le lot devait être un essai et n'a pas pu en être un.
   *
   * Les publicités sont livrées · elles perdent seulement le droit de se
   * présenter comme une comparaison contrôlée. Le taire laisserait conclure sur
   * un lot dont on sait qu'il ne prouve rien.
   */
  essaiRompu?: string;
  /**
   * Ce que le lot a APPLIQUÉ de ce qui avait été mesuré.
   *
   * Un lot qui n'est plus une rotation égale sans rien dire se lit comme un
   * hasard bizarre · l'appliquer sans l'annoncer revient à mesurer en cachette.
   */
  appliquee?: string;
}

/**
 * Ce qu'on dit quand AUCUNE scène n'est sortie.
 *
 * « Les scènes n'ont pas pu être générées. Réessaie. » était la seule chose
 * qu'on savait déjà en regardant l'écran vide · et elle conseillait de refaire
 * exactement ce qui venait d'échouer, donc de repayer l'attente.
 */
function echecLisible(e: unknown, workspaceId: string): string {
  if (!e) return 'Aucune scène n’est sortie, et le fournisseur n’a rien dit. Réessaie dans une minute.';
  return logAndTranslate('ads:compose', e, { subject: 'la génération des scènes', workspaceId });
}

/** Ordonne les couleurs d'accent lisibles (bouton/CTA) de la DA ; défaut si aucune. */
function pickAccents(colors?: string[] | null): string[] {
  const list = (colors ?? []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c.trim())).map((c) => '#' + c.trim().replace('#', ''));
  const lumOf = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const vivid = list.filter((h) => { const l = lumOf(h); return l > 0.18 && l < 0.82; });
  const ordered = [...vivid, ...list.filter((h) => !vivid.includes(h))];
  return ordered.length ? Array.from(new Set(ordered)) : ['#2563EB'];
}

/** Rassemble des extraits de copy de pubs sauvegardées (veille) pour inspirer les angles. */
function copyFromSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  const c = (o.copy && typeof o.copy === 'object' ? o.copy as Record<string, unknown> : {});
  const parts = [o.primaryText, o.headline, o.title, o.text, o.body, o.description, c.primaryText, c.headline, c.title, c.body]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  const t = parts.join(' · ').trim();
  return t ? t.slice(0, 240) : null;
}

/** Extrait une URL d'image exploitable d'un snapshot de pub sauvegardée (veille). */
function imageUrlFromSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== 'object') return null;
  const o = snap as Record<string, unknown>;
  const media = Array.isArray(o.media) ? o.media : [];
  const first = media.find((m) => typeof m === 'string') as string | undefined;
  const cand = [o.imageUrl, o.thumbnailUrl, o.thumbUrl, o.mediaUrl, o.image, o.creativeUrl, o.previewUrl, first]
    .find((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x));
  return cand ?? null;
}

/** Télécharge une image et la convertit en référence base64 pour l'analyse vision. */
async function refFromUrl(url: string): Promise<CloneRefImage | null> {
  // L'URL vient d'un snapshot de pub, donc d'une source externe : safeFetch refuse
  // les adresses internes et revalide chaque redirection (sinon un 302 vers
  // 127.0.0.1 suffit à faire relayer une réponse interne par notre serveur).
  const res = await safeFetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, timeoutMs: 15_000, maxBytes: 6_000_000 });
  if (!res || !/^image\/(jpeg|png|webp)$/.test(res.contentType)) return null;
  return { mediaType: res.contentType as CloneRefImage['mediaType'], base64: res.body.toString('base64') };
}

/**
 * Version d'un rendu, dérivée de ses textes. Elle est collée à l'URL de l'aperçu
 * (?v=) pour que le navigateur recharge l'image dès qu'un texte change : sans ça,
 * le `cache-control: max-age=86400` de /api/ad servait l'ancienne composition
 * pendant 24 h dans la grille et dans le téléchargement.
 */
function adVersion(r: Partial<AdRecipe>): string {
  const t = `${r.headline ?? ''}|${r.subhead ?? ''}|${r.cta ?? ''}|${r.kicker ?? ''}|${r.badge ?? ''}|${r.sceneUrl ?? ''}`;
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** URL d'aperçu versionnée d'un rendu de pub. (Non exportée : un module
 *  « use server » ne peut exposer que des fonctions async.) */
function adUrl(id: string, recipe: Partial<AdRecipe>): string {
  return `/api/ad/${id}?v=${adVersion(recipe)}`;
}

/**
 * Le constat de relecture, tiré de la recette · une SEULE fonction le façonne.
 *
 * La carte le lit à deux moments · dès la génération, et au rechargement de la
 * liste. Deux mises en forme séparées finiraient par diverger, et une même pub
 * montrerait un défaut ici, rien là. `null` quand elle n'a pas été relue · mode
 * composé, ou relecteur absent · et alors la carte n'affiche rien, ce qui est
 * la bonne réponse : il n'y a eu aucune mesure.
 */
function controleDepuisRecette(rec: Partial<AdRecipe>): AdItem['controle'] {
  return rec.copieConforme || typeof rec.produitFidele === 'boolean' || typeof rec.texteLisible === 'boolean' ? {
    copieResume: rec.copieConforme?.resume ?? '',
    copieGrave: !!rec.copieConforme?.grave,
    produitFidele: rec.produitFidele ?? null,
    ecarts: rec.ecartsProduit ?? [],
    texteLisible: rec.texteLisible ?? null,
    problemesLisibilite: rec.problemesLisibilite ?? [],
  } : null;
}

/** Compose une série : scènes (univers variés) + enregistrement + débit. Mutualisé par génération et clone. */
async function composeBatch(o: {
  cfg: FalConfig; brandId: string; brandName: string; colors?: string[] | null; logoUrl?: string | null;
  /** Ce dont la génération a bénéficié · consigné pour mesurer si la mémoire aide (§attribution). */
  memoryUse?: { measured: boolean; market: boolean; hooks: number };
  productImageUrls: string[] | null; editMode: boolean; concepts: AdConcept[]; universe?: string;
  /**
   * Les mises en page du lot, décidées PAR L'APPELANT.
   *
   * Elles étaient calculées ici, après l'écriture des concepts · le modèle ne
   * pouvait donc pas savoir dans quelle mise en page son accroche allait
   * atterrir, ni combien de place elle y aurait.
   */
  mises: AdLayout[];
  /**
   * Quelle scène sert à quelle publicité · l'identité par défaut.
   *
   * Un lot d'essai tient la scène constante : les N publicités pointent alors
   * toutes vers la scène 0, et une seule image est produite. C'est ce qui rend
   * la comparaison honnête ET le lot presque gratuit.
   */
  sceneFor?: number[];
  /**
   * La coquille de tout le lot · un essai la tient constante.
   *
   * `null` laisse la règle habituelle décider, gabarit puis longueur d'accroche.
   */
  coquilleImposee?: AdLayout | null;
  /**
   * La scène servira PLUSIEURS coquilles · le cadrage devient un compromis.
   *
   * Vrai uniquement pour un essai de mise en page, où la même image est
   * composée de quatre façons.
   */
  cadragePolyvalent?: boolean;
  /** Ce que le lot déclare tester · consigné sur chaque publicité. */
  essai?: { variable: EssaiVariable; groupe: string } | null;
  /** Comment fabriquer · une publicité entière ne reçoit aucune couche de texte. */
  mode?: ProductionMode;
  /** Rempli quand le lot n'a PAS tenu son contrat d'essai · lu par l'appelant. */
  essaiRompu?: string;
  assetRefUrls?: string[]; // images de la bibliothèque Assets (références marque pour l'IA)
  cloneRefUrl?: string; // référence à répliquer visuellement (mode clone)
  workspaceId: string; unlimited: boolean;
  reservedCredits: number; // deja debite par l'appelant : on rembourse ce qui n'a pas ete produit
  /**
   * Combien d'images de reprise ce lot s'autorise · 0 hors mode entière.
   *
   * Le budget est réservé ET annoncé par l'appelant avant le clic · ici on ne
   * fait que le consommer, pub cassée par pub cassée, sans jamais le dépasser.
   */
  reprisesBudget?: number;
  /**
   * Le vivier de directions de la rotation · en entière, biaisé par la mesure.
   *
   * Absent, la rotation tourne sur toutes les directions (comportement d'avant).
   * Fourni, il exclut les directions mesurées pires et met la meilleure en tête.
   */
  directionsVivier?: AdDirection[];
  /** La meilleure direction est ancrée en tête · la rotation part d'elle. */
  directionAncree?: boolean;
  /**
   * Renforts ciblés sur les défauts mesurés de CETTE marque (accents, lisibilité).
   * Décidés au noyau (`durcirEntiere`) depuis le bilan, passés à `promptPubEntiere`.
   * Vides le plus souvent · une marque sans mesure suffisante ne durcit rien.
   */
  durcissementsEntiere?: string[];
  /**
   * Tendances de mise en page gagnantes de la catégorie (`briefLayout`),
   * distillées de la veille et injectées en direction artistique d'entière.
   * Vides tant que la catégorie n'a pas été décrite · s'allument au premier lot
   * market-learn. Lecture au mieux · un échec ne bloque pas la génération.
   */
  tendancesMarche?: string[];
  /** Le moteur choisi, entier · l'endpoint et les paramètres s'en déduisent. */
  modelSpec: ImageModelSpec; creditsPerImage: number;
  productId?: string; personaId?: string; objective?: string;
  /** Prompt maison · remplace l'univers fourni quand il est choisi. */
  preset?: { id: string; prompt: string; negative: string | null } | null;
  /** De quoi expliquer chaque proposition · les mêmes chiffres que ceux injectés. */
  rationaleCtx?: { stats: StatRow[]; globalRate: number | null; hooks: HookEntry[] } | null;
  /**
   * Le dernier échec rencontré · rempli au fil de l'eau.
   *
   * Sans lui, une série entièrement ratée rendait « les scènes n'ont pas pu
   * être générées », c'est-à-dire la seule chose qu'on savait déjà.
   */
  echec: { dernier?: unknown };
}): Promise<AdItem[]> {
  const accents = pickAccents(o.colors);
  // La variété vient d'ici · la règle du noyau garantit qu'un lot de quatre ne
  // répète jamais la même mise en page. Sans elle, sept gabarits rendaient sept
  // fois la même image : photo plein cadre, bandeau noir, texte blanc.
  /**
   * La coquille d'un visuel · UNE seule source.
   *
   * La scène est cadrée pour elle et la recette est composée avec elle. Deux
   * calculs séparés finiraient par diverger, et on aurait payé une image cadrée
   * pour une page qu'elle n'occupe pas · exactement le défaut qu'on corrige.
   */
  const coquille = (c: AdConcept, i: number): AdLayout =>
    // Un lot d'essai impose sa coquille · la laisser dépendre de la longueur de
    // chaque accroche ferait varier DEUX choses dans un lot qui promet d'en
    // faire varier une.
    o.coquilleImposee ? o.coquilleImposee :
    // Deux rabats, dans cet ordre · le gabarit d'abord (`before_after` a besoin
    // de l'image entière), la longueur de l'accroche ensuite. On demande au
    // modèle un titre court pour l'affiche, il obéit souvent, pas toujours · et
    // rien ne le vérifiait. Une accroche trop longue ne se coupe pas, elle
    // change de mise en page.
    layoutForCopy(c.headline, layoutFor(c.template, o.mises[i] ?? 'immersif'));
  // Les directions artistiques remplacent les huit univers d'une phrase.
  //
  // Les huit premières clés sont les mêmes · les publicités déjà produites et
  // les essais d'ambiance déjà cumulés continuent donc de compter. Les six
  // nouvelles s'ajoutent au vivier de la rotation.
  const chosen = o.universe && o.universe !== 'auto' ? directionByKey(o.universe) : null;
  // La rotation tourne sur un VIVIER · en entière, il exclut les directions que
  // la relecture a mesurées nettement pires et met la meilleure en tête (calculé
  // par l'appelant). Sans mesure qui tranche, c'est AD_DIRECTIONS entier · la
  // rotation d'avant, exactement.
  const rotation = o.directionsVivier && o.directionsVivier.length ? o.directionsVivier : AD_DIRECTIONS;
  // La meilleure direction est ANCRÉE en tête (offset 0) · sinon on garde la
  // variété d'un décalage horaire sur ce qui reste.
  const offset = o.directionAncree ? 0 : Math.floor(Date.now() / 1000) % rotation.length;
  // Un prompt maison l'emporte sur les univers fournis · c'est la direction
  // artistique de la marque, elle ne se fait pas alterner avec la nôtre.
  /**
   * L'univers RÉELLEMENT utilisé pour un visuel.
   *
   * On consignait la valeur DEMANDÉE. Le composeur propose « Varié (auto) » par
   * défaut · toutes les générations portaient donc `auto`, qui n'est pas un
   * univers mais le refus d'en choisir un. L'écran de sélection collait alors
   * tous les aperçus sur la vignette « Varié », et les huit univers réels
   * restaient vides — c'est-à-dire que la promesse « choisis à l'œil » ne
   * pouvait pas se tenir, quel que soit le nombre de séries lancées.
   */
  const universeUsed = (i: number) =>
    chosen ? chosen.key : rotation[(offset + i) % rotation.length]!.key;

  /** La direction retenue pour ce visuel · un prompt maison la remplace. */
  const directionPour = (i: number) => chosen ?? rotation[(offset + i) % rotation.length]!;
  // En mode composé, on ne demande NI typographie NI disposition · c'est nous
  // qui posons le texte. Lui demander un registre typographique lui ferait
  // écrire des mots qu'on recouvrirait.
  const universeFor = (i: number) => o.preset
    ? o.preset.prompt
    : directionScenePrompt(directionPour(i));
  // Les exclusions ferment la consigne · un moteur qui les ignore n'est pas gêné,
  // un moteur qui les lit les retient mieux en fin de prompt.
  const exclusions = o.preset?.negative?.trim() ? `\n\nAvoid: ${o.preset.negative.trim()}` : '';
  const hasProduct = !!(o.productImageUrls && o.productImageUrls.length);
  const assetRefs = o.assetRefUrls ?? [];
  const hasAssetRef = assetRefs.length > 0;
  // Références marque venant de la bibliothèque Assets, ajoutées en note quand on s'en sert.
  const assetNote = hasAssetRef ? ' Additional images are brand reference material (real brand/product shots from the asset library) · draw visual style, palette and authenticity from them, but do not copy any text or layout.' : '';

  const genScene = async (c: AdConcept, i: number, modeForce?: ProductionMode): Promise<string | null> => {
    // Clone : on donne la référence EN PREMIER puis nos images produit -> Nano recompose la mise en page.
    // Sinon : produit (edit) et/ou images de la bibliothèque Assets comme références marque.
    let imageUrls: string[] | undefined;
    let prompt: string;
    let edit: boolean;
    if (o.cloneRefUrl) {
      imageUrls = [o.cloneRefUrl, ...(o.productImageUrls ?? [])];
      prompt = scenePromptClone(c, hasProduct);
      edit = true;
    } else if (o.editMode) {
      imageUrls = [...(o.productImageUrls ?? []), ...assetRefs].slice(0, 8);
      prompt = scenePrompt(c, true, universeFor(i), coquille(c, i), o.cadragePolyvalent) + assetNote + exclusions;
      edit = true;
    } else if (hasAssetRef) {
      // Pas de photo produit mais la bibliothèque est remplie -> l'IA s'en sert comme références marque.
      imageUrls = assetRefs.slice(0, 8);
      prompt = scenePromptBrandRef(c, universeFor(i), coquille(c, i), o.cadragePolyvalent) + exclusions;
      edit = true;
    } else {
      imageUrls = undefined;
      prompt = scenePrompt(c, false, universeFor(i), coquille(c, i), o.cadragePolyvalent) + exclusions;
      edit = false;
    }

    // La publicité ENTIÈRE remplace la consigne de scène.
    //
    // Les références et le point d'entrée restent ceux qu'on vient de choisir ·
    // c'est la photo produit qui garantit l'étiquette, et elle compte encore
    // plus ici : le modèle doit reproduire un packaging ET écrire par-dessus.
    //
    // `modeForce` sert au filet composée · une reprise en composée demande la
    // SCÈNE (le prompt déjà construit ci-dessus), pas la publicité entière, pour
    // qu'on pose NOTRE texte par-dessus.
    if ((modeForce ?? o.mode) === 'entiere') {
      prompt = promptPubEntiere({
        copie: {
          kicker: c.kicker, headline: c.headline, subhead: c.subhead,
          benefits: c.benefits, cta: c.cta, badge: c.badge, brandName: o.brandName,
        },
        sceneBrief: c.sceneBrief,
        avecProduit: !!imageUrls?.length,
        // La direction ENTIÈRE ici · scène, lumière, typographie, disposition,
        // finition. C'est la typographie et la disposition qui manquaient, et
        // c'est pour ça que la mise en page changeait sans raison d'une image
        // à l'autre : on ne lui en disait rien.
        direction: o.preset ? null : directionPour(i),
        universPrompt: o.preset ? o.preset.prompt : undefined,
        // Renforts mesurés · accents, lisibilité, seulement là où cette marque a
        // le défaut installé. Vides sinon · le prompt reste léger.
        durcissements: o.durcissementsEntiere,
        // Tendances de mise en page gagnantes de la catégorie · direction, pas
        // règle. Vides tant que la veille n'a pas décrit la catégorie.
        tendancesMarche: o.tendancesMarche,
      }) + exclusions;
    }
    for (let attempt = 0; attempt < 2; attempt++) { // 1 réessai sur échec transitoire (rate-limit)
      try {
        // L'endpoint dépend de la présence d'une référence · appeler `.../edit`
        // sans image renvoie une erreur du fournisseur, et le modèle a l'air
        // cassé alors qu'on s'est trompé de porte.
        const { images } = await sousPlafond('fal_image', { action: 'ads:image', workspaceId: o.workspaceId, units: 1 }, () => falGenerateImage(o.cfg, {
          prompt, aspectRatio: '4:5', imageUrls, edit, count: 1,
          model: falModelFor(o.modelSpec, !!imageUrls?.length), params: o.modelSpec.params,
          // Le délai suit le modèle · GPT Image 2 en haute qualité travaille
          // plusieurs minutes, et l'échéance fixe de 90 s le condamnait à
          // échouer en le faisant quand même facturer.
          timeoutMs: imageTimeoutMs(o.modelSpec),
        }));
        if (images[0]) return images[0];
        const vide = new Error('Le fournisseur n’a renvoyé aucune image.');
        logFailure('ads:scene', vide, o.workspaceId);
        o.echec.dernier = vide;
      } catch (e) {
        // On réessaie, mais on ne se tait plus · un catch vide transformait une
        // panne diagnosticable (modèle inconnu, quota, référence illisible) en
        // dix minutes d'attente suivies d'un message qui n'explique rien.
        logFailure(`ads:scene:${attempt + 1}`, e, o.workspaceId);
        o.echec.dernier = e;
        // Un refus du fournisseur (4xx) se reproduira à l'identique · le
        // réessayer fait attendre quatre-vingt-dix secondes de plus pour la
        // même réponse, et douze pubs le font attendre dix minutes.
        // On ne rejoue pas un délai dépassé · le fournisseur a déjà commencé et
        // facture. Rejouer paierait une seconde image pour la même attente.
        if (inutileDeReessayer(e)) break;
      }
    }
    return null;
  };

  // Les scènes RÉELLEMENT produites · un lot d'essai n'en demande qu'une pour
  // quatre publicités, et générer quatre fois la même consigne coûterait quatre
  // images pour un lot qui doit justement en partager une.
  const slots = o.sceneFor ?? o.concepts.map((_, i) => i);
  const aProduire = [...new Set(slots)].sort((a, b) => a - b);

  // Génération par petits lots (max 3 en parallèle) pour éviter les rate-limits qui font perdre des pubs.
  const parSlot = new Map<number, string | null>();
  const LOT = 3;
  for (let start = 0; start < aProduire.length; start += LOT) {
    const tranche = aProduire.slice(start, start + LOT);
    const done = await Promise.all(tranche.map((slot) => genScene(o.concepts[slot]!, slot)));
    tranche.forEach((slot, k) => { parSlot.set(slot, done[k] ?? null); });
  }
  const scenes: (string | null)[] = slots.map((slot) => parSlot.get(slot) ?? null);

  // Combien d'IMAGES le fournisseur a réellement produites · c'est ce qu'on
  // facture, et ce dont on rembourse le reste. Un lot d'essai partage une scène,
  // donc `aProduire` dédoublonne déjà les slots. Le rattrapage l'incrémentera au
  // fil des reprises · une reprise est une image de plus, payée comme telle.
  let imagesFal = aProduire.filter((slot) => parSlot.get(slot)).length;

  // Images de reprise déjà dépensées · le filet composée puise dans le RESTE de
  // la même marge réservée, jamais au-delà. Un dollar de plus que l'annoncé
  // serait un dollar non dit.
  let reprisesFaites = 0;
  // Le mode RÉELLEMENT appliqué à chaque visuel · par défaut celui du lot, mais
  // une pub repliée passe en composée pour elle seule. La maquette lit ce mode
  // pour décider si elle pose une couche de texte par-dessus.
  const modeParItem = new Map<number, ProductionMode>();

  // On regarde les scènes AVANT de les composer.
  //
  // Le voile qui porte le texte était une constante · sur une image déjà sombre
  // il enterrait la photo qu'on venait de payer. La mesure est prise une fois et
  // rangée dans la recette : la composition tourne à chaque affichage, décoder
  // l'image à chaque rendu paierait cent fois une réponse qui ne change pas.
  //
  // En parallèle, et sans jamais faire échouer le lot · une scène non mesurée se
  // rend avec les voiles d'avant, ce qui est moins bien et pas cassé.
  const mesures = new Map<string, SceneLight | null>();
  await Promise.all([...new Set(scenes.filter((u): u is string => !!u))].map(async (url) => {
    mesures.set(url, await mesurerScene(url));
  }));
  const lumieres = scenes.map((url) => (url ? mesures.get(url) ?? null : null));

  /*
   * ── On relit ce que le modèle a écrit, tout de suite ───────────────────────
   *
   * La note Jarvis savait déjà transcrire · mais elle est manuelle et payante,
   * une publicité à la fois. Un lot de quatre repartait donc sans qu'aucune
   * n'ait été relue, et les deux questions qui décident si le mode « entière »
   * est utilisable — a-t-il écrit nos mots, a-t-il gardé notre produit —
   * restaient sans réponse.
   *
   * Ici c'est le modèle le moins cher, sur l'image réduite : environ 0,002 $ par
   * publicité contre 0,08 $ pour l'image. Trois pour cent · c'est ce qui
   * autorise à le lancer sans le demander.
   *
   * Uniquement en mode « entière ». En composé, c'est nous qui écrivons les
   * textes · les relire reviendrait à vérifier notre propre travail.
   *
   * Un contrôle qui échoue ne fait jamais échouer le lot · une publicité
   * produite mais non relue reste une publicité produite.
   */
  const controles = new Map<number, { copie: VerdictCopie; produitFidele: boolean | null; ecartsProduit: string[]; texteLisible: boolean | null; problemesLisibilite: string[] }>();
  if (o.mode === 'entiere') {
    const relecteur = guardedAnthropic({ action: 'ads:controle', workspaceId: o.workspaceId });
    const ref = await imageJointe(o.productImageUrls?.[0]);
    /** Relire UNE scène · le constat, ou null si on n'a pas pu regarder. */
    const relireScene = async (url: string, c: AdConcept) => {
      const img = await imageJointe(url);
      if (!img || !relecteur) return null;
      const vu = await controlePubEntiere(relecteur, { image: img, reference: ref });
      if (!vu) return null;
      return {
        copie: verifieCopie(chainesImposees({
          kicker: c.kicker, headline: c.headline, subhead: c.subhead,
          benefits: c.benefits, cta: c.cta, badge: c.badge,
        }), vu.texteLu),
        produitFidele: vu.produitFidele,
        ecartsProduit: vu.ecartsProduit,
        texteLisible: vu.texteLisible,
        problemesLisibilite: vu.problemesLisibilite,
      };
    };
    if (relecteur) {
      const aRelire = scenes.map((url, i) => ({ url, i })).filter((x): x is { url: string; i: number } => !!x.url);
      for (let d = 0; d < aRelire.length; d += 3) {
        await Promise.all(aRelire.slice(d, d + 3).map(async ({ url, i }) => {
          const c = o.concepts[i];
          if (!c) return;
          try {
            const vu = await relireScene(url, c);
            if (vu) controles.set(i, vu);
          } catch (e) {
            logFailure('ads:controle', e, o.workspaceId);
          }
        }));
      }

      /*
       * ── On rattrape ce que la relecture vient de juger cassé ─────────────────
       *
       * Détecter sans agir laissait livrer du connu-cassé · l'accroche réécrite
       * ou le produit inventé partaient dans la grille, et c'était à l'œil de les
       * repérer. Ici, une pub cassée est régénérée UNE fois, dans le budget
       * réservé et annoncé d'avance · aucune dépense qui n'ait été dite avant le
       * clic. La règle (qui reprendre, combien, garder la meilleure) vit dans le
       * noyau, où un test l'exerce.
       *
       * Pas sur un essai · il partage une seule scène entre N publicités, et
       * reprendre l'une romprait la comparaison qu'il promet.
       *
       * Chaque reprise passe par `genScene`, donc par le plafond de dépense · s'il
       * est atteint, la reprise ne part pas et on garde l'original. Une reprise
       * plus mauvaise est rejetée · on ne remplace que sur un progrès strict.
       */
      if (!o.essai && (o.reprisesBudget ?? 0) > 0) {
        const constats = o.concepts.map((_, i) => {
          const ctl = controles.get(i);
          return ctl ? { accrocheReecrite: ctl.copie.grave, produitFidele: ctl.produitFidele, texteLisible: ctl.texteLisible } : null;
        });
        for (const i of indicesARattraper(constats, o.reprisesBudget ?? 0)) {
          const c = o.concepts[i];
          const original = controles.get(i);
          if (!c || !original) continue;
          try {
            const nouvelleUrl = await genScene(c, i);
            if (!nouvelleUrl) continue; // plafond atteint ou échec · on garde l'original
            imagesFal++;
            reprisesFaites++;
            const [nouvelleLum, nouveauControle] = await Promise.all([
              mesurerScene(nouvelleUrl),
              relireScene(nouvelleUrl, c),
            ]);
            if (nouveauControle && reprisePreferable(
              { accrocheReecrite: original.copie.grave, produitFidele: original.produitFidele, texteLisible: original.texteLisible },
              { accrocheReecrite: nouveauControle.copie.grave, produitFidele: nouveauControle.produitFidele, texteLisible: nouveauControle.texteLisible },
            )) {
              scenes[i] = nouvelleUrl;
              lumieres[i] = nouvelleLum;
              controles.set(i, nouveauControle);
            }
          } catch (e) {
            logFailure('ads:rattrapage', e, o.workspaceId);
          }
        }

        /*
         * ── Ce qui reste cassé après la reprise se refait en composée ──────────
         *
         * La reprise rejoue l'entière · le modèle échoue parfois encore de la
         * même façon (accroche réécrite, texte illisible). Livrer ça « à revoir »
         * revient à rendre du connu-cassé. On refait alors la pub en COMPOSÉE, où
         * le texte est le NÔTRE — donc exact — et le produit vient de la photo —
         * donc fidèle : la bascule résout par construction les trois écarts
         * éliminatoires, elle n'a donc pas besoin d'être relue.
         *
         * Elle puise dans la MÊME marge de reprise, déjà réservée et annoncée ·
         * jamais un dollar de plus. Quand la marge est épuisée, la cassée reste
         * visible et comptée au débrief · un lot majoritairement cassé est un
         * signal de mode, pas un incident à masquer.
         */
        const budgetReplis = (o.reprisesBudget ?? 0) - reprisesFaites;
        if (budgetReplis > 0) {
          const constatsFinaux = o.concepts.map((_, i) => {
            const ctl = controles.get(i);
            return ctl ? { accrocheReecrite: ctl.copie.grave, produitFidele: ctl.produitFidele, texteLisible: ctl.texteLisible } : null;
          });
          for (const i of indicesARattraper(constatsFinaux, budgetReplis)) {
            const c = o.concepts[i];
            if (!c) continue;
            try {
              const urlComposee = await genScene(c, i, 'composee');
              if (!urlComposee) continue; // plafond atteint ou échec · on garde l'entière cassée
              imagesFal++;
              scenes[i] = urlComposee;
              lumieres[i] = await mesurerScene(urlComposee);
              // La pub devient composée pour elle seule · la maquette posera
              // NOTRE texte par-dessus, exact par construction.
              modeParItem.set(i, 'composee');
              // Aucune relecture entière à consigner · le texte est le nôtre, le
              // produit vient de la photo. La composée ne se relit pas.
              controles.delete(i);
            } catch (e) {
              logFailure('ads:repli-composee', e, o.workspaceId);
            }
          }
        }
      }
    }
  }

  // On construit TOUTES les recettes avant d'en enregistrer une seule.
  //
  // Un lot d'essai doit pouvoir être vérifié dans son ensemble · un lot annoncé
  // comme contrôlé qui ne l'est pas est pire qu'un lot libre, on lui fait
  // confiance pour conclure.
  const recettes: Array<{ c: AdConcept; sceneUrl: string; recipe: AdRecipe }> = [];
  for (let i = 0; i < o.concepts.length; i++) {
    const sceneUrl = scenes[i]; const c = o.concepts[i];
    if (!sceneUrl || !c) continue;
    const recipe: AdRecipe = {
      template: c.template, sceneUrl, kicker: c.kicker, headline: c.headline, subhead: c.subhead, cta: c.cta,
      badge: c.badge, quote: c.quote, author: c.author, rating: c.rating, benefits: c.benefits, stat: c.stat, statLabel: c.statLabel,
      accent: accents[i % accents.length]!, variant: i % 3, brandName: o.brandName, logoUrl: o.logoUrl ?? null,
      productId: o.productId, personaId: o.personaId, objective: o.objective,
      // Consigné AU MOMENT de générer · reconstruire après coup ce que Jarvis
      // savait ce jour-là est impossible, la mémoire ayant changé depuis.
      memoryUse: o.memoryUse,
      presetId: o.preset?.id ?? null,
      // Consigné pour que l'écran puisse montrer ce que cet univers donne chez
      // cette marque · sans ça, on choisit une ambiance sur un libellé.
      // L'univers réellement appliqué · un prompt maison remplace la direction
      // artistique, il n'y a alors aucun univers à consigner.
      universe: o.preset ? null : universeUsed(i),
      // Rabattue sur ce que le gabarit accepte · `before_after` a besoin de
      // l'image entière pour poser sa frontière.
      layout: coquille(c, i),
      // Ce que la scène a dans le ventre · c'est elle qui décide de l'épaisseur
      // du voile, et donc de la part de photo qui survit.
      light: lumieres[i] ?? null,
      // Ce que le lot déclare tester · sans ça, quatre publicités sont quatre
      // paris indépendants et la mesure n'attribue l'écart à rien.
      essai: o.essai ?? null,
      // Comment elle a été fabriquée · c'est ce qui décide si la maquette pose
      // une couche de texte par-dessus, et si « du texte dans l'image » est un
      // raté ou exactement ce qu'on avait demandé. Par item · une pub repliée en
      // composée porte son mode à elle, pas celui du lot.
      mode: modeParItem.get(i) ?? o.mode ?? 'composee',
      // Ce que la relecture a constaté · rangé sous les mêmes clés que le
      // contrôle payant, pour que la carte, la vignette d'exemple et le cumul
      // lisent un seul endroit quelle qu'en soit l'origine.
      ...(controles.get(i) ? {
        copieConforme: controles.get(i)!.copie,
        produitFidele: controles.get(i)!.produitFidele,
        ecartsProduit: controles.get(i)!.ecartsProduit,
        texteLisible: controles.get(i)!.texteLisible,
        problemesLisibilite: controles.get(i)!.problemesLisibilite,
      } : {}),
      // Le brief de la scène · consigné pour pouvoir en produire une AUTRE du
      // même concept sans redemander au modèle ce qu'il a déjà écrit.
      sceneBrief: c.sceneBrief,
      // Le moteur qui a produit cette image · c'est lui qu'on met en cause
      // quand les ratés de fabrication s'accumulent.
      model: o.modelSpec.key,
      // Recalculée depuis la mémoire injectée · elle ne peut donc pas inventer
      // un chiffre, contrairement à une phrase demandée au modèle.
      rationale: o.rationaleCtx
        ? explainProposal({ headline: c.headline }, {
            stats: o.rationaleCtx.stats,
            globalRate: o.rationaleCtx.globalRate,
            hooks: o.rationaleCtx.hooks,
          }).lines.map((l) => l.text)
        : null,
    };
    recettes.push({ c, sceneUrl, recipe });
  }

  // Le lot mérite-t-il le nom d'essai ?
  //
  // Rien dans le chemin de génération ne le garantit mécaniquement : le modèle
  // peut rendre deux fois la même accroche, une image peut manquer et réduire
  // le lot à une seule publicité. Quand le contrat n'est pas tenu, les
  // publicités sont livrées quand même · elles perdent seulement le droit de se
  // présenter comme un essai. C'est le seul choix honnête : elles ont été
  // payées, et une comparaison qu'on sait fausse ne doit pas être affichée
  // comme vraie.
  let essaiTenu = o.essai ?? null;
  if (essaiTenu) {
    const lot = recettes.map(({ recipe }) => ({
      headline: recipe.headline, cta: recipe.cta, subhead: recipe.subhead ?? null,
      kicker: recipe.kicker ?? null, badge: recipe.badge ?? null, sceneUrl: recipe.sceneUrl,
      layout: (recipe.layout ?? 'immersif') as AdLayout, universe: recipe.universe ?? null,
    }));
    const verdict = verifieEssai(lot, essaiTenu.variable);
    if (!verdict.ok) {
      o.essaiRompu = verdict.probleme;
      essaiTenu = null;
      for (const r of recettes) r.recipe.essai = null;
    }
  }

  const ads: AdItem[] = [];
  for (const { c, sceneUrl, recipe } of recettes) {
    try {
      const [row] = await db!.insert(schema.generations).values({
        brandId: o.brandId, kind: 'ad', input: recipe as unknown as Record<string, unknown>,
        status: 'completed', assetUrls: [sceneUrl], creditsCost: o.unlimited ? 0 : o.creditsPerImage,
      }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
      if (row) ads.push({ id: row.id, template: c.template, headline: c.headline, url: adUrl(row.id, recipe), createdAt: (row.createdAt as Date).toISOString(), rationale: recipe.rationale ?? null, essai: recipe.essai?.variable ?? null, sceneBrief: !!recipe.sceneBrief?.trim(),
        // La relecture est faite · la poser ICI la rend visible dès la
        // génération, et donne au débrief du lot la matière à additionner.
        // Sans ça, la carte restait muette jusqu'à un rechargement, et le lot
        // ne pouvait pas se lire d'un coup à l'instant où on le regarde.
        controle: controleDepuisRecette(recipe) });
    } catch { /* ignore */ }
  }

  // Les crédits ont été réservés en bloc avant la génération (débit atomique) : on
  // ne facture au final que les visuels réellement produits et on rend le reste.
  if (!o.unlimited) {
    // On facture les IMAGES réellement produites, pas les publicités composées ·
    // un lot d'essai compose quatre publicités sur une seule image, et une pub
    // rattrapée a coûté deux images. `imagesFal` compte les deux cas justes ·
    // le reste de ce qui a été réservé (dont la marge de reprise non utilisée)
    // est rendu. Rien n'est produit → on rembourse tout, comme avant.
    const facturables = ads.length ? imagesFal : 0;
    const unused = o.reservedCredits - o.creditsPerImage * facturables;
    if (unused > 0) await refundCredits(o.workspaceId, unused, 'Remboursement · images non produites');
  }
  return ads;
}

/** Prompt « références marque » : composer une nouvelle scène inspirée des assets de la bibliothèque. */
/**
 * Le cumul des essais de mise en page, pour la marque active.
 *
 * ── Pourquoi au mieux, et jamais bloquant ────────────────────────────────────
 *
 * La carte peut être fermée pour cette marque, ou la lecture échouer. Un studio
 * qui refuserait de générer parce qu'il n'a pas pu consulter une statistique
 * échangerait une amélioration contre une panne.
 *
 * Sans cumul, `appliquerEssais` retombe sur les taux, puis sur rien · la
 * rotation d'avant, exactement.
 */
async function cumulCoquillesPourMarque(): Promise<CumulEssais | null> {
  const { view } = await essaisViewAction();
  return view?.cumuls.find((c) => c.variable === 'mise_en_page') ?? null;
}

/** Ce qu'on accepte comme coquille · le reste vient du navigateur. */
function isAdLayout(v: unknown): v is AdLayout {
  return typeof v === 'string' && (AD_LAYOUTS as readonly string[]).includes(v);
}

function scenePromptBrandRef(c: AdConcept, universePrompt?: string, layout?: AdLayout, polyvalent?: boolean): string {
  const base = c.sceneBrief.slice(0, 650);
  const uni = universePrompt ? `Art direction / visual universe: ${universePrompt}` : '';
  return `The provided images are brand reference material (real brand/product/lifestyle shots). Compose a NEW premium advertising scene INSPIRED by their look, palette, materials and authenticity · do not copy them literally and do not reproduce any text or logo from them. New scene: ${base}. ${uni} Ultra realistic, photorealistic, true-to-life proportions, correct perspective, no distortion. Premium advertising photography. ${cadrageDe(layout, polyvalent)} Absolutely NO text, NO words, NO captions, NO logos, NO watermark added to the image.`;
}

/**
 * Le cadrage demandé · celui de la coquille, ou le compromis d'un essai.
 *
 * Une SEULE expression choisit entre les deux · c'est ce qui empêche qu'un
 * chemin de génération oublie le compromis et cadre pour une coquille alors que
 * l'image en servira quatre.
 */
function cadrageDe(layout?: AdLayout, polyvalent?: boolean): string {
  return polyvalent ? sceneFramingPolyvalent() : sceneFraming(layout);
}

/** Prompt de clonage : recomposer la mise en page de la référence avec NOTRE produit. */
function scenePromptClone(c: AdConcept, hasProduct: boolean): string {
  const base = c.sceneBrief.slice(0, 500);
  const product = hasProduct
    ? 'The FIRST image is a winning reference ad. The OTHER image(s) show OUR product. Recreate the reference ad\'s exact composition, framing, camera angle, background, lighting and overall mood, but REPLACE its product with OUR product, keeping our product EXACTLY identical (same packaging shape, label, logo, text, colors and real proportions · do not distort it).'
    : 'The image is a winning reference ad. Recreate its exact composition, framing, background, lighting and mood, adapted to our brand.';
  return `${product} Scene notes: ${base}. Ultra realistic, photorealistic, true-to-life proportions, correct perspective, no distortion. Premium advertising photography. Absolutely NO text, NO words, NO captions, NO logos, NO watermark added to the image.`;
}

function scenePrompt(c: AdConcept, editMode: boolean, universePrompt?: string, layout?: AdLayout, polyvalent?: boolean): string {
  const base = c.sceneBrief.slice(0, 700);
  // Le cadrage dépend de la coquille où l'image atterrit · il était écrit en dur
  // pour l'immersive, et donc faux pour les trois autres : on payait une image
  // composée pour une page qu'elle n'allait pas occuper.
  const framing = cadrageDe(layout, polyvalent);
  const realism = 'Ultra realistic, photorealistic, true-to-life scale and proportions. The product must be at a believable real-world size (a supplement bottle is roughly 12 cm tall): never gigantic, never tiny, never floating. Hands, fingers and faces must be anatomically correct. Correct perspective and grounding (real contact shadow), no distortion, no warping, no stretching, no duplicated or extra objects, accurate label and cap proportions, physically plausible lighting, shadows and reflections.';
  const uni = universePrompt ? `Art direction / visual universe: ${universePrompt}` : '';
  const noText = 'Absolutely NO text, NO words, NO captions, NO logos, NO watermark, NO UI added to the image.';
  if (editMode) {
    return `Place the product from the reference image into a new scene, keeping it EXACTLY identical (same packaging shape, label, logo, text, colors AND real proportions · do not resize, stretch or reshape it). New scene: ${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
  }
  return `${base}. ${uni} ${realism} Premium advertising photography. ${framing} ${noText}`;
}

/**
 * Distille les notes de pertinence (👍/👎) du client en consignes pour Jarvis :
 * apprentissage en contexte, par marque · « ce qui plaît / ne plaît pas ».
 */
async function learnedPreferences(brandId: string): Promise<string | undefined> {
  if (!db) return undefined;
  const rows = await db.select({ input: schema.generations.input })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brandId), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(80);
  const liked: string[] = [], disliked: string[] = [];
  for (const r of rows) {
    const rec = (r.input ?? {}) as { rating?: 'up' | 'down'; headline?: string; template?: string };
    if (!rec.rating || !rec.headline) continue;
    const line = `${rec.template ? '[' + rec.template + '] ' : ''}${rec.headline}`.slice(0, 120);
    (rec.rating === 'up' ? liked : disliked).push(line);
    if (liked.length >= 8 && disliked.length >= 8) break;
  }
  if (!liked.length && !disliked.length) return undefined;
  const parts: string[] = [];
  if (liked.length) parts.push("Créas jugées PERTINENTES par le client (reprends l'esprit, l'angle, le ton) :\n- " + liked.slice(0, 8).join('\n- '));
  if (disliked.length) parts.push('Créas jugées NON pertinentes (évite ces angles/formulations) :\n- ' + disliked.slice(0, 8).join('\n- '));
  return parts.join('\n\n');
}

/**
 * Enveloppe · une exception qui S'ÉCHAPPE au lieu de renvoyer { error } ne doit
 * ni figer le client (le bouton restait sur « Génération… »), ni disparaître
 * dans les logs du conteneur que personne ne lit. On la JOURNALISE — elle
 * remonte alors dans « Incidents techniques » (/admin/incidents) — et on la
 * renvoie comme un échec lisible.
 *
 * C'est le trou qu'un incident a révélé · le lot levait, la page d'incidents
 * restait vide (logAndTranslate ne journalise que ce qu'un catch lui donne), et
 * il fallait le terminal du serveur pour voir quoi que ce soit. Le correctif
 * client (#279) empêche le figeage ; celle-ci fait que l'échec est VU.
 */
export async function generateAdsAction(input: Parameters<typeof genererLotInterne>[0]): Promise<AdsResult> {
  try {
    return await genererLotInterne(input);
  } catch (e) {
    return { error: logAndTranslate('ads:generate', e, { subject: 'la génération des pubs' }) };
  }
}

async function genererLotInterne(input: {
  productId?: string; personaId?: string; objective?: string; templates?: AdTemplate[]; angle?: string; universe?: string; count?: number; assetIds?: string[]; offer?: string; model?: string;
  /** Identifiant d'un prompt maison · prime sur `universe`. */
  presetId?: string;
  /**
   * Coquille imposée · absente ou inconnue, la rotation décide.
   *
   * Imposer la même à tout un lot est un choix légitime — on veut parfois quatre
   * affiches — mais ce n'est PAS le défaut : la rotation existe justement pour
   * qu'un lot ne rende pas quatre fois la même image.
   */
  layout?: string;
  /**
   * Le lot déclare ce qu'il teste · une seule dimension varie, le reste est tenu.
   *
   * Absent, on garde le lot libre : quatre gabarits, quatre mises en page,
   * quatre ambiances. C'est utile pour explorer, ça ne prouve rien.
   */
  essai?: string;
  /**
   * Comment fabriquer la publicité · composée par défaut.
   *
   * « entiere » demande au modèle la publicité complète, typographie comprise.
   * Un essai côte à côte l'a montrée meilleure sur l'étiquette, le français et
   * la mise en page · elle ne garantit simplement pas les textes au caractère
   * près, et le mode le dit.
   */
  mode?: string;
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };

  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: GUARD.aiOff() };
  if (!db) return { error: GUARD.db() };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  // Le lot est-il un essai ?
  //
  // Un essai tient tout constant sauf une chose. Les conséquences descendent
  // ensuite partout : un seul gabarit, une seule coquille (ou N, si c'est elle
  // qu'on teste), une seule scène, et donc un prix qui n'est plus celui de N
  // images.
  const mode: ProductionMode = estMode(input.mode) ? input.mode : 'composee';

  const essaiVariable = (ESSAI_VARIABLES as readonly string[]).includes(input.essai ?? '')
    ? input.essai as EssaiVariable
    : null;

  // Pool de gabarits autorisés + quantité voulue -> liste ordonnée (avec répétitions).
  const pool = (input.templates && input.templates.length ? input.templates : AD_TEMPLATES);
  const brut = Math.min(8, Math.max(1, Math.round(input.count ?? pool.length)));
  // Un essai de mise en page ne peut pas dépasser le nombre de coquilles · en
  // demander cinq en produirait deux identiques, et le contrôle refuserait le
  // lot entier après l'avoir payé.
  const count = essaiVariable === 'mise_en_page' ? Math.min(brut, AD_LAYOUTS.length) : brut;
  // Un essai garde UN gabarit · en faire varier un second ferait varier deux
  // choses, ce qui est exactement ce qu'un essai refuse.
  const templates = essaiVariable
    ? Array.from({ length: count }, () => pool[0]!)
    : Array.from({ length: count }, (_, i) => pool[i % pool.length]!);
  // Les mises en page sont décidées ICI · avant l'écriture des concepts, pour
  // que le modèle connaisse la place dont il dispose, et avant la composition,
  // qui les applique. Une seule décision, deux étapes servies.
  const impose = isAdLayout(input.layout) ? input.layout : null;
  const modelSpec = imageModelByKey(input.model);
  // Le rattrapage ne vaut que pour le mode entière hors essai · c'est le seul où
  // une pub est relue puis peut être régénérée seule. Un essai partage sa scène,
  // le mode composé écrit ses propres textes.
  const reprisesBudget = mode === 'entiere' && !essaiVariable ? budgetReprises(count) : 0;
  // Le prix suit les IMAGES produites, pas les publicités composées · un essai
  // d'accroches ou de mises en page en produit UNE pour quatre publicités. En
  // entière, on réserve EN PLUS la marge de reprise · elle est ainsi annoncée
  // avant le clic, et le non-utilisé est remboursé par composeBatch.
  const cost = essaiVariable
    ? prixEssai(essaiVariable, count, modelSpec.credits)
    : modelSpec.credits * imagesAReserver(count, reprisesBudget > 0);
  const unlimited = unlimitedCredits(s.user.email);
  // Débit atomique en bloc avant la génération ; composeBatch rembourse les visuels
  // qui n'ont pas abouti. Vérifier puis débiter en deux temps laissait deux lots
  // lancés simultanément passer pour un seul débit.
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · pubs IA'))) {
    return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };
  }

  // Contexte marque + produit + persona.
  const [da] = await db.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null; imageUrls: string[] | null } | null = null;
  if (input.productId) {
    const [p] = await db.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(and(eq(schema.products.id, input.productId), eq(schema.products.brandId, brand.id))).limit(1);
    if (p) product = p;
  }
  let persona: { name: string; pains: string[] | null; desires: string[] | null } | null = null;
  if (input.personaId) {
    const [p] = await db.select({ name: schema.personas.name, pains: schema.personas.pains, desires: schema.personas.desires })
      .from(schema.personas).where(and(eq(schema.personas.id, input.personaId), eq(schema.personas.brandId, brand.id))).limit(1);
    if (p) persona = p;
  }

  const productImageUrls = product ? (product.imageUrls && product.imageUrls.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
  const editMode = !!(productImageUrls && productImageUrls.length);
  // Bibliothèque Assets : sélection explicite si fournie, sinon auto (images marque/communes).
  const assetRefUrls = input.assetIds && input.assetIds.length
    ? await resolveAssetImageUrls(s.workspaceId, input.assetIds, 6)
    : await listBrandAssetImageUrls(s.workspaceId, brand.id, 4);

  // Inspiration « ce qui fonctionne » : concurrents de la marque + copy des pubs sauvegardées (veille).
  const [brow] = await db.select({ competitors: schema.brands.competitors }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const saved = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  const winningCopy = saved.map((r) => copyFromSnapshot(r.snapshot)).filter((x): x is string => !!x);

  // Apprentissage Jarvis : notes de pertinence du client (👍/👎) + learnings existants.
  // Ordre d'autorité, du plus fort au plus faible : ce que la marque a MESURÉ
  // (verdicts ADSMAP), puis ce qu'elle a distillé de la veille, puis les créas
  // notées au pouce. Le premier bloc n'existe qu'à partir de vrais verdicts.
  const [memoire, prefs, statsPourExpliquer, accroches] = await Promise.all([
    jarvisMemoryWithUse(brand.id, s.workspaceId),
    learnedPreferences(brand.id),
    jarvisStats(brand.id, s.workspaceId).catch(() => ({ stats: [], globalRate: null, nAds: 0 })),
    jarvisHooks(brand.id, s.workspaceId).catch(() => []),
  ]);
  const winningPatterns = [memoire.text, da?.jarvisLearnings, prefs].filter(Boolean).join('\n\n') || undefined;
  // Le contexte d'explication vient des MÊMES lectures que la mémoire injectée ·
  // expliquer avec d'autres chiffres que ceux qui ont servi serait une fiction.
  const rationaleCtx = {
    stats: statsPourExpliquer.stats as StatRow[],
    globalRate: statsPourExpliquer.globalRate,
    hooks: accroches as HookEntry[],
  };

  // Les mises en page du lot · la rotation apprend de la marque.
  //
  // Une mise en page nettement perdante sort du vivier : mesurer qu'elle perd et
  // continuer à la servir une fois sur quatre, c'est produire un rapport que
  // personne n'applique. Le seuil est sévère et garde toujours deux mises en
  // page en lice · une exclue ne produit plus de tests, donc ne peut plus se
  // racheter.
  //
  // Les ESSAIS l'emportent sur les taux quand ils ont parlé · un essai tient
  // tout le reste, un taux par coquille compare des coquilles et mesure tout ce
  // qui les accompagnait. La lecture est au mieux : la carte peut être fermée
  // pour cette marque, et un studio ne doit pas s'arrêter pour autant.
  const cumulCoquilles = impose ? null : await cumulCoquillesPourMarque().catch(() => null);
  const decision = impose
    ? { ecartees: [] as AdLayout[], favori: null as AdLayout | null, source: 'aucune' as const, resume: '' }
    : appliquerEssais({
        cumul: cumulCoquilles,
        rates: (statsPourExpliquer.stats as StatRow[])
          .filter((r) => r.dimension === 'layout')
          .map((r) => ({ layout: r.key, nConclusive: r.nConclusive, hitRate: r.hitRate })),
        globalRate: statsPourExpliquer.globalRate,
      });
  const ecartees = decision.ecartees;
  const vivier = AD_LAYOUTS.filter((l) => !ecartees.includes(l));

  /**
   * Les coquilles du lot.
   *
   * Un essai de mise en page en veut N DISTINCTES · c'est ce qu'il teste. Les
   * deux autres n'en veulent qu'UNE, tenue pour tout le lot, et on prend
   * l'immersive : c'est celle dont le budget de copie est le plus large, donc
   * la seule sur laquelle une accroche un peu longue ne fera pas basculer une
   * publicité du lot vers une autre coquille.
   */
  const coquilleEssai: AdLayout | null =
    essaiVariable && essaiVariable !== 'mise_en_page' ? (impose ?? 'immersif') : null;
  const mises = essaiVariable === 'mise_en_page'
    ? layoutsFor(templates[0]!).slice(0, count) as AdLayout[]
    : coquilleEssai
      ? templates.map(() => coquilleEssai)
      : impose
        ? templates.map(() => impose)
        : layoutsForBatchFavori(templates.length, Math.floor(Date.now() / 60000), vivier, decision.favori);

  // 1) Concepts (Claude) · un par gabarit, tous au service de l'angle si fourni.
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
      hasProductPhoto: editMode,
      persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
      objective: input.objective, angle: input.angle?.trim() || undefined, offer: input.offer?.trim() || undefined, creativeRules: da?.creativeRules ?? undefined, winningPatterns,
    }, {
      // Un essai de mise en page ou d'ambiance ne demande QU'UN concept · les N
      // publicités partagent les mêmes textes, c'est ce qui est tenu. En
      // demander N puis n'en garder qu'un ferait payer une écriture jetée.
      templates: essaiVariable && essaiVariable !== 'accroche' ? [templates[0]!] : templates,
      copyBudget: mises.map(copyBudgetLine), winningCopy, competitors: brow?.competitors ?? undefined,
    });
  } catch (e) {
    return { error: logAndTranslate('ads:concepts', e, { subject: "l'écriture des concepts", workspaceId: s.workspaceId }) };
  }
  if (!concepts.length) return { error: "Aucun concept n'a pu être généré. Réessaie." };

  // Le prompt maison est résolu une fois pour tout le lot · le relire par visuel
  // ferait autant de requêtes que d'images, pour la même réponse.
  const resolu = await resolvePreset(s.workspaceId, input.presetId);
  const presetChoisi = resolu && input.presetId ? { id: input.presetId, ...resolu } : null;

  // Les N publicités d'un essai de mise en page ou d'ambiance partagent le même
  // concept · une seule écriture, répétée, parce que c'est elle qui est tenue.
  const lot = essaiVariable && essaiVariable !== 'accroche'
    ? Array.from({ length: count }, () => concepts[0]!)
    : concepts;

  // La mesure de la marque nourrit DEUX leviers d'entière · on la lit une seule
  // fois. Lecture au mieux, jamais bloquante · un bilan illisible retombe sur le
  // comportement d'avant (rotation égale, aucun renfort).
  let directionsVivier: AdDirection[] | undefined;
  let directionAncree = false;
  let durcissementsEntiere: string[] | undefined;
  let tendancesMarche: string[] | undefined;
  if (mode === 'entiere' && !essaiVariable) {
    const bilan = (await bilanCopieAction().catch(() => ({ bilan: undefined }))).bilan;

    // 0 · La grammaire de layout gagnante de la catégorie · distillée de la veille
    // déjà décrite (sans migration, sans dépense · #265 range les dimensions dans
    // le jsonb). Une consigne de direction artistique, pas une règle · on ne la
    // pose PAS sur un preset maison, qui porte sa propre direction. Inerte tant
    // qu'aucune créa concurrente n'a été analysée. Lecture au mieux.
    if (!presetChoisi) {
      const t = await tendancesLayoutMarcheAction().catch(() => [] as string[]);
      if (t.length) tendancesMarche = t;
    }

    // 1 · Le durcissement ciblé · renforts sur les défauts que CETTE marque a
    // mesurément (accents perdus, texte illisible). S'applique à TOUTE entière
    // hors essai, preset ou direction imposée comprises · un défaut d'accents ne
    // dépend pas de la direction. Les compteurs se reconstruisent du taux et du
    // dénominateur (taux = compte / n, donc l'arrondi rend le compte exact).
    if (bilan) {
      const d = durcirEntiere({
        relues: bilan.relues,
        accents: Math.round((bilan.tauxAccents ?? 0) * bilan.relues),
        avecTexte: bilan.avecTexte,
        illisibles: Math.round((bilan.tauxIllisible ?? 0) * bilan.avecTexte),
      });
      if (d.length) durcissementsEntiere = d;
    }

    // 2 · La rotation des directions, biaisée par la mesure · seulement sur une
    // direction auto (pas imposée, pas un preset maison), là où la rotation a
    // encore un sens.
    if (bilan && !presetChoisi && (!input.universe || input.universe === 'auto')) {
      const dirDim = bilan.dimensions.find((d) => d.dimension === 'direction');
      if (dirDim) {
        const { ecartees, favori } = directionsBiais(dirDim.lignes);
        if (ecartees.length || favori) {
          const restants = AD_DIRECTIONS.filter((d) => !ecartees.includes(d.key));
          // Toujours au moins deux directions · une rotation à une seule n'en est
          // plus une, et une mesure qui condamnerait tout sauf une est plus
          // probablement du bruit qu'une vérité.
          const base = restants.length >= 2 ? restants : AD_DIRECTIONS;
          const fav = favori ? base.find((d) => d.key === favori) : null;
          directionsVivier = fav ? [fav, ...base.filter((d) => d.key !== fav.key)] : base;
          directionAncree = !!fav;
        }
      }
    }
  }

  const echec: { dernier?: unknown } = {};
  // Typé explicitement · `essaiRompu` est rempli PAR `composeBatch`, et une
  // inférence à partir de l'objet littéral le laisserait absent du type.
  const options: Parameters<typeof composeBatch>[0] = {
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, assetRefUrls, concepts: lot, universe: input.universe,
    mises,
    // Tenir la scène, c'est n'en produire qu'une · toutes les publicités
    // pointent alors vers la même.
    sceneFor: essaiVariable && essaiVariable !== 'univers' ? lot.map(() => 0) : undefined,
    coquilleImposee: coquilleEssai,
    // La même image sera composée de N façons · son cadrage devient un
    // compromis, et c'est dit dans la consigne au modèle.
    cadragePolyvalent: essaiVariable === 'mise_en_page',
    essai: essaiVariable ? { variable: essaiVariable, groupe: crypto.randomUUID() } : null,
    mode,
    reprisesBudget,
    directionsVivier, directionAncree, durcissementsEntiere, tendancesMarche,
    preset: presetChoisi,
    workspaceId: s.workspaceId, unlimited, reservedCredits: unlimited ? 0 : cost,
    modelSpec, creditsPerImage: modelSpec.credits, echec,
    productId: input.productId, personaId: input.personaId, objective: input.objective,
    memoryUse: memoire.use, rationaleCtx,
  };
  const ads = await composeBatch(options);
  if (!ads.length) {
    // Un délai dépassé sur un modèle lent ne se règle pas en demandant moins de
    // créas · le conseil générique envoie vers une manœuvre qui ne change rien.
    const conseil = delaiDepasse(echec.dernier) ? conseilDelai(modelSpec) : null;
    const base = echecLisible(echec.dernier, s.workspaceId);
    return { error: conseil ? `${base} ${conseil}` : base };
  }
  return { ads, requested: count, essaiRompu: options.essaiRompu, appliquee: decision.resume || undefined };
}

/** Propose des angles précis en s'appuyant sur la marque + les sauvegardes de veille + les concurrents. */
export async function suggestAnglesAction(input: { productId?: string }): Promise<{ angles?: AdAngle[]; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: GUARD.aiOff() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('suggest');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · angles suggérés'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  const { da, product } = await loadAdContext(brand.id, input.productId);

  // Concurrents (DA) + copy des pubs sauvegardées (veille).
  const [brow] = await db.select({ competitors: schema.brands.competitors }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const saved = await db.select({ snapshot: schema.savedAds.snapshot })
    .from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).limit(20);
  const winningCopy = saved.map((r) => copyFromSnapshot(r.snapshot)).filter((x): x is string => !!x);

  try {
    const angles = await suggestAdAngles(client, {
      brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
      audience: da?.audience ?? undefined, category: da?.category ?? undefined,
      productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
    }, { winningCopy, competitors: brow?.competitors ?? undefined });
    return { angles };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · angles suggérés');
    return { error: logAndTranslate('ads:angles', e, { subject: 'la proposition d’angles', workspaceId: s.workspaceId }) };
  }
}

/** Contexte marque + produit + persona (mutualisé par génération et clone). */
async function loadAdContext(brandId: string, productId?: string, personaId?: string) {
  const [da] = await db!.select({
    colors: schema.brands.colors, tone: schema.brands.tone, usp: schema.brands.usp,
    audience: schema.brands.audience, category: schema.brands.category, logoUrl: schema.brands.logoUrl,
    // Le clone en a besoin comme la génération : les règles maison et les patterns
    // distillés ne doivent pas dépendre du chemin emprunté.
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);

  let product: { name: string; description: string | null; usp: string | null; imageUrl: string | null; imageUrls: string[] | null } | null = null;
  if (productId) {
    const [p] = await db!.select({ name: schema.products.name, description: schema.products.description, usp: schema.products.usp, imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.brandId, brandId))).limit(1);
    if (p) product = p;
  }
  let persona: { name: string; pains: string[] | null; desires: string[] | null } | null = null;
  if (personaId) {
    const [p] = await db!.select({ name: schema.personas.name, pains: schema.personas.pains, desires: schema.personas.desires })
      .from(schema.personas).where(and(eq(schema.personas.id, personaId), eq(schema.personas.brandId, brandId))).limit(1);
    if (p) persona = p;
  }
  return { da, product, persona };
}

const DATA_URI = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

/** Références de pubs gagnantes issues de la veille (pour le mode Clone). */
export interface SavedAdRef { id: string; imageUrl: string; brandName: string | null }
export async function listSavedAdRefs(): Promise<SavedAdRef[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const rows = await db.select({ id: schema.savedAds.id, snapshot: schema.savedAds.snapshot })
    .from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)).orderBy(desc(schema.savedAds.createdAt)).limit(40);
  const out: SavedAdRef[] = [];
  for (const r of rows) {
    const img = imageUrlFromSnapshot(r.snapshot);
    const snap = (r.snapshot ?? {}) as Record<string, unknown>;
    if (img) out.push({ id: r.id, imageUrl: img, brandName: typeof snap.brandName === 'string' ? snap.brandName : (typeof snap.advertiser === 'string' ? snap.advertiser : null) });
  }
  return out;
}

/**
 * Clone une pub gagnante : analyse la référence (vision), en déduit l'angle + le gabarit,
 * puis produit N variations sur ta marque/produit (même moteur que « Depuis la marque »).
 */
/** Même barrière que la génération · un clone qui LÈVE remonte dans les incidents. */
export async function cloneAdAction(input: Parameters<typeof clonerLotInterne>[0]): Promise<AdsResult> {
  try {
    return await clonerLotInterne(input);
  } catch (e) {
    return { error: logAndTranslate('ads:clone', e, { subject: 'le clonage de la pub' }) };
  }
}

async function clonerLotInterne(input: {
  referenceDataUri?: string; savedAdId?: string;
  productId?: string; personaId?: string; objective?: string; universe?: string; count?: number; model?: string;
  /** Consigne libre · ce que l'utilisateur veut changer par rapport à la référence. */
  direction?: string;
  /** Scène enregistrée reprise · c'est ce rattachement qui lui bâtit un bilan. */
  presetId?: string;
}): Promise<AdsResult> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  const cfg = falFromEnv();
  if (!cfg) return { error: "La génération d'image n'est pas activée (clé Fal manquante)." };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: GUARD.aiOff() };
  if (!db) return { error: GUARD.db() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  // Référence : upload direct OU pub sauvegardée de la veille.
  // ref = base64 (analyse vision) ; refForModel = URL/data URI donnée au modèle image pour répliquer la mise en page.
  let ref: CloneRefImage | null = null;
  let refForModel = '';
  if (input.savedAdId) {
    const [row] = await db.select({ snapshot: schema.savedAds.snapshot }).from(schema.savedAds)
      .where(and(eq(schema.savedAds.id, input.savedAdId), eq(schema.savedAds.workspaceId, s.workspaceId))).limit(1);
    const url = row ? imageUrlFromSnapshot(row.snapshot) : null;
    if (url) { ref = await refFromUrl(url); refForModel = url; }
    if (!ref) return { error: "Impossible de charger l'image de cette pub sauvegardée. Utilise l'upload." };
  } else {
    const uri = input.referenceDataUri?.trim() || '';
    const m = DATA_URI.exec(uri);
    if (!m || !m[1] || !m[2]) return { error: 'Ajoute une pub de référence (upload ou depuis la veille).' };
    ref = { mediaType: m[1] as CloneRefImage['mediaType'], base64: m[2] };
    refForModel = uri;
  }

  const count = Math.min(8, Math.max(1, Math.round(input.count ?? 4)));
  const modelSpec = imageModelByKey(input.model);
  const cost = modelSpec.credits * count;
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Studio · clone de pub'))) {
    return { error: `Crédits insuffisants (${cost} requis pour ${count} pub(s)).` };
  }

  const { da, product, persona } = await loadAdContext(brand.id, input.productId, input.personaId);
  const productImageUrls = product ? (product.imageUrls && product.imageUrls.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
  const editMode = !!(productImageUrls && productImageUrls.length);
  // Le clone bénéficie de la même mémoire mesurée : reproduire une pub qui a
  // marché ailleurs sans tenir compte de ce qui marche ICI serait une régression.
  const [mesureClone, prefsClone] = await Promise.all([
    jarvisMemoryWithUse(brand.id, s.workspaceId),
    learnedPreferences(brand.id),
  ]);
  const ctx = {
    brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
    audience: da?.audience ?? undefined, category: da?.category ?? undefined,
    productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
    hasProductPhoto: editMode,
    persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
    objective: input.objective,
    creativeRules: da?.creativeRules ?? undefined,
    winningPatterns: [mesureClone.text, da?.jarvisLearnings, prefsClone].filter(Boolean).join('\n\n') || undefined,
  };

  // 1) Analyse de la référence -> gabarit + angle à répliquer.
  let base: AdConcept | null;
  try { base = await cloneAdFromReference(client, ref, ctx, input.direction); }
  catch (e) { return { error: logAndTranslate('ads:ref', e, { subject: 'l’analyse de la pub de référence', workspaceId: s.workspaceId }) }; }
  if (!base) return { error: "La pub de référence n'a pas pu être interprétée. Réessaie." };
  const angle = [base.kicker, base.headline].filter(Boolean).join(' · ') || base.headline;

  // 2) N variations sur ce même angle + gabarit (moteur « Depuis la marque »).
  let concepts: AdConcept[];
  try {
    concepts = await generateAdConcepts(client, { ...ctx, angle }, { templates: Array.from({ length: count }, () => base!.template) });
  } catch (e) {
    return { error: logAndTranslate('ads:clone', e, { subject: 'l’écriture des variations', workspaceId: s.workspaceId }) };
  }
  if (!concepts.length) concepts = [base]; // repli : au moins la reproduction directe

  // La scène enregistrée vaut aussi pour le clonage · sans ce rattachement, une
  // scène reprise cent fois afficherait encore « jamais utilisée ».
  const resoluClone = await resolvePreset(s.workspaceId, input.presetId);
  const presetClone = resoluClone && input.presetId ? { id: input.presetId, ...resoluClone } : null;

  const echec: { dernier?: unknown } = {};
  const ads = await composeBatch({
    cfg, brandId: brand.id, brandName: brand.name, colors: da?.colors, logoUrl: da?.logoUrl,
    productImageUrls, editMode, concepts, universe: input.universe, cloneRefUrl: refForModel || undefined,
    // Le clonage reprend la mise en page de la RÉFÉRENCE, pas la nôtre · on
    // garde donc l'immersive, celle qui laisse l'image entière parler. Faire
    // tourner nos quatre mises en page contredirait la demande.
    mises: concepts.map(() => 'immersif' as const),
    preset: presetClone,
    workspaceId: s.workspaceId, unlimited, reservedCredits: unlimited ? 0 : cost,
    modelSpec, creditsPerImage: modelSpec.credits, echec,
    productId: input.productId, personaId: input.personaId, objective: input.objective,
    memoryUse: mesureClone.use,
  });
  if (!ads.length) return { error: echecLisible(echec.dernier, s.workspaceId) };
  return { ads, requested: count };
}

/** Liste les publicités composées (actives par défaut, ou archivées). */
export async function listBrandAds(opts?: { archived?: boolean }): Promise<AdItem[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];
  const wantArchived = !!opts?.archived;
  const rows = await db.select({ id: schema.generations.id, input: schema.generations.input, status: schema.generations.status, createdAt: schema.generations.createdAt })
    .from(schema.generations)
    .where(and(eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .orderBy(desc(schema.generations.createdAt)).limit(240);
  return rows
    .filter((r) => (r.status === 'archived') === wantArchived)
    .map((r) => {
      const rec = (r.input ?? {}) as Partial<AdRecipe> & { rating?: import('./creatives').Rating; jarvisScore?: CreativeScore };
      return {
        id: r.id, template: (rec.template ?? 'problem_solution') as AdTemplate, headline: rec.headline ?? '',
        url: adUrl(r.id, rec), createdAt: (r.createdAt as Date).toISOString(),
        rating: rec.rating ?? null, score: rec.jarvisScore?.score,
        parentId: rec.parentId ?? null, variable: rec.variable ?? null,
        essai: rec.essai?.variable ?? null,
        sceneBrief: !!rec.sceneBrief?.trim(),
        controle: controleDepuisRecette(rec),
      };
    });
}

/**
 * Un exemple par univers, pris dans les pubs de la marque.
 *
 * ── Pourquoi pas des images de démonstration ─────────────────────────────────
 *
 * On aurait pu joindre huit visuels de référence. Ils montreraient ce que
 * l'univers donne sur un produit qui n'est pas le vôtre · c'est-à-dire la seule
 * chose qu'on sait déjà en lisant « Sombre cinématique ».
 *
 * Ce qu'on veut savoir, c'est ce que ça donne ICI. La marque a déjà payé des
 * générations : la meilleure démonstration est la sienne, et elle ne coûte rien.
 *
 * L'univers n'était pas consigné jusqu'ici · les pubs antérieures n'en portent
 * donc pas, et leur univers reste sans aperçu jusqu'à la prochaine série. On ne
 * devine pas : une vignette attribuée au mauvais univers vendrait une ambiance
 * pour une autre.
 *
 * ── On montre la MEILLEURE, pas la dernière ──────────────────────────────────
 *
 * C'était la plus récente jusqu'ici. Mais la vignette ne raconte pas
 * l'historique · elle sert à décider, et ce qu'on veut savoir c'est ce que
 * cette direction sait faire de mieux. Une dernière créa ratée fait écarter une
 * direction qui marche.
 *
 * Les ratés sont écartés, et une direction qui n'a produit QUE des ratés reste
 * sans vignette. La règle vit dans le noyau, où elle se teste.
 */
export async function universeSamplesAction(): Promise<Record<string, string>> {
  const s = await getSession();
  if (!s || !db) return {};
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return {};

  const rows = await db.select({ id: schema.generations.id, input: schema.generations.input })
    .from(schema.generations)
    .where(and(
      eq(schema.generations.brandId, brand.id),
      eq(schema.generations.kind, 'ad'),
      eq(schema.generations.status, 'completed'),
    ))
    .orderBy(desc(schema.generations.createdAt))
    .limit(160);

  // Les lignes arrivent du plus récent au plus ancien · le rang inverse
  // l'ordre pour que « plus grand » veuille dire « plus récent », ce que la
  // règle du noyau attend.
  const candidats = rows.map((r, i) => {
    const rec = (r.input ?? {}) as Partial<AdRecipe> & { jarvisScore?: CreativeScore; copieConforme?: VerdictCopie };
    const vd = verdictDefauts(rec.jarvisScore?.defauts);
    return {
      id: r.id,
      direction: rec.universe,
      score: rec.jarvisScore?.score ?? null,
      // Un raté de fabrication, ou une accroche que le modèle a réécrite · dans
      // les deux cas la créa ne représente pas sa direction, elle représente
      // une génération manquée.
      // Quatre façons de ne pas représenter sa direction · un raté de
      // fabrication, une accroche réécrite, un produit qui n'est plus le nôtre,
      // un texte illisible. Une pub au packaging inventé ou au texte brouillé est
      // inutilisable, si belle soit-elle · elle ne vend pas sa direction.
      grave: vd.grave || !!rec.copieConforme?.grave || rec.produitFidele === false || rec.texteLisible === false,
      rang: rows.length - i,
      rec,
    };
  });

  const out: Record<string, string> = {};
  for (const [direction, gagnant] of Object.entries(exemplesParDirection(candidats))) {
    const c = candidats.find((x) => x.id === gagnant.id);
    if (c) out[direction] = `${adUrl(c.id, c.rec)}&t=1`;
  }
  return out;
}

/** Archive (ou restaure) un rendu de pub. */
export async function archiveAdAction(input: { id: string; archived?: boolean }): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  const [g] = await db.select({ id: schema.generations.id }).from(schema.generations)
    .where(and(eq(schema.generations.id, input.id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: GUARD.notFound('ce rendu') };
  await db.update(schema.generations).set({ status: input.archived === false ? 'completed' : 'archived' }).where(eq(schema.generations.id, input.id));
  return { ok: true };
}

export interface AdText { kicker?: string; headline?: string; subhead?: string; cta?: string; badge?: string }

/** Lit les textes éditables d'une pub (accroche, sous-titre, CTA…). */
export async function getAdTextAction(id: string): Promise<{ text?: AdText; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: GUARD.notFound('ce rendu') };
  const r = (g.input ?? {}) as Partial<AdRecipe>;
  return { text: { kicker: r.kicker ?? '', headline: r.headline ?? '', subhead: r.subhead ?? '', cta: r.cta ?? '', badge: r.badge ?? '' } };
}

/**
 * Met à jour les textes d'une pub SANS régénérer l'image (l'overlay est recomposé à la volée) :
 * aucun crédit débité. Renvoie une version pour rafraîchir l'aperçu (cache-bust).
 */
export async function updateAdTextAction(id: string, text: AdText): Promise<{ ok?: true; url?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: GUARD.notFound('ce rendu') };
  const r = (g.input ?? {}) as Record<string, unknown>;
  const clean = (v?: string) => (typeof v === 'string' ? v.trim() : undefined);
  const next = {
    ...r,
    kicker: clean(text.kicker) || undefined,
    headline: clean(text.headline) || (r.headline as string) || '',
    subhead: clean(text.subhead) || undefined,
    cta: clean(text.cta) || (r.cta as string) || '',
    badge: clean(text.badge) || undefined,
  };
  await db.update(schema.generations).set({ input: next as Record<string, unknown> }).where(eq(schema.generations.id, id));
  // La version suit le contenu (et non l'horloge) : la grille, l'aperçu et le
  // téléchargement pointent tous sur la même URL fraîche.
  return { ok: true, url: adUrl(id, next as Partial<AdRecipe>) };
}

/**
 * Score Jarvis · évalue le POTENTIEL DE PERFORMANCE d'une créa (scroll-stop, clarté, adéquation),
 * en s'appuyant sur les règles maison + les patterns gagnants appris. Débite 2 crédits.
 */
export async function scoreCreativeAction(id: string, opts?: { force?: boolean }): Promise<{ score?: CreativeScore; copie?: VerdictCopie | null; cost?: number; cached?: true; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const client = guardedAnthropic({ action: 'ads' });
  if (!client) return { error: GUARD.aiOff() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const [g] = await db.select({ input: schema.generations.input }).from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad'))).limit(1);
  if (!g) return { error: GUARD.notFound('ce rendu') };
  const r = (g.input ?? {}) as Partial<AdRecipe> & { jarvisScore?: CreativeScore; copieConforme?: VerdictCopie };

  // Score déjà calculé : on le renvoie sans redébiter (sauf nouvelle analyse demandée).
  // Le verdict de copie est rangé AVEC la note · le relire ici évite de perdre
  // le constat en rouvrant une publicité déjà analysée, et d'avoir à repayer une
  // analyse pour retrouver ce qu'on savait déjà.
  if (r.jarvisScore && !opts?.force) return { score: r.jarvisScore, copie: r.copieConforme ?? null, cost: 0, cached: true };

  const unlimited = unlimitedCredits(s.user.email);
  const cost = costFor('score');
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Jarvis · analyse de créa'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }

  const [da] = await db.select({
    tone: schema.brands.tone, usp: schema.brands.usp, audience: schema.brands.audience, category: schema.brands.category,
    creativeRules: schema.brands.creativeRules, jarvisLearnings: schema.brands.jarvisLearnings,
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);

  // La note s'appuie sur ce que la marque a mesuré, pas seulement sur son ton :
  // sans ça, Jarvis évalue une créa à l'aune de règles générales de copywriting.
  const mesureScore = await jarvisFullMemory(brand.id, s.workspaceId);

  try {
    // La publicité COMPOSÉE, pas ses textes.
    //
    // La note jugeait « la capacité à stopper le scroll » en ne lisant que la
    // copie · une note de copywriting vendue comme une note de créa. Elle voit
    // maintenant ce qu'un pouce voit, et peut donc signaler ce que rien ne
    // signalait : du texte cuit dans l'image malgré la consigne, un produit
    // déformé, une main anormale.
    //
    // Le rendu est demandé en petit · la vision n'a pas besoin de 1080 px, et
    // chaque pixel envoyé est facturé. Un échec de composition ne fait pas
    // échouer la note, il la ramène à ce qu'elle savait faire avant.
    let image: { mediaType: 'image/png'; base64: string } | undefined;
    try {
      const png = await renderAdPng({ ...r, width: 512, height: 640 } as AdRecipe);
      image = { mediaType: 'image/png', base64: Buffer.from(png).toString('base64') };
    } catch (e) {
      logFailure('ads:score:render', e, s.workspaceId);
    }

    const score = await scoreCreative(client, {
      brand: brand.name, tone: da?.tone ?? undefined, usp: da?.usp ?? undefined, audience: da?.audience ?? undefined,
      category: da?.category ?? undefined, objective: r.objective, creativeRules: da?.creativeRules ?? undefined,
      winningPatterns: [mesureScore, da?.jarvisLearnings].filter(Boolean).join('\n\n') || undefined,
    }, { template: r.template, kicker: r.kicker, headline: r.headline ?? '', subhead: r.subhead, cta: r.cta, badge: r.badge, image, texteDansImage: texteAttenduDansImage(r.mode) });
    if (!score) {
      if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · analyse de créa');
      return { error: "Score indisponible, réessaie." };
    }
    // La note ne contredit pas ce qui est écrit juste en dessous · laisser
    // passer 68 sur 100 avec une fausse accroche cuite dans l'image, c'est
    // publier la note et enterrer le constat.
    const vd = verdictDefauts(score.defauts);
    // A-t-elle écrit NOS mots ?
    //
    // En mode « entière », c'est le modèle d'images qui pose la typographie ·
    // il lui arrive d'inventer une accroche, de traduire, ou de perdre les
    // accents. On lui a demandé de RECOPIER ce qu'il voit ; la comparaison,
    // elle, se fait ici, en code déterministe. Un avis de modèle ne se compte
    // pas · un écart mesuré, si.
    //
    // Aucun appel de plus · c'est la même note, quelques jetons de sortie en
    // sus. Un second appel de vision aurait doublé le coût d'une analyse pour
    // une question que celle-là pouvait déjà porter.
    const copie = texteAttenduDansImage(r.mode)
      ? verifieCopie(chainesImposees({
          kicker: r.kicker, headline: r.headline, subhead: r.subhead,
          benefits: r.benefits, cta: r.cta, badge: r.badge,
        }), score.texteLu)
      : null;
    // Une accroche réécrite plafonne la note au même titre qu'un raté de
    // fabrication · publier 72 sur 100 sous une publicité qui ne dit plus ce
    // qu'on voulait, c'est afficher la note et enterrer le constat.
    const note: CreativeScore = {
      ...score, defauts: vd.defauts,
      score: plafonner(score.score, vd.grave || !!copie?.grave),
    };
    // Mémorise le score (affichage direct sur la carte, pas de re-débit).
    // Fusion côté SQL : l'analyse dure plusieurs secondes, une note ou une édition de
    // texte faite pendant ce temps ne doit pas être écrasée par un instantané périmé.
    try {
      await db.update(schema.generations)
        .set({ input: sql`coalesce(${schema.generations.input}, '{}'::jsonb) || ${JSON.stringify({ jarvisScore: note, ...(copie ? { copieConforme: copie } : {}) })}::jsonb` })
        .where(eq(schema.generations.id, id));
    } catch { /* best-effort */ }
    return { score: note, copie, cost: unlimited ? 0 : cost };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · analyse de créa');
    return { error: logAndTranslate('ads:score', e, { subject: 'l’analyse de la créa', workspaceId: s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Décliner une publicité                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Une déclinaison : UNE chose change, tout le reste est tenu.
 *
 * ── Ce qu'on ne pouvait pas faire ────────────────────────────────────────────
 *
 * Une publicité plaît à moitié · son accroche porte, sa composition l'enterre.
 * La seule manœuvre offerte était de relancer un lot entier et de repayer
 * quatre images, dont trois qu'on n'avait pas demandées.
 *
 * Et le nouveau lot changeait TOUT à la fois · quand la mesure arrivait, plus
 * personne ne savait à quoi attribuer l'écart. On payait pour apprendre, et on
 * n'apprenait rien.
 *
 * ── Pourquoi c'est presque gratuit ───────────────────────────────────────────
 *
 * La scène est déjà payée et elle reste. Changer la mise en page ne coûte donc
 * **rien du tout** · la composition est un calcul. Réécrire l'accroche ou
 * l'offre coûte une courte demande au modèle, pas une image.
 *
 * ── Le contrôle qui compte ───────────────────────────────────────────────────
 *
 * `verifieDeclinaison` refuse ce qui n'a rien changé (un modèle rend parfois la
 * même phrase à la ponctuation près) ET ce qui a changé deux choses. Le second
 * cas est le plus insidieux : il a l'air d'un progrès et ne prouve rien.
 *
 * Le contrôle passe AVANT la facturation · on ne fait pas payer un doublon.
 */
export async function declineAdAction(input: { id: string; variable: string; model?: string }): Promise<{ ad?: AdItem; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };

  const variable = (STUDIO_VARIABLES as readonly string[]).includes(input.variable)
    ? input.variable as StudioVariable
    : null;
  if (!variable) return { error: 'Cette déclinaison n’existe pas.' };

  const [g] = await db.select({ input: schema.generations.input, creditsCost: schema.generations.creditsCost })
    .from(schema.generations)
    .where(and(eq(schema.generations.id, input.id), eq(schema.generations.brandId, brand.id), eq(schema.generations.kind, 'ad')))
    .limit(1);
  if (!g) return { error: GUARD.notFound('cette publicité') };

  const parent = (g.input ?? {}) as AdRecipe;
  if (!parent.sceneUrl || !parent.headline) return { error: 'Cette publicité n’a pas de quoi être déclinée.' };
  // La coquille du parent se LIT, elle ne se recalcule pas · elle a déjà été
  // arbitrée à la génération, par la seule expression qui a le droit de le
  // faire. La recalculer ici serait une seconde source de vérité, et un garde
  // le refuse à juste titre.
  const layoutParent = (parent.layout ?? 'immersif') as AdLayout;

  // Ce que CETTE publicité-là permet · une scène ne se redécline pas sans le
  // brief qui l'a produite.
  const brief = parent.sceneBrief?.trim() || '';
  const bloque = empechement(variable, !!brief);
  if (bloque) return { error: bloque };

  const modelSpec = imageModelByKey(input.model);
  const unlimited = unlimitedCredits(s.user.email);
  // Zéro pour une recomposition, le prix d'un texte court pour une réécriture,
  // le prix du moteur pour une nouvelle image · une seule règle décide.
  const cost = prixDeclinaison(variable, modelSpec.credits, costFor('suggest'));
  if (cost > 0 && !unlimited && !(await reserveCredits(s.workspaceId, cost, `Studio · décliner ${STUDIO_LABEL[variable].toLowerCase()}`))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }
  const rendre = async () => { if (cost > 0 && !unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · déclinaison'); };

  // Ce qui change, selon la variable. Tout le reste est recopié tel quel · c'est
  // la recopie qui fait le contrat, pas la consigne donnée au modèle.
  let patch: Partial<AdRecipe> = {};
  if (variable === 'mise_en_page') {
    const suivante = miseSuivante(layoutParent, parent.headline, layoutsFor(parent.template) as AdLayout[]);
    if (!suivante) {
      await rendre();
      return { error: 'Aucune autre mise en page ne tient cette accroche. Raccourcis-la d’abord, ou décline l’accroche.' };
    }
    patch = { layout: suivante };
  } else if (variable === 'accroche' || variable === 'offre') {
    const client = guardedAnthropic({ action: 'ads' });
    if (!client) { await rendre(); return { error: GUARD.aiOff() }; }
    const { da, product, persona } = await loadAdContext(brand.id, parent.productId, parent.personaId);
    try {
      const copie = await rewriteAdCopy(client, {
        brand: brand.name, tone: da?.tone ?? undefined, colors: da?.colors ?? undefined, usp: da?.usp ?? undefined,
        audience: da?.audience ?? undefined, category: da?.category ?? undefined,
        productName: product?.name, productDesc: product?.description ?? undefined, productUsp: product?.usp ?? undefined,
        persona: persona ? { name: persona.name, pains: persona.pains ?? undefined, desires: persona.desires ?? undefined } : undefined,
        objective: parent.objective, creativeRules: da?.creativeRules ?? undefined,
      }, {
        headline: parent.headline, subhead: parent.subhead, kicker: parent.kicker,
        cta: parent.cta, badge: parent.badge, sceneBrief: parent.sceneBrief,
      }, variable);
      if (!copie) { await rendre(); return { error: 'La réécriture n’a rien rendu. Réessaie.' }; }
      patch = copie;
    } catch (e) {
      await rendre();
      return { error: logAndTranslate('ads:decline', e, { subject: 'la déclinaison', workspaceId: s.workspaceId }) };
    }
  } else if (variable === 'scene' || variable === 'univers') {
    // Une AUTRE image du MÊME concept · c'est le brief d'origine qui le
    // garantit. Sans lui on obtiendrait une autre scène d'un autre concept,
    // c'est-à-dire une créa de plus et pas une déclinaison.
    const cfg = falFromEnv();
    if (!cfg) { await rendre(); return { error: "La génération d'image n'est pas activée (clé Fal manquante)." }; }

    let universCible = parent.universe ?? null;
    if (variable === 'univers') {
      universCible = universSuivant(parent.universe, VISUAL_UNIVERSES.map((u) => u.key));
      if (!universCible) { await rendre(); return { error: 'Aucune autre ambiance à essayer.' }; }
    }
    const uni = VISUAL_UNIVERSES.find((u) => u.key === universCible)?.prompt;

    // Le produit et la bibliothèque comme références · la déclinaison doit
    // ressembler à la marque autant que l'originale, sinon elle change deux
    // choses au lieu d'une.
    const { product } = await loadAdContext(brand.id, parent.productId);
    const produits = product ? (product.imageUrls?.length ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : null)) : null;
    const refs = produits?.length ? produits : await listBrandAssetImageUrls(s.workspaceId, brand.id, 4);
    const avecRef = !!refs.length;

    const faux: AdConcept = {
      template: parent.template, headline: parent.headline, cta: parent.cta, sceneBrief: brief,
    };
    try {
      const { images } = await sousPlafond('fal_image', { action: 'ads:decline', workspaceId: s.workspaceId, units: 1 }, () => falGenerateImage(cfg, {
        prompt: scenePrompt(faux, avecRef, uni, layoutParent),
        aspectRatio: '4:5', imageUrls: avecRef ? refs.slice(0, 8) : undefined, edit: avecRef, count: 1,
        model: falModelFor(modelSpec, avecRef), params: modelSpec.params,
        timeoutMs: imageTimeoutMs(modelSpec),
      }));
      const url = images[0];
      if (!url) { await rendre(); return { error: 'Aucune scène n’est sortie. Réessaie dans une minute.' }; }
      patch = { sceneUrl: url, universe: universCible, light: await mesurerScene(url) };
    } catch (e) {
      await rendre();
      const base = logAndTranslate('ads:decline:scene', e, { subject: 'la nouvelle scène', workspaceId: s.workspaceId });
      return { error: delaiDepasse(e) ? `${base} ${conseilDelai(modelSpec)}` : base };
    }
  } else {
    // Exhaustif · une sixième variable ajoutée sans branche ne compilerait pas,
    // au lieu de tomber en silence dans un `else` qui ne la traite pas.
    const jamais: never = variable;
    await rendre();
    return { error: `Cette déclinaison n’est pas traitée : ${String(jamais)}.` };
  }

  const enfant: AdRecipe = {
    ...parent,
    ...patch,
    layout: patch.layout ?? layoutParent,
    // La mesure suit la scène · garder celle du parent sur une nouvelle image
    // taillerait le voile pour une photo qui n'est plus là.
    light: patch.light !== undefined ? patch.light : parent.light ?? null,
    // La filiation · sans elle, une déclinaison est une créa de plus dans la
    // grille, et l'écart qu'elle mesure n'est rattaché à rien.
    parentId: input.id,
    variable,
    // Le score du parent ne vaut pas pour l'enfant · le garder afficherait une
    // note qui n'a pas été calculée sur ce qu'on regarde.
    jarvisScore: undefined,
    rating: undefined,
  } as AdRecipe;

  const vue = (r: AdRecipe): DeclinaisonSnapshot => ({
    headline: r.headline, cta: r.cta, subhead: r.subhead ?? null, kicker: r.kicker ?? null,
    badge: r.badge ?? null, sceneUrl: r.sceneUrl, layout: (r.layout ?? 'immersif') as AdLayout,
    universe: r.universe ?? null,
  });
  const verdict = verifieDeclinaison(vue(parent), vue(enfant), variable);
  if (!verdict.ok) {
    // On rembourse AVANT de répondre · le travail a eu lieu, mais il n'a rien
    // produit qu'on puisse comparer, et le facturer serait vendre un doublon.
    await rendre();
    return { error: verdict.probleme };
  }

  try {
    const [row] = await db.insert(schema.generations).values({
      brandId: brand.id, kind: 'ad', input: enfant as unknown as Record<string, unknown>,
      status: 'completed', assetUrls: [enfant.sceneUrl], creditsCost: unlimited ? 0 : cost,
    }).returning({ id: schema.generations.id, createdAt: schema.generations.createdAt });
    if (!row) { await rendre(); return { error: 'La déclinaison n’a pas pu être enregistrée.' }; }
    return { ad: { id: row.id, template: enfant.template, headline: enfant.headline, url: adUrl(row.id, enfant), createdAt: (row.createdAt as Date).toISOString(), rationale: null, parentId: input.id, variable, sceneBrief: !!enfant.sceneBrief?.trim() } };
  } catch (e) {
    await rendre();
    return { error: logAndTranslate('ads:decline:save', e, { subject: 'l’enregistrement de la déclinaison', workspaceId: s.workspaceId }) };
  }
}
