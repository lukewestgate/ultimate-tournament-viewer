import { useT } from '../ctx';
import { IReplay } from '../icons';

/** Replay banner (full controls come with the replay screen). */
export function ReplayBar() {
  const c = useT();
  return (
    <div className="bn replay sticky">
      <IReplay size={18} />
      <span style={{ flex: 1 }}>Replay</span>
      <button onClick={() => c.setReplayAt(undefined)}>Exit</button>
    </div>
  );
}
