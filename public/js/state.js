/**
 * Central UI state. Holds the latest dashboard / scan / history payloads
 * plus the active tab. Subscribers register a listener and are called
 * on every change.
 *
 * Kept deliberately small — no reducer machinery, no immutability tricks.
 * The shape mirrors what the API returns; if the API grows, this grows.
 */

export const store = {
  state: {
    activeTab: 'dashboard',
    status: null,
    statusLoading: false,
    scan: null,
    scanLoading: false,
    history: null,
    historyLoading: false,
    githubAvailable: null
  },
  listeners: new Set(),

  get() { return this.state; },

  set(patch) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  },

  subscribe(l) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
};
