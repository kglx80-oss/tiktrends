'use client';

import { useId, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../../components/Modal';
import {
  importerPackAction, validerVersionAction, evaluerReleaseAction, retirerReleaseAction, creerReleaseAction,
  publierReleaseAction, rollbackReleaseAction, revoquerReleaseAction, enregistrerBrouillonAction, approuverBenchmarkAction, type ReponseAdmin,
} from '../../../actions/studios/prompts';
import { approuverBudgetBenchmarkAction, joindreFichesBenchmarkAction, type ReponseBenchmark } from '../../../../lib/studios/benchmark/actions';

/**
 * Gestes de l'écran « IA et Studios » · chaque bouton appelle UNE commande
 * serveur gardée (`actions/studios/prompts.ts`), puis recharge l'écran. Le
 * retour (succès, motifs de refus, identifiant de trace) s'affiche sous le
 * bouton, annoncé aux lecteurs d'écran. Les gestes publics (publier, revenir
 * à une release) passent par la fenêtre de confirmation partagée (`Modal`).
 */

const CIBLE = 44;
export const bouton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE, padding: '10px 16px', borderRadius: 999,
  border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
export const boutonSecondaire: CSSProperties = { ...bouton, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line-2)', fontWeight: 600 };
const champ: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: CIBLE, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit', lineHeight: 1.5,
};

type Commande = 'importer' | 'valider' | 'evaluer' | 'retirer' | 'creerRelease';
const ACTIONS: Record<Commande, (p: never) => Promise<ReponseAdmin<Record<string, unknown>>>> = {
  importer: importerPackAction as never,
  valider: validerVersionAction as never,
  evaluer: evaluerReleaseAction as never,
  retirer: retirerReleaseAction as never,
  creerRelease: creerReleaseAction as never,
};

function Retour({ r, succes }: { r: ReponseAdmin<Record<string, unknown>> | null; succes: string }) {
  if (!r) return null;
  if (r.ok) return <p role="status" style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ok)', fontWeight: 600 }}>{succes}</p>;
  return (
    <div role="alert" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(229,72,77,.45)', background: 'rgba(229,72,77,.08)', color: 'var(--ink)', fontSize: 13.5 }}>
      <b style={{ color: 'var(--err)' }}>{r.message}</b>
      {r.constats.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {r.constats.slice(0, 12).map((c, i) => <li key={i} style={{ marginTop: 3, overflowWrap: 'anywhere' }}><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.code}</code> · {c.message}</li>)}
          {r.constats.length > 12 && <li>… et {r.constats.length - 12} autre(s).</li>}
        </ul>
      )}
      {r.traceId && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>Identifiant support · <code>{r.traceId}</code></p>}
    </div>
  );
}

export function BoutonCommande({ commande, charge, libelle, succes, secondaire }: { commande: Commande; charge?: Record<string, unknown>; libelle: string; succes: string; secondaire?: boolean }) {
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  return (
    <div>
      <button type="button" disabled={enCours} aria-busy={enCours} style={{ ...(secondaire ? boutonSecondaire : bouton), opacity: enCours ? 0.6 : 1 }}
        onClick={() => demarrer(async () => { const x = await ACTIONS[commande]((charge ?? {}) as never); setR(x); if (x.ok) router.refresh(); })}>
        {enCours ? 'En cours…' : libelle}
      </button>
      <Retour r={r} succes={succes} />
    </div>
  );
}

/** Confirmation des gestes publics · la fenêtre partagée (`Modal` : Portail, focus piégé, Échap, focus rendu). */
export function BoutonConfirme({ geste, releaseId, attendue, libelle, titre, explication, secondaire }: {
  geste: 'publier' | 'rollback'; releaseId: string; attendue: string | null; libelle: string; titre: string; explication: string[]; secondaire?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const confirmer = () => demarrer(async () => {
    const action = geste === 'publier' ? publierReleaseAction : rollbackReleaseAction;
    const x = await action({ releaseId, attendue, confirme: true });
    setR(x as ReponseAdmin<Record<string, unknown>>);
    setOuvert(false);
    if (x.ok) router.refresh();
  });

  return (
    <div>
      <button type="button" style={secondaire ? boutonSecondaire : bouton} aria-haspopup="dialog" onClick={() => { setR(null); setOuvert(true); }}>{libelle}</button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title={titre} subtitle="Geste public · tracé dans l’audit." maxWidth={520}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {explication.map((t) => <li key={t} style={{ marginTop: 4 }}>{t}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={boutonSecondaire} onClick={() => setOuvert(false)}>Annuler</button>
          <button type="button" style={{ ...bouton, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={confirmer}>{enCours ? 'En cours…' : libelle}</button>
        </div>
      </Modal>
      <Retour r={r} succes={geste === 'publier' ? 'Release publiée · les prochaines résolutions l’utilisent.' : 'Retour effectué · les prochaines résolutions utilisent cette release.'} />
    </div>
  );
}

/** Révoquer une release · geste d'urgence, motif obligatoire, tracé dans l'audit. */
export function BoutonRevoquer({ releaseId }: { releaseId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  const confirmer = () => demarrer(async () => {
    const x = await revoquerReleaseAction({ releaseId, motif, confirme: true });
    setR(x as ReponseAdmin<Record<string, unknown>>);
    if (x.ok) { setOuvert(false); router.refresh(); }
  });
  return (
    <div>
      <button type="button" style={boutonSecondaire} aria-haspopup="dialog" onClick={() => { setR(null); setOuvert(true); }}>Révoquer</button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Révoquer cette release ?" subtitle="Geste d’urgence · tracé dans l’audit." maxWidth={520}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          <li>Plus aucune tâche studio ni nouveau devis ne l’utilise, même les jobs déjà épinglés sur elle.</li>
          <li>Jarvis garde sa consigne 1.0.0 tant qu’elle reste pointée · publie ou reviens à une autre release.</li>
          <li>Rien n’est effacé, et une révocation ne se défait pas.</li>
        </ul>
        <label htmlFor={id} style={{ display: 'block', marginTop: 14, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Motif</label>
        <textarea id={id} value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} style={{ ...champ, marginTop: 6, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={boutonSecondaire} onClick={() => setOuvert(false)}>Annuler</button>
          <button type="button" style={{ ...bouton, opacity: enCours || !motif.trim() ? 0.6 : 1 }} disabled={enCours || !motif.trim()} onClick={confirmer}>{enCours ? 'En cours…' : 'Révoquer'}</button>
        </div>
        <Retour r={r} succes="Release révoquée." />
      </Modal>
      {r?.ok && <Retour r={r} succes="Release révoquée · plus aucune résolution ne l’utilise." />}
    </div>
  );
}

export interface ChampEditable { champ: string; libelle: string; valeur: string; liste?: boolean }

/** Édition d'un brouillon (en place) ou création d'une nouvelle version depuis une version figée. */
export function EditeurBrouillon({ baseId, champs, empreinteAttendue, brouillon }: { baseId: string; champs: ChampEditable[]; empreinteAttendue: string; brouillon: boolean }) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => Object.fromEntries(champs.map((c) => [c.champ, c.valeur])));
  const [motif, setMotif] = useState('');
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  const envoyer = () => demarrer(async () => {
    const modifies: Record<string, unknown> = {};
    for (const c of champs) {
      const v = valeurs[c.champ] ?? '';
      if (v === c.valeur) continue;
      modifies[c.champ] = c.liste ? v.split('\n').map((x) => x.replace(/^·\s*/, '').trim()).filter(Boolean) : v;
    }
    const x = await enregistrerBrouillonAction({ baseId, champs: modifies, motif, empreinteAttendue });
    setR(x as ReponseAdmin<Record<string, unknown>>);
    if (x.ok) router.refresh();
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); envoyer(); }} style={{ display: 'grid', gap: 12 }}>
      {champs.map((c) => (
        <div key={c.champ}>
          <label htmlFor={`${id}-${c.champ}`} style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 600 }}>{c.libelle}{c.liste ? ' · une entrée par ligne' : ''}</label>
          <textarea id={`${id}-${c.champ}`} value={valeurs[c.champ] ?? ''} rows={Math.min(14, Math.max(2, (valeurs[c.champ] ?? '').split('\n').length + 1))}
            onChange={(e) => setValeurs((v) => ({ ...v, [c.champ]: e.target.value }))} style={{ ...champ, resize: 'vertical' }} />
        </div>
      ))}
      <div>
        <label htmlFor={`${id}-motif`} style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 600 }}>Motif de la modification (entre dans l’audit)</label>
        <input id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} style={champ} />
      </div>
      <div><button type="submit" disabled={enCours} style={{ ...bouton, opacity: enCours ? 0.6 : 1 }}>{enCours ? 'Enregistrement…' : brouillon ? 'Enregistrer le brouillon' : 'Créer un brouillon (nouvelle version)'}</button></div>
      <Retour r={r} succes={brouillon ? 'Brouillon enregistré.' : 'Nouvelle version créée en brouillon.'} />
    </form>
  );
}

/** Création d'une release `staged` depuis les dernières versions validées. */
export function FormulaireRelease() {
  const [motif, setMotif] = useState('');
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  return (
    <form onSubmit={(e) => { e.preventDefault(); demarrer(async () => { const x = await creerReleaseAction({ motif }); setR(x as ReponseAdmin<Record<string, unknown>>); if (x.ok) router.refresh(); }); }} style={{ display: 'grid', gap: 10 }}>
      <label htmlFor={`${id}-motif`} style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>Motif de la release</label>
      <input id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} style={champ} placeholder="Ex. éclairage plus chaud sur la recette photo" />
      <div><button type="submit" disabled={enCours} style={{ ...bouton, opacity: enCours ? 0.6 : 1 }}>{enCours ? 'Création…' : 'Créer la release (staged)'}</button></div>
      <Retour r={r} succes="Release créée en attente (staged) · évalue-la avant de la publier." />
    </form>
  );
}

/* ───────────────────────── Benchmark F01-F24 (lot F-D) ─────────────────── */

function RetourBenchmark({ r, succes }: { r: ReponseBenchmark<Record<string, unknown>> | null; succes: string }) {
  if (!r) return null;
  if (r.ok) return <p role="status" style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ok)', fontWeight: 600 }}>{succes}</p>;
  return (
    <div role="alert" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(229,72,77,.45)', background: 'rgba(229,72,77,.08)', color: 'var(--ink)', fontSize: 13.5 }}>
      <b style={{ color: 'var(--err)' }}>{r.message}</b>
      {r.motifs && r.motifs.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{r.motifs.slice(0, 12).map((c, i) => <li key={i} style={{ marginTop: 3, overflowWrap: 'anywhere' }}><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.code}</code> · {c.message}</li>)}</ul>}
      {r.traceId && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>Identifiant support · <code>{r.traceId}</code></p>}
    </div>
  );
}

const etiquette: CSSProperties = { display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6, fontWeight: 600 };

/** Approbation d'un budget · le prix (devis) est affiché AVANT le clic, la confirmation le répète. */
export function FormulaireBudgetBenchmark({ releases, devisLisible, devisUsd, devisMaximum = false }: { releases: Array<{ id: string; libelle: string }>; devisLisible: string; devisUsd: number; devisMaximum?: boolean }) {
  // R3 · « au plus » seulement quand le devis est une borne ; sinon, une estimation qui le dit.
  const nature = devisMaximum ? 'au plus' : '· estimation, maximum non garanti';
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? '');
  const [budget, setBudget] = useState((Math.ceil(devisUsd * 1000) / 1000).toFixed(3).replace('.', ','));
  const [motif, setMotif] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [r, setR] = useState<ReponseBenchmark<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  const confirmer = () => demarrer(async () => {
    const x = await approuverBudgetBenchmarkAction({ releaseId, budgetUsd: budget, motif });
    setR(x as ReponseBenchmark<Record<string, unknown>>);
    setOuvert(false);
    if (x.ok) router.refresh();
  });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 14 }}>Devis du benchmark complet : <b>{devisLisible}</b> {nature}.</p>
      <div><label htmlFor={`${id}-release`} style={etiquette}>Release évaluée</label>
        <select id={`${id}-release`} value={releaseId} onChange={(e) => setReleaseId(e.target.value)} style={champ}>{releases.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></div>
      <div><label htmlFor={`${id}-budget`} style={etiquette}>Budget maximal (dollars)</label>
        <input id={`${id}-budget`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} style={champ} /></div>
      <div><label htmlFor={`${id}-motif`} style={etiquette}>Motif (entre dans l’audit)</label>
        <input id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} style={champ} /></div>
      <div><button type="button" style={{ ...bouton, opacity: motif.trim() && releaseId ? 1 : 0.6 }} disabled={!motif.trim() || !releaseId} aria-haspopup="dialog" onClick={() => { setR(null); setOuvert(true); }}>Approuver ce budget…</button></div>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title={`Approuver ${budget.replace('.', ',').trim()} $ ?`} subtitle="Dépense réelle possible · tracée dans l’audit." maxWidth={520}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          <li>Devis recalculé par le serveur : {devisLisible} {nature}.</li>
          <li>Budget approuvé : {budget.replace('.', ',')} $ · il doit couvrir le devis et tenir dans le reste du plafond de dépense.</li>
          <li>Valable 24 h, pour UNE campagne, sur cette release et ce devis seulement.</li>
          <li>Rien n’est lancé ici : la campagne part de la commande réelle, qui revérifie tout.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={boutonSecondaire} onClick={() => setOuvert(false)}>Annuler</button>
          <button type="button" style={{ ...bouton, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={confirmer}>{enCours ? 'En cours…' : 'Approuver'}</button>
        </div>
      </Modal>
      <RetourBenchmark r={r} succes={`Budget approuvé${r?.ok && r.donnees ? ` · approbation ${String((r.donnees as { approbationId?: string }).approbationId)} valable jusqu’au ${String((r.donnees as { expireLe?: string }).expireLe).slice(0, 16).replace('T', ' ')}` : ''}.`} />
    </div>
  );
}

/** Fiches humaines · le contenu de rapport.json et des fiche-revue.json remplies. */
export function FormulaireFichesBenchmark({ releases }: { releases: Array<{ id: string; libelle: string }> }) {
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? '');
  const [rapport, setRapport] = useState('');
  const [fiches, setFiches] = useState('');
  const [r, setR] = useState<ReponseBenchmark<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  return (
    <form onSubmit={(e) => { e.preventDefault(); demarrer(async () => { const x = await joindreFichesBenchmarkAction({ releaseId, rapport, fiches }); setR(x as ReponseBenchmark<Record<string, unknown>>); if (x.ok) router.refresh(); }); }} style={{ display: 'grid', gap: 10 }}>
      <div><label htmlFor={`${id}-release`} style={etiquette}>Release</label>
        <select id={`${id}-release`} value={releaseId} onChange={(e) => setReleaseId(e.target.value)} style={champ}>{releases.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></div>
      <div><label htmlFor={`${id}-rapport`} style={etiquette}>Contenu de rapport.json (campagne RÉELLE)</label>
        <textarea id={`${id}-rapport`} value={rapport} onChange={(e) => setRapport(e.target.value)} rows={4} style={{ ...champ, resize: 'vertical' }} /></div>
      <div><label htmlFor={`${id}-fiches`} style={etiquette}>Fiches remplies · liste JSON des fiche-revue.json</label>
        <textarea id={`${id}-fiches`} value={fiches} onChange={(e) => setFiches(e.target.value)} rows={4} style={{ ...champ, resize: 'vertical' }} /></div>
      <div><button type="submit" disabled={enCours || !rapport.trim() || !fiches.trim()} style={{ ...bouton, opacity: enCours || !rapport.trim() || !fiches.trim() ? 0.6 : 1 }}>{enCours ? 'Vérification…' : 'Joindre les fiches'}</button></div>
      <RetourBenchmark r={r} succes={r?.ok && (r.donnees as { passed?: boolean } | undefined)?.passed ? 'Fiches jointes · évaluation réelle passée.' : 'Fiches jointes · l’évaluation n’est pas passée (voir la liste).'} />
    </form>
  );
}

/** Geste « Benchmark approuvé » · confirmation explicite, motif obligatoire. */
export function BoutonBenchmarkApprouve({ releaseId, evaluations }: { releaseId: string; evaluations: Array<{ id: string; libelle: string }> }) {
  const [evaluationId, setEvaluationId] = useState(evaluations[0]?.id ?? '');
  const [motif, setMotif] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [r, setR] = useState<ReponseAdmin<Record<string, unknown>> | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const id = useId();
  const confirmer = () => demarrer(async () => {
    const x = await approuverBenchmarkAction({ releaseId, evaluationId, motif, confirme: true });
    setR(x as ReponseAdmin<Record<string, unknown>>);
    setOuvert(false);
    if (x.ok) router.refresh();
  });
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <div><label htmlFor={`${id}-ev`} style={etiquette}>Évaluation réelle passée</label>
        <select id={`${id}-ev`} value={evaluationId} onChange={(e) => setEvaluationId(e.target.value)} style={champ}>{evaluations.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</select></div>
      <div><label htmlFor={`${id}-motif`} style={etiquette}>Motif (entre dans l’audit)</label>
        <input id={`${id}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} style={champ} /></div>
      <div><button type="button" style={{ ...bouton, opacity: motif.trim() ? 1 : 0.6 }} disabled={!motif.trim()} aria-haspopup="dialog" onClick={() => { setR(null); setOuvert(true); }}>Benchmark approuvé…</button></div>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Approuver le benchmark de cette release ?" subtitle="Décision nominative · tracée dans l’audit." maxWidth={520}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          <li>La release devient publiable en production (la publication reste un geste séparé).</li>
          <li>Le serveur revérifie : évaluation réelle passée sur cette empreinte, fiches remplies et nommées.</li>
          <li>Rien n’est publié automatiquement.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={boutonSecondaire} onClick={() => setOuvert(false)}>Annuler</button>
          <button type="button" style={{ ...bouton, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={confirmer}>{enCours ? 'En cours…' : 'Benchmark approuvé'}</button>
        </div>
      </Modal>
      <Retour r={r} succes="Benchmark approuvé · la release reste en attente, à publier par un geste séparé." />
    </div>
  );
}
