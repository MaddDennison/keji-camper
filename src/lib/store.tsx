import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { AppData, Camper, Memory, Settings, Trip } from '../types';
import { uid } from './format';

/**
 * Local-first store: everything lives in localStorage under one key, with
 * JSON export/import (merge-by-id) so friends can swap journals.
 * The reducer is the single write path — a future hosted backend only needs
 * to replay these actions (see docs/ARCHITECTURE.md §6).
 */

const KEY = 'keji-camper/v1';

const DEFAULTS: AppData = {
  version: 1,
  campers: [],
  trips: [],
  memories: [],
  settings: { paddleKmh: 4, hikeKmh: 3.5, userName: '' },
};

type Action =
  | { type: 'trip/save'; trip: Trip }
  | { type: 'trip/delete'; id: string }
  | { type: 'memory/save'; memory: Memory }
  | { type: 'memory/delete'; id: string }
  | { type: 'camper/save'; camper: Camper }
  | { type: 'camper/delete'; id: string }
  | { type: 'settings/save'; settings: Partial<Settings> }
  | { type: 'import/merge'; data: AppData }
  | { type: 'reset' };

function upsert<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = [...arr];
  next[i] = item;
  return next;
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'trip/save':
      return { ...state, trips: upsert(state.trips, action.trip) };
    case 'trip/delete':
      return { ...state, trips: state.trips.filter((t) => t.id !== action.id) };
    case 'memory/save':
      return { ...state, memories: upsert(state.memories, action.memory) };
    case 'memory/delete':
      return { ...state, memories: state.memories.filter((m) => m.id !== action.id) };
    case 'camper/save':
      return { ...state, campers: upsert(state.campers, action.camper) };
    case 'camper/delete':
      return { ...state, campers: state.campers.filter((c) => c.id !== action.id) };
    case 'settings/save':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'import/merge': {
      const d = action.data;
      let next = state;
      for (const c of d.campers ?? []) next = reducer(next, { type: 'camper/save', camper: c });
      for (const t of d.trips ?? []) next = reducer(next, { type: 'trip/save', trip: t });
      for (const m of d.memories ?? []) next = reducer(next, { type: 'memory/save', memory: m });
      return next;
    }
    case 'reset':
      return DEFAULTS;
    default:
      return state;
  }
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, settings: { ...DEFAULTS.settings, ...parsed.settings } };
  } catch {
    return DEFAULTS;
  }
}

interface StoreCtx {
  data: AppData;
  dispatch: React.Dispatch<Action>;
  visitedPlaceIds: Set<string>;
  exportJson: () => void;
  importJson: (file: File) => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage full — consider exporting & trimming photos', e);
    }
  }, [data]);

  const visitedPlaceIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of data.memories) s.add(m.placeId);
    for (const t of data.trips) {
      if (t.status === 'completed') for (const stop of t.stops) s.add(stop);
    }
    return s;
  }, [data.memories, data.trips]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keji-camper-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1) throw new Error('Not a Keji Camper export');
    dispatch({ type: 'import/merge', data: parsed });
  };

  return (
    <Ctx.Provider value={{ data, dispatch, visitedPlaceIds, exportJson, importJson }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}

export function newTrip(): Trip {
  return {
    id: uid(),
    name: '',
    startDate: '',
    // start → night 1 → finish scaffold; the finish mirrors the start until edited
    stops: ['', '', ''],
    modes: ['paddle', 'paddle'],
    modesLocked: [false, false],
    partyIds: [],
    notes: '',
    status: 'planned',
  };
}

/** Downscale & compress an image file to a small JPEG data-URL. */
export async function compressPhoto(file: File, maxDim = 1024, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
