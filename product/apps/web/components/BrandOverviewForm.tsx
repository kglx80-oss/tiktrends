'use client';

import { useState } from 'react';
import { input, lbl } from './ui';
import { updateBrandAction } from '../app/actions/brands';

const area = { ...input, minHeight: 74, resize: 'vertical' as const, lineHeight: 1.5, fontFamily: 'inherit' };
const sectionH = { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;
const addBtn = { padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' } as const;

export interface BrandInitial {
  id: string; name: string; url: string; description: string; usp: string; audience: string;
  category: string; categoryNeeds: string; moreAbout: string; industry: string; industryTags: string;
  tone: string; languages: string; colors: string; fonts: string; preferredWords: string; avoidWords: string;
  competitors: string; // préservé (édité dans l'onglet Concurrents), passé en caché
}

export function BrandOverviewForm({ init }: { init: BrandInitial }) {
  const [f, setF] = useState(init);
  const set = (k: keyof BrandInitial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form action={updateBrandAction}>
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="competitors" value={f.competitors} />

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
      <label style={lbl}>{label}{hint && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {hint}</span>}</label>
      {children}
    </div>
  );
}
