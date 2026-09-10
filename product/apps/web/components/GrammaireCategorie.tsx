'use client';

import { useState, useTransition } from 'react';
import type { LigneGrammaire } from '@tiktrends/core';
import { grammaireCategorieAction } from '../app/actions/layout-marche';
import { grammaireVideoAction } from '../app/actions/video-marche';

/**
 * « La carte d'identité de ta catégorie » · rendre le poumon VISIBLE.
 *
 * Le poumon apprend la grammaire gagnante de la catégorie (mise en page, typo,
 * palette) et l'injecte dans la génération d'entière · en silence. Cette carte
 * la MONTRE · ce que les pubs concurrentes qui tiennent ont en commun, et donc
 * ce que tes entières vont suivre. À la demande · la lecture agrège les analyses
 * déjà décrites, pas de dépense · muette tant que la catégorie n'a pas été
 * décrite (le lot market-learn la remplit).
 */
/** Un volet de la carte d'identité · un titre, l'effectif, et la grille des axes. */
function Volet({ titre, n, lignes }: { titre: string; n: number; lignes: LigneGrammaire[] }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 2 }}>{titre}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>
        D’après {n} créa(s) concurrente(s) analysée(s) · ce qui revient chez les gagnantes.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {lignes.map((l) => (
          <div key={l.axe} style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{l.axe}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{l.valeur}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GrammaireCategorie() {
  const [lignes, setLignes] = useState<LigneGrammaire[] | null>(null);
  const [n, setN] = useState(0);
  const [video, setVideo] = useState<{ lignes: LigneGrammaire[]; n: number } | null>(null);
  const [busy, start] = useTransition();

  function voir() {
    if (busy) return;
    start(async () => {
      // Deux volets, un seul geste · le statique (mise en page, charte) et la
      // vidéo (accroche, ouverture, personne à l'écran).
      const [stat, vid] = await Promise.all([grammaireCategorieAction(), grammaireVideoAction()]);
      setLignes(stat.lignes);
      setN(stat.n);
      setVideo(vid);
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>La carte d’identité de ma catégorie</h2>
        <button type="button" onClick={voir} disabled={busy} style={{
          fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer',
          border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy ? 0.6 : 1,
        }}>{busy ? 'Lecture…' : '✦ Lire ce qui gagne dans ma catégorie'}</button>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Ce que tes entières vont suivre · appris des concurrents qui tiennent.</span>
      </div>

      {lignes && lignes.length > 0 && (
        <Volet titre="Statique · mise en page & charte" n={n} lignes={lignes} />
      )}

      {video && video.lignes.length > 0 && (
        <Volet titre="Vidéo · accroche, ouverture, présence" n={video.n} lignes={video.lignes} />
      )}

      {lignes && lignes.length === 0 && (!video || video.lignes.length === 0) && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
          {n > 0
            ? `Rien ne se détache encore nettement dans ta catégorie (${n} pub(s) analysée(s)) · il faut un motif majoritaire pour conclure.`
            : 'Ta catégorie n’a pas encore été décrite · lance un lot d’analyse des concurrents pour la remplir.'}
        </p>
      )}
    </section>
  );
}
