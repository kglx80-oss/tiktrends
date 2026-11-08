'use client';

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  GAIN_MUSIQUE_MAX_DB, GAIN_MUSIQUE_MIN_DB, LIBELLES_MODE_PAROLE, MESSAGE_REPONSE_PERDUE_MONTAGE, MODES_PAROLE, RELECTURE_CREATIONS_MS,
  appliquerOperationVideo as appliquerNoyau, classeFormat, decisionConfirmationApercu, dureeLisible, ECHEC_RESEAU_STUDIO, etatEchecStudio, etatPlan, ecritureVideoReconnue, gesteVideoReessayable, formatDuDocument, gestesPlan, idsPlansAlloues,
  impactVideo, infoOrnementVideo, legendeFormat, libelleAnimationIndisponible, libelleCredits, libellePrix, mentionAppelTexte,
  largeurMinFrise, messageHorsLigneStudio, minuteSeconde, pistesMontage, styleTableDefilante, relectureNecessaire, saisieVierge, sourceLecteur,
  type BilanDurees, type CleGestePlan, type ErreurStudio, type EtatJob, type ImpactVideo, type ModeParole, type OperationVideo, type PlanStudio, type SaisiePlan,
} from '@tiktrends/core';
import type { VueVideo as DonneesVideo } from '../../../lib/studios/video/lecture';
import {
  appliquerOperationVideo, approuverEtLancerClip, approuverEtLancerKeyframe, assemblerVideoFinale, compilerConsignePlan,
  demanderDevisClip, demanderDevisKeyframe, planifierStoryboard, retenirConsignePlan,
} from '../../../app/actions/studios/video';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../lib/studios/appel-payant';
import { cleRetour, useFocusApresGeste } from '../../../lib/studios/focus-geste';
import { useRegime, useSpatial } from '../../coquille/contexte';
import { EnTete, Ic, Lien, Vue, useTelephone } from '../../communs';
import { Ornement } from '../studios/Ornement';
import { boutonAction, replacerFocus } from './action-serveur';
import { Message } from './briques';
import { AnnonceLogos } from './LogosAReimporter';

/**
 * Le studio vidéo d'un projet · `docs/spatial/reference/video.html`, balisage
 * à l'identique (lecteur, plans, gestes, montage).
 *
 * La maquette simule des variantes A/B/C qui « se rendent » toutes seules et
 * six leviers à prix fixe. Ici tout est la chaîne vidéo RÉELLE, reprise de
 * l'écran V5 (`EcranVideo`, retiré ; ses gardes vivent dans
 * `spatial-video-atelier.test.tsx`) :
 *  · le lecteur · la dernière vidéo finale assemblée, sinon l'image clé du
 *    plan choisi ;
 *  · « Plans » · chaque plan du storyboard et son état réel (en file, en
 *    cours, échec, image clé prête, animé), relu toutes les 4 s tant qu'un
 *    job travaille ;
 *  · « Produire le plan » · les six gestes du plan (consigne, retenue, devis,
 *    lancement de l'image clé, devis et lancement du clip), prix annoncé AVANT
 *    le clic, un second clic de confirmation pour tout ce qui coûte ;
 *  · « Montage » · les pistes réelles (plans, texte écran, voix, musique) ;
 *    « Modifier le script » ouvre l'édition, chaque changement montre son
 *    impact (noyau) avant d'être enregistré ;
 *  · storyboard (appel texte payant, ou saisie manuelle gratuite), vidéo
 *    finale (calcul serveur, 0 crédit), générations ;
 *  · la fiche du plan choisi · chaque champ dans sa case, son clip animé ;
 *  · le focus suit le geste (aperçu, message), Échap referme l'aperçu ; un
 *    refus dit son MOT (conflit, hors ligne) et le geste suivant
 *    (« Recharger la version courante », « Réessayer » s'il ne coûte rien) ;
 *  · passe design (comme l'Export #1024 et l'Éditeur #1027) · le bouton
 *    pressé GARDE le focus pendant son action serveur (`aria-disabled` +
 *    `aria-busy`, jamais `disabled`, second clic ignoré) ; un contrôle qui
 *    disparaît rend le focus à ce qui le remplace ; un contrôle fermé dit
 *    pourquoi en toutes lettres à côté de lui, jamais dans un `title` ; chaque
 *    tuile est une région nommée par son titre.
 * Rien n'est lancé sans le geste explicite de la personne.
 */

interface Apercu { operation: OperationVideo; version: { id: string; n: number }; libelle: string; impact: ImpactVideo | null; durees: BilanDurees | null; signalements: string[]; refus: string | null }
/** `code` · le mot du refus (`etatEchecStudio`) ; `reessayable` · « Réessayer » rejoue le même geste sans rien dépenser. */
type Retour = { ton: 'ok' | 'err'; texte: string; code?: string; reessayable?: boolean } | null;

function apercuDuGeste(vue: DonneesVideo, operation: OperationVideo): Apercu {
  const r = appliquerNoyau(vue.contenu, operation, { sortiesExistantes: vue.mediasValides });
  if (!r.ok) {
    const detail = r.violations.map((v) => v.raison).join(' · ');
    return { operation, version: vue.version, libelle: 'changement refusé', impact: null, durees: null, signalements: [], refus: detail ? `${r.message} ${detail}` : r.message };
  }
  return { operation, version: vue.version, libelle: r.libelle, impact: impactVideo(vue.contenu, r.contenu, { mediasExistants: vue.mediasValides }), durees: r.durees, signalements: r.signalements, refus: null };
}

/** Même clé que l'écran V5 · un double clic, une reconnexion ou un changement d'interface retrouvent le même job. */
function cleDuClic(quoteId: string): string {
  const k = `tt-studio-video-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `vid-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch { return `vid-${quoteId}`; }
}

/** Le nom de l'action serveur d'un geste du plan (`agir`) · le bouton qui l'a lancée se reconnaît pendant l'envoi. */
const actionDuGeste = (cle: CleGestePlan, sid: string) => `${cle === 'consigne' ? 'compiler' : cle}:${sid}`;

/**
 * Le focus ne tombe jamais sur `<body>` quand son contrôle disparaît (UX-02) ·
 * ici en mode `si-perdu` (brique `replacerFocus`) · s'il est PERDU (rien ne
 * l'a repris, ni l'aperçu ni le message de `useFocusApresGeste`), le premier
 * sélecteur présent et ouvert le prend. L'Éditeur, lui, focalise toujours.
 */

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const messageErreur = (r: ErreurStudio) => `${r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`;

export interface PropsVideo {
  vue: DonneesVideo;
  marque: string;
  variantesHref: string;
  /** Recette · plan choisi au premier rendu. */
  planInitial?: string | null;
}

export function Video({ vue: v, marque, variantesHref, planInitial }: PropsVideo) {
  const router = useRouter();
  const { toast } = useSpatial();
  const regime = useRegime();
  const appelStoryboard = useAppelPayant(v.projet.id, 'storyboard');
  const appelConsigne = useAppelPayant(v.projet.id, 'compilation-video');
  const ordre = v.contenu.shots.order.filter((s) => v.contenu.shots.byId[s] && s !== 's_image');
  const [plan, setPlan] = useState<string | null>(planInitial ?? ordre[0] ?? null);
  const [geste, setGeste] = useState<CleGestePlan | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [storyboard, setStoryboard] = useState<{ plans: PlanStudio[]; totalMs: number; avertissements: string[] } | null>(null);
  const [scriptOuvert, setScriptOuvert] = useState(false);
  const [lecture, setLecture] = useState<'arret' | 'lecture' | 'pause'>('arret');
  const lecteur = useRef<HTMLVideoElement>(null);
  const telephone = useTelephone();
  // Le focus suit le geste (règle `cibleFocusApresGeste`) · l'aperçu qui s'ouvre, le message de retour,
  // puis, l'aperçu refermé sans rien, le bouton du geste qui l'avait ouvert.
  const ecran = useRef<HTMLDivElement>(null);
  const apercuRef = useRef<HTMLElement>(null);
  const retourRef = useRef<HTMLDivElement>(null);
  const dernierGeste = useRef<(() => void) | null>(null);
  const idsTitres = useId();
  const titres = { plans: `${idsTitres}-plans`, produire: `${idsTitres}-produire`, montage: `${idsTitres}-montage`, storyboard: `${idsTitres}-storyboard`, finale: `${idsTitres}-finale`, jobs: `${idsTitres}-jobs`, geste: `${idsTitres}-geste`, mp4: `${idsTitres}-mp4` };

  const recharger = useCallback(() => router.refresh(), [router]);
  useEffect(() => {
    if (!relectureNecessaire(v.jobs.map((j) => j.etat as EtatJob))) return;
    const t = setTimeout(recharger, RELECTURE_CREATIONS_MS);
    return () => clearTimeout(t);
  }, [v, recharger]);
  useEffect(() => { if (plan && !v.contenu.shots.byId[plan]) setPlan(ordre[0] ?? null); }, [v, plan, ordre]);

  const disponibilite = useMemo(() => ({
    ...v.disponibilite,
    storyboard: appelStoryboard.bloque ? { disponible: false, raison: MESSAGE_APPEL_PAYANT } : v.disponibilite.storyboard,
    consigne: appelConsigne.bloque ? { disponible: false, raison: MESSAGE_APPEL_PAYANT } : v.disponibilite.consigne,
  }), [v.disponibilite, appelStoryboard.bloque, appelConsigne.bloque]);
  const coutTexte = mentionAppelTexte(regime, v.coutTexteUsd);

  async function agir(nom: string, f: () => Promise<{ ok: true } | ErreurStudio>, succes: (r: { ok: true }) => string, apres?: () => void) {
    const payant = nom === 'storyboard' ? appelStoryboard : nom.startsWith('compiler:') ? appelConsigne : null;
    const tentative = payant?.commencer();
    if (payant && !tentative) return;
    setEnCours(nom); setRetour(null);
    const reessayable = gesteVideoReessayable(nom);
    dernierGeste.current = reessayable ? () => { void agir(nom, f, succes, apres); } : null;
    try {
      const r = await f();
      if (payant && tentative) payant.terminer(tentative, resultatPayantIncertain(r));
      if (r.ok) { const t = succes(r); setRetour({ ton: 'ok', texte: t }); toast(t); apres?.(); recharger(); }
      else setRetour({ ton: 'err', texte: messageErreur(r), code: r.code, reessayable });
    } catch {
      if (payant && tentative) payant.terminer(tentative, true);
      setRetour({ ton: 'err', code: ECHEC_RESEAU_STUDIO, reessayable, texte: payant ? MESSAGE_APPEL_PAYANT : ecritureVideoReconnue(nom) ? MESSAGE_REPONSE_PERDUE_MONTAGE : messageHorsLigneStudio('enregistrement') });
    } finally { setEnCours(null); }
  }

  const prevoir = (op: OperationVideo) => { setRetour(null); setApercu(apercuDuGeste(v, op)); };
  // L'aperçu se confirme sur SA version (version attendue) · jamais sur celle
  // que la vue a relue entre-temps (relecture des jobs, autre geste).
  const confirmation = apercu ? decisionConfirmationApercu(apercu.version, v.version) : null;
  useFocusApresGeste({ apercu: !!apercu, retour: cleRetour(retour), formulaire: false }, { conteneur: ecran, apercu: apercuRef, retour: retourRef });
  const echec = retour?.ton === 'err' && retour.code ? etatEchecStudio(retour.code) : null;
  const rechargerVersion = () => { setRetour(null); setApercu(null); recharger(); };
  const confirmer = () => {
    const a = apercu;
    if (!a || enCours) return;
    const d = decisionConfirmationApercu(a.version, v.version);
    if (!d.ok) { setRetour({ ton: 'err', texte: d.message, code: 'VERSION_CONFLICT' }); return; }
    void agir('confirmer', () => appliquerOperationVideo({ projectId: v.projet.id, baseVersionId: a.version.id, operation: a.operation }), (r) => {
      const x = r as { deja?: boolean; impact?: { resume: string }; durees?: { phrase: string } };
      if (x.deja) return `${a.libelle} · déjà enregistré, ta première demande avait abouti · rien n’a été écrit deux fois.`;
      return `${a.libelle} · nouvelle version. ${x.impact?.resume ?? ''} ${x.durees?.phrase ?? ''}`.trim();
    }, () => { setApercu(null); if (a.operation.type === 'scenario') setStoryboard(null); });
  };

  /* ── Le plan choisi ─────────────────────────────────────────────────────── */
  const rang = plan ? ordre.indexOf(plan) + 1 : 0;
  const k = plan ? v.keyframes[plan] ?? { etat: 'a_produire' as const, media: null, retenue: null, enAttente: null, devis: null } : null;
  const c = plan ? v.clips[plan] ?? { etat: 'a_produire' as const, media: null, keyframePrete: false, devis: null } : null;
  const gestes = k && c ? gestesPlan({
    disponibilite: { consigne: disponibilite.consigne, montage: disponibilite.montage, devis: disponibilite.devis, lancement: disponibilite.lancement, animation: disponibilite.animation },
    keyframe: { etat: k.etat, consigneEnAttente: !!k.enAttente, consigneRetenue: k.retenue ? { ok: k.retenue.verdict.ok, motif: k.retenue.verdict.ok ? '' : k.retenue.verdict.motif } : null, devisCredits: k.devis?.credits ?? null },
    clip: { keyframePrete: c.keyframePrete, devisCredits: c.devis?.credits ?? null },
    prixImageCredits: v.prix.credits, prixClip: { credits: v.prixClip.credits, dureeS: v.prixClip.dureeS }, coutTexte: mentionAppelTexte(regime, v.coutTexteUsd),
  }) : [];
  const gesteChoisi = gestes.find((g) => g.cle === geste) ?? null;
  // Pendant l'envoi, seul le bouton qui l'a lancé dit « En cours… » ; il reste focalisable.
  const gestePresse = !!gesteChoisi && !!plan && enCours === actionDuGeste(gesteChoisi.cle, plan);
  // Les leviers fermés disent pourquoi, en toutes lettres SOUS la grille (dans le levier, l'opacité de
  // `.vlev:disabled` ramène le texte à 2,8:1 en sombre et 2,0:1 en clair) · une raison partagée n'est dite qu'une fois.
  const raisonsFermees: Array<{ raison: string; cles: CleGestePlan[]; titres: string[] }> = [];
  for (const g of gestes) {
    if (g.actif || !g.raison) continue;
    const r = raisonsFermees.find((x) => x.raison === g.raison);
    if (r) { r.cles.push(g.cle); r.titres.push(g.titre); } else raisonsFermees.push({ raison: g.raison, cles: [g.cle], titres: [g.titre] });
  }
  const idRaison = (cle: CleGestePlan) => { const i = raisonsFermees.findIndex((r) => r.cles.includes(cle)); return i < 0 ? undefined : `${idsTitres}-raison-${i}`; };

  const lancerGeste = (cle: CleGestePlan) => {
    if (!plan || !k || !c) return;
    const sid = plan;
    if (cle === 'consigne') void agir(`compiler:${sid}`, async () => {
      const r = await compilerConsignePlan({ projectId: v.projet.id, shotId: sid });
      if (r.ok && 'statut' in r && r.statut === 'questions') { setQuestions(r.questions); return { ok: true as const }; }
      return r;
    }, () => 'Consigne compilée et validée par le serveur · relis-la puis retiens-la.', () => setGeste('retenir'));
    else if (cle === 'retenir' && k.enAttente) {
      // La consigne en attente est celle compilée sur la version affichée (`consignesCompileesSur`) ·
      // la base est figée au clic, « Réessayer » la renvoie telle quelle (version attendue).
      const base = v.version.id;
      const runId = k.enAttente.runId;
      void agir(`retenir:${sid}`, () => retenirConsignePlan({ projectId: v.projet.id, baseVersionId: base, runId }), (r) => (r as { deja?: boolean }).deja
        ? 'Consigne déjà retenue · ta première demande avait abouti, rien n’a été écrit deux fois.'
        : 'Consigne retenue · nouvelle version, seule l’image clé de ce plan est concernée.', () => setGeste('devis'));
    }
    else if (cle === 'devis') void agir(`devis:${sid}`, () => demanderDevisKeyframe({ projectId: v.projet.id, shotId: sid }), () => 'Devis prêt · relis le prix avant d’approuver.', () => setGeste('lancer'));
    else if (cle === 'lancer' && k.devis) { const d = k.devis; void agir(`lancer:${sid}`, () => approuverEtLancerKeyframe({ quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.credits, idempotencyKey: cleDuClic(d.id) }), () => 'Lancé · le job est en file, tu peux fermer la page.', () => setGeste(null)); }
    else if (cle === 'devis-clip') void agir(`devis-clip:${sid}`, () => demanderDevisClip({ projectId: v.projet.id, shotId: sid }), () => 'Devis du clip prêt · relis le prix avant d’approuver.', () => setGeste('lancer-clip'));
    else if (cle === 'lancer-clip' && c.devis) { const d = c.devis; void agir(`lancer-clip:${sid}`, () => approuverEtLancerClip({ quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.credits, idempotencyKey: cleDuClic(d.id) }), () => 'Animation lancée · le clip est en file, tu peux fermer la page.', () => setGeste(null)); }
  };

  /* ── Lecteur ────────────────────────────────────────────────────────────── */
  const finale = v.videoFinale.derniere;
  const source = sourceLecteur({ finale, imagesCles: plan ? [k?.media ?? null, ...ordre.map((s) => v.keyframes[s]?.media ?? null)] : ordre.map((s) => v.keyframes[s]?.media ?? null) });
  const format = formatDuDocument({ width: v.format.largeur, height: v.format.hauteur });
  const premierTexte = ordre.length ? (v.sansTexte ? '' : v.contenu.shots.byId[ordre[0]!]?.onScreenText.join(' · ') ?? '') : '';
  const pistes = pistesMontage({
    segments: v.segments, plans: v.contenu.shots.byId, totalMs: v.dureeTotaleMs, sansTexte: v.sansTexte,
    nomVoix: ordre.some((s) => v.contenu.shots.byId[s]!.speechMode !== 'none') ? LIBELLES_MODE_PAROLE[v.contenu.shots.byId[ordre.find((s) => v.contenu.shots.byId[s]!.speechMode !== 'none')!]!.speechMode] : null,
    nomMusique: v.contenu.timeline?.music ? (v.musiques.find((m) => m.assetId === v.contenu.timeline!.music!.assetId)?.libelle ?? 'piste importée') : null,
  });
  const dureeLecture = (finale?.dureeMs ?? v.dureeTotaleMs) / 1000;
  const basculerLecture = () => {
    const el = lecteur.current;
    if (!el) return;
    if (el.paused) { void el.play().then(() => setLecture('lecture')).catch(() => setRetour({ ton: 'err', texte: 'Le navigateur a refusé la lecture · utilise le téléchargement MP4.' })); }
    else { el.pause(); setLecture('pause'); }
  };
  const progression: CSSProperties = { ['--d' as string]: `${Math.max(1, Math.round(dureeLecture))}s`, ...(lecture === 'pause' ? { animationPlayState: 'paused' } : {}) };
  const etatLecteur = plan ? etatPlan({ shotId: plan, keyframe: k!.etat, clip: c!.etat, jobs: v.jobs.map((j) => ({ operation: j.operation, etat: j.etat as EtatJob })) }) : null;

  // Les boutons de l'aperçu · sous le lecteur (maquette). Au téléphone, le lecteur 9:16 remplit le premier écran
  // et ses boutons tombaient sous les deux barres flottantes (ornement + navigation, ~150 px) · ils passent
  // AU-DESSUS du lecteur, visibles dès l'arrivée (planche v4 · G2).
  // Planche finale · G2 · la barre flottante (`#orn`) restait posée sur la barre de navigation mobile, 6 px
  // au-dessus, et masquait le bas de l'écran · ses deux gestes (« Projet », « Tester les variantes ») sont
  // alors DÉJÀ ici, au-dessus du lecteur ; son compte de plans est masqué au téléphone par la maquette. Au
  // téléphone, la barre flottante n'est donc plus montée · « Projet » rejoint les boutons de l'aperçu.
  // MP4 fermé · la raison est écrite sous les boutons (le `title` ne se lit ni au doigt ni au clavier).
  const actionsApercu = (
    <>
      <div className="kc" data-actions-apercu={telephone ? 'haut' : 'bas'}>
        {telephone && <Lien className="btn sm" href={`/studio/projets/${v.projet.id}`}><Ic n="back" />Projet</Lien>}
        {finale
          ? <a className="btn sm" href={finale.url} download><Ic n="down" />MP4</a>
          : <button className="btn sm" type="button" disabled aria-describedby={titres.mp4}><Ic n="down" />MP4</button>}
        <Lien className="btn sm pri" href={variantesHref}><Ic n="flask" />Tester les variantes</Lien>
      </div>
      {!finale && <small className="faint" id={titres.mp4} data-raison-ferme="mp4" style={{ fontSize: '11.5px' }}>MP4 · aucune vidéo finale assemblée{v.videoFinale.possible ? ' · assemble-la plus bas, 0 crédit.' : '.'}</small>}
    </>
  );

  return (
    <Vue>
      <div ref={ecran}>
      <EnTete titre={v.projet.titre || 'Projet vidéo'} sous={`Studios${marque ? ` · ${marque}` : ''} · vidéo ${Math.round(v.dureeTotaleMs / 1000)} s`} />
      {(appelStoryboard.bloque || appelConsigne.bloque) && <div className="banner" role="status"><span className="orb" aria-hidden="true" style={{ width: 32, height: 32, fontSize: '12.5px' }}>J</span><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${v.projet.id}#taches`}>Voir le suivi</Lien></span></div>}
      <div className="vstudio">
        <div style={{ display: 'grid', gap: 10 }}>
          {telephone && actionsApercu}
          <div className="vplayer">
            <div className={`ad ${classeFormat(format)}`} style={format ? undefined : { aspectRatio: `${v.format.largeur} / ${v.format.hauteur}` }}>
              <div className="ph">
                {source?.type === 'video'
                  ? <video ref={lecteur} src={source.src} playsInline preload="metadata" aria-label="Dernière vidéo finale assemblée" onEnded={() => setLecture('arret')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : source ? <img src={source.src} alt={`Image clé du plan ${rang || 1}`} /> : null}
              </div>
              <div className="band">{premierTexte}</div>
            </div>
            {source?.type === 'video'
              ? <button type="button" className="vpbtn" data-vplay="1" aria-label={lecture === 'lecture' ? 'Pause' : 'Lire'} onClick={basculerLecture}><span>{lecture === 'lecture' ? '❚❚' : <Ic n="arrow" s={false} />}</span></button>
              : <div className="vrend"><b>{etatLecteur?.actif ? etatLecteur.libelle : source ? 'Image clé' : 'À produire'}</b><small>{v.videoFinale.possible ? 'Assemble la vidéo finale pour la lire ici' : source ? 'Aucune vidéo finale assemblée' : 'Aucune image clé produite'}</small></div>}
          </div>
          <div className="vprog"><i className={lecture !== 'arret' ? 'on' : ''} style={progression} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="faint">
            <span>{finale ? `Vidéo finale · ${date(finale.creeLe)}` : `Version ${v.version.n} · ${ordre.length} plan${ordre.length > 1 ? 's' : ''}`}</span>
            <span>{legendeFormat(v.format, finale?.dureeMs ?? v.dureeTotaleMs)}</span>
          </div>
          {!telephone && actionsApercu}
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="tile" aria-labelledby={titres.plans} style={{ display: 'grid', gap: 10 }}>
            <div className="sech" style={{ margin: 0 }}><h2 id={titres.plans}>Plans</h2><span className="faint" style={{ fontSize: '12.5px' }}>Le storyboard, dans l’ordre du montage</span></div>
            {ordre.map((sid, i) => {
              const p = v.contenu.shots.byId[sid]!;
              const seg = v.segments.find((s) => s.shotId === sid);
              const e = etatPlan({ shotId: sid, keyframe: v.keyframes[sid]?.etat ?? 'a_produire', clip: v.clips[sid]?.etat ?? 'a_produire', jobs: v.jobs.map((j) => ({ operation: j.operation, etat: j.etat as EtatJob })) });
              return (
                <button key={sid} type="button" className="vvar" data-vsel={sid} aria-pressed={plan === sid} onClick={() => { setPlan(sid); setGeste(null); }}>
                  <span className="vvid">{i + 1}</span>
                  <span style={{ display: 'grid', gap: 1, minWidth: 0, flex: 1 }}>
                    <strong>{p.purpose || p.subject || `Plan ${i + 1}`}</strong>
                    <small className="faint">{dureeLisible(seg?.dureeMs ?? p.estimatedDurationMs)}{seg?.estimee === false ? ' réelles' : ' estimées'} · {p.subject || 'sujet à préciser'}</small>
                  </span>
                  <span className={`pill ${e.classe}`}>{e.libelle}</span>
                </button>
              );
            })}
            {ordre.length === 0 && <p className="muted" style={{ fontSize: '12.5px' }}>Aucun plan pour l’instant · propose un storyboard depuis le brief ou écris les plans à la main (« Modifier le script »).</p>}
          </section>

          <section className="tile" aria-labelledby={titres.produire} style={{ display: 'grid', gap: 12 }}>
            <div className="sech" style={{ margin: 0 }}><h2 id={titres.produire}>{plan ? `Produire le plan ${rang}` : 'Produire un plan'}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Une étape à la fois · prix annoncé avant le clic</span></div>
            {/* Un logo que l'image clé de ce plan utiliserait est à réimporter · dit AVANT « Compiler la consigne », rien n'est fermé. */}
            <AnnonceLogos a={k?.logosAReimporter} />
            {plan && (
              <div className="vlevs">
                {gestes.map((g) => (
                  <button key={g.cle} type="button" className="vlev" data-vlev={g.cle} aria-pressed={geste === g.cle} {...boutonAction({ occupe: !!enCours, ferme: !g.actif })} aria-describedby={g.actif ? undefined : idRaison(g.cle)} onClick={() => setGeste((x) => (x === g.cle ? null : g.cle))}>
                    <strong>{g.titre}</strong><small>{g.sous}</small><span className="pill">{g.prix}</span>
                  </button>
                ))}
              </div>
            )}
            {plan && raisonsFermees.length > 0 && (
              <ul data-raisons-fermees="" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {raisonsFermees.map((r, i) => <li key={r.raison} id={`${idsTitres}-raison-${i}`} className="faint" data-raison-ferme={r.cles.join(' ')} style={{ fontSize: '11.5px' }}>{r.titres.join(', ')} · {r.raison}</li>)}
              </ul>
            )}
            {gesteChoisi && k && c && (
              <div className="vopts" data-geste={gesteChoisi.cle} role="group" aria-labelledby={titres.geste}>
                <span className="lbl" id={titres.geste} style={{ margin: 0 }}>{gesteChoisi.titre} · plan {rang}</span>
                <DetailGeste cle={gesteChoisi.cle} k={k} c={c} vue={v} coutTexte={coutTexte} />
                <div className="kc">
                  {/* Jamais `disabled` · pressé, il GARDE le focus pendant l'envoi (sinon le clavier repartirait du haut de la page). */}
                  <button className="btn sm pri" type="button" data-action="geste"
                    {...boutonAction({ presse: gestePresse, occupe: !!enCours, ferme: !gesteChoisi.actif, focalisable: 'tout', surClic: () => lancerGeste(gesteChoisi.cle) })}>
                    {gestePresse ? 'En cours…' : libelleConfirmation(gesteChoisi.cle, k.devis?.credits ?? null, c.devis?.credits ?? null)}
                  </button>
                  <button className="btn sm" type="button" {...boutonAction({ occupe: !!enCours })} onClick={() => { const cle = gesteChoisi.cle; setGeste(null); replacerFocus('si-perdu', `[data-vlev="${cle}"]`); }}>Fermer</button>
                  {!gestePresse && !gesteChoisi.actif && gesteChoisi.raison && <small className="faint" data-raison-ferme="geste" style={{ fontSize: '11.5px', alignSelf: 'center' }}>{gesteChoisi.raison}</small>}
                </div>
              </div>
            )}
            {!disponibilite.animation.disponible && <small className="faint">Animation · {libelleAnimationIndisponible(disponibilite.animation)}. Aucun clip n’est proposé ni facturé.</small>}
            {questions.length > 0 && <Message ton="info">Le modèle demande des précisions · {questions.join(' · ')}</Message>}
            {retour && (
              <div ref={retourRef} tabIndex={-1} data-retour={retour.ton === 'ok' ? 'ok' : 'refus'} data-echec={echec ? retour.code : undefined}>
                <p role={retour.ton === 'ok' ? 'status' : 'alert'} className="muted" style={{ fontSize: '12.5px' }}><span className={`pill ${retour.ton === 'ok' ? 'g' : 'w'}`}>{retour.ton === 'ok' ? 'Fait' : echec?.mot ?? 'Refusé'}</span>{' · '}{retour.texte}</p>
                {/* Le message disparaît sous le doigt · le focus va au geste en cours (« Réessayer ») ou au levier du plan (« Recharger »). */}
                {echec?.action === 'recharger' && <button className="btn sm" type="button" data-bouton="recharger" {...boutonAction({ occupe: !!enCours })} onClick={() => { rechargerVersion(); replacerFocus('si-perdu', '[data-vlev][aria-pressed="true"]', '[data-vsel][aria-pressed="true"]', '[data-vedit]'); }} style={{ marginTop: 8 }}>{echec.libelleAction}</button>}
                {echec?.action === 'reessayer' && retour.reessayable && <button className="btn sm" type="button" data-bouton="reessayer" {...boutonAction({ occupe: !!enCours })} onClick={() => { dernierGeste.current?.(); replacerFocus('si-perdu', '[aria-busy="true"]', '[data-vsel][aria-pressed="true"]', '[data-vedit]'); }} style={{ marginTop: 8 }}>{echec.libelleAction}</button>}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="tile sec" aria-labelledby={titres.montage}>
        <div className="sech" style={{ margin: '0 0 10px' }}><h2 id={titres.montage}>Montage · version {v.version.n}</h2>
          <button className="btn sm" type="button" data-vedit="1" style={{ marginLeft: 'auto' }} aria-pressed={scriptOuvert} onClick={() => setScriptOuvert((o) => !o)}><Ic n="brush" />{scriptOuvert ? 'Fermer le script' : 'Modifier le script'}</button>
        </div>
        {/* La frise garde une largeur par scène (`largeurMinFrise`) et défile dans son cadre au téléphone · ses pistes
            (`minWidth: 0`) ne s'élargissent pas au texte entier de la voix (planche v4 · G3). */}
        <div className="vtl" data-frise="" style={styleTableDefilante(largeurMinFrise(pistes.scenes))}>
          <div className="vtr"><span>Scènes</span><div style={{ minWidth: 0 }}>{pistes.scenes.map((s) => <b key={s.shotId} style={{ flex: s.flex }}>{s.libelle}</b>)}</div></div>
          <div className="vtr"><span>Texte à l’écran</span><div style={{ minWidth: 0 }}>{pistes.textes.map((s) => <b key={s.shotId} className="t" style={{ flex: s.flex }}>{s.libelle}</b>)}</div></div>
          <div className="vtr"><span>{pistes.voix.titre}</span><div style={{ minWidth: 0 }}><b className="a" style={{ flex: 1 }}>{pistes.voix.texte}</b></div></div>
          <div className="vtr"><span>{pistes.musique.titre}</span><div style={{ minWidth: 0 }}><b className="m" style={{ flex: 1 }} /></div></div>
          <div className="vtr"><span /><div className="vticks" style={{ minWidth: 0 }}>{pistes.reperes.map((r, i) => <small key={i}>{r}</small>)}</div></div>
        </div>
      </section>

      {plan && c && <FichePlan rang={rang} p={v.contenu.shots.byId[plan]!} seg={v.segments.find((x) => x.shotId === plan) ?? null} c={c} />}

      {apercu && (
        // Échap équivaut à « Ne rien changer », qui reste le bouton visible.
        <section ref={apercuRef} tabIndex={-1} className="tile sec" data-zone="apercu-impact" aria-label="Impact du changement avant enregistrement · Échap pour ne rien changer"
          onKeyDown={(e) => { if (e.key === 'Escape' && !enCours) { e.stopPropagation(); setApercu(null); } }}>
          <div className="sech" style={{ margin: 0 }}><h2>Avant d’enregistrer · {apercu.libelle}</h2></div>
          {apercu.refus ? <Message ton="err">{apercu.refus}</Message> : apercu.impact && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <p style={{ fontSize: 13 }}>{apercu.impact.resume}</p>
              <p className="faint" style={{ fontSize: '12.5px' }}>Sera refait · {apercu.impact.aRefaire.length ? apercu.impact.aRefaire.map((l) => `${l.libelle}${l.payant ? ' (génération · devis séparé, rien n’est lancé ici)' : ' (recalcul, sans coût)'}`).join(' · ') : 'rien'}</p>
              <p className="faint" style={{ fontSize: '12.5px' }}>Médias conservés · {apercu.impact.mediasConserves.length ? apercu.impact.mediasConserves.map((l) => l.libelle).join(' · ') : 'aucun média produit à conserver'}</p>
              {apercu.impact.mediasObsoletes.length > 0 && <p className="faint" style={{ fontSize: '12.5px' }}>Deviendront obsolètes (restent consultables) · {apercu.impact.mediasObsoletes.map((l) => l.libelle).join(', ')}</p>}
              {apercu.durees && <p className="faint" style={{ fontSize: '12.5px' }}>{apercu.durees.phrase}</p>}
              {apercu.signalements.map((s) => <p key={s} className="faint" style={{ fontSize: '12.5px' }}>{s}</p>)}
            </div>
          )}
          {confirmation && !confirmation.ok && <Message ton="err">{confirmation.message}</Message>}
          <div className="kc" style={{ marginTop: 10 }}>
            {/* Même place, même balise · React garde le nœud, le focus passe de « Recalculer » à « Enregistrer » sans rattrapage. */}
            {confirmation && !confirmation.ok
              ? <button className="btn sm pri" type="button" {...boutonAction({ occupe: !!enCours })} onClick={() => prevoir(apercu.operation)}>Recalculer l’aperçu</button>
              : <button className="btn sm pri" type="button" data-action="enregistrer-changement"
                  {...boutonAction({ presse: enCours === 'confirmer', occupe: !!enCours, ferme: !!apercu.refus || !disponibilite.montage.disponible, focalisable: 'occupe', surClic: confirmer })}>{enCours === 'confirmer' ? 'Enregistrement…' : 'Enregistrer ce changement'}</button>}
            <button className="btn sm" type="button" {...boutonAction({ occupe: !!enCours })} onClick={() => setApercu(null)}>Ne rien changer</button>
            <span className="faint" style={{ fontSize: '11.5px' }}>{disponibilite.montage.disponible ? 'Nouvelle version du projet · aucun appel, aucun coût, aucun devis.' : disponibilite.montage.raison}</span>
          </div>
        </section>
      )}

      {storyboard && (
        <section className="tile sec" data-zone="storyboard-propose" aria-labelledby={titres.storyboard}>
          <div className="sech" style={{ margin: 0 }}><h2 id={titres.storyboard}>Storyboard proposé · {storyboard.plans.length} plan{storyboard.plans.length > 1 ? 's' : ''} · {dureeLisible(storyboard.totalMs)}</h2></div>
          {storyboard.avertissements.map((a) => <p key={a} className="faint" style={{ fontSize: '12.5px' }}>{a}</p>)}
          <div className="tl">
            {storyboard.plans.map((pl, i) => <div className="ev" key={pl.shotId}><span className="ico">{i + 1}</span><span>{pl.purpose || 'Plan'} · {pl.subject} · {pl.action}{pl.narration ? ` · « ${pl.narration} »` : ''}</span><span className="faint">{dureeLisible(pl.estimatedDurationMs)}</span></div>)}
          </div>
          <div className="kc" style={{ marginTop: 10 }}>
            <button className="btn sm pri" type="button" {...boutonAction({ occupe: !!enCours, ferme: !!apercu })} onClick={() => prevoir({ type: 'scenario', plans: storyboard.plans })}>Voir l’impact et retenir</button>
            <button className="btn sm" type="button" {...boutonAction({ occupe: !!enCours })} onClick={() => { setStoryboard(null); setQuestions([]); replacerFocus('si-perdu', '[data-action="proposer-storyboard"]', '[data-vedit]'); }}>Écarter</button>
          </div>
        </section>
      )}

      {scriptOuvert && (
        <Script vue={v} ordre={ordre} libre={!enCours && !apercu && disponibilite.montage.disponible} prevoir={prevoir} coutTexte={coutTexte} enCours={enCours}
          storyboardDispo={disponibilite.storyboard}
          surStoryboard={(e) => void agir('storyboard', async () => {
            setQuestions([]);
            const r = await planifierStoryboard({ projectId: v.projet.id, ...e });
            if (!r.ok) return r;
            if (r.statut === 'questions') { setQuestions(r.questions); return { ok: true as const }; }
            setStoryboard({ plans: r.plans, totalMs: r.totalMs, avertissements: r.avertissements });
            return { ok: true as const };
          }, () => 'Réponse reçue · relis les plans, rien n’est encore écrit dans le projet.')} />
      )}

      <section className="tile sec" data-zone="video-finale" aria-labelledby={titres.finale}>
        <div className="sech" style={{ margin: 0 }}><h2 id={titres.finale}>Vidéo finale</h2><span className="faint" style={{ fontSize: '12.5px' }}>Assemblée sur le serveur · aucun crédit, aucun coût fournisseur</span></div>
        <p className="muted" style={{ fontSize: '12.5px', marginTop: 8 }}>Les clips animés des plans, dans l’ordre du montage, au format {v.format.largeur} × {v.format.hauteur}{v.videoFinale.possible ? ` · ${dureeLisible(v.videoFinale.dureeMs)}` : ''}.</p>
        {v.videoFinale.nonInclus.length > 0 && <p className="faint" style={{ fontSize: '12.5px' }}>Ce qu’elle n’inclut pas · {v.videoFinale.nonInclus.join(' · ')}</p>}
        <div className="kc" style={{ marginTop: 10 }}>
          <button className="btn sm pri" type="button" data-action="assembler"
            {...boutonAction({ presse: enCours === 'assembler', occupe: !!enCours, ferme: !v.videoFinale.possible, focalisable: 'occupe', surClic: () => void agir('assembler', () => assemblerVideoFinale({ projectId: v.projet.id }), (r) => {
              const x = r as { video?: { dureeMs: number } };
              return `Vidéo finale assemblée${x.video ? ` · ${Math.round(x.video.dureeMs / 100) / 10} s` : ''} · lis-la ou télécharge-la ci-dessus.`;
            }) })}>{enCours === 'assembler' ? 'Assemblage…' : finale ? 'Assembler à nouveau · 0 crédit' : 'Assembler la vidéo finale · 0 crédit'}</button>
          <span className="faint" style={{ fontSize: '11.5px' }}>{v.videoFinale.possible ? 'Quelques secondes à une minute · tu peux rester sur la page.' : v.videoFinale.raison}</span>
        </div>
      </section>

      <section className="tile sec" data-zone="jobs" aria-labelledby={titres.jobs}>
        <div className="sech" style={{ margin: 0 }}><h2 id={titres.jobs}>Générations</h2><span className="faint" style={{ fontSize: '12.5px' }}>Images clés et clips de ce projet · état réel</span></div>
        {v.jobs.length === 0 ? <p className="muted" style={{ fontSize: '12.5px', marginTop: 8 }}>Aucune image clé ni aucun clip lancé pour ce projet.</p> : (
          <div className="tl">
            {v.jobs.map((j) => {
              const clip = j.operation.startsWith('clip:');
              const sid = j.operation.slice(j.operation.indexOf(':') + 1);
              const n = ordre.indexOf(sid) + 1;
              return (
                <div className="ev" key={j.id} data-job={j.id}>
                  <span className="ico"><Ic n={clip ? 'phone' : 'img'} /></span>
                  <span>{clip ? 'Clip animé' : 'Image clé'} · plan {n || sid} · {date(j.creeLe)} · {libelleCredits(j.creditsReserves)} réservé{j.creditsReserves > 1 ? 's' : ''}<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{j.message}{j.raisonEchec ? ` · raison : ${j.raisonEchec}` : ''}{j.etat === 'completed' ? ` · qualité : ${j.libelleQualite}` : ''}</small></span>
                  <span className={`pill ${j.etat === 'completed' ? 'g' : j.etat === 'failed' || j.etat === 'reconciliation_required' ? 'w' : ''}`}>{j.libelleEtat}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {/* La barre flottante de la maquette (`#orn`) · retour au projet, plans RÉELLEMENT animés, tester les variantes (rattachement, lot d'essai). */}
      {!telephone && (
        <Ornement>
          <Lien className="btn" href={`/studio/projets/${v.projet.id}`}><Ic n="back" />Projet</Lien>
          <span className="info" data-orn-video="">{infoOrnementVideo(ordre.length, ordre.filter((s) => v.clips[s]?.etat === 'valide').length)}</span>
          <Lien className="btn pri" href={variantesHref}><Ic n="flask" />Tester les variantes</Lien>
        </Ornement>
      )}
      </div>
    </Vue>
  );
}

/** Le plan choisi · chaque champ du storyboard dans SA case, et son clip animé quand il existe. */
function FichePlan({ rang, p, seg, c }: { rang: number; p: PlanStudio; seg: DonneesVideo['segments'][number] | null; c: DonneesVideo['clips'][string] }) {
  const duree = seg
    ? `${dureeLisible(seg.dureeMs)} · ${seg.estimee ? 'estimée' : 'réelle'} · de ${dureeLisible(seg.debutMs)} à ${dureeLisible(seg.debutMs + seg.dureeMs)}`
    : `${dureeLisible(p.estimatedDurationMs)} · estimée`;
  const titre = useId();
  const champs: Array<[string, string]> = [
    ['Sujet', p.subject], ['Action', p.action], ['Cadrage', p.framing], ['Caméra', p.camera], ['Lumière', p.lighting], ['Décor', p.environment],
    [`Narration (dite) · ${LIBELLES_MODE_PAROLE[p.speechMode]}`, p.speechMode === 'none' ? 'aucune' : p.narration],
    ['Texte écran (lu)', p.onScreenText.join(' / ') || 'aucun'],
    ['Durée', duree],
  ];
  return (
    <section className="tile sec" data-zone="plan-choisi" aria-labelledby={titre}>
      <div className="sech" style={{ margin: 0 }}><h2 id={titre}>Plan {rang} · {p.purpose || 'fiche du plan'}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Le storyboard tel qu’il sera produit</span></div>
      <dl className="kv2" data-champs-plan={p.shotId}>
        {champs.map(([dt, dd]) => <Fragment key={dt}><dt>{dt}</dt><dd>{dd || 'à préciser'}</dd></Fragment>)}
      </dl>
      {c.media && (
        <div data-clip={p.shotId} style={{ display: 'grid', gap: 6, marginTop: 12, maxWidth: 240 }}>
          <video src={c.media.url} controls playsInline preload="metadata" aria-label={`Clip animé du plan ${rang}`} style={{ width: '100%', borderRadius: 14, display: 'block' }} />
          <small className="faint" style={{ fontSize: '11.5px' }}>{c.etat === 'valide' ? 'Clip animé valide' : 'Clip animé obsolète · reste consultable, à refaire pour cette version'}</small>
        </div>
      )}
    </section>
  );
}

function libelleConfirmation(cle: CleGestePlan, devisImage: number | null, devisClip: number | null): string {
  switch (cle) {
    case 'consigne': return 'Compiler la consigne';
    case 'retenir': return 'Retenir cette consigne';
    case 'devis': return 'Demander le devis';
    case 'lancer': return `Approuver et lancer · ${libelleCredits(devisImage ?? 0)}`;
    case 'devis-clip': return 'Demander le devis du clip';
    case 'lancer-clip': return `Approuver et animer · ${libelleCredits(devisClip ?? 0)}`;
  }
}

function DetailGeste({ cle, k, c, vue, coutTexte }: {
  cle: CleGestePlan; k: DonneesVideo['keyframes'][string]; c: DonneesVideo['clips'][string]; vue: DonneesVideo; coutTexte: string;
}) {
  const p = (t: string) => <p className="faint" style={{ fontSize: '12.5px' }}>{t}</p>;
  if (cle === 'consigne') return p(`${coutTexte} · aucune image.`);
  if (cle === 'retenir') return k.enAttente ? <>{p(`Consigne compilée · ${k.enAttente.instruction}`)}{p('Nouvelle version · aucun appel, aucun coût.')}</> : p('Aucune consigne en attente.');
  if (cle === 'devis') return <>
    {k.retenue && p(`Consigne retenue · ${k.retenue.instruction} · à éviter : ${k.retenue.interdits.map((x) => x.replace(/\.$/, '')).join(' · ')}`)}
    {p(`Une image clé · ${libellePrix(vue.prix)} · le devis ne débite rien.`)}
  </>;
  if (cle === 'lancer') return k.devis ? p(`Devis · ${libelleCredits(k.devis.credits)} · valable jusqu’à ${heure(k.devis.expiresAt)}. Débite ${libelleCredits(k.devis.credits)} maintenant · rendus si aucune image n’est livrée.`) : p('Demande d’abord un devis.');
  if (cle === 'devis-clip') return p(`Un clip de ${vue.prixClip.dureeS} s depuis l’image clé · ${libelleCredits(vue.prixClip.credits)} · le devis ne débite rien.`);
  return c.devis ? p(`Devis du clip · ${libelleCredits(c.devis.credits)} · valable jusqu’à ${heure(c.devis.expiresAt)}. Les crédits sont réservés, rendus si aucun clip n’est livré.`) : p('Demande d’abord le devis du clip.');
}

/** L'édition du script · chaque changement passe par l'aperçu de son impact avant d'être enregistré. */
function Script({ vue: v, ordre, libre, prevoir, coutTexte, enCours, storyboardDispo, surStoryboard }: {
  vue: DonneesVideo; ordre: string[]; libre: boolean; prevoir: (op: OperationVideo) => void; coutTexte: string; enCours: string | null;
  storyboardDispo: { disponible: boolean; raison: string };
  surStoryboard: (e: { nbPlans: number; dureeCibleMs: number; speechMode: ModeParole }) => void;
}) {
  const [saisies, setSaisies] = useState<Record<string, { action: string; texte: string; narration: string }>>({});
  const [nb, setNb] = useState(Math.max(1, ordre.length || 3));
  const [duree, setDuree] = useState(Math.max(1, Math.round(v.dureeTotaleMs / 1000) || 15));
  const [mode, setMode] = useState<ModeParole>('voiceover');
  const [manuels, setManuels] = useState<SaisiePlan[] | null>(null);
  const t = v.contenu.timeline;
  const [musique, setMusique] = useState(t?.music?.assetId ?? v.musiques[0]?.assetId ?? '');
  const [gain, setGain] = useState(t?.music?.gainDb ?? -12);
  const ids = idsPlansAlloues(Object.keys(v.contenu.shots.byId), nb);
  const titre = useId();
  // Au téléphone, l'en-tête de colonnes (`.vsch`) est masqué par la maquette · chaque champ porte alors son libellé visible.
  const telephone = useTelephone();
  const libelleVisible = (t: string) => telephone ? <span className="faint" aria-hidden="true" data-libelle-champ="" style={{ fontSize: '11.5px' }}>{t}</span> : null;

  const bouge = (sid: string, delta: number) => {
    const o = [...v.contenu.shots.order];
    const i = o.indexOf(sid), j = i + delta;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    prevoir({ type: 'ordre', ordre: o });
  };

  return (
    <section className="tile sec" data-zone="script" aria-labelledby={titre}>
      <div className="sech" style={{ margin: 0 }}><h2 id={titre}>Script</h2><span className="faint" style={{ fontSize: '12.5px' }}>Chaque changement montre son impact avant d’être enregistré · aucun coût</span></div>
      {ordre.length > 0 && <div className="vsc vsch" style={{ marginTop: 10 }}><span>Temps</span><span>Ce qu’on voit</span><span>Texte à l’écran</span><span>Voix off</span></div>}
      {ordre.map((sid, i) => {
        const p = v.contenu.shots.byId[sid]!;
        const seg = v.segments.find((s) => s.shotId === sid);
        const s = saisies[sid] ?? { action: p.action, texte: p.onScreenText.join(' / '), narration: p.narration };
        const maj = (champ: 'action' | 'texte' | 'narration', valeur: string) => setSaisies((x) => ({ ...x, [sid]: { ...s, [champ]: valeur } }));
        const change = s.action !== p.action || s.texte !== p.onScreenText.join(' / ') || s.narration !== p.narration;
        return (
          <div key={sid}>
            <div className="vsc">
              <span className="vtime"><b>{p.purpose || `Plan ${i + 1}`}</b><small>{minuteSeconde(seg?.debutMs ?? 0)}–{minuteSeconde((seg?.debutMs ?? 0) + (seg?.dureeMs ?? 0))}</small></span>
              {libelleVisible('Ce qu’on voit')}
              <textarea className="vin" rows={2} value={s.action} aria-label={`Plan ${i + 1} · ce qu’on voit`} onChange={(e) => maj('action', e.target.value)} />
              {libelleVisible('Texte à l’écran')}
              <textarea className="vin" rows={2} value={s.texte} aria-label={`Plan ${i + 1} · texte à l’écran`} disabled={v.sansTexte} onChange={(e) => maj('texte', e.target.value)} />
              {libelleVisible('Voix off')}
              <textarea className="vin" rows={2} value={s.narration} aria-label={`Plan ${i + 1} · voix off`} disabled={p.speechMode === 'none'} onChange={(e) => maj('narration', e.target.value)} />
            </div>
            <div className="kc" style={{ marginBottom: 10 }}>
              {change && <button className="btn sm pri" type="button" disabled={!libre} onClick={() => prevoir(s.narration !== p.narration && s.action === p.action && s.texte === p.onScreenText.join(' / ')
                ? { type: 'narration', shotId: sid, narration: s.narration }
                : { type: 'plan', shotId: sid, champs: { action: s.action, onScreenText: s.texte.split('/').map((x) => x.trim()).filter(Boolean), ...(p.speechMode !== 'none' ? { narration: s.narration } : {}) } })} aria-label={`Voir l’impact du plan ${i + 1}`}>Voir l’impact</button>}
              <button className="btn sm" type="button" disabled={!libre || i === 0} onClick={() => bouge(sid, -1)} aria-label={`Avancer le plan ${i + 1}`}>Avancer</button>
              <button className="btn sm" type="button" disabled={!libre || i === ordre.length - 1} onClick={() => bouge(sid, 1)} aria-label={`Reculer le plan ${i + 1}`}>Reculer</button>
              <span className="faint" style={{ fontSize: '11.5px' }}>{LIBELLES_MODE_PAROLE[p.speechMode]} · {dureeLisible(seg?.dureeMs ?? p.estimatedDurationMs)}</span>
            </div>
          </div>
        );
      })}

      {ordre.length > 0 && (
        <div className="grid3" style={{ marginTop: 6, alignItems: 'end' }}>
          <label className="field">Piste musicale
            <select value={musique} disabled={v.musiques.length === 0} onChange={(e) => setMusique(e.target.value)}>
              {v.musiques.length === 0 && <option value="">Aucune piste audio importée</option>}
              {v.musiques.map((m) => <option key={m.assetId} value={m.assetId}>{m.libelle}</option>)}
            </select>
          </label>
          <label className="field">Gain (dB, de {GAIN_MUSIQUE_MIN_DB} à +{GAIN_MUSIQUE_MAX_DB})<input type="number" min={GAIN_MUSIQUE_MIN_DB} max={GAIN_MUSIQUE_MAX_DB} step={0.5} value={gain} onChange={(e) => setGain(Number(e.target.value))} /></label>
          <div className="kc">
            <button className="btn sm" type="button" disabled={!libre || !musique} onClick={() => prevoir({ type: 'musique', musique: { assetId: musique, gainDb: gain } })} aria-label="Voir l’impact de la musique">Voir l’impact</button>
            {t?.music && <button className="btn sm" type="button" disabled={!libre} onClick={() => prevoir({ type: 'musique', musique: null })}>Retirer la musique</button>}
            {!v.sansTexte && <button className="btn sm" type="button" disabled={!libre} onClick={() => prevoir({ type: 'sans_texte' })}>Retirer texte écran et sous-titres</button>}
          </div>
        </div>
      )}
      {v.sansTexte && <p className="faint" style={{ fontSize: '12.5px' }}>Vidéo sans texte · aucune surimpression ni sous-titre ne sera posé.</p>}

      <div className="sech sec" style={{ margin: '18px 0 8px' }}><h2>{ordre.length ? 'Remplacer le scénario' : 'Construire le scénario'}</h2></div>
      <div className="grid3" style={{ alignItems: 'end' }}>
        <label className="field">Nombre de plans<select value={nb} onChange={(e) => { setNb(Number(e.target.value)); setManuels(null); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="field">Durée cible (s)<input type="number" min={1} max={180} value={duree} onChange={(e) => setDuree(Number(e.target.value))} /></label>
        <label className="field">Parole<select value={mode} onChange={(e) => setMode(e.target.value as ModeParole)}>{MODES_PAROLE.map((m) => <option key={m} value={m}>{LIBELLES_MODE_PAROLE[m]}</option>)}</select></label>
      </div>
      <div className="kc" style={{ marginTop: 10 }}>
        {/* Le verrou d'appel payant ferme le storyboard PENDANT son propre appel · le bouton pressé reste focalisable (`aria-busy`). */}
        <button className="btn sm pri" type="button" data-action="proposer-storyboard"
          {...boutonAction({ presse: enCours === 'storyboard', occupe: !!enCours, ferme: !storyboardDispo.disponible, focalisable: 'occupe', surClic: () => surStoryboard({ nbPlans: nb, dureeCibleMs: Math.round(duree * 1000), speechMode: mode }) })}><Ic n="spark" />{enCours === 'storyboard' ? 'Rédaction…' : 'Proposer un storyboard depuis le brief'}</button>
        <span className="faint" style={{ fontSize: '11.5px' }} data-cout="storyboard">{storyboardDispo.disponible ? `${coutTexte} · rien n’est écrit avant que tu retiennes les plans.` : storyboardDispo.raison}</span>
      </div>
      <div className="kc" style={{ marginTop: 8 }}>
        <button className="btn sm" type="button" disabled={!libre} onClick={() => setManuels(ids.map((_, i) => saisieVierge(i, nb, Math.round(duree * 1000), mode)))}>Écrire les plans à la main</button>
        <span className="faint" style={{ fontSize: '11.5px' }}>Chemin manuel · aucun appel, aucun coût.</span>
      </div>
      {manuels && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {manuels.map((s, i) => (
            <div key={ids[i]} className="grid3">
              {(['purpose', 'subject', 'action', 'camera', 'narration'] as const).map((champ) => (
                <label key={champ} className="field">Plan {i + 1} · {({ purpose: 'Fonction', subject: 'Sujet *', action: 'Action *', camera: 'Caméra *', narration: 'Narration' })[champ]}
                  <input value={s[champ]} aria-required={champ === 'subject' || champ === 'action' || champ === 'camera' || undefined} onChange={(e) => setManuels((m) => m!.map((x, j) => (j === i ? { ...x, [champ]: e.target.value } : x)))} />
                </label>
              ))}
              <label className="field">Plan {i + 1} · Texte écran<input value={s.onScreenText.join(' / ')} onChange={(e) => setManuels((m) => m!.map((x, j) => (j === i ? { ...x, onScreenText: e.target.value.split('/').map((t) => t.trim()).filter(Boolean) } : x)))} /></label>
            </div>
          ))}
          <div className="kc"><button className="btn sm pri" type="button" disabled={!libre} onClick={() => prevoir({ type: 'scenario', plans: manuels.map((s, i) => ({ shotId: ids[i]!, ...s })) })}>Voir l’impact du scénario</button><span className="faint" style={{ fontSize: '11.5px' }}>Sujet, action et caméra sont obligatoires.</span></div>
        </div>
      )}
    </section>
  );
}

