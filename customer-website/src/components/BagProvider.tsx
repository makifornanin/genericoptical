"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { addLine, BAG_STORAGE_KEY, bagCount, MAX_QTY, parseStoredBag, type BagLine } from "@/lib/bag";

/*
 * The bag, kept in localStorage so it survives reloads and is shared between tabs (an external store
 * read with useSyncExternalStore). `ready` is false during server rendering and hydration, so pages
 * don't flash "empty" before the stored bag is read. If storage is blocked, the bag lives in memory
 * for this page.
 */

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedLines: BagLine[] = [];
let memoryOnly = false;

function readBag(): BagLine[] {
  if (memoryOnly) return cachedLines;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(BAG_STORAGE_KEY);
  } catch {
    memoryOnly = true;
    return cachedLines;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedLines = parseStoredBag(raw);
  }
  return cachedLines;
}

function writeBag(lines: BagLine[]) {
  const raw = JSON.stringify(lines);
  try {
    window.localStorage.setItem(BAG_STORAGE_KEY, raw);
  } catch {
    memoryOnly = true;
  }
  cachedRaw = raw;
  cachedLines = lines;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === BAG_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

type BagState = {
  lines: BagLine[];
  ready: boolean;
  count: number;
  add: (line: BagLine) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** The line just added (drives the "added to your bag" panel). */
  lastAdded: BagLine | null;
  dismissAdded: () => void;
};

const BagContext = createContext<BagState | null>(null);
const NOT_READY: BagLine[] | null = null;

export function BagProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, readBag, () => NOT_READY);
  const [lastAdded, setLastAdded] = useState<BagLine | null>(null);
  const lines = useMemo(() => stored ?? [], [stored]);
  const dismissAdded = useCallback(() => setLastAdded(null), []);

  const value = useMemo<BagState>(
    () => ({
      lines,
      ready: stored !== null,
      count: bagCount(lines),
      lastAdded,
      add: (line) => {
        writeBag(addLine(readBag(), line));
        setLastAdded(line);
      },
      setQuantity: (id, quantity) => writeBag(readBag().map((l) => (l.id === id ? { ...l, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) } : l))),
      remove: (id) => writeBag(readBag().filter((l) => l.id !== id)),
      clear: () => writeBag([]),
      dismissAdded,
    }),
    [lines, stored, lastAdded, dismissAdded],
  );

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagState {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used inside <BagProvider>");
  return ctx;
}
