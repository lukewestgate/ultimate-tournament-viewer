import { ISparkle } from '../../icons';
import './FixOptions.css';

export interface FixOptionsProps {
  /** An OpenRouter key is saved: AI leads. Without one, Map it yourself leads and AI is a single line. */
  hasKey: boolean;
  /** Nothing usable was read yet (no games). */
  noGames?: boolean;
  onAi: () => void;
  onMap: () => void;
  /** Where to add a key (App settings). */
  onAddKey: () => void;
}

/** The next rungs of the fix ladder, for what the problem rows can't fix: Fix with AI, then Map it yourself. */
export function FixOptions({ hasKey, noGames, onAi, onMap, onAddKey }: FixOptionsProps) {
  const ai = (
    <div className="fixopt">
      <span className="fixopt-text">
        AI rereads the whole sheet in 1–3 minutes, for a cent or two.
        <small>You see the changes before anything is used.</small>
      </span>
      <button className="btn small violet" onClick={onAi}>
        <ISparkle size={16} /> Fix with AI
      </button>
    </div>
  );
  const map = (
    <div className="fixopt">
      <span className="fixopt-text">
        Tap the sheet to show where the {noGames ? 'games are' : 'games, pools and seeding are'}.<small>Takes a few minutes. Each step says what to tap.</small>
      </span>
      <button className={`btn small${hasKey ? '' : ' primary'}`} onClick={onMap}>
        Map it yourself
      </button>
    </div>
  );
  return (
    <section className="card fixopts">
      <h3>{noGames ? 'Show the app where the games are' : 'Can’t fix it from the list?'}</h3>
      {hasKey ? (
        <>
          {ai}
          {map}
        </>
      ) : (
        <>
          {map}
          <p className="fixopt-key">
            Have an OpenRouter key? AI can do this for you.{' '}
            <button className="link-btn" onClick={onAddKey}>
              Add a key
            </button>
          </p>
        </>
      )}
    </section>
  );
}
