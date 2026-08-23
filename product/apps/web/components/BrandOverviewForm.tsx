'use client';

import { useActionState, useState } from 'react';
import { input, lbl } from './ui';
import { updateBrandAction, generateBrandDraftAction, type BrandDraftState } from '../app/actions/brands';

const area = { ...input, minHeight: 74, resize: 'vertical' as const, lineHeight: 1.5, fontFamily: 'inherit' };
const sectionH = { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;
const addBtn = { padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' } as const;

export interface BrandInitial {
  id: string; name: string; url: string; description: string; usp: string; audience: string;
  category: string; categoryNeeds: string; moreAbout: string; industry: string; industryTags: string;
  tone: string; languages: string; colors: string; fonts: string; preferredWords: string; avoidWords: string;
  competitors: string; // préservé (édité dans l'onglet Concurrents), passé en caché
}

export function BrandOverviewForm({ init, aiReady }: { init: BrandInitial; aiReady: boolean }) {
  const [f, setF] = useState(init);
  const set = (k: keyof BrandInitial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const [draftState, runDraft, drafting] = useActionState<BrandDraftState, FormData>(async (_p, fd) => {
    const res = await generateBrandDraftAction(_p, fd);
    if (res.draft) {
      const d = res.draft;
      setF((s) => ({
        ...s,
        description: d.description || s.description,
        usp: d.usp || s.usp,
        audience: d.audience || s.audience,
        category: d.category || s.category,
        categoryNeeds: d.categoryNeeds || s.categoryNeeds,
        tone: d.tone || s.tone,
        industryTags: d.industryTags?.join(', ') || s.industryTags,
        preferredWords: d.preferredWords?.join(', ') || s.preferredWords,
        avoidWords: d.avoidWords?.join(', ') || s.avoidWords,
      }));
    }
    return res;
  }, {});

  return (
    <form action={updateBrandAction}>
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="competitors" value={f.competitors} />

      {/* Barre IA de pré-remplissage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18, padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)' }}>
        <button
          type="button"
          disabled={!aiReady || drafting || !f.name.trim()}
          onClick={() => { const fd = new FormData(); fd.set('name', f.name); fd.set('url', f.url); runDraft(fd); }}
          title={aiReady ? 'Analyse le site et pré-remplit le profil' : 'IA non configurée sur le serveur'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, border: 'none',
            background: aiReady && f.name.trim() ? 'var(--grad-accent)' : 'var(--line-2)',
            color: aiReady && f.name.trim() ? '#0d070c' : 'var(--muted)', fontWeight: 800, fontSize: 13,
            cursor: aiReady && f.name.trim() && !drafting ? 'pointer' : 'default',
          }}
        >✦ {drafting ? 'Analyse en cours…' : 'Générer par IA depuis le site'}</button>
        {!aiReady && <span style={{ fontSize: 12, color: 'var(--muted)' }}>IA non configurée — remplis le profil à la main.</span>}
        {draftState.error && <span style={{ fontSize: 12, color: '#ff9db0' }}>{draftState.error}</span>}
        {draftState.draft && <span style={{ fontSize: 12, color: '#7ee8bf' }}>Profil pré-rempli{draftState.cost ? ` (${draftState.cost} crédits)` : ''}. Vérifie, puis enregistre.</span>}
      </div>

      <h2 style={sectionH}>Profil</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Le profil nourrit le Studio IA et le Radar. Tout est modifiable.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Nom *" flex="2 1 220px"><input name="name" value={f.name} onChange={set('name')} required style={input} /></F>
        <F label="Site" flex="2 1 220px"><input name="url" value={f.url} onChange={set('url')} placeholder="gruns.co" style={input} /></F>
      </div>
      <F label="Description produit / service"><textarea name="description" value={f.description} onChange={set('description')} style={area} /></F>
      <F label="Propositions de valeur uniques (USP)" hint="une par ligne"><textarea name="usp" value={f.usp} onChange={set('usp')} style={area} /></F>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Audience cible" flex="1 1 240px"><input name="audience" value={f.audience} onChange={set('audience')} style={input} /></F>
        <F label="Catégorie" flex="1 1 160px"><input name="category" value={f.category} onChange={set('category')} style={input} /></F>
      </div>
      <F label="Besoins de la catégorie"><input name="categoryNeeds" value={f.categoryNeeds} onChange={set('categoryNeeds')} style={input} /></F>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Secteur" flex="1 1 240px"><input name="industry" value={f.industry} onChange={set('industry')} style={input} /></F>
        <F label="Tags secteur" hint="virgules" flex="1 1 240px"><input name="industryTags" value={f.industryTags} onChange={set('industryTags')} style={input} /></F>
      </div>
      <F label="En savoir plus"><textarea name="moreAbout" value={f.moreAbout} onChange={set('moreAbout')} style={area} /></F>

      <h2 style={{ ...sectionH, marginTop: 22 }}>Charte</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Ton de voix" flex="1 1 220px"><input name="tone" value={f.tone} onChange={set('tone')} style={input} /></F>
        <F label="Langue(s)" hint="virgules" flex="1 1 200px"><input name="languages" value={f.languages} onChange={set('languages')} style={input} /></F>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Couleurs" hint="hex, virgules" flex="1 1 220px"><input name="colors" value={f.colors} onChange={set('colors')} style={input} /></F>
        <F label="Polices" hint="virgules" flex="1 1 200px"><input name="fonts" value={f.fonts} onChange={set('fonts')} style={input} /></F>
      </div>
      {f.colors.trim() && (
        <div style={{ display: 'flex', gap: 8, margin: '-4px 0 14px', flexWrap: 'wrap' }}>
          {f.colors.split(',').map((c) => c.trim()).filter(Boolean).map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: '1px solid var(--line-2)', background: c }} />{c}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <F label="Mots à privilégier" hint="virgules" flex="1 1 240px"><input name="preferredWords" value={f.preferredWords} onChange={set('preferredWords')} style={input} /></F>
        <F label="Mots à éviter" hint="virgules" flex="1 1 240px"><input name="avoidWords" value={f.avoidWords} onChange={set('avoidWords')} style={input} /></F>
      </div>
      <div style={{ marginTop: 8 }}><button type="submit" style={addBtn}>Enregistrer le profil</button></div>
    </form>
  );
}

function F({ label, hint, flex, children }: { label: string; hint?: string; flex?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: flex ?? '1 1 auto' }}>
      <label style={lbl}>{label}{hint && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {hint}</span>}</label>
      {children}
    </div>
  );
}
