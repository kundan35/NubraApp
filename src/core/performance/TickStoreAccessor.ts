// TickStoreAccessor.ts
// Wraps the C++ JSI HostObject (global.nubraTickStore).
// Provides typed access to the zero-serialization tick store.
//
// How it works:
// - Kotlin writes decoded Protobuf ticks to C++ TickStore via JNI
// - JS reads via JSI — synchronous, no bridge, no await
// - drainDirty() returns ONLY symbols that changed since last call
// - Called at 60fps from rAF loop — JS thread is in control of read rate

export interface RawTick {
  symbol:    string;
  ltp:       number;
  open:      number;
  high:      number;
  low:       number;
  volume:    number;
  oi:        number;
  timestamp: number;
  bid:       number;
  ask:       number;
  change:    number;
  changePct: number;
}

// Access the C++ HostObject registered during JNI_OnLoad
function getTickStore(): any {
  return (global as any).nubraTickStore ?? null;
}

export const TickStoreAccessor = {
  // Returns ticks that changed since last call — zero serialization
  // If nothing changed returns empty array — fast path, zero work
  drainDirty(): RawTick[] {
    const store = getTickStore();
    if (!store) return [];
    try {
      return store.drainDirty() ?? [];
    } catch {
      return [];
    }
  },

  // Read single symbol synchronously — no await, no callback
  getLatest(symbol: string): RawTick | null {
    const store = getTickStore();
    if (!store) return null;
    try {
      return store.getLatest(symbol) ?? null;
    } catch {
      return null;
    }
  },

  isAvailable(): boolean {
    return getTickStore() !== null;
  },
};
