'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnboardingAction } from '../actions/onboarding';

const PROFILES = [
  { key: 'brand', label: 'Marque / E-commerce', hint: 'Créa en interne', emoji: '🏷️' },
  { key: 'agency', label: 'Agence', hint: 'Travail client, en équipe', emoji: '🏢' },
  { key: 'freelancer', label: 'Freelance', hint: 'Travail client, en solo', emoji: '🧑‍💻' },
  { key: 'ai_artist', label: 'AI Artist', hint: 'Art & expérimentations', emoji: '🎨' },
  { key: 'other', label: 'Autre', hint: 'Je verrai en avançant', emoji: '✨' },
];
const AI_LEVELS = [
  { key: 'starter', label: 'Je débute', hint: "Jamais utilisé l'IA pour créer" },
  { key: 'exploring', label: "J'explore", hint: "J'utilise des outils IA, je cherche encore" },
  { key: 'comfortable', label: "À l'aise", hint: 'ChatGPT / Midjourney au quotidien' },
  { key: 'advanced', label: 'Avancé', hint: "J'ai construit des workflows IA" },
];
const GOALS = [
  { key: 'ads', label: 'Créer des pubs qui vendent', emoji: '🚀' },
  { key: 'clone', label: 'Cloner des pubs gagnantes', emoji: '🏆' },
  { key: 'analyze', label: 'Analyser mes performances', emoji: '📊' },
  { key: 'scale', label: 'Produire à grande échelle', emoji: '⚡' },
  { key: 'multi', label: 'Gérer plusieurs marques', emoji: '🗂️' },
  { key: 'video', label: 'Passer à la vidéo IA', emoji: '🎬' },
];

const TOTAL = 4;

export function OnboardingWizard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState('');
  const [aiLevel, setAiLevel] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [brandName, setBrandName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleGoal = (k: string) => setGoals((g) => g.includes(k) ? g.filter((x) => x !== k) : [...g, k]);
  const canNext = step === 0 ? !!profile : step === 1 ? !!aiLevel : step === 2 ? goals.length > 0 : true;

  async function finish() {
    if (busy) return;
    setBusy(true);
    await saveOnboardingAction({ profile, aiLevel, goals, brandName, siteUrl });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,520px)', background: 'var(--bg, #0b070d)' }}>
      {/* Colonne formulaire */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px min(8vw, 90px)', maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--grad-accent)' }} />
          <b style={{ fontSize: 16, color: 'var(--ink)' }}>TikTrends</b>
        </div>

        {step === 0 && (
          <Step title={`Bienvenue${firstName ? `, ${firstName}` : ''} 👋`} sub="Pour personnaliser ton espace : qui es-tu ?">
            <Grid>
              {PROFILES.map((p) => <Card key={p.key} active={profile === p.key} onClick={() => setProfile(p.key)} emoji={p.emoji} label={p.label} hint={p.hint} />)}
            </Grid>
          </Step>
        )}
        {step === 1 && (
          <Step title="Où en es-tu avec l'IA ?" sub="On adapte l'accompagnement à ton niveau.">
            <Grid>
              {AI_LEVELS.map((p) => <Card key={p.key} active={aiLevel === p.key} onClick={() => setAiLevel(p.key)} label={p.label} hint={p.hint} />)}
            </Grid>
          </Step>
        )}
        {step === 2 && (
          <Step title="Ton objectif principal ?" sub="Plusieurs choix possibles · on met en avant ce qui compte pour toi.">
            <Grid>
              {GOALS.map((p) => <Card key={p.key} active={goals.includes(p.key)} onClick={() => toggleGoal(p.key)} emoji={p.emoji} label={p.label} check />)}
            </Grid>
          </Step>
        )}
        {step === 3 && (
          <Step title="Ta première marque" sub="On la crée pour toi · tu génères tes premières créas juste après.">
            <label style={lbl}>Nom de la marque / entreprise</label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Ex : Studio Nova" style={field} autoFocus />
            <label style={{ ...lbl, marginTop: 16 }}>Site web <span style={{ color: 'var(--muted)' }}>· optionnel, pour pré-remplir ta marque</span></label>
            <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="ta-marque.com" style={field} />
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>Tu pourras ajouter d'autres marques et affiner la DA à tout moment.</p>
          </Step>
        )}

        {/* Progression + navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 34 }}>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span key={i} style={{ height: 4, flex: 1, borderRadius: 999, background: i <= step ? 'var(--accent-strong)' : 'var(--line-2)', transition: 'background .2s' }} />
            ))}
          </div>
          {step > 0 && <button type="button" onClick={() => setStep((n) => n - 1)} style={ghostBtn}>Retour</button>}
          {step < TOTAL - 1
            ? <button type="button" onClick={() => canNext && setStep((n) => n + 1)} disabled={!canNext} style={{ ...primaryBtn, opacity: canNext ? 1 : .5 }}>Continuer</button>
            : <button type="button" onClick={finish} disabled={busy} style={primaryBtn}>{busy ? 'Préparation…' : 'Démarrer 🚀'}</button>}
        </div>
      </div>

      {/* Colonne vitrine (notre identité) */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 44px', background: 'linear-gradient(150deg, rgba(255,60,120,.22), rgba(124,60,190,.16) 55%, rgba(20,12,26,.9))', borderLeft: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent-strong)' }}>CREATIVE INTELLIGENCE</div>
        <h2 style={{ margin: '10px 0 14px', fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: -0.5 }}>Des créas qui performent, pilotées par la donnée.</h2>
        <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(255,255,255,.82)', lineHeight: 1.6, maxWidth: 420 }}>
          Génère, clone et itère tes publicités · Jarvis apprend de la veille et de tes performances pour te dire ce qui va marcher, avant de dépenser.
        </p>
        <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Pubs IA', 'Clone gagnants', 'Score Jarvis', 'Multi-marques', 'Analytics'].map((t) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 700, color: '#fff', padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)' }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>{title}</h1>
      <p style={{ margin: '6px 0 22px', fontSize: 14, color: 'var(--ink-2)' }}>{sub}</p>
      {children}
    </div>
  );
}
function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>{children}</div>;
}
function Card({ active, onClick, emoji, label, hint, check }: { active: boolean; onClick: () => void; emoji?: string; label: string; hint?: string; check?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: 'relative', textAlign: 'left', padding: '15px 16px', borderRadius: 14, cursor: 'pointer',
      border: `1.5px solid ${active ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: active ? 'var(--accent-soft)' : 'var(--surface)',
    }}>
      {check && <span style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: active ? '#18cc8c' : 'transparent', color: active ? '#04140d' : 'transparent', border: active ? 'none' : '1.5px solid var(--line-2)' }}>✓</span>}
      {emoji && <div style={{ fontSize: 22 }}>{emoji}</div>}
      <div style={{ marginTop: emoji ? 8 : 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{label}</div>
      {hint && <div style={{ marginTop: 3, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{hint}</div>}
    </button>
  );
}

const field: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 15, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 };
const primaryBtn: React.CSSProperties = { padding: '12px 22px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 14, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '12px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
