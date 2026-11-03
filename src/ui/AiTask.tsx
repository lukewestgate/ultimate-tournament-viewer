import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_MODEL, TIMEOUTS, type AiCall, type AiErrorKind, type AiPhase, type AiProgress, type Usage } from '../mapping/ai';
import { store } from '../store/app';
import { href } from './router';
import { useOverlay } from './overlay';
import { ICheck } from './icons';

export interface AiOutcome {
  error?: string;
  errorKind?: AiErrorKind;
  usage?: Usage;
}

export interface AiControls {
  call: AiCall;
  onProgress: (p: AiProgress) => void;
}

const ERRORS: Record<AiErrorKind, { title: string; hint: string; link?: 'settings' | 'credit' }> = {
  key: { title: 'Key not accepted', hint: 'Check the OpenRouter key in App settings. It should start with “sk-or-”.', link: 'settings' },
  credit: { title: 'Out of credit', hint: 'Add credit on OpenRouter, or choose a cheaper or free model in App settings.', link: 'credit' },
  model: { title: 'Model not available', hint: 'Check the model name in App settings, or clear it to use the recommended default.', link: 'settings' },
  rate: { title: 'Model is busy', hint: 'Wait a minute and try again, or choose another model in App settings.' },
  timeout: { title: 'No answer in time', hint: 'Try again. If it keeps happening, choose a faster model in App settings.', link: 'settings' },
  network: { title: 'Couldn’t reach OpenRouter', hint: 'Check your connection and try again.' },
  server: { title: 'OpenRouter had a problem', hint: 'This is usually temporary. Try again in a moment.' },
  reply: { title: 'The answer wasn’t usable', hint: 'AI doesn’t always get it right. Trying again often works.' },
  cancelled: { title: 'Cancelled', hint: 'Nothing was changed.' },
};

const n = (x: number) => x.toLocaleString('en-GB');
const kb = (chars: number) => `${Math.max(1, Math.round(chars / 1024))} KB`;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const modelName = () => store.app.aiModel || DEFAULT_MODEL;

/** A line saying what the AI cost: tokens and an estimate in dollars. */
export function UsageLine({ usage, ms }: { usage?: Usage; ms?: number }) {
  const tokens = usage ? usage.promptTokens + usage.completionTokens : 0;
  if (!tokens && !ms) return null;
  return (
    <span className="small muted ai-usage">
      {modelName()}
      {ms ? ` · ${(ms / 1000).toFixed(0)} s` : ''}
      {tokens ? ` · ${n(tokens)} tokens · about $${usage!.cost.toFixed(4)}` : ''}
    </span>
  );
}

/**
 * Runs one AI job with live feedback: the steps so far, what the model is doing (thinking or
 * writing, with a running count), elapsed time and a Cancel button; then the job's own result,
 * or an error with what to do next and Try again.
 */
export function AiTask<R extends AiOutcome>({
  intro,
  checking = true,
  typical = 'This usually takes 10–60 seconds.',
  slowAfter = 45_000,
  run,
  done,
}: {
  /** Shown first with an "Ask AI" button; without it the job starts straight away. */
  intro?: ReactNode;
  /** The job checks the answer against the sheet afterwards. */
  checking?: boolean;
  /** How long the job usually takes, shown while it runs. */
  typical?: string;
  /** Milliseconds after which the job counts as slow. */
  slowAfter?: number;
  run: (ctl: AiControls) => Promise<R>;
  done: (r: R, info: { ms: number; again: () => void }) => ReactNode;
}) {
  const overlay = useOverlay();
  const [state, setState] = useState<'idle' | 'running' | 'done'>(intro ? 'idle' : 'running');
  const [progress, setProgress] = useState<AiProgress>({ phase: 'reading', attempt: 1, thinking: 0, writing: 0 });
  const [result, setResult] = useState<R | undefined>();
  const [started, setStarted] = useState(0);
  const [ms, setMs] = useState(0);
  const ctl = useRef<AbortController | undefined>(undefined);

  const start = () => {
    ctl.current?.abort();
    const me = new AbortController();
    ctl.current = me;
    const t0 = Date.now();
    setStarted(t0);
    setMs(0);
    setResult(undefined);
    setProgress({ phase: 'reading', attempt: 1, thinking: 0, writing: 0 });
    setState('running');
    const call: AiCall = { key: store.app.aiKey ?? '', model: store.app.aiModel, signal: me.signal };
    // A macrotask first, so the running state paints before any synchronous sheet reading.
    setTimeout(() => {
      run({ call, onProgress: (p) => !me.signal.aborted && setProgress(p) })
        .catch((e: unknown): R => ({ error: (e as Error)?.message || 'Something went wrong.', errorKind: 'reply' }) as R)
        .then((r) => {
          if (ctl.current !== me) return;
          setMs(Date.now() - t0);
          setResult(r);
          setState('done');
        });
    }, 0);
  };

  useEffect(() => {
    if (!intro) start();
    return () => ctl.current?.abort();
    // Start once on mount; later runs come from the buttons.
  }, []);

  useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => setMs(Date.now() - started), 500);
    return () => clearInterval(id);
  }, [state, started]);

  if (state === 'idle')
    return (
      <div className="stack">
        {intro}
        <button className="btn violet" onClick={start}>
          Ask AI
        </button>
      </div>
    );

  if (state === 'running')
    return (
      <AiProgressView
        progress={progress}
        ms={ms}
        checking={checking}
        typical={typical}
        slowAfter={slowAfter}
        onCancel={() => {
          ctl.current?.abort();
          ctl.current = undefined;
          setMs(Date.now() - started);
          setResult({ error: 'Cancelled.', errorKind: 'cancelled' } as R);
          setState('done');
        }}
      />
    );

  if (!result) return null;
  if (result.error) {
    const e = ERRORS[result.errorKind ?? 'reply'];
    return (
      <div className="stack ai-error" role="alert">
        <div className="ai-error-head">
          <span className={`ai-error-mark${result.errorKind === 'cancelled' ? ' quiet' : ''}`} aria-hidden="true">
            {result.errorKind === 'cancelled' ? '–' : '!'}
          </span>
          <b>{e.title}</b>
        </div>
        {result.errorKind !== 'cancelled' && <p className="ai-error-msg">{result.error}</p>}
        <p className="small muted" style={{ margin: 0 }}>
          {e.hint}{' '}
          {e.link === 'settings' && (
            <a href={href({ name: 'appSettings' })} onClick={() => overlay.closeSheet()}>
              Open App settings
            </a>
          )}
          {e.link === 'credit' && (
            <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">
              OpenRouter credits
            </a>
          )}
        </p>
        <UsageLine usage={result.usage} ms={ms} />
        <div className="two-btns">
          <button className="btn" onClick={() => overlay.closeSheet()}>
            Close
          </button>
          <button className="btn violet" onClick={start}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <>{done(result, { ms, again: start })}</>;
}

type StepState = 'done' | 'on' | 'todo';

function AiProgressView({
  progress: p,
  ms,
  checking,
  typical,
  slowAfter,
  onCancel,
}: {
  progress: AiProgress;
  ms: number;
  checking: boolean;
  typical: string;
  slowAfter: number;
  onCancel: () => void;
}) {
  const order: AiPhase[] = ['reading', 'waiting', 'thinking', 'writing', 'checking'];
  const at = order.indexOf(p.phase);
  const st = (phase: AiPhase): StepState => {
    const i = order.indexOf(phase);
    return i < at ? 'done' : i === at ? 'on' : 'todo';
  };
  // Waiting and thinking are one step: the model is working before it writes anything.
  const think: StepState = at > 2 ? 'done' : at >= 1 ? 'on' : 'todo';
  const steps: { key: string; s: StepState; label: string; sub?: string }[] = [
    { key: 'read', s: st('reading'), label: st('reading') === 'done' ? 'Read the sheet' : 'Reading the sheet…', sub: p.sent ? `${kb(p.sent)} sent to OpenRouter` : undefined },
    {
      key: 'think',
      s: think,
      label: think === 'done' ? (p.thinking ? 'Model thought it through' : 'Model started answering') : p.phase === 'thinking' ? 'Model is thinking…' : 'Waiting for the model…',
      sub: [p.rounds && p.rounds > 1 ? `Step ${p.attempt} of up to ${p.rounds}` : '', p.phase === 'thinking' ? `${n(p.thinking)} characters of reasoning` : think === 'on' ? modelName() : ''].filter(Boolean).join(' · ') || undefined,
    },
    { key: 'write', s: st('writing'), label: st('writing') === 'done' ? 'Answer received' : 'Writing the answer…', sub: p.phase === 'writing' ? `${n(p.writing)} characters` : undefined },
  ];
  if (checking) steps.push({ key: 'check', s: st('checking'), label: 'Checking it against the sheet…' });
  const slow = ms > slowAfter;
  const did = p.steps ?? [];
  return (
    <div className="stack ai-run" aria-live="polite">
      <div className="ai-run-head">
        <span className="ai-pulse" aria-hidden="true" />
        <b>Asking AI</b>
        <span style={{ flex: 1 }} />
        <span className="d ai-clock" aria-label={`${Math.floor(ms / 1000)} seconds`}>
          {clock(ms)}
        </span>
      </div>
      {(p.retry ?? (p.attempt > 1 && !p.rounds)) && <p className="ai-retry small">The answer didn’t fit the sheet, so we sent the problems back for one more try.</p>}
      <ol className="ai-steps">
        {steps.map((x) => (
          <li key={x.key} className={x.s}>
            <span className="ai-step-mark" aria-hidden="true">
              {x.s === 'done' ? <ICheck size={14} /> : x.s === 'on' ? <span className="ai-spin" /> : null}
            </span>
            <span className="ai-step-text">
              <span>{x.label}</span>
              {x.sub && x.s !== 'todo' && <small className="muted">{x.sub}</small>}
            </span>
          </li>
        ))}
      </ol>
      {did.length > 0 && <AiSteps steps={did} last={4} />}
      <p className={`small ${slow ? 'ai-slow' : 'muted'}`} style={{ margin: 0 }}>
        {slow ? `Taking longer than usual. Some models think for a few minutes; we stop waiting for any one answer at ${clock(TIMEOUTS.total)}.` : typical}
      </p>
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** What the AI did on the way (looked at cells, tried a mapping), newest last. */
export function AiSteps({ steps, last }: { steps: string[]; last?: number }) {
  const shown = last ? steps.slice(-last) : steps;
  return (
    <div className="ai-notes">
      <b className="small">What the AI did</b>
      <ul className="small">
        {steps.length > shown.length && <li className="muted">{steps.length - shown.length} earlier steps</li>}
        {shown.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
