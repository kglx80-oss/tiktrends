'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncAdsMapAction } from '../../actions/adsmap';

/**
 * « Mesurer maintenant » · déclenche la synchro Meta de la marque active.
 *
 * Le job nocturne suffit au régime de croisière, mais pas au lancement d'un lot :
 * quelqu'un qui vient de mettre trois ads en ligne veut savoir tout de suite si
 * le rattachement a fonctionné, pas demain matin.
 *
 * Le compte rendu est affiché tel quel, y compris quand il est décevant. « Aucune
 * ad rattachée » est une information · un bouton qui répondrait « terminé » sans
 * rien avoir mesuré serait pire que pas de bouton du tout.
 */
export function SyncButton({ syncedAt }: { syncedAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const router = useRouter();

  async function lancer() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await syncAdsMapAction();
    setBusy(false);
    if (r.error) { setMsg({ texte: r.error, erreur: true }); return; }
    setMsg({ texte: r.summary ?? 'Mesure terminée.', erreur: false });
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button type="button" onClick={lancer} disabled={busy} style={{
        padding: '8px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
        color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
      }}>
        {busy ? 'Mesure en cours…' : 'Mesurer maintenant'}
      </button>
      {!msg && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {syncedAt
            ? `Dernière mesure · ${new Date(syncedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : 'Jamais mesurée'}
        </span>
      )}
      {msg && (
        <span style={{ fontSize: 11, maxWidth: 420, textAlign: 'right', lineHeight: 1.45, color: msg.erreur ? '#ff8095' : 'var(--ink-2)' }}>
          {msg.texte}
        </span>
      )}
    </div>
  );
}
