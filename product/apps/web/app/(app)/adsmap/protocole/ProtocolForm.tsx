'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { saveSettingsAction, suggestSettingsAction, type SettingsBundle } from '../../../actions/adsmap-protocol';

/**
 * Réglage du protocole de test et des seuils de verdict.
 *
 * Chaque champ porte sa conséquence, pas sa définition : « ce qui se passe si tu
 * changes ça », plutôt que « ce que ce champ contient ». C'est ce qui distingue
 * un réglage compris d'un réglage recopié.
 */
export function ProtocolForm({ initial, canEdit }: { initial: SettingsBundle; canEdit: boolean }) {
  const [s, setS] = useState<SettingsBundle>(initial);
  const [notes, setNotes] = useState<string[]>([]);
  const [fromReal, setFromReal] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setP = <K extends keyof SettingsBundle['protocol']>(k: K, v: SettingsBundle['protocol'][K]) =>
    setS((x) => ({ ...x, protocol: { ...x.protocol, [k]: v } }));
  const setV = <K extends keyof SettingsBundle['verdict']>(k: K, v: SettingsBundle['verdict'][K]) =>
    setS((x) => ({ ...x, verdict: { ...x.verdict, [k]: v } }));

  async function proposer() {
    setBusy(true); setMsg(null);
    const r = await suggestSettingsAction();
    setBusy(false);
    if (r.error || !r.suggestion) { setMsg({ kind: 'err', text: r.error ?? 'Proposition impossible.' }); return; }
    setS((x) => ({ ...x, protocol: r.suggestion!.protocol, verdict: r.suggestion!.verdict }));
    setNotes(r.suggestion.notes);
    setFromReal(r.suggestion.fromRealData);
  }

  async function enregistrer() {
    setBusy(true); setMsg(null);
    const r = await saveSettingsAction(s);
    setBusy(false);
    setMsg(r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Réglages enregistrés · ils s’appliquent aux prochains verdicts calculés.' });
  }

  const cbo = s.protocol.structure === 'cbo_tolerated';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {initial.isDefault && (
        <div style={{ ...bandeau, background: 'rgba(245,166,35,.09)', borderColor: 'rgba(245,166,35,.3)', color: '#ffcf8f' }}>
          Rien n’est encore enregistré pour cette marque : ce sont des valeurs par défaut.
          Lance l’assistant pour les caler sur tes performances réelles.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={proposer} disabled={busy}
          style={{ padding: '9px 17px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Analyse…' : 'Proposer des seuils depuis mes 30 derniers jours'}
        </button>
        {fromReal === false && <span style={{ fontSize: 12.5, color: '#ffcf8f' }}>Sans données Meta · valeurs génériques</span>}
      </div>

      {notes.length > 0 && (
        <ul style={{ margin: 0, padding: '12px 16px 12px 30px', borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)', display: 'grid', gap: 5 }}>
          {notes.map((n, i) => <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{n}</li>)}
        </ul>
      )}

      {/* Protocole */}
      <section style={panel}>
        <h2 style={h2}>Protocole de test</h2>
        <p style={sub}>
          C’est lui qui rend les verdicts comparables. En CBO, Meta concentre le budget sur une ou
          deux annonces : les autres n’ont jamais assez de données, et celle qui est favorisée gagne
          par construction.
        </p>

        <Champ label="Structure de campagne" aide={cbo
          ? 'En CBO, le moteur ne produira que des gagnants relatifs et des sous-diffusions · il le dira explicitement sur chaque verdict.'
          : 'Un ad set par ad, même audience, même budget : chaque annonce a la même chance.'}>
          <select value={s.protocol.structure} onChange={(e) => setP('structure', e.target.value as SettingsBundle['protocol']['structure'])} disabled={!canEdit} style={input}>
            <option value="abo_one_adset_per_ad">ABO · un ad set par ad (recommandé)</option>
            <option value="abo_single_adset">ABO · un seul ad set</option>
            <option value="cbo_tolerated">CBO toléré · verdicts dégradés</option>
          </select>
        </Champ>

        <div style={grille}>
          <Champ label="Budget quotidien par ad (€)" aide="Trop bas, aucune ad n’atteint le seuil de conclusion et tout ressort « non concluant ».">
            <input type="number" min={1} step={1} value={s.protocol.dailyBudgetPerAd} disabled={!canEdit}
              onChange={(e) => setP('dailyBudgetPerAd', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Durée du test (jours)" aide="La fenêtre d’évaluation. Sept jours lissent les variations de jour de semaine.">
            <input type="number" min={1} max={30} value={s.protocol.durationDays} disabled={!canEdit}
              onChange={(e) => setP('durationDays', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Écart de budget toléré" aide="Au-delà, le lot est signalé non conforme et ses verdicts passent en comparaison relative.">
            <input type="number" min={0} max={1} step={0.05} value={s.protocol.budgetVarianceTolerance} disabled={!canEdit}
              onChange={(e) => setP('budgetVarianceTolerance', Number(e.target.value))} style={input} />
          </Champ>
        </div>

        <Champ label="Nom de campagne attendu" aide="Sert à retrouver automatiquement les ads du lot dans le compte publicitaire.">
          <input value={s.protocol.campaignNamePattern} disabled={!canEdit}
            onChange={(e) => setP('campaignNamePattern', e.target.value)} style={input} />
        </Champ>

        <Champ label="Nom d’annonce attendu" aide="C’est ce nom qui relie une ad du compte publicitaire à sa ligne ici. Sans lui, le rattachement se fait à la main.">
          <input value={s.namingPattern} disabled={!canEdit}
            onChange={(e) => setS((x) => ({ ...x, namingPattern: e.target.value }))} style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
        </Champ>
      </section>

      {/* Seuils */}
      <section style={panel}>
        <h2 style={h2}>Seuils de verdict</h2>
        <p style={sub}>Ce qui sépare une gagnante d’une perdante. À recalibrer après deux lots, avec les données réelles.</p>

        <div style={grille}>
          <Champ label="CPA cible (€)" aide="La référence de tout le moteur. Une gagnante fait mieux ; une perdante dépasse nettement.">
            <input type="number" min={1} step={1} value={s.verdict.targetCpa} disabled={!canEdit}
              onChange={(e) => setV('targetCpa', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Tolérance « naissante »" aide="0,3 : une ad jusqu’à 30 % au-dessus de la cible reste prometteuse, à itérer avant de scaler.">
            <input type="number" min={0} max={1} step={0.05} value={s.verdict.babyTolerance} disabled={!canEdit}
              onChange={(e) => setV('babyTolerance', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Limite « perdante »" aide="1,5 : au-delà d’une fois et demie la cible, l’ad est perdante.">
            <input type="number" min={1} step={0.1} value={s.verdict.loserMultiple} disabled={!canEdit}
              onChange={(e) => setV('loserMultiple', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Dépense minimale (× CPA cible)" aide="En dessous, on ne conclut pas : le chiffre ne veut encore rien dire.">
            <input type="number" min={1} step={0.5} value={s.verdict.minSpendMultiple} disabled={!canEdit}
              onChange={(e) => setV('minSpendMultiple', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Achats minimum pour « gagnante »" aide="Trois achats, c’est le plancher pour que le CPA ne soit pas un accident.">
            <input type="number" min={1} step={1} value={s.verdict.minPurchasesWinner} disabled={!canEdit}
              onChange={(e) => setV('minPurchasesWinner', Number(e.target.value))} style={input} />
          </Champ>
          <Champ label="Niveau de confiance" aide="0,80 · unilatéral. Le monter rend le moteur plus prudent, donc plus lent à conclure : ajuste plutôt la tolérance ci-dessus.">
            <input type="number" min={0.5} max={0.99} step={0.05} value={s.verdict.ciLevelOneSided} disabled={!canEdit}
              onChange={(e) => setV('ciLevelOneSided', Number(e.target.value))} style={input} />
          </Champ>
        </div>
      </section>

      {msg && (
        <div style={{ ...bandeau, background: msg.kind === 'ok' ? 'rgba(126,232,191,.08)' : 'rgba(254,44,85,.08)', borderColor: msg.kind === 'ok' ? 'rgba(126,232,191,.32)' : 'rgba(254,44,85,.32)', color: msg.kind === 'ok' ? '#7ee8bf' : '#ff8095' }}>
          {msg.text}
        </div>
      )}

      {canEdit ? (
        <div>
          <button type="button" onClick={enregistrer} disabled={busy}
            style={{ padding: '10px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Lecture seule · seuls les administrateurs de l’espace modifient les seuils.</p>
      )}
    </div>
  );
}

function Champ({ label, aide, children }: { label: string; aide: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>{label}</label>
      {children}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>{aide}</div>
    </div>
  );
}

const panel: CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '18px 20px' };
const h2: CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' };
const sub: CSSProperties = { color: 'var(--muted)', fontSize: 12.5, margin: '0 0 16px', lineHeight: 1.6, maxWidth: 680 };
const input: CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13 };
const grille: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0 16px' };
const bandeau: CSSProperties = { padding: '10px 14px', borderRadius: 11, border: '1px solid', fontSize: 12.5, lineHeight: 1.55 };
