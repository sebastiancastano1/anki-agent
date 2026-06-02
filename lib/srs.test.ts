import { describe, it, expect } from "vitest";
import { scheduleNext, type SrsState } from "./srs";

const fresh: SrsState = { ease: 2.5, interval: 0, repetitions: 0 };

describe("scheduleNext (SM-2)", () => {
  it("first 'good' review schedules 1 day out", () => {
    const r = scheduleNext(fresh, "good");
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
  });

  it("second 'good' review schedules 6 days out", () => {
    const r1 = scheduleNext(fresh, "good");
    const r2 = scheduleNext(r1, "good");
    expect(r2.repetitions).toBe(2);
    expect(r2.interval).toBe(6);
  });

  it("third 'good' multiplies interval by ease", () => {
    let s: SrsState = fresh;
    s = scheduleNext(s, "good");
    s = scheduleNext(s, "good");
    const r3 = scheduleNext(s, "good");
    expect(r3.interval).toBe(Math.round(6 * r3.ease));
  });

  it("'again' resets repetitions and interval", () => {
    let s: SrsState = fresh;
    s = scheduleNext(s, "good");
    s = scheduleNext(s, "good");
    const r = scheduleNext(s, "again");
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(0);
  });

  it("ease never drops below 1.3", () => {
    let s: SrsState = fresh;
    for (let i = 0; i < 10; i++) s = scheduleNext(s, "again");
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("'easy' increases ease", () => {
    const r = scheduleNext(fresh, "easy");
    expect(r.ease).toBeGreaterThan(2.5);
  });
});
