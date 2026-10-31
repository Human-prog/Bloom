// GhostControl-inspired retention manager for Bloom Notch (Electron/JS)
// Zero-retention principle: transient data cleared deterministically after each action

const RETENTION_STATES = {
  IDLE: 'idle',
  INPUT_ACTIVE: 'input_active',
  INFERENCE: 'inference',
  ACTION_VALIDATION: 'action_validation',
  PERMISSION_CHECK: 'permission_check',
  ACTION_GATE: 'action_gate',
  EXECUTION: 'execution',
  INPUT_BUFFER_CLEAR: 'input_buffer_clear',
  TRANSIENT_STATE_CLEAR: 'transient_state_clear',
  RETURN_TO_IDLE: 'return_to_idle',
  CANCELLED: 'cancelled',
  ERROR: 'error',
};

class RetentionManager {
  constructor() {
    this.buffers = new Map();
    this.state = RETENTION_STATES.IDLE;
    this.callbacks = [];
    this.emergencyStopped = false;
    // Register cleanup on window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.clearAll());
    }
  }

  beginTransaction(id, inputType) {
    this.state = RETENTION_STATES.INPUT_ACTIVE;
    this.transactionId = id;
    this.inputType = inputType || 'unknown';
  }

  registerBuffer(name, buffer, limit = 0) {
    this.buffers.set(name, { data: buffer, limit, size: 0 });
  }

  clearBuffer(name) {
    if (!this.buffers.has(name)) return;
    const entry = this.buffers.get(name);
    if (Array.isArray(entry.data)) {
      entry.data.length = 0; // In-place clear
    } else if (entry.data && typeof entry.data.clear === 'function') {
      entry.data.clear();
    }
    this.buffers.delete(name);
  }

  clearAll() {
    const cleared = {};
    for (const [name, entry] of this.buffers) {
      const size = entry.data ? (entry.data.length || entry.data.size || 0) : 0;
      cleared[name] = { type: 'buffer', size: size, cleared: true };
      this.clearBuffer(name);
    }
    // Run callbacks
    for (const cb of this.callbacks) {
      try { cb(); } catch (e) { /* ignore */ }
    }
    this.state = RETENTION_STATES.TRANSIENT_STATE_CLEAR;
    return cleared;
  }

  completeTransaction() {
    const result = this.clearAll();
    this.state = RETENTION_STATES.RETURN_TO_IDLE;
    this.transactionId = null;
    return result;
  }

  cancelTransaction() {
    this.state = RETENTION_STATES.CANCELLED;
    this.clearAll();
  }

  triggerEmergencyStop() {
    this.emergencyStopped = true;
    this.cancelTransaction();
  }

  resetEmergencyStop() {
    this.emergencyStopped = false;
  }

  isEmergencyStopped() {
    return this.emergencyStopped;
  }
}

// Singleton instance for the app
const retentionManager = new RetentionManager();

// Data inventory: what flows where (GhostControl DATA_LIFECYCLE concept)
const DATA_FLOWS = [
  { name: 'raw_camera_frames', category: 'TRANSIENT', persistent: false, sensitive: true },
  { name: 'hand_landmarks', category: 'TRANSIENT', persistent: false, sensitive: true },
  { name: 'motion_history', category: 'TRANSIENT', persistent: false, sensitive: false },
  { name: 'raw_microphone_audio', category: 'TRANSIENT', persistent: false, sensitive: true },
  { name: 'speech_transcript', category: 'TRANSIENT', persistent: false, sensitive: true },
  { name: 'gesture_classification', category: 'TRANSIENT', persistent: false, sensitive: false },
  { name: 'action_parameters', category: 'TRANSIENT', persistent: false, sensitive: false },
  { name: 'settings_config', category: 'PERSISTENT', persistent: true, sensitive: false },
];

function getDataFlow(name) {
  return DATA_FLOWS.find(f => f.name === name);
}

// Export for preload/main integration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RetentionManager, retentionManager, DATA_FLOWS, getDataFlow, RETENTION_STATES };
}
if (typeof window !== 'undefined') {
  window.ghostRetention = { manager: retentionManager, DATA_FLOWS, RETENTION_STATES };
}
