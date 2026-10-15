'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { cadreSignal, tuile } from '../../../components/ui';
import {
  listShareLinksAction, createShareLinkAction, revokeShareLinkAction, type ShareLink,
} from '../../actions/adsmap-share';
import { EmptyLine } from '../../../components/Empty';
import { Modal } from '../../../components/Modal';

/**
 * Partage client de la carte (§12).
 *
 * Une agence ne montre pas son outil, elle montre un résultat. L'encart dit
 * exactement ce qui part et ce qui ne part pas · un partage dont on ignore le
 * contenu est un partage qu'on ne fait pas, ou qu'on regrette.
 */
export function SharePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copie, setCopie] = useState('');
  const [jours, setJours] = useState(90);

  const charger = useCallback(async () => {
    const r = await listShareLinksAction();
    if (r.error) { setError(r.error); setLinks([]); return; }
    setError(''); setLinks(r.links ?? []);
  }, []);

  useEffect(() => { if (open) void charger(); }, [open, charger]);

  if (!open) return null;

  const url = (t: string) => `${window.location.origin}/c/${t}`;

  async function creer() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await createShareLinkAction(jours);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setLinks((l) => [r.link!, ...(l ?? [])]);
  }

  async function revoquer(id: string) {
    if (busy) return;
    setBusy(true); setError('');
    const r = await revokeShareLinkAction(id);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setLinks((l) => (l ?? []).filter((x) => x.id !== id));
  }

  function copier(t: string, id: string) {
    void navigator.clipboard?.writeText(url(t)).then(() => {
      setCopie(id);
      setTimeout(() => setCopie(''), 1600);
    }).catch(() => setError('Copie impossible · sélectionne le lien à la main.'));
  }

  return (
    <Modal open={open} onClose={onClose} title="Partager avec le client" maxWidth={560}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        Une page en lecture seule, sans compte à créer. Le client y voit <b>ce qui a été testé et ce qui
        a gagné</b>.
      </p>
      <ul style={{ margin: '9px 0 0', paddingLeft: 17, fontSize: 12, color: 'var(--muted)', lineHeight: 1.65 }}>
        <li>Aucune dépense, aucun CPA, aucun budget · ta marge se lit dans ces colonnes.</li>
        <li>Aucune hypothèse, aucun apprentissage · c’est ta méthode, c’est ce qu’il paie.</li>
        <li>Aucun test en cours · seuls les verdicts que tu as arbitrés apparaissent.</li>
      </ul>

      {error && (
        <p style={{ marginTop: 13, padding: '9px 12px', background: 'color-mix(in srgb, var(--accent) 9%, transparent)', ...cadreSignal('color-mix(in srgb, var(--accent) 30%, transparent)', 'tuile'), color: 'var(--err-strong)', fontSize: 12.5, lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7 }}>
          Valable
          <select value={jours} onChange={(e) => setJours(Number(e.target.value))} style={{
            padding: '7px 10px', borderRadius: 9, border: '1px solid var(--line-2)',
            background: 'var(--paper)', color: 'var(--ink)', fontSize: 12,
          }}>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
            <option value={180}>6 mois</option>
            <option value={365}>1 an</option>
          </select>
        </label>
        <button type="button" onClick={creer} disabled={busy} style={{
          padding: '8px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
          color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          Créer un lien
        </button>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Une échéance est toujours posée · un lien sans date traîne dans un fil de messages et finit
        par montrer à un ancien client ce que tu fais aujourd’hui.
      </p>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {links === null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Chargement…</span>}
        {links?.length === 0 && <EmptyLine>Aucun lien actif · crée le premier ci-dessus pour partager tes créas gagnantes en marque blanche, sans jamais donner accès à l’outil.</EmptyLine>}
        {links?.map((l) => (
          <div key={l.id} style={{
            ...tuile, padding: '9px 12px',
            background: 'var(--paper)', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
          }}>
            <code style={{
              flex: '1 1 220px', minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 11,
              color: l.expired ? 'var(--muted)' : 'var(--accent-strong)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              /c/{l.token}
            </code>
            <span style={{ fontSize: 10.5, color: l.expired ? 'var(--err-strong)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
              {l.expired
                ? 'expiré'
                : l.expiresAt
                  ? `jusqu’au ${new Date(l.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}`
                  : 'sans échéance'}
            </span>
            {!l.expired && (
              <button type="button" onClick={() => copier(l.token, l.id)} style={petit}>
                {copie === l.id ? 'copié' : 'copier'}
              </button>
            )}
            <button type="button" onClick={() => revoquer(l.id)} disabled={busy} style={{ ...petit, color: 'var(--err-strong)' }}>
              révoquer
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

const petit: CSSProperties = {
  padding: '3px 9px', borderRadius: 7, border: '1px solid var(--line-2)', background: 'transparent',
  color: 'var(--muted)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
};
