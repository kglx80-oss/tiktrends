'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, type CapaciteStudio } from '@tiktrends/core';
import { enregistrerBudgetEssaiAction, enregistrerInterrupteursEspaceAction } from '../../../app/actions/studios/interrupteurs';

/**
 * Les deux réglages d'UN espace (ancien `/admin/studios-interrupteurs`) · les
 * capacités de portée espace (défaut, allumée en pilote, coupée) et le budget
 * d'ESSAI (plafond cumulé en dollars, vérifié avant chaque appel payant de
 * l'espace, en plus du plafond global). Motif et confirmation obligatoires ·
 * le serveur relit la garde plateforme (`provider.configure`), valide, écrit
 * et journalise. Le retour dit « Fait » ou « Refusé » avec ses raisons.
 */

type Choix = 'defaut' | 'active' | 'coupee';
const LIBELLE_CHOIX: Record<Choix, string> = { defaut: 'Défaut', active: 'Allumée (pilote)', coupee: 'Coupée' };
type Retour = { ok: boolean; texte: string; raisons: string[] } | null;
const PANNE = 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.';

function RetourReglage({ r }: { r: Retour }) {
  if (!r) return null;
  return (
    <div role={r.ok ? 'status' : 'alert'} style={{ display: 'grid', gap: 4 }}>
      <span className={`pill ${r.ok ? 'g' : 'r'}`} style={{ whiteSpace: 'normal', justifySelf: 'start' }}>{r.ok ? 'Fait · ' : 'Refusé · '}{r.texte}</span>
      {r.raisons.length > 0 && <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{r.raisons.map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

const versRetour = (r: { ok: boolean; message: string; raisons?: string[]; traceId?: string }): Retour =>
  r.ok ? { ok: true, texte: r.message, raisons: [] } : { ok: false, texte: r.traceId ? `${r.message} · identifiant support ${r.traceId}` : r.message, raisons: r.raisons ?? [] };

export function ReglageEspace({ workspaceId, nom, actives, coupees }: { workspaceId: string; nom: string; actives: readonly CapaciteStudio[]; coupees: readonly CapaciteStudio[] }) {
  const router = useRouter();
  const reglables = CAPACITES_STUDIOS.filter((c) => DEFINITIONS_CAPACITES[c].portee === 'espace');
  const [choix, setChoix] = useState<Record<string, Choix>>(() => Object.fromEntries(reglables.map((c) => [c, coupees.includes(c) ? 'coupee' : actives.includes(c) ? 'active' : 'defaut'])));
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);
  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setEnCours(true); setRetour(null);
    try {
      const r = await enregistrerInterrupteursEspaceAction({ workspaceId, actives: reglables.filter((c) => choix[c] === 'active'), coupees: reglables.filter((c) => choix[c] === 'coupee'), motif, confirme });
      setRetour(versRetour(r));
      if (r.ok) { setConfirme(false); router.refresh(); }
    } catch { setRetour({ ok: false, texte: PANNE, raisons: [] }); } finally { setEnCours(false); }
  }
  return (
    <form onSubmit={envoyer} aria-label={`Régler les interrupteurs de ${nom}`} style={{ display: 'grid', gap: 12, marginTop: 14 }} data-formulaire="interrupteurs">
      <div className="fields">
        {reglables.map((c) => (
          <label key={c} className="field">{DEFINITIONS_CAPACITES[c].libelle}
            <select name={c} value={choix[c]} onChange={(e) => setChoix({ ...choix, [c]: e.target.value as Choix })}>{(Object.keys(LIBELLE_CHOIX) as Choix[]).map((x) => <option key={x} value={x}>{LIBELLE_CHOIX[x]}</option>)}</select>
          </label>
        ))}
      </div>
      <label className="field">Motif (écrit au journal)<input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} placeholder="ex. espace pilote de la recette image" /></label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 20, height: 20 }} />Je confirme ce réglage pour « {nom} » · effet immédiat</label>
      <div className="kc"><button className="btn sm pri" type="submit" disabled={enCours || !confirme}>{enCours ? 'Enregistrement…' : 'Enregistrer le réglage'}</button></div>
      <RetourReglage r={retour} />
    </form>
  );
}

export function ReglageBudgetEssai({ workspaceId, nom, plafondActuel }: { workspaceId: string; nom: string; plafondActuel: number | null }) {
  const router = useRouter();
  const [plafond, setPlafond] = useState(plafondActuel === null ? '15' : String(plafondActuel));
  const [depuis, setDepuis] = useState('');
  const [motif, setMotif] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<Retour>(null);
  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setEnCours(true); setRetour(null);
    try {
      const r = await enregistrerBudgetEssaiAction({ workspaceId, plafondUsd: plafond, depuis: depuis ? new Date(depuis).toISOString() : undefined, motif, confirme });
      setRetour(versRetour(r));
      if (r.ok) { setConfirme(false); router.refresh(); }
    } catch { setRetour({ ok: false, texte: PANNE, raisons: [] }); } finally { setEnCours(false); }
  }
  return (
    <form onSubmit={envoyer} aria-label={`Budget d’essai de ${nom}`} style={{ display: 'grid', gap: 10, marginTop: 6 }} data-formulaire="budget-essai">
      <div className="agrid2" style={{ gap: 10 }}>
        <label className="field">Plafond cumulé ($)<input inputMode="decimal" value={plafond} onChange={(e) => setPlafond(e.target.value)} required /></label>
        <label className="field">Début du cumul (vide = maintenant)<input type="datetime-local" value={depuis} onChange={(e) => setDepuis(e.target.value)} /></label>
      </div>
      <label className="field">Motif (écrit au journal)<input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} placeholder="ex. recette manuelle Studios, 15 $ au total" /></label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 20, height: 20 }} />Je confirme ce budget pour « {nom} » · vérifié avant chaque appel payant</label>
      <div className="kc"><button className="btn sm" type="submit" disabled={enCours || !confirme}>{enCours ? 'Enregistrement…' : 'Enregistrer le budget'}</button></div>
      <RetourReglage r={retour} />
    </form>
  );
}
