'use client';

import { useState } from 'react';
import { trainJarvisAction, saveJarvisLearningsAction } from '../../actions/jarvis';

export function JarvisTraining({ brandName, initial, trainedAt }: { brandName: string | null; initial: string; trainedAt: string | null }) {
  const [learnings, setLearnings] = useState(initial);
  const [trained, setTrained] = useState(trainedAt);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  async function train() {
    if (busy) return;
    if (learnings.trim() && !confirm("Ré-entraîner Jarvis ? Cela remplace l'intelligence créative actuelle (20 crédits).")) return;
    setBusy(true); setMsg('');
    const r = await trainJarvisAction();
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    if (r.learnings) {
      setLearnings(r.learnings); setTrained(new Date().toISOString()); setOk(true);
      setMsg(`Jarvis entraîné sur ${r.adsAnalyzed ?? 0} pub(s) performante(s)${r.cost ? ` (${r.cost} crédits)` : ''}. Injecté dès la prochaine génération.`);
    }
  }
  async function save() {
    if (saving) return;
    setSaving(true); setMsg('');
    const r = await saveJarvisLearningsAction({ learnings });
    setSaving(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true); setMsg('Intelligence créative enregistrée.');
  }

  return (
    <div style={{ border: '1px solid rgba(120,90,255,.35)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(120,90,255,.08), var(--surface))', padding: 22, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>🎓</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Entraînement · intelligence créative</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{brandName ? `· ${brandName}` : '· marque active'}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={train} disabled={busy} style={{ fontSize: 12.5, fontWeight: 800, padding: '9px 15px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#7a5aff,#e6007e)', color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
          {busy ? 'Jarvis apprend…' : '🎓 Entraîner Jarvis (pubs gagnantes · 20 cr.)'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        Jarvis analyse les pubs qui <b>performent</b> (concurrents + ta niche via la veille) et en distille les
        <b> patterns gagnants</b> (hooks, angles, formats, codes visuels, CTA). Ces apprentissages sont
        <b> injectés dans chaque génération</b> pour tirer la performance de tes créas vers le haut.
      </p>

      <textarea
        value={learnings}
        onChange={(e) => setLearnings(e.target.value)}
        placeholder="Aucune intelligence pour l'instant. Lance « Entraîner Jarvis » : il ira analyser les pubs qui tournent chez tes concurrents et dans ta niche, et écrira ici ce qui fait la performance."
        style={{ width: '100%', minHeight: 180, padding: '13px 15px', borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.6, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {trained ? `Dernier entraînement : ${new Date(trained).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'Jamais entraîné'}
        </span>
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: ok ? '#c9b8ff' : '#f5b043' }}>{msg}</span>}
        {learnings.trim() && <button type="button" onClick={save} disabled={saving} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer les ajustements'}</button>}
      </div>
    </div>
  );
}
