'use client';

import { useId, useState } from 'react';
import {
  libellePrix, libelleCredits, libelleUsd, dureeLisible, idsPlansAlloues, saisieVierge, referencesDuProjet,
  LIBELLES_MODE_PAROLE, LIBELLE_ANIMATION_INDISPONIBLE, MODES_PAROLE, VALIDITE_DEVIS_MS, GAIN_MUSIQUE_MIN_DB, GAIN_MUSIQUE_MAX_DB,
  type ModeParole, type OperationVideo, type PlanStudio, type SaisiePlan, type ImpactVideo, type BilanDurees,
} from '@tiktrends/core';
import type { VueVideo as DonneesVideo, KeyframeVue, JobVideoVue } from '../../../lib/studios/video/lecture';
import { tuile } from '../../ui';
import { panneau, carte, titre, sousTitre, etiquette, texte, mini, boutonPrimaire, boutonSecondaire, desactive, signal, pastille, rangee, champ, CIBLE } from '../propositions/styles';

/**
 * Studio vidéo d'un projet (lot L6-A) · PRÉSENTATION : storyboard des plans,
 * timeline, images clés et leurs devis, statut des jobs, animation dite
 * indisponible. Chaque geste de montage passe d'abord par un APERÇU de son
 * impact (ce qui sera refait, ce qui est conservé, les durées), calculé par le
 * noyau, avant tout enregistrement et avant tout devis.
 *
 * Gestes payants séparés et nommés, prix annoncé AVANT le clic. Un geste
 * indisponible est un bouton inactif accompagné de sa raison. Cibles de
 * 44 px, champs à 16 px, statut porté par des mots.
 */

export interface ApercuGeste {
  operation: OperationVideo;
  libelle: string;
  impact: ImpactVideo | null;
  durees: BilanDurees | null;
  signalements: string[];
  refus: string | null;
}

export interface StoryboardPropose { plans: PlanStudio[]; totalMs: number; avertissements: string[] }

export interface GestesVideo {
  surPrevoir: (op: OperationVideo) => void;
  surConfirmer: () => void;
  surAbandonner: () => void;
  surStoryboard: (e: { nbPlans: number; dureeCibleMs: number; speechMode: ModeParole }) => void;
  surRetenirStoryboard: () => void;
  surEcarterStoryboard: () => void;
  surCompiler: (shotId: string) => void;
  surRetenirConsigne: (runId: string) => void;
  surDevis: (shotId: string) => void;
  surLancer: (shotId: string) => void;
}

export interface ProprietesVueVideo extends GestesVideo {
  vue: DonneesVideo;
  apercu: ApercuGeste | null;
  storyboard: StoryboardPropose | null;
  questions: string[];
  enCours: string | null;
  retour: { ok: boolean; texte: string } | null;
}

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const coutTexte = (usd: number) => `${usd.toFixed(2).replace('.', ',')} $ au plus`;

const ETATS_KEYFRAME: Record<KeyframeVue['etat'], { mot: string; couleur: string }> = {
  valide: { mot: 'Image clé valide', couleur: 'var(--ok)' },
  obsolete: { mot: 'Image clé obsolète', couleur: 'var(--warn)' },
  a_produire: { mot: 'Image clé à produire', couleur: 'var(--line-2)' },
};
const COULEUR_JOB: Record<string, string> = { completed: 'var(--ok)', failed: 'var(--err)', cancelled: 'var(--muted)', reconciliation_required: 'var(--warn)' };

function Bouton({ actif, enCours, libelle, libelleEnCours, surClic, primaire = true, nom, etiquetteAria }: { actif: boolean; enCours: boolean; libelle: string; libelleEnCours?: string; surClic: () => void; primaire?: boolean; nom: string; etiquetteAria?: string }) {
  return (
    <button type="button" data-bouton={nom} disabled={!actif} aria-busy={enCours} aria-label={etiquetteAria} onClick={surClic} style={{ ...(primaire ? boutonPrimaire : boutonSecondaire), ...(actif ? {} : desactive) }}>
      {enCours ? (libelleEnCours ?? 'En cours…') : libelle}
    </button>
  );
}

/* ─────────────────────────────── Aperçu d'impact ─────────────────────────── */

function Apercu({ a, p }: { a: ApercuGeste; p: ProprietesVueVideo }) {
  const payantes = a.impact?.aRefaire.filter((l) => l.payant) ?? [];
  const calculs = a.impact?.aRefaire.filter((l) => !l.payant) ?? [];
  const conservees = a.impact?.mediasConserves ?? [];
  return (
    <div style={{ ...carte, border: '2px solid var(--accent-strong)' }} data-zone="apercu-impact" role="region" aria-label="Impact du changement avant enregistrement">
      <h3 style={{ ...titre, fontSize: 16 }}>Avant d’enregistrer · {a.libelle}</h3>
      {a.refus ? <p style={signal('err')} data-apercu="refus">{a.refus}</p> : a.impact && (
        <>
          <p style={signal(a.impact.aucuneGeneration ? 'ok' : 'warn')} data-apercu="resume">{a.impact.resume}</p>
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ ...texte, color: 'var(--ink)' }}>Sera refait</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }} data-apercu="refait">
              {payantes.map((l) => <li key={l.id} style={texte}>{l.libelle} · génération (devis séparé, rien n’est lancé ici)</li>)}
              {calculs.map((l) => <li key={l.id} style={texte}>{l.libelle} · recalcul, sans fournisseur payant</li>)}
              {payantes.length + calculs.length === 0 && <li style={texte}>Rien.</li>}
            </ul>
            <p style={{ ...texte, color: 'var(--ink)' }}>Médias déjà produits conservés</p>
            <p style={mini} data-apercu="conserve">{conservees.length ? conservees.map((l) => l.libelle).join(' · ') : 'Aucun média n’a encore été produit pour ce projet · rien à conserver ni à refaire côté fournisseur.'}</p>
            {a.impact.mediasObsoletes.length > 0 && <p style={signal('warn')} data-apercu="obsoletes">Médias déjà produits qui deviendront obsolètes (ils restent consultables) : {a.impact.mediasObsoletes.map((l) => l.libelle).join(', ')}.</p>}
          </div>
          {a.durees && <p style={texte} data-apercu="durees">{a.durees.phrase}</p>}
          {a.signalements.map((s) => <p key={s} style={signal('warn')} data-apercu="signalement">{s}</p>)}
        </>
      )}
      <div style={rangee}>
        <Bouton nom="confirmer" actif={!a.refus && p.vue.disponibilite.montage.disponible && !p.enCours} enCours={p.enCours === 'confirmer'} libelle="Enregistrer ce changement" libelleEnCours="Enregistrement…" surClic={p.surConfirmer} />
        <Bouton nom="abandonner" primaire={false} actif={!p.enCours} enCours={false} libelle="Ne rien changer" surClic={p.surAbandonner} />
        <span style={mini}>{p.vue.disponibilite.montage.disponible ? 'Nouvelle version du projet · aucun appel, aucun coût, aucun devis.' : p.vue.disponibilite.montage.raison}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Plan ────────────────────────────────────── */

function Champ({ nom, valeur }: { nom: string; valeur: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <dt style={{ ...mini, color: 'var(--ink-2)', fontWeight: 600 }}>{nom}</dt>
      <dd style={{ ...texte, margin: 0, color: valeur ? 'var(--ink)' : 'var(--muted)' }}>{valeur || 'non renseigné'}</dd>
    </div>
  );
}

function ImageCle({ sid, rang, k, p }: { sid: string; rang: number; k: KeyframeVue; p: ProprietesVueVideo }) {
  const v = p.vue;
  const d = v.disponibilite;
  const e = ETATS_KEYFRAME[k.etat];
  const verdictOk = !!k.retenue && k.retenue.verdict.ok;
  const raisonDevis = !k.retenue ? 'Retiens d’abord une consigne compilée pour ce plan.' : !k.retenue.verdict.ok ? k.retenue.verdict.motif : !d.devis.disponible ? d.devis.raison : '';
  return (
    <div style={{ display: 'grid', gap: 10 }} data-image-cle={sid} data-etat-image={k.etat}>
      <div style={rangee}>
        <span style={pastille(e.couleur)}>{e.mot}</span>
        {k.etat === 'obsolete' && <span style={mini}>L’ancienne image reste consultable · elle ne vaut plus pour cette version.</span>}
      </div>
      {k.media && (
        <img src={k.media.url} alt={`Image clé du plan ${rang}`} loading="lazy"
          style={{ width: 'min(100%, 180px)', height: 'auto', aspectRatio: `${v.format.largeur} / ${v.format.hauteur}`, objectFit: 'cover', borderRadius: 12, background: 'var(--rail)' }} />
      )}
      {k.enAttente && (
        <div style={{ ...carte, background: 'var(--surface)' }} data-consigne="en-attente">
          <p style={{ ...texte, color: 'var(--ink)' }}>Consigne compilée, pas encore retenue · {k.enAttente.instruction}</p>
          <div style={rangee}>
            <Bouton nom={`retenir-${sid}`} actif={d.montage.disponible && !p.enCours} enCours={p.enCours === `retenir:${sid}`} libelle="Retenir cette consigne" libelleEnCours="Enregistrement…" surClic={() => p.surRetenirConsigne(k.enAttente!.runId)} />
            <span style={mini}>Nouvelle version · aucun appel, aucun coût.</span>
          </div>
        </div>
      )}
      {k.retenue ? (
        <div style={{ display: 'grid', gap: 6 }} data-consigne="retenue" data-pret={k.retenue.verdict.ok ? 'oui' : 'non'}>
          <p style={texte}><span style={{ fontWeight: 600, color: 'var(--ink)' }}>Consigne · </span>{k.retenue.instruction}</p>
          <p style={mini}>À éviter : {k.retenue.interdits.join(' · ')}{k.retenue.composants.length ? ` · composants protégés : ${k.retenue.composants.join(', ')}` : ''}.</p>
          {!k.retenue.verdict.ok && <p style={signal('warn')} data-champ="verdict">{k.retenue.verdict.motif}</p>}
        </div>
      ) : !k.enAttente && <p style={mini} data-consigne="aucune">Aucune consigne d’image pour ce plan.</p>}
      <div style={rangee}>
        <Bouton nom={`compiler-${sid}`} primaire={false} actif={d.consigne.disponible && !p.enCours} enCours={p.enCours === `compiler:${sid}`} libelle="Compiler la consigne" libelleEnCours="Compilation…" surClic={() => p.surCompiler(sid)} etiquetteAria={`Compiler la consigne du plan ${rang}`} />
        <span style={mini} data-cout="consigne">{d.consigne.disponible ? `Appel texte payant · ${coutTexte(v.coutTexteUsd)} · aucun crédit, aucune image.` : d.consigne.raison}</span>
      </div>
      <div style={rangee}>
        <Bouton nom={`devis-${sid}`} primaire={false} actif={verdictOk && d.devis.disponible && !p.enCours} enCours={p.enCours === `devis:${sid}`} libelle={k.etat === 'valide' ? 'Devis d’une nouvelle variante' : 'Demander un devis'} libelleEnCours="Devis…" surClic={() => p.surDevis(sid)} etiquetteAria={`Demander un devis pour l’image clé du plan ${rang}`} />
        <span style={mini} data-prix="annonce">Une image clé · {libellePrix(v.prix)}{raisonDevis ? ` · ${raisonDevis}` : ` · le devis ne débite rien, prix figé ${Math.round(VALIDITE_DEVIS_MS / 60_000)} minutes.`}</span>
      </div>
      {k.devis && (
        <div style={{ ...carte, background: 'var(--surface)' }} data-devis={k.devis.id}>
          <p style={{ ...texte, color: 'var(--ink)' }} data-prix="devis">Devis · {libelleCredits(k.devis.credits)} · {libelleUsd(k.devis.usdMicros)} au plus de coût fournisseur · valable jusqu’à {heure(k.devis.expiresAt)}.</p>
          <div style={rangee}>
            <Bouton nom={`lancer-${sid}`} actif={d.lancement.disponible && !p.enCours} enCours={p.enCours === `lancer:${sid}`} libelle={`Approuver et lancer · ${libelleCredits(k.devis.credits)}`} libelleEnCours="Lancement…" surClic={() => p.surLancer(sid)} />
            <span style={mini}>{d.lancement.disponible ? `Débite ${libelleCredits(k.devis.credits)} maintenant · rendus si aucune image n’est livrée.` : d.lancement.raison}</span>
          </div>
        </div>
      )}
      {!d.animation.disponible && <p style={signal('info')} data-animation={sid}><span style={{ fontWeight: 600 }}>Animation · {LIBELLE_ANIMATION_INDISPONIBLE}.</span> Aucun clip n’est proposé ni facturé pour ce plan.</p>}
    </div>
  );
}

function CartePlan({ plan, rang, total, p }: { plan: PlanStudio; rang: number; total: number; p: ProprietesVueVideo }) {
  const v = p.vue;
  const ordre = v.contenu.shots.order;
  const [narration, setNarration] = useState<string | null>(null);
  const id = useId();
  const seg = v.segments.find((s) => s.shotId === plan.shotId);
  const bouge = (delta: number) => {
    const o = [...ordre];
    const i = o.indexOf(plan.shotId);
    const j = i + delta;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    p.surPrevoir({ type: 'ordre', ordre: o });
  };
  const libre = !p.enCours && !p.apercu && v.disponibilite.montage.disponible;
  return (
    <article style={carte} data-plan={plan.shotId} data-rang={rang} aria-labelledby={`${id}-t`}>
      <div style={{ ...rangee, justifyContent: 'space-between' }}>
        <h3 id={`${id}-t`} style={{ ...titre, fontSize: 16 }}>Plan {rang} · {plan.purpose || 'sans fonction'}</h3>
        <span style={mini} data-champ="duree">{dureeLisible(seg?.dureeMs ?? plan.estimatedDurationMs)} {seg?.estimee === false ? '· durée réelle' : '· estimée'} · de {dureeLisible(seg?.debutMs ?? 0)} à {dureeLisible((seg?.debutMs ?? 0) + (seg?.dureeMs ?? 0))}</span>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }} data-champs-plan={plan.shotId}>
        <Champ nom="Sujet" valeur={plan.subject} />
        <Champ nom="Action" valeur={plan.action} />
        <Champ nom="Cadrage" valeur={plan.framing} />
        <Champ nom="Caméra" valeur={plan.camera} />
        <Champ nom="Lumière" valeur={plan.lighting} />
        <Champ nom="Décor" valeur={plan.environment} />
        <Champ nom={`Narration (dite) · ${LIBELLES_MODE_PAROLE[plan.speechMode]}`} valeur={plan.narration} />
        <Champ nom="Texte écran (lu)" valeur={plan.onScreenText.join(' · ')} />
      </dl>
      <div style={rangee}>
        <Bouton nom={`monter-${plan.shotId}`} primaire={false} actif={libre && rang > 1} enCours={false} libelle="Avancer" surClic={() => bouge(-1)} etiquetteAria={`Avancer le plan ${rang}`} />
        <Bouton nom={`descendre-${plan.shotId}`} primaire={false} actif={libre && rang < total} enCours={false} libelle="Reculer" surClic={() => bouge(1)} etiquetteAria={`Reculer le plan ${rang}`} />
        {plan.speechMode !== 'none' && narration === null && <Bouton nom={`narration-${plan.shotId}`} primaire={false} actif={libre} enCours={false} libelle="Modifier la narration" surClic={() => setNarration(plan.narration)} etiquetteAria={`Modifier la narration du plan ${rang}`} />}
      </div>
      {narration !== null && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor={`${id}-n`} style={etiquette}>Narration du plan {rang} · la durée sera recalculée</label>
          <textarea id={`${id}-n`} value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} style={champ} />
          <div style={rangee}>
            <Bouton nom={`voir-narration-${plan.shotId}`} actif={libre} enCours={false} libelle="Voir l’impact" surClic={() => { p.surPrevoir({ type: 'narration', shotId: plan.shotId, narration }); setNarration(null); }} />
            <Bouton nom={`couper-narration-${plan.shotId}`} primaire={false} actif={libre && plan.narration !== ''} enCours={false} libelle="Couper la narration" surClic={() => { p.surPrevoir({ type: 'narration', shotId: plan.shotId, narration: '' }); setNarration(null); }} />
            <Bouton nom="fermer-narration" primaire={false} actif={true} enCours={false} libelle="Fermer" surClic={() => setNarration(null)} />
          </div>
        </div>
      )}
      <ImageCle sid={plan.shotId} rang={rang} k={v.keyframes[plan.shotId] ?? { etat: 'a_produire', media: null, retenue: null, enAttente: null, devis: null }} p={p} />
    </article>
  );
}

/* ─────────────────────────────── Scénario ────────────────────────────────── */

function FormulaireScenario({ p }: { p: ProprietesVueVideo }) {
  const v = p.vue;
  const id = useId();
  const [nb, setNb] = useState(2);
  const [duree, setDuree] = useState(8);
  const [mode, setMode] = useState<ModeParole>('voiceover');
  const [saisies, setSaisies] = useState<SaisiePlan[] | null>(null);
  const refs = [...referencesDuProjet(v.contenu)];
  const d = v.disponibilite;
  const ids = idsPlansAlloues(Object.keys(v.contenu.shots.byId), nb);
  const maj = (i: number, champ: keyof SaisiePlan, valeur: unknown) => setSaisies((s) => s!.map((x, k) => (k === i ? { ...x, [champ]: valeur } : x)));
  return (
    <div style={carte} data-zone="nouveau-scenario">
      <h3 style={{ ...titre, fontSize: 16 }}>{v.contenu.shots.order.length ? 'Remplacer le scénario' : 'Construire le scénario'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div><label htmlFor={`${id}-nb`} style={etiquette}>Nombre de plans</label>
          <select id={`${id}-nb`} value={nb} onChange={(e) => { setNb(Number(e.target.value)); setSaisies(null); }} style={champ}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div><label htmlFor={`${id}-d`} style={etiquette}>Durée cible (s)</label>
          <input id={`${id}-d`} type="number" min={1} max={180} value={duree} onChange={(e) => setDuree(Number(e.target.value))} style={champ} /></div>
        <div><label htmlFor={`${id}-m`} style={etiquette}>Parole</label>
          <select id={`${id}-m`} value={mode} onChange={(e) => setMode(e.target.value as ModeParole)} style={champ}>{MODES_PAROLE.map((m) => <option key={m} value={m}>{LIBELLES_MODE_PAROLE[m]}</option>)}</select></div>
      </div>
      <div style={rangee}>
        <Bouton nom="storyboard" actif={d.storyboard.disponible && !p.enCours} enCours={p.enCours === 'storyboard'} libelle="Proposer un storyboard depuis le brief" libelleEnCours="Rédaction…" surClic={() => p.surStoryboard({ nbPlans: nb, dureeCibleMs: Math.round(duree * 1000), speechMode: mode })} />
        <span style={mini} data-cout="storyboard">{d.storyboard.disponible ? `Appel texte payant · ${coutTexte(v.coutTexteUsd)} · rien n’est écrit avant que tu retiennes les plans.` : d.storyboard.raison}</span>
      </div>
      <div style={rangee}>
        <Bouton nom="manuel" primaire={false} actif={d.montage.disponible && !p.enCours} enCours={false} libelle="Écrire les plans à la main" surClic={() => setSaisies(ids.map((_, i) => saisieVierge(i, nb, Math.round(duree * 1000), mode)))} />
        <span style={mini}>Chemin manuel · aucun appel, aucun coût.</span>
      </div>
      {saisies && (
        <div style={{ display: 'grid', gap: 12 }} data-zone="saisie-plans">
          {saisies.map((s, i) => (
            <fieldset key={ids[i]} style={{ ...tuile, padding: 12, margin: 0, minWidth: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <legend style={{ ...etiquette, padding: '0 6px' }}>Plan {i + 1}</legend>
              {(['purpose', 'subject', 'action', 'framing', 'camera', 'lighting', 'environment', 'narration'] as const).map((c) => (
                <div key={c}><label htmlFor={`${id}-${i}-${c}`} style={etiquette}>{({ purpose: 'Fonction narrative', subject: 'Sujet *', action: 'Action *', framing: 'Cadrage', camera: 'Caméra *', lighting: 'Lumière', environment: 'Décor', narration: 'Narration (dite)' })[c]}</label>
                  <input id={`${id}-${i}-${c}`} value={s[c]} onChange={(e) => maj(i, c, e.target.value)} style={champ} /></div>
              ))}
              <div><label htmlFor={`${id}-${i}-ecran`} style={etiquette}>Texte écran (lu)</label>
                <input id={`${id}-${i}-ecran`} value={s.onScreenText.join(' / ')} onChange={(e) => maj(i, 'onScreenText', e.target.value.split('/').map((t) => t.trim()).filter(Boolean))} style={champ} /></div>
              <div><label htmlFor={`${id}-${i}-duree`} style={etiquette}>Durée (s)</label>
                <input id={`${id}-${i}-duree`} type="number" min={1} max={60} step={0.1} value={s.estimatedDurationMs / 1000} onChange={(e) => maj(i, 'estimatedDurationMs', Math.round(Number(e.target.value) * 1000))} style={champ} /></div>
              {refs.length > 0 && (
                <div style={{ display: 'grid', gap: 4 }}><span style={etiquette}>Références citées</span>
                  {refs.map((r) => (
                    <label key={r} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: CIBLE, fontSize: 14, color: 'var(--ink-2)' }}>
                      <input type="checkbox" checked={s.referenceIds.includes(r)} onChange={(e) => maj(i, 'referenceIds', e.target.checked ? [...s.referenceIds, r] : s.referenceIds.filter((x) => x !== r))} style={{ width: 20, height: 20 }} />{r}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
          <div style={rangee}>
            <Bouton nom="voir-scenario" actif={!p.enCours && !p.apercu} enCours={false} libelle="Voir l’impact du scénario" surClic={() => p.surPrevoir({ type: 'scenario', plans: saisies.map((s, i) => ({ shotId: ids[i]!, ...s })) })} />
            <span style={mini}>Sujet, action et caméra sont obligatoires · chaque champ reste distinct.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryboardEnAttente({ s, p }: { s: StoryboardPropose; p: ProprietesVueVideo }) {
  return (
    <div style={{ ...carte, border: '2px solid var(--accent-strong)' }} data-zone="storyboard-propose">
      <h3 style={{ ...titre, fontSize: 16 }}>Storyboard proposé · {s.plans.length} plan{s.plans.length > 1 ? 's' : ''} · {dureeLisible(s.totalMs)} estimées</h3>
      {s.avertissements.map((a) => <p key={a} style={signal('warn')}>{a}</p>)}
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
        {s.plans.map((pl) => (
          <li key={pl.shotId} style={texte} data-plan-propose={pl.shotId}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{pl.purpose || 'Plan'}</span> · sujet : {pl.subject} · action : {pl.action} · caméra : {pl.camera}
            {pl.narration ? ` · narration : « ${pl.narration} »` : ' · sans narration'}{pl.onScreenText.length ? ` · texte écran : « ${pl.onScreenText.join(' · ')} »` : ' · sans texte écran'} · {dureeLisible(pl.estimatedDurationMs)}
          </li>
        ))}
      </ol>
      <div style={rangee}>
        <Bouton nom="retenir-storyboard" actif={!p.enCours && !p.apercu} enCours={false} libelle="Voir l’impact et retenir" surClic={p.surRetenirStoryboard} />
        <Bouton nom="ecarter-storyboard" primaire={false} actif={!p.enCours} enCours={false} libelle="Écarter" surClic={p.surEcarterStoryboard} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Timeline ────────────────────────────────── */

function Timeline({ p }: { p: ProprietesVueVideo }) {
  const v = p.vue;
  const id = useId();
  const t = v.contenu.timeline;
  const [musique, setMusique] = useState(t?.music?.assetId ?? v.musiques[0]?.assetId ?? '');
  const [gain, setGain] = useState(t?.music?.gainDb ?? -12);
  const libre = !p.enCours && !p.apercu && v.disponibilite.montage.disponible;
  const pistes = t ? Object.values(t.tracks).sort((a, b) => a.z - b.z) : [];
  const NOMS: Record<string, string> = { video: 'Piste images', audio: 'Piste voix', overlay: 'Piste texte écran', subtitle: 'Piste sous-titres' };
  return (
    <div style={carte} data-zone="timeline">
      <h3 style={{ ...titre, fontSize: 16 }}>Timeline · {dureeLisible(v.dureeTotaleMs)}{t ? ` · ${t.fps.num}/${t.fps.den} images par seconde` : ''}</h3>
      {v.segments.length === 0 ? <p style={texte}>Aucun plan · la timeline se construit avec le scénario.</p> : (
        <div style={{ ...tuile, display: 'flex', width: '100%', minHeight: CIBLE, overflow: 'hidden' }} role="list" aria-label="Ordre et durée des plans">
          {v.segments.map((s) => (
            <div key={s.shotId} role="listitem" data-segment={s.shotId} style={{ flex: `${s.dureeMs} 0 0`, minWidth: 0, padding: '6px 8px', background: s.rang % 2 ? 'var(--rail)' : 'var(--surface)', borderRight: '1px solid var(--line-2)', fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {s.rang} · {dureeLisible(s.dureeMs)}
            </div>
          ))}
        </div>
      )}
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }} data-pistes>
        {pistes.map((pi) => <li key={pi.id} style={mini}>{NOMS[pi.kind] ?? pi.kind} · {Object.keys(pi.items).length} segment{Object.keys(pi.items).length > 1 ? 's' : ''}</li>)}
        <li style={mini} data-musique>{t?.music ? `Musique · gain ${String(t.music.gainDb).replace('.', ',')} dB` : 'Musique · aucune'}</li>
        <li style={mini} data-sous-titres>{t?.subtitles.enabled === false ? 'Sous-titres coupés' : 'Sous-titres activés · posés sur la narration validée'}</li>
      </ul>
      {v.sansTexte
        ? <p style={signal('info')} data-sans-texte="oui">Vidéo sans texte · aucune surimpression ni sous-titre ne sera posé. Les images clés à venir interdisent le texte dans les pixels.</p>
        : (
          <div style={rangee}>
            <Bouton nom="sans-texte" primaire={false} actif={libre && v.segments.length > 0} enCours={false} libelle="Retirer texte écran et sous-titres" surClic={() => p.surPrevoir({ type: 'sans_texte' })} />
            <span style={mini}>Aucun overlay ne sera généré · le texte déjà incrusté dans une image produite est signalé, pas effacé.</span>
          </div>
        )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
        <div><label htmlFor={`${id}-mu`} style={etiquette}>Piste musicale</label>
          <select id={`${id}-mu`} value={musique} onChange={(e) => setMusique(e.target.value)} style={champ} disabled={v.musiques.length === 0}>
            {v.musiques.length === 0 && <option value="">Aucune piste audio importée</option>}
            {v.musiques.map((m) => <option key={m.assetId} value={m.assetId}>{m.libelle}</option>)}
          </select></div>
        <div><label htmlFor={`${id}-g`} style={etiquette}>Gain (dB, de {GAIN_MUSIQUE_MIN_DB} à +{GAIN_MUSIQUE_MAX_DB})</label>
          <input id={`${id}-g`} type="number" min={GAIN_MUSIQUE_MIN_DB} max={GAIN_MUSIQUE_MAX_DB} step={0.5} value={gain} onChange={(e) => setGain(Number(e.target.value))} style={champ} /></div>
        <div style={rangee}>
          <Bouton nom="musique" primaire={false} actif={libre && !!musique && v.segments.length > 0} enCours={false} libelle="Voir l’impact" surClic={() => p.surPrevoir({ type: 'musique', musique: { assetId: musique, gainDb: gain } })} etiquetteAria="Voir l’impact du réglage de la musique" />
          {t?.music && <Bouton nom="sans-musique" primaire={false} actif={libre} enCours={false} libelle="Retirer la musique" surClic={() => p.surPrevoir({ type: 'musique', musique: null })} />}
        </div>
      </div>
    </div>
  );
}

function CarteJob({ j, rangs }: { j: JobVideoVue; rangs: Record<string, number> }) {
  const sid = j.operation.slice('keyframe:'.length);
  return (
    <article style={carte} data-job={j.id} data-etat-job={j.etat}>
      <div style={rangee}>
        <span style={pastille(COULEUR_JOB[j.etat] ?? 'var(--accent-strong)')}>{j.libelleEtat}</span>
        <span style={mini}>Image clé · plan {rangs[sid] ?? sid} · lancée le {date(j.creeLe)} · {libelleCredits(j.creditsReserves)} réservé{j.creditsReserves > 1 ? 's' : ''}</span>
      </div>
      <p style={texte}>{j.message}</p>
      {j.raisonEchec && <p style={signal('err')}>Raison : {j.raisonEchec}</p>}
      {j.etat === 'completed' && <p style={mini}>Qualité · {j.libelleQualite}</p>}
    </article>
  );
}

/* ─────────────────────────────── Écran ───────────────────────────────────── */

export function VueVideo(p: ProprietesVueVideo) {
  const id = useId();
  const v = p.vue;
  const ordre = v.contenu.shots.order.filter((s) => v.contenu.shots.byId[s] && s !== 's_image');
  const rangs = Object.fromEntries(ordre.map((s, i) => [s, i + 1]));
  return (
    <section aria-labelledby={`${id}-titre`} style={panneau} data-zone="studio-video">
      <div style={{ display: 'grid', gap: 6 }}>
        <h2 id={`${id}-titre`} style={titre}>Storyboard et montage</h2>
        <p style={sousTitre}>Version {v.version.n} · {ordre.length} plan{ordre.length > 1 ? 's' : ''} · {dureeLisible(v.dureeTotaleMs)} · images clés {v.format.largeur} × {v.format.hauteur} ({v.format.libelle}{v.format.depuisBrief ? ', lu dans le brief' : ', défaut'}). Chaque changement montre son impact avant d’être enregistré ; rien de payant ne part sans ton clic.</p>
      </div>
      {!v.disponibilite.animation.disponible && <p style={signal('warn')} data-zone="animation" data-indisponible="animation"><span style={{ fontWeight: 600 }}>{LIBELLE_ANIMATION_INDISPONIBLE}.</span> {v.disponibilite.animation.raison}</p>}
      {p.retour && (
        <div role={p.retour.ok ? 'status' : 'alert'} style={signal(p.retour.ok ? 'ok' : 'err')} data-retour={p.retour.ok ? 'ok' : 'refus'}>
          <span style={{ fontWeight: 600 }}>{p.retour.ok ? 'Fait · ' : 'Refusé · '}</span>{p.retour.texte}
        </div>
      )}
      {p.apercu && <Apercu a={p.apercu} p={p} />}
      {p.questions.length > 0 && (
        <div style={signal('info')} data-champ="questions">
          <p style={{ ...texte, color: 'var(--ink)' }}>Le modèle demande des précisions avant de proposer :</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{p.questions.map((q) => <li key={q} style={texte}>{q}</li>)}</ul>
        </div>
      )}
      {p.storyboard && <StoryboardEnAttente s={p.storyboard} p={p} />}
      <div style={{ display: 'grid', gap: 12 }} data-zone="storyboard">
        {ordre.length === 0
          ? <p style={texte} data-etat="sans-plan">Aucun plan pour l’instant · propose un storyboard depuis le brief ou écris les plans à la main.</p>
          : ordre.map((sid, i) => <CartePlan key={sid} plan={v.contenu.shots.byId[sid]!} rang={i + 1} total={ordre.length} p={p} />)}
      </div>
      <Timeline p={p} />
      <FormulaireScenario p={p} />
      <div style={carte} data-zone="jobs">
        <h3 style={{ ...titre, fontSize: 16 }}>Générations d’images clés</h3>
        {v.jobs.length === 0 ? <p style={texte} data-etat="sans-job">Aucune image clé lancée pour ce projet.</p> : v.jobs.map((j) => <CarteJob key={j.id} j={j} rangs={rangs} />)}
      </div>
    </section>
  );
}
