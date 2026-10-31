/**
 * Signal Handler — GhostControl-style action trigger for Bloom Notch
 *
 * Handles keyboard signals / IPC events that trigger approved actions
 * (e.g., opening an application) through the full security pipeline:
 *   signal -> ACTION_VALIDATION -> PERMISSION_CHECK -> ACTION_GATE -> EXECUTION -> CLEANUP
 */

const RETENTION_STATES = {
  IDLE: 'idle', INPUT_ACTIVE: 'input_active', ACTION_VALIDATION: 'action_validation',
  PERMISSION_CHECK: 'permission_check', ACTION_GATE: 'action_gate', EXECUTION: 'execution',
  CLEANUP: 'cleanup', CANCELLED: 'cancelled',
};

// Approved executable whitelist (matches automation/action_registry patterns)
const APPROVED_EXECUTABLES = new Set([
  'notepad.exe', 'calc.exe', 'explorer.exe', 'chrome.exe', 'cmd.exe', 'powershell.exe'
]);

// Action schema for launch_app
const ACTION_SCHEMA = {
  action: 'string',
  executable: 'string',
  arguments: 'array',
};

class SignalHandler {
  constructor() {
    this.state = RETENTION_STATES.IDLE;
    this.transactionId = null;
    this.callbacks = [];
  }

  // Validate signal payload against security rules
  validatePayload(payload) {
    if (!payload || typeof payload !== 'object') return { valid: false, reason: 'Payload must be object' };
    if (payload.action !== 'launch_app') return { valid: false, reason: 'Unknown action: ' + payload.action };
    if (!payload.executable || typeof payload.executable !== 'string') return { valid: false, reason: 'Executable required' };
    const basename = payload.executable.split(/[\\\/]/).pop();
    if (!APPROVED_EXECUTABLES.has(basename)) return { valid: false, reason: 'Executable not approved: ' + basename };
    return { valid: true, basename: basename };
  }

  // Permission check (default deny unless explicitly allowed)
  checkPermission(actionName) {
    if (actionName === 'launch_app') {
      return { decision: 'DENY', reason: 'Launch requires explicit user confirmation' };
    }
    return { decision: 'DENY', reason: 'No rule for action: ' + actionName };
  }

  // Emergency cancellation
  cancel() {
    this.state = RETENTION_STATES.CANCELLED;
    try { require('electron').ipcRenderer?.send('signal-cancelled'); } catch (e) { /* ignore */ }
  }

  // Handle an incoming signal (keyboard, gesture, or IPC trigger)
  handleSignal(payload) {
    this.state = RETENTION_STATES.INPUT_ACTIVE;
    this.transactionId = 'sig-' + Date.now();

    // Step 1: Validation
    const validation = this.validatePayload(payload);
    if (!validation.valid) {
      this.state = RETENTION_STATES.CANCELLED;
      return { success: false, stage: 'VALIDATION', reason: validation.reason, cleaned: true };
    }

    // Step 2: Permission check (hard deny for launch by default — requires user action)
    const perm = this.checkPermission(payload.action);
    if (perm.decision === 'DENY') {
      this.state = RETENTION_STATES.CANCELLED;
      return { success: false, stage: 'PERMISSION', reason: perm.reason, cleaned: true };
    }

    // For this feature: if user explicitly triggers via UI/keyboard shortcut, treat as authorized
    // In production, this should show a confirmation dialog; here we proceed with guardrails
    this.state = RETENTION_STATES.ACTION_GATE;
    // Step 3: Execute (only safe, pre-approved executables)
    try {
      this.state = RETENTION_STATES.EXECUTION;
      const { spawn } = require('child_process');
      const args = Array.isArray(payload.arguments) ? payload.arguments : [];
      const child = spawn(validation.basename, args, { detached: false, windowsHide: false });
      this.state = RETENTION_STATES.CLEANUP;
      // Immediate cleanup — no retention of process handles
      child.unref?.();
      return { success: true, stage: 'EXECUTION', executable: validation.basename, args: args, cleaned: true, pid: child.pid || null };
    } catch (err) {
      this.state = RETENTION_STATES.CANCELLED;
      return { success: false, stage: 'EXECUTION', reason: err.message, cleaned: true };
    }
  }
}

const signalHandler = new SignalHandler();

// Expose to renderer via preload integration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SignalHandler, signalHandler, APPROVED_EXECUTABLES, RETENTION_STATES };
}
