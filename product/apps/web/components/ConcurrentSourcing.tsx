'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { costFor, lienAnnonceurVeille } from '@tiktrends/core';
import { proposerConcurrents, ajouterConcurrents } from '../app/actions/competitor';
import { Icon } from './Icon';
import { input, surface } from './ui';

export function ConcurrentSourcing({ brandId, ready, unlimited = false }: { brandId: string; ready: boolean; unlimited?: boolean }) {
  const router = useRouter();
  const [context, setContext] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const price = unlimited ? '0 crédit débité · coût fournisseur sous plafond' : `${costFor('brief')} crédits`;
  return <section aria-label="Sourcing concurrents avec Jarvis" style={{ ...surface, padding: 18, marginBottom: 22, display: 'grid', gap: 12, background: 'var(--surface)' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="sparkles" size={20} /><h2 style={{ margin: 0, fontSize: 18 }}>Trouver mes concurrents avec Jarvis</h2></div>
    <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>Précise ton marché et ta cible. Jarvis propose des pistes à partir de ta fiche de marque, puis tu vérifies leurs annonces avant de les ajouter.</p>
    <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Quel type de concurrent recherches-tu ?
      <textarea value={context} onChange={(e) => { setContext(e.target.value); setSuggestions([]); setSelected([]); setMessage(''); }} maxLength={1200} disabled={pending} placeholder="Ex. soins capillaires en France, marques premium vendues en ligne, cible cheveux bouclés…" style={{ ...input, minHeight: 82, resize: 'vertical', fontFamily: 'inherit' }} />
    </label>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" disabled={pending || !ready} onClick={() => start(async () => {
        setMessage('');
        try {
          const result = await proposerConcurrents(brandId, context);
          if ('error' in result) { setMessage(result.error); return; }
          setSuggestions(result.names); setSelected([]);
          setMessage(result.names.length ? 'Pistes non vérifiées : consulte les annonces, puis sélectionne les marques pertinentes.' : 'Aucune nouvelle piste proposée. Précise ton marché ou ajoute une marque manuellement.');
        } catch { setMessage('Réponse interrompue. Vérifie ton solde avant de réessayer : l’appel a pu être facturé.'); }
      })} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: pending ? 'wait' : 'pointer' }}>
        {pending ? 'Jarvis travaille…' : `Proposer des concurrents · ${price}`}
      </button>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ready ? 'Un clic lance un appel IA. Aucun ajout automatique.' : 'Jarvis n’est pas disponible actuellement.'}</span>
    </div>
    {message && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{message}</p>}
    {suggestions.length > 0 && <div style={{ display: 'grid', gap: 8 }}>
      {suggestions.map((name) => <div key={name} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
        <label style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, overflowWrap: 'anywhere' }}><input type="checkbox" disabled={pending} checked={selected.includes(name)} onChange={(e) => setSelected(e.target.checked ? [...selected, name] : selected.filter((n) => n !== name))} />{name}</label>
        <a href={lienAnnonceurVeille({ advertiserName: name, platform: 'meta' }, '') ?? '/veille'} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--accent-strong)' }}>Vérifier dans la Veille ↗</a>
      </div>)}
      <button type="button" disabled={pending || selected.length === 0} onClick={() => start(async () => {
        try {
          const result = await ajouterConcurrents(brandId, selected);
          if ('error' in result) { setMessage(result.error); return; }
          setSuggestions([]); setSelected([]); setMessage('Sélection ajoutée. Tes concurrents existants sont conservés.'); router.refresh();
        } catch { setMessage('Ajout non confirmé. Recharge la fiche avant de réessayer.'); }
      })} style={{ minHeight: 44, padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 700 }}>Ajouter la sélection · sans appel IA</button>
    </div>}
  </section>;
}
