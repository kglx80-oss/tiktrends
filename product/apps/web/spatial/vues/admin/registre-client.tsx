'use client';

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { messageHorsLigneStudio } from '@tiktrends/core';
import {
  importerPackAction, validerVersionAction, evaluerReleaseAction, retirerReleaseAction, creerReleaseAction,
  publierReleaseAction, rollbackReleaseAction, revoquerReleaseAction, enregistrerBrouillonAction, validerImportsAction,
  approuverBenchmarkAction, approuverRecetteManuelleAction,
} from '../../../app/actions/studios/prompts';
import { approuverBudgetBenchmarkAction, joindreFichesBenchmarkAction } from '../../../lib/studios/benchmark/actions';
import type { ChampEditable } from '../../../lib/studios/prompts/vues-registre';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * Les gestes du registre de prompts dans Spatial (ancien « IA et Studios »).
 * Chaque bouton appelle UNE commande serveur EXISTANTE et gardée
 * (`actions/studios/prompts`, `lib/studios/benchmark/actions` · la garde
 * plateforme est reposée dans chacune), puis recharge l'écran. Le retour
 * (succès, motifs de refus, identifiant de trace) s'affiche sous le geste et
 * prend le focus. Les gestes publics (publier, revenir, révoquer, approuver)
 * passent par une fenêtre de confirmation. Une requête qui n'aboutit pas
 * (hors ligne) rend un refus lisible, jamais un écran cassé.
 */

interface Retour { ok: boolean; message?: string; constats?: ReadonlyArray<{ code: string; message: string }>; motifs?: ReadonlyArray<{ code: string; message: string }>; traceId?: string; donnees?: unknown }

const HORS_LIGNE: Retour = { ok: false, message: `Hors ligne · ${messageHorsLigneStudio('commande')}`, constats: [] };
async function sansPanne(appel: () => Promise<unknown>): Promise<Retour> {
  try { return (await appel()) as Retour; } catch { return HORS_LIGNE; }
}

function RetourGeste({ r, succes }: { r: Retour | null; succes: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (r) ref.current?.focus(); }, [r]);
  if (!r) return null;
  if (r.ok) return <div ref={ref} tabIndex={-1} role="status" className="pill g" style={{ marginTop: 8, whiteSpace: 'normal', outline: 0 }}>{succes}</div>;
  const liste = [...(r.constats ?? []), ...(r.motifs ?? [])];
  return (
    <div ref={ref} tabIndex={-1} role="alert" style={{ marginTop: 8, display: 'grid', gap: 4, outline: 0 }}>
      <span className="pill r" style={{ whiteSpace: 'normal', justifySelf: 'start' }}>{r.message ?? 'Refusé.'}</span>
      {liste.length > 0 && (
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {liste.slice(0, 12).map((c, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><code className="mono">{c.code}</code> · {c.message}</li>)}
          {liste.length > 12 && <li>… et {liste.length - 12} autre(s).</li>}
        </ul>
      )}
      {r.traceId && <small className="faint">Identifiant support · <code className="mono">{r.traceId}</code></small>}
    </div>
  );
}

function useGeste() {
  const [r, setR] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const lancer = (appel: () => Promise<unknown>, apres?: (x: Retour) => void) => demarrer(async () => {
    const x = await sansPanne(appel);
    setR(x);
    apres?.(x);
    if (x.ok) router.refresh();
  });
  return { r, setR, enCours, lancer };
}

type Commande = 'importer' | 'validerImports' | 'valider' | 'evaluer' | 'retirer';
const COMMANDES: Record<Commande, (charge: Record<string, unknown>) => Promise<unknown>> = {
  importer: () => importerPackAction(),
  validerImports: () => validerImportsAction(),
  valider: (c) => validerVersionAction({ id: c.id }),
  evaluer: (c) => evaluerReleaseAction({ releaseId: c.releaseId }),
  retirer: (c) => retirerReleaseAction({ releaseId: c.releaseId }),
};

/** Une commande sans saisie (importer, valider, évaluer, retirer). */
export function CommandeRegistre({ commande, charge = {}, libelle, succes, principal = false }: { commande: Commande; charge?: Record<string, unknown>; libelle: string; succes: string; principal?: boolean }) {
  const g = useGeste();
  return (
    <div>
      <button className={principal ? 'btn sm pri' : 'btn sm'} type="button" disabled={g.enCours} aria-busy={g.enCours} data-commande={commande}
        onClick={() => g.lancer(() => COMMANDES[commande](charge))}>{g.enCours ? 'En cours…' : libelle}</button>
      <RetourGeste r={g.r} succes={succes} />
    </div>
  );
}

function Confirmation({ ouvert, fermer, titre, sousTitre, points, children, pied }: { ouvert: boolean; fermer: () => void; titre: string; sousTitre: string; points: readonly string[]; children?: ReactNode; pied: ReactNode }) {
  return (
    <DialogueSpatial titre={titre} ouvert={ouvert} fermer={fermer}>
      <small className="faint">{sousTitre}</small>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: '12.5px', display: 'grid', gap: 4 }}>{points.map((t) => <li key={t}>{t}</li>)}</ul>
      {children}
      <div className="kc">{pied}</div>
    </DialogueSpatial>
  );
}

/** Publier une release, ou revenir à une release publiée · geste public, confirmé. */
export function ReleaseConfirmee({ geste, releaseId, attendue, libelle, titre, explication, principal = true }: {
  geste: 'publier' | 'rollback'; releaseId: string; attendue: string | null; libelle: string; titre: string; explication: readonly string[]; principal?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const g = useGeste();
  const confirmer = () => g.lancer(() => (geste === 'publier' ? publierReleaseAction : rollbackReleaseAction)({ releaseId, attendue, confirme: true }), () => setOuvert(false));
  return (
    <div>
      <button className={principal ? 'btn sm pri' : 'btn sm'} type="button" aria-haspopup="dialog" data-geste={geste} onClick={() => { g.setR(null); setOuvert(true); }}>{libelle}</button>
      <Confirmation ouvert={ouvert} fermer={() => setOuvert(false)} titre={titre} sousTitre="Geste public · tracé dans l’audit." points={explication}
        pied={<><button className="btn sm pri" type="button" disabled={g.enCours} onClick={confirmer}>{g.enCours ? 'En cours…' : libelle}</button><button className="btn sm" type="button" onClick={() => setOuvert(false)}>Annuler</button></>} />
      <RetourGeste r={g.r} succes={geste === 'publier' ? 'Release publiée · les prochaines résolutions l’utilisent.' : 'Retour effectué · les prochaines résolutions utilisent cette release.'} />
    </div>
  );
}

/** Révoquer une release · geste d'urgence, motif obligatoire, tracé dans l'audit. */
export function RevoquerRelease({ releaseId }: { releaseId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const g = useGeste();
  const id = useId();
  const confirmer = () => g.lancer(() => revoquerReleaseAction({ releaseId, motif, confirme: true }), (x) => { if (x.ok) setOuvert(false); });
  return (
    <div>
      <button className="btn sm" type="button" aria-haspopup="dialog" data-geste="revoquer" onClick={() => { g.setR(null); setOuvert(true); }}>Révoquer</button>
      <Confirmation ouvert={ouvert} fermer={() => setOuvert(false)} titre="Révoquer cette release ?" sousTitre="Geste d’urgence · tracé dans l’audit."
        points={['Plus aucune tâche studio ni nouveau devis ne l’utilise, même les jobs déjà épinglés sur elle.', 'Jarvis garde sa consigne 1.0.0 tant qu’elle reste pointée · publie ou reviens à une autre release.', 'Rien n’est effacé, et une révocation ne se défait pas.']}
        pied={<><button className="btn sm pri" type="button" disabled={g.enCours || !motif.trim()} onClick={confirmer}>{g.enCours ? 'En cours…' : 'Révoquer'}</button><button className="btn sm" type="button" onClick={() => setOuvert(false)}>Annuler</button></>}>
        <label className="field" htmlFor={id}>Motif<textarea id={id} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} style={{ font: '14px/1.5 var(--sf)' }} /></label>
        {!g.r?.ok && <RetourGeste r={g.r} succes="" />}
      </Confirmation>
      {g.r?.ok && <RetourGeste r={g.r} succes="Release révoquée · plus aucune résolution ne l’utilise." />}
    </div>
  );
}

/** Éditer un brouillon en place, ou créer une nouvelle version depuis une version figée. */
export function EditeurVersion({ baseId, champs, empreinteAttendue, brouillon }: { baseId: string; champs: readonly ChampEditable[]; empreinteAttendue: string; brouillon: boolean }) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => Object.fromEntries(champs.map((c) => [c.champ, c.valeur])));
  const [motif, setMotif] = useState('');
  const g = useGeste();
  const id = useId();
  const envoyer = () => {
    const modifies: Record<string, unknown> = {};
    for (const c of champs) {
      const v = valeurs[c.champ] ?? '';
      if (v === c.valeur) continue;
      modifies[c.champ] = c.liste ? v.split('\n').map((x) => x.replace(/^·\s*/, '').trim()).filter(Boolean) : v;
    }
    g.lancer(() => enregistrerBrouillonAction({ baseId, champs: modifies, motif, empreinteAttendue }));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); envoyer(); }} style={{ display: 'grid', gap: 12 }} data-editeur={brouillon ? 'brouillon' : 'nouvelle-version'}>
      {champs.map((c) => (
        <label key={c.champ} className="field" htmlFor={`${id}-${c.champ}`}>{c.libelle}{c.liste ? ' · une entrée par ligne' : ''}
          <textarea id={`${id}-${c.champ}`} value={valeurs[c.champ] ?? ''} rows={Math.min(14, Math.max(2, (valeurs[c.champ] ?? '').split('\n').length + 1))}
            onChange={(e) => setValeurs((v) => ({ ...v, [c.champ]: e.target.value }))} />
        </label>
      ))}
      <label className="field" htmlFor={`${id}-motif`}>Motif de la modification (entre dans l’audit)
        <input id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} />
      </label>
      <div className="kc"><button className="btn sm pri" type="submit" disabled={g.enCours}>{g.enCours ? 'Enregistrement…' : brouillon ? 'Enregistrer le brouillon' : 'Créer un brouillon (nouvelle version)'}</button></div>
      <RetourGeste r={g.r} succes={brouillon ? 'Brouillon enregistré.' : 'Nouvelle version créée en brouillon.'} />
    </form>
  );
}

/** Créer une release `staged` depuis les dernières versions validées. */
export function NouvelleRelease() {
  const [motif, setMotif] = useState('');
  const g = useGeste();
  const id = useId();
  return (
    <form onSubmit={(e) => { e.preventDefault(); g.lancer(() => creerReleaseAction({ motif })); }} style={{ display: 'grid', gap: 10 }} data-geste="creer-release">
      <label className="field" htmlFor={id}>Motif de la release<input id={id} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. éclairage plus chaud sur la recette photo" /></label>
      <div className="kc"><button className="btn sm pri" type="submit" disabled={g.enCours}>{g.enCours ? 'Création…' : 'Créer la release (en attente)'}</button></div>
      <RetourGeste r={g.r} succes="Release créée en attente · évalue-la avant de la publier." />
    </form>
  );
}

/** Approuver un budget de benchmark · le devis est affiché AVANT le clic, la confirmation le répète. Rien n'est lancé ici. */
export function BudgetBenchmark({ releases, devisLisible, devisUsd, devisMaximum = false }: { releases: ReadonlyArray<{ id: string; libelle: string }>; devisLisible: string; devisUsd: number; devisMaximum?: boolean }) {
  const nature = devisMaximum ? 'au plus' : '· estimation, maximum non garanti';
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? '');
  const [budget, setBudget] = useState((Math.ceil(devisUsd * 1000) / 1000).toFixed(3).replace('.', ','));
  const [motif, setMotif] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const g = useGeste();
  const id = useId();
  const donnees = (g.r?.ok ? g.r.donnees : null) as { approbationId?: string; expireLe?: string } | null;
  return (
    <div style={{ display: 'grid', gap: 10 }} data-geste="budget-benchmark">
      <p style={{ margin: 0, fontSize: 13 }}>Devis du benchmark complet · <b>{devisLisible}</b> {nature}.</p>
      <div className="fields">
        <label className="field" htmlFor={`${id}-r`}>Release évaluée<select id={`${id}-r`} value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>{releases.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></label>
        <label className="field" htmlFor={`${id}-b`}>Budget maximal (dollars)<input id={`${id}-b`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <label className="field" htmlFor={`${id}-m`}>Motif (entre dans l’audit)<input id={`${id}-m`} value={motif} onChange={(e) => setMotif(e.target.value)} /></label>
      </div>
      <div className="kc"><button className="btn sm pri" type="button" disabled={!motif.trim() || !releaseId} aria-haspopup="dialog" onClick={() => { g.setR(null); setOuvert(true); }}>Approuver ce budget…</button></div>
      <Confirmation ouvert={ouvert} fermer={() => setOuvert(false)} titre={`Approuver ${budget.replace('.', ',').trim()} $ ?`} sousTitre="Dépense réelle possible · tracée dans l’audit."
        points={[`Devis recalculé par le serveur · ${devisLisible} ${nature}.`, `Budget approuvé · ${budget.replace('.', ',')} $ · il doit couvrir le devis et tenir dans le reste du plafond de dépense.`, 'Valable 24 h, pour UNE campagne, sur cette release et ce devis seulement.', 'Rien n’est lancé ici · la campagne part de la commande réelle, qui revérifie tout.']}
        pied={<><button className="btn sm pri" type="button" disabled={g.enCours} onClick={() => g.lancer(() => approuverBudgetBenchmarkAction({ releaseId, budgetUsd: budget, motif }), () => setOuvert(false))}>{g.enCours ? 'En cours…' : 'Approuver'}</button><button className="btn sm" type="button" onClick={() => setOuvert(false)}>Annuler</button></>} />
      <RetourGeste r={g.r} succes={`Budget approuvé${donnees?.approbationId ? ` · approbation ${donnees.approbationId} valable jusqu’au ${String(donnees.expireLe ?? '').slice(0, 16).replace('T', ' ')}` : ''}.`} />
    </div>
  );
}

/** Joindre le rapport d'une campagne RÉELLE et les fiches de revue humaine. */
export function FichesBenchmark({ releases }: { releases: ReadonlyArray<{ id: string; libelle: string }> }) {
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? '');
  const [rapport, setRapport] = useState('');
  const [fiches, setFiches] = useState('');
  const g = useGeste();
  const id = useId();
  const vide = !rapport.trim() || !fiches.trim();
  const passe = (g.r?.ok ? (g.r.donnees as { passed?: boolean } | undefined)?.passed : false) === true;
  return (
    <form onSubmit={(e) => { e.preventDefault(); g.lancer(() => joindreFichesBenchmarkAction({ releaseId, rapport, fiches })); }} style={{ display: 'grid', gap: 10 }} data-geste="fiches-benchmark">
      <label className="field" htmlFor={`${id}-r`}>Release<select id={`${id}-r`} value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>{releases.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></label>
      <label className="field" htmlFor={`${id}-p`}>Contenu de rapport.json (campagne RÉELLE)<textarea id={`${id}-p`} rows={4} value={rapport} onChange={(e) => setRapport(e.target.value)} /></label>
      <label className="field" htmlFor={`${id}-f`}>Fiches remplies · liste JSON des fiche-revue.json<textarea id={`${id}-f`} rows={4} value={fiches} onChange={(e) => setFiches(e.target.value)} /></label>
      <div className="kc"><button className="btn sm pri" type="submit" disabled={g.enCours || vide}>{g.enCours ? 'Vérification…' : 'Joindre les fiches'}</button></div>
      <RetourGeste r={g.r} succes={passe ? 'Fiches jointes · évaluation réelle passée.' : 'Fiches jointes · l’évaluation n’est pas passée (voir la liste).'} />
    </form>
  );
}

/** « Benchmark approuvé » · décision nominative, motif obligatoire, confirmée. Ne publie rien. */
export function BenchmarkApprouve({ releaseId, evaluations }: { releaseId: string; evaluations: ReadonlyArray<{ id: string; libelle: string }> }) {
  const [evaluationId, setEvaluationId] = useState(evaluations[0]?.id ?? '');
  const [motif, setMotif] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const g = useGeste();
  const id = useId();
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }} data-geste="benchmark-approuve">
      <div className="fields">
        <label className="field" htmlFor={`${id}-e`}>Évaluation réelle passée<select id={`${id}-e`} value={evaluationId} onChange={(e) => setEvaluationId(e.target.value)}>{evaluations.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></label>
        <label className="field" htmlFor={`${id}-m`}>Motif (entre dans l’audit)<input id={`${id}-m`} value={motif} onChange={(e) => setMotif(e.target.value)} /></label>
      </div>
      <div className="kc"><button className="btn sm pri" type="button" disabled={!motif.trim()} aria-haspopup="dialog" onClick={() => { g.setR(null); setOuvert(true); }}>Benchmark approuvé…</button></div>
      <Confirmation ouvert={ouvert} fermer={() => setOuvert(false)} titre="Approuver le benchmark de cette release ?" sousTitre="Décision nominative · tracée dans l’audit."
        points={['La release devient publiable en production (la publication reste un geste séparé).', 'Le serveur revérifie · évaluation réelle passée sur cette empreinte, fiches remplies et nommées.', 'Rien n’est publié automatiquement.']}
        pied={<><button className="btn sm pri" type="button" disabled={g.enCours} onClick={() => g.lancer(() => approuverBenchmarkAction({ releaseId, evaluationId, motif, confirme: true }), () => setOuvert(false))}>{g.enCours ? 'En cours…' : 'Benchmark approuvé'}</button><button className="btn sm" type="button" onClick={() => setOuvert(false)}>Annuler</button></>} />
      <RetourGeste r={g.r} succes="Benchmark approuvé · la release reste en attente, à publier par un geste séparé." />
    </div>
  );
}

/** « Recette manuelle » · le propriétaire met la release en service SANS benchmark (mandat du 10/10). Motif, confirmation, audit. */
export function RecetteManuelle({ releaseId }: { releaseId: string }) {
  const [motif, setMotif] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const g = useGeste();
  const id = useId();
  return (
    <div style={{ display: 'grid', gap: 8, width: '100%' }} data-geste="recette-manuelle">
      <label className="field" htmlFor={id}>Motif de la mise en service sans benchmark (entre dans l’audit)<input id={id} value={motif} onChange={(e) => setMotif(e.target.value)} /></label>
      <div className="kc"><button className="btn sm" type="button" disabled={!motif.trim()} aria-haspopup="dialog" onClick={() => { g.setR(null); setOuvert(true); }}>Recette manuelle…</button></div>
      <Confirmation ouvert={ouvert} fermer={() => setOuvert(false)} titre="Mettre cette release en service sans benchmark ?" sousTitre="Décision nominative du propriétaire · tracée dans l’audit."
        points={['La release devient publiable en production sans benchmark réel · la qualité sera jugée par les tests manuels.', 'Le serveur revérifie · release en attente, non révoquée, tests structurels réussis sur cette empreinte.', 'Rien n’est publié automatiquement · « Publier la release » reste un geste séparé.']}
        pied={<><button className="btn sm pri" type="button" disabled={g.enCours} onClick={() => g.lancer(() => approuverRecetteManuelleAction({ releaseId, motif, confirme: true }), () => setOuvert(false))}>{g.enCours ? 'En cours…' : 'Accorder la recette manuelle'}</button><button className="btn sm" type="button" onClick={() => setOuvert(false)}>Annuler</button></>} />
      <RetourGeste r={g.r} succes="Accord enregistré · la release peut maintenant être publiée." />
    </div>
  );
}
