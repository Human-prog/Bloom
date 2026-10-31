/**
 * Pomodoro timer: local-only, no API.
 */
let timerState = { active: false, start: 0, targetMs: 25 * 60 * 1000 };

function start(minutes) {
  timerState = { active: true, start: Date.now(), targetMs: (minutes || 25) * 60 * 1000 };
  return { ok: true, minutes: minutes || 25 };
}

function stop() { timerState.active = false; return { ok: true, stopped: true }; }

function status() {
  if (!timerState.active) return { ok: true, active: false, remaining: 0 };
  const elapsed = Date.now() - timerState.start;
  const remaining = Math.max(0, timerState.targetMs - elapsed);
  return { ok: true, active: true, remainingMs: remaining, targetMs: timerState.targetMs };
}

module.exports = { start, stop, status };
