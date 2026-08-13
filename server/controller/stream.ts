export type TerminalStreamEvent = {
  sessionId: string;
  sequence: number;
  kind: "stdout" | "stderr" | "stdin" | "status";
  payload: string;
  createdAt: Date;
};

type Listener = (event: TerminalStreamEvent) => void;

class TerminalEventBus {
  private listeners = new Map<string, Set<Listener>>();

  publish(event: TerminalStreamEvent) {
    this.listeners.get(event.sessionId)?.forEach(listener => listener(event));
  }

  subscribe(sessionId: string, listener: Listener) {
    const listeners = this.listeners.get(sessionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionId);
    };
  }
}

export const terminalEventBus = new TerminalEventBus();
