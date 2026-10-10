'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { CAPACITES_STUDIOS, CIBLE_TACTILE_MIN, DEFINITIONS_CAPACITES, type CapaciteStudio } from '@tiktrends/core';
import { enregistrerBudgetEssaiAction, enregistrerInterrupteursEspaceAction } from '../../../actions/studios/interrupteurs';

/**
 * Réglage d'UN espace · par capacité de portée espace : défaut, allumée
 * (pilote) ou coupée. Motif et confirmation obligatoires ; le serveur relit
 * la garde plateforme, valide, écrit et journalise dans une transaction.
 */

type Choix = 'defaut' | 'active' | 'coupee';

const champ: CSSProperties = { minHeight: CIBLE_TACTILE_MIN, fontSize: 16, padding: '0 10px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' };
const LIBELLE_CHOIX: Record<Choix, string> = { defaut: 'Défaut', active: 'Allumée (pilote)', coupee: 'Coupée' };

export function FormulaireEspace({ workspaceId, nom, actives, coupees }: { workspaceId: string; nom: string; actives: CapaciteStudio[]; coupees: CapaciteStudio[] }) {
  const router = useRouter();
  const reglables = CAPACITES_STUDIOS.filter((c) => DEFINITIONS_CAPACITES[c].portee === 'espace');
  const [choix, setChoix] = useState<Record<string, Choix>>(() => Object.fromEntries(reglables.map((c) => [c, coupees.includes(c) ? 'coupee' : actives.includes(c) ? 'active' : 'defaut'])));
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; raisons: string[] } | null>(null);

  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setEnCours(true);
    setRetour(null);
    try {
      const r = await enregistrerInterrupteursEspaceAction({
        workspaceId,
        actives: reglables.filter((c) => choix[c] === 'active'),
        coupees: reglables.filter((c) => choix[c] === 'coupee'),
        motif, confirme,
      });
      setRetour(r.ok ? { ok: true, texte: r.message, raisons: [] } : { ok: false, texte: r.traceId ? `${r.message} · identifiant support ${r.traceId}` : r.message, raisons: r.raisons });
      if (r.ok) { setConfirme(false); router.refresh(); }
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.', raisons: [] });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} aria-label={`Régler les interrupteurs de ${nom}`} style={{ display: 'grid', gap: 12, marginTop: 14 }} data-formulaire="interrupteurs">
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
        {reglables.map((c) => (
          <label key={c} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{DEFINITIONS_CAPACITES[c].libelle}</span>
            <select name={c} value={choix[c]} onChange={(e) => setChoix({ ...choix, [c]: e.target.value as Choix })} style={champ}>
              {(Object.keys(LIBELLE_CHOIX) as Choix[]).map((x) => <option key={x} value={x}>{LIBELLE_CHOIX[x]}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Motif (écrit au journal)</span>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} style={champ} placeholder="ex. espace pilote de la recette image" />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 14, color: 'var(--ink)' }}>
        <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 22, height: 22 }} />
        Je confirme ce réglage pour « {nom} » · effet immédiat
      </label>
      <button type="submit" disabled={enCours || !confirme} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '0 18px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 14, color: 'var(--on-accent)', background: 'var(--grad-accent)', opacity: enCours || !confirme ? 0.55 : 1, cursor: enCours || !confirme ? 'not-allowed' : 'pointer', width: 'fit-content' }}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le réglage'}
      </button>
      {retour && (
        <div role={retour.ok ? 'status' : 'alert'} style={{ fontSize: 13.5, color: retour.ok ? 'var(--ink)' : 'var(--err)' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{retour.ok ? 'Fait · ' : 'Refusé · '}{retour.texte}</p>
          {retour.raisons.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{retour.raisons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}

/**
 * Budget d'ESSAI d'un espace · plafond cumulé en dollars, début du cumul
 * (vide = maintenant), motif et confirmation. Le serveur relit la garde
 * plateforme, borne la saisie, écrit et journalise.
 */
export function FormulaireBudgetEssai({ workspaceId, nom, plafondActuel }: { workspaceId: string; nom: string; plafondActuel: number | null }) {
  const router = useRouter();
  const [plafond, setPlafond] = useState(plafondActuel === null ? '15' : String(plafondActuel));
  const [depuis, setDepuis] = useState('');
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; raisons: string[] } | null>(null);

  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setEnCours(true);
    setRetour(null);
    try {
      const r = await enregistrerBudgetEssaiAction({ workspaceId, plafondUsd: plafond, depuis: depuis ? new Date(depuis).toISOString() : undefined, motif, confirme });
      setRetour(r.ok ? { ok: true, texte: r.message, raisons: [] } : { ok: false, texte: r.traceId ? `${r.message} · identifiant support ${r.traceId}` : r.message, raisons: r.raisons });
      if (r.ok) { setConfirme(false); router.refresh(); }
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.', raisons: [] });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} aria-label={`Budget d’essai de ${nom}`} style={{ display: 'grid', gap: 10, marginTop: 6 }} data-formulaire="budget-essai">
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Plafond cumulé ($)</span>
          <input inputMode="decimal" value={plafond} onChange={(e) => setPlafond(e.target.value)} required style={champ} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Début du cumul (vide = maintenant)</span>
          <input type="datetime-local" value={depuis} onChange={(e) => setDepuis(e.target.value)} style={champ} />
        </label>
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Motif (écrit au journal)</span>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} style={champ} placeholder="ex. recette manuelle Studios, 15 $ au total" />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 14, color: 'var(--ink)' }}>
        <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 22, height: 22 }} />
        Je confirme ce budget pour « {nom} » · vérifié avant chaque appel payant
      </label>
      <button type="submit" disabled={enCours || !confirme} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '0 18px', borderRadius: 999, border: '1px solid var(--line-2)', fontWeight: 700, fontSize: 14, color: 'var(--ink)', background: 'transparent', opacity: enCours || !confirme ? 0.55 : 1, cursor: enCours || !confirme ? 'not-allowed' : 'pointer', width: 'fit-content' }}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le budget'}
      </button>
      {retour && (
        <div role={retour.ok ? 'status' : 'alert'} style={{ fontSize: 13.5, color: retour.ok ? 'var(--ink)' : 'var(--err)' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{retour.ok ? 'Fait · ' : 'Refusé · '}{retour.texte}</p>
          {retour.raisons.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{retour.raisons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
