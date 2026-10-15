import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Overview } from '../../../domain/ledger';
import { eventTime } from '../../../domain/date';
import { prepareOffline } from '../../../platform/storage';
import type { TrackerService } from '../application/tracker-service';
import { getTracker } from '../application/runtime';

type TrackerState = {
  service: TrackerService | null; overview: Overview | null; loading: boolean;
  error: string | null; refresh: () => Promise<void>;
};
const Context = createContext<TrackerState | null>(null);

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<TrackerService | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const tracker = await getTracker();
      if (generation.current !== current) return;
      setLoading(true);
      const result = await tracker.repository.overview();
      if (generation.current !== current) return;
      setService(tracker); setOverview(result); setError(null);
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : 'Local data is unavailable. Retry to open it.');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Opens the external database asynchronously; this is not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void prepareOffline();
    let localDate = eventTime().localDate;
    const dayCheck = setInterval(() => {
      const nextDate = eventTime().localDate;
      if (nextDate !== localDate) { localDate = nextDate; void refresh(); }
    }, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { subscription.remove(); clearInterval(dayCheck); };
  }, [refresh]);
  return <Context.Provider value={{ service, overview, loading, error, refresh }}>{children}</Context.Provider>;
}

export function useTracker(): TrackerState {
  const state = useContext(Context);
  if (!state) throw new Error('TrackerProvider is required.');
  return state;
}
