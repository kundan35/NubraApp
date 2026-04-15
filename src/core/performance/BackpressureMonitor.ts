// BackpressureMonitor.ts
// Measures JS thread health via setTimeout lag + rAF FPS.
// Reports pressure level to native every 200ms.
// Native uses this to throttle how much data it sends to JS.
//
// This solves the NEW bottleneck (rendering) not the old one (bridge).
// Article insight: bridge is gone with JSI. Optimize rendering now.

import { NativeModules } from 'react-native';

const { NubraMarketWebSocket } = NativeModules;

export type PressureLevel = 'NORMAL' | 'MEDIUM' | 'HIGH';

export class BackpressureMonitor {
  private lag      = 0;
  private fps      = 60;
  private frames: number[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private rafId:      number | null = null;

  start() {
    this.measureLag();
    this.measureFPS();
    this.intervalId = setInterval(() => this.report(), 200);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.rafId)      cancelAnimationFrame(this.rafId);
    this.intervalId = null;
    this.rafId      = null;
  }

  getLevel(): PressureLevel {
    if (this.lag > 50 || this.fps < 30) return 'HIGH';
    if (this.lag > 16 || this.fps < 50) return 'MEDIUM';
    return 'NORMAL';
  }

  getLag()  { return this.lag; }
  getFPS()  { return this.fps; }

  private measureLag() {
    const scheduled = Date.now();
    setTimeout(() => {
      this.lag = Date.now() - scheduled;
      setTimeout(() => this.measureLag(), 100);
    }, 0);
  }

  private measureFPS() {
    const now = performance.now();
    this.frames.push(now);
    if (this.frames.length > 30) this.frames.shift();

    if (this.frames.length >= 2) {
      const elapsed =
        this.frames[this.frames.length - 1] - this.frames[0];
      this.fps = ((this.frames.length - 1) / elapsed) * 1000;
    }

    this.rafId = requestAnimationFrame(() => this.measureFPS());
  }

  private report() {
    try {
      NubraMarketWebSocket?.reportPressure?.(this.getLevel());
    } catch {
      // Native module not ready yet — ignore
    }
  }
}

// Singleton — one monitor for the entire app
export const backpressureMonitor = new BackpressureMonitor();
