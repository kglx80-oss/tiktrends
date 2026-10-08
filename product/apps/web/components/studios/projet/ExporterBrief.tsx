'use client';

import { useState } from 'react';
import { exporterBrief } from '../../../app/actions/studios/sources';
import { btn, btnGhost } from '../../ui';

/**
 * Exporter le brief pour produire ailleurs (FLOW-10) · lecture pure côté
 * serveur, aucune génération, aucun crédit. Le fichier est construit par le
 * serveur (`exporterBrief`) puis téléchargé ; « Copier » met le Markdown dans
 * le presse-papiers.
 */
export function ExporterBrief({ projectId, versionId, autorise }: { projectId: string; versionId: string; autorise: boolean }) {
  const [etat, setEtat] = useState<{ message: string; erreur: boolean } | null>(null);
  const [encours, setEncours] = useState(false);

  async function exporter(format: 'markdown' | 'json', copier = false) {
    setEncours(true);
    setEtat(null);
    const r = await exporterBrief({ projectId, versionId, format });
    setEncours(false);
    if (!r.ok) { setEtat({ message: `${r.message} · identifiant support : ${r.traceId}`, erreur: true }); return; }
    if (copier) {
      try {
        await navigator.clipboard.writeText(r.contenu);
        setEtat({ message: 'Brief copié · colle-le dans l’outil de ton choix.', erreur: false });
      } catch {
        setEtat({ message: 'Copie refusée par le navigateur · utilise le téléchargement.', erreur: true });
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([r.contenu], { type: `${r.typeMime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = r.nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setEtat({ message: `Téléchargé · ${r.nomFichier}`, erreur: false });
  }

  if (!autorise) return <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>Ton rôle ne permet pas d’exporter · demande un rôle Membre.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={encours} onClick={() => exporter('markdown')} style={btn}>Exporter le brief</button>
        <button type="button" disabled={encours} onClick={() => exporter('markdown', true)} style={btnGhost}>Copier</button>
        <button type="button" disabled={encours} onClick={() => exporter('json')} style={btnGhost}>JSON</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Gratuit · aucune génération. Le fichier suffit pour produire avec un autre outil.</p>
      {etat && <p role={etat.erreur ? 'alert' : 'status'} style={{ fontSize: 12.5, margin: 0, color: etat.erreur ? '#ff9db0' : '#7ee8bf' }}>{etat.message}</p>}
    </div>
  );
}
