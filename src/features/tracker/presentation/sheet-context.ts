import { createContext, useContext } from 'react';

// Entry forms open as a sheet over the current page instead of replacing it.
export type Sheet =
  | { kind: 'entry'; mode?: 'expense' | 'income'; walletId?: string; edit?: string; duplicate?: string }
  | { kind: 'transfer'; walletId?: string }
  | { kind: 'wallet' };
export type SheetFrame = { params: Record<string, string | undefined>; close: (saved?: string) => void; replace: (sheet: Sheet) => void };

export const FrameContext = createContext<SheetFrame | null>(null);
export const OpenContext = createContext<(sheet: Sheet) => void>(() => undefined);

// Inside a sheet: its parameters and how to leave. Null when the form is a full page (deep link).
export const useSheetFrame = () => useContext(FrameContext);
export const useOpenSheet = () => useContext(OpenContext);
