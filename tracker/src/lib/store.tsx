import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Card, Commit, JournalEntry, Plan } from "../types";
import { gitLog, loadList } from "./api";
import { toCard, toJournal, toPlan } from "./model";

export interface Store {
  cards: Card[];
  plans: Plan[];
  journal: JournalEntry[];
  commits: Commit[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  toast: (m: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, onToast }: { children: ReactNode; onToast: (m: string) => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      loadList("issues"),
      loadList("planning"),
      loadList("journal"),
      gitLog({ days: 63 }),
    ])
      .then(([i, p, j, c]) => {
        if (!alive) return;
        setCards(i.map(toCard));
        setPlans(p.map(toPlan));
        setJournal(j.map(toJournal).sort((a, b) => b.date.localeCompare(a.date)));
        setCommits(c);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "load failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  const value = useMemo<Store>(
    () => ({ cards, plans, journal, commits, loading, error, reload, toast: onToast }),
    [cards, plans, journal, commits, loading, error, reload, onToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
