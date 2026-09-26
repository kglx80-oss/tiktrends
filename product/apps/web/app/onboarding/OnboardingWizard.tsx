'use client';

import { useState, type ReactNode } from 'react';
import { useIsMobile } from '../../components/useIsMobile';
import { useRouter } from 'next/navigation';
import { saveOnboardingAction } from '../actions/onboarding';
import { Icon } from '../../components/Icon';

const PROFILES = [
  { key: 'brand', label: 'Marque / E-commerce', hint: 'Créa en interne', icon: 'tag' },
  { key: 'agency', label: 'Agence', hint: 'Travail client, en équipe', icon: 'store' },
  { key: 'freelancer', label: 'Freelance', hint: 'Travail client, en solo', icon: 'user' },
  { key: 'ai_artist', label: 'AI Artist', hint: 'Art & expérimentations', icon: 'palette' },
  { key: 'other', label: 'Autre', hint: 'Je verrai en avançant', icon: 'sparkles' },
];
// Expérience PUBLICITAIRE · c'est le domaine où Jarvis ajuste son
// accompagnement (pas l'aisance avec l'IA · cf. accueil.ts · NIVEAU_PAR_PUB).
const AD_LEVELS = [
  { key: 'debute', label: 'Je débute', hint: "Pas encore lancé de vraie campagne" },
  { key: 'cree', label: 'Je crée déjà des pubs', hint: 'Je produis des créas régulièrement' },
  { key: 'teste', label: 'Je teste régulièrement', hint: "J'itère et je compare mes résultats" },
  { key: 'metier', label: "C'est mon métier", hint: 'La publicité est mon quotidien' },
];
const GOALS = [
  { key: 'ads', label: 'Créer des pubs qui vendent', icon: 'spark' },
  { key: 'clone', label: 'Cloner des pubs gagnantes', icon: 'star' },
  { key: 'analyze', label: 'Analyser mes performances', icon: 'chart' },
  { key: 'scale', label: 'Produire à grande échelle', icon: 'plug' },
  { key: 'multi', label: 'Gérer plusieurs marques', icon: 'layers' },
  { key: 'video', label: 'Passer à la vidéo IA', icon: 'film' },
];

const TOTAL = 4;

export function OnboardingWizard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState('');
  const [adLevel, setAdLevel] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [brandName, setBrandName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Écran étroit · l'illustration et le formulaire s'empilent (le split débordait).
  const mobile = useIsMobile();

  const toggleGoal = (k: string) => setGoals((g) => g.includes(k) ? g.filter((x) => x !== k) : [...g, k]);
  // La dernière étape CRÉE la marque · sans nom, l'action n'en crée aucune et
  // marquait quand même le compte onboardé · l'utilisateur retombait sur un
  // tableau de bord vide, après un écran qui promettait « on la crée pour toi ».
  const peutFinir = !!brandName.trim();
  const canNext = step === 0 ? !!profile : step === 1 ? !!adLevel : step === 2 ? goals.length > 0 : peutFinir;

  async function finish() {
    if (busy || !peutFinir) return;
    setErr(null);
    setBusy(true);
    // On ne navigue que si le serveur a RÉUSSI · l'ancienne version poussait
    // vers le dashboard quoi qu'il arrive, et une erreur (ou un throw) laissait
    // le bouton figé sur « Préparation… », sans un mot.
    try {
      const r = await saveOnboardingAction({ profile, adLevel, goals, brandName, siteUrl });
      if (r.error) { setErr(r.error); setBusy(false); return; }
      // La fin ouvre JARVIS · l'objectif choisi oriente déjà ses trois
      // suggestions (cf. accueil.ts) · on arrive donc sur une conversation
      // pertinente, pas sur un tableau de bord vide.
      router.push('/jarvis');
      router.refresh();
    } catch {
      setErr('La préparation a échoué. Réessaie dans un instant.');
      setBusy(false);
    }
  }

  /**
   * Passer · l'accès à Jarvis ne se mérite pas en finissant le questionnaire.
   *
   * On enregistre ce qui a DÉJÀ été répondu (rien n'est perdu) et on marque le
   * compte comme onboardé · sans ça, le layout renverrait l'utilisateur ici à
   * chaque page, et « passer » ne passerait rien. Aucune marque n'est créée si
   * on n'a pas donné de nom · Jarvis proposera alors d'en choisir une.
   */
  async function passer() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await saveOnboardingAction({ profile, adLevel, goals, brandName, siteUrl });
      if (r.error) { setErr(r.error); setBusy(false); return; }
      router.push('/jarvis');
      router.refresh();
    } catch {
      setErr('Impossible d’ouvrir Jarvis pour l’instant. Réessaie dans un instant.');
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) minmax(0,520px)', background: 'var(--bg, #0b070d)' }}>
      {/* Colonne formulaire */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px min(8vw, 90px)', maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--grad-accent)' }} />
          <b style={{ fontSize: 16, color: 'var(--ink)' }}>TikTrends</b>
          <span style={{ flex: 1 }} />
          {/* Passer · toujours accessible · on n'oblige personne à finir le
              questionnaire pour parler à Jarvis (spec · le parcours est facultatif). */}
          <button type="button" onClick={passer} disabled={busy} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
            Passer →
          </button>
        </div>

        {step === 0 && (
          <Step title={`Bienvenue${firstName ? `, ${firstName}` : ''}`} sub="Pour personnaliser ton espace : qui es-tu ?">
            <Grid>
              {PROFILES.map((p) => <Card key={p.key} active={profile === p.key} onClick={() => setProfile(p.key)} icon={p.icon} label={p.label} hint={p.hint} />)}
            </Grid>
          </Step>
        )}
        {step === 1 && (
          <Step title="Où en es-tu avec la publicité ?" sub="On adapte le niveau d'explication à ton expérience, sans jamais rien te fermer.">
            <Grid>
              {AD_LEVELS.map((p) => <Card key={p.key} active={adLevel === p.key} onClick={() => setAdLevel(p.key)} label={p.label} hint={p.hint} />)}
            </Grid>
          </Step>
        )}
        {step === 2 && (
          <Step title="Ton objectif principal ?" sub="Plusieurs choix possibles · on met en avant ce qui compte pour toi.">
            <Grid>
              {GOALS.map((p) => <Card key={p.key} active={goals.includes(p.key)} onClick={() => toggleGoal(p.key)} icon={p.icon} label={p.label} check />)}
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

        {/* Progression + navigation · l'étape est dite en toutes lettres (X/4),
            pas seulement par une barre · on sait où l'on en est. */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginTop: 30 }}>Étape {step + 1}/{TOTAL}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span key={i} style={{ height: 4, flex: 1, borderRadius: 999, background: i <= step ? 'var(--accent-strong)' : 'var(--line-2)', transition: 'background .2s' }} />
            ))}
          </div>
          {step > 0 && <button type="button" onClick={() => setStep((n) => n - 1)} style={ghostBtn}>Retour</button>}
          {step < TOTAL - 1
            ? <button type="button" onClick={() => canNext && setStep((n) => n + 1)} disabled={!canNext} style={{ ...primaryBtn, opacity: canNext ? 1 : .5 }}>Continuer</button>
            : <button type="button" onClick={finish} disabled={busy || !peutFinir} title={!peutFinir ? 'Donne un nom à ta marque' : undefined} style={{ ...primaryBtn, opacity: busy || !peutFinir ? .5 : 1, cursor: busy || !peutFinir ? 'default' : 'pointer' }}>{busy ? 'Préparation…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Démarrer <Icon name="spark" size={14} /></span>}</button>}
        </div>

        {/* Le refus, dit là où l'on clique · pas de navigation muette sur échec. */}
        {err && (
          <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--accent-strong)', fontWeight: 600 }}>{err}</p>
        )}
      </div>

      {/* Colonne vitrine (notre identité) */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 44px', background: 'linear-gradient(150deg, rgba(255,60,120,.22), rgba(124,60,190,.16) 55%, rgba(20,12,26,.9))', borderLeft: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent-strong)' }}>CREATIVE INTELLIGENCE</div>
        <h2 style={{ margin: '10px 0 14px', fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: '#fff', lineHeight: 1.15, letterSpacing: -0.5 }}>Des créas guidées par la donnée, du repérage au test.</h2>
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
function Card({ active, onClick, icon, label, hint, check }: { active: boolean; onClick: () => void; icon?: string; label: string; hint?: string; check?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      position: 'relative', textAlign: 'left', padding: '15px 16px', borderRadius: 14, cursor: 'pointer',
      border: `1.5px solid ${active ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: active ? 'var(--accent-soft)' : 'var(--surface)',
    }}>
      {check && <span style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: active ? '#18cc8c' : 'transparent', color: active ? '#04140d' : 'transparent', border: active ? 'none' : '1.5px solid var(--line-2)' }}>✓</span>}
      {icon && <div style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name={icon} size={22} /></div>}
      <div style={{ marginTop: icon ? 8 : 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{label}</div>
      {hint && <div style={{ marginTop: 3, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{hint}</div>}
    </button>
  );
}

const field: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 15, outline: 'none' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 };
const primaryBtn: React.CSSProperties = { padding: '12px 22px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 14, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { padding: '12px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
