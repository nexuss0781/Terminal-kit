import { describe, expect, it } from "vitest";
import { terminalEventBus } from "./stream";

describe("terminal event stream", () => {
  it("delivers ordered terminal events to subscribed session listeners and stops after unsubscribe", () => {
    const received: number[] = [];
    const unsubscribe = terminalEventBus.subscribe("session-test", event => received.push(event.sequence));
    terminalEventBus.publish({ sessionId: "session-test", sequence: 1, kind: "stdout", payload: "one", createdAt: new Date() });
    terminalEventBus.publish({ sessionId: "session-test", sequence: 2, kind: "stderr", payload: "two", createdAt: new Date() });
    unsubscribe();
    terminalEventBus.publish({ sessionId: "session-test", sequence: 3, kind: "stdout", payload: "three", createdAt: new Date() });
    expect(received).toEqual([1, 2]);
  });
});
