'use client';

import { useId, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../../components/Modal';
import {
  importerPackAction, validerVersionAction, evaluerReleaseAction, retirerReleaseAction, creerReleaseAction,
  publierReleaseAction, rollbackReleaseAction, enregistrerBrouillonAction, type ReponseAdmin,
} from '../../../actions/studios/prompts';

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
