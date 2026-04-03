(function initializeOpenTheLockDatabase() {
  const STORAGE_KEY = "open_the_lock_last_session";
  const COLLECTION_PATH = "open_the_lock_sessions";
  const disconnectOps = new Map();

  function hasFirebaseRuntime() {
    return Boolean(window.FirebaseRuntime);
  }

  function rememberLastSession(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  async function saveSession(payload) {
    if (hasFirebaseRuntime()) {
      const { db, ref, set } = window.FirebaseRuntime;
      await set(ref(db, `${COLLECTION_PATH}/${payload.session_id}`), payload);
    }

    rememberLastSession(payload);
    return true;
  }

  async function queueDisconnectSession(payload) {
    if (!hasFirebaseRuntime()) {
      rememberLastSession(payload);
      return;
    }

    const { db, onDisconnect, ref } = window.FirebaseRuntime;
    const sessionRef = ref(db, `${COLLECTION_PATH}/${payload.session_id}`);
    const disconnectOp =
      disconnectOps.get(payload.session_id) || onDisconnect(sessionRef);

    disconnectOps.set(payload.session_id, disconnectOp);

    await disconnectOp.set(payload);
  }

  async function cancelDisconnectSession(sessionId) {
    const disconnectOp = disconnectOps.get(sessionId);
    if (!disconnectOp) return;

    await disconnectOp.cancel();
    disconnectOps.delete(sessionId);
  }

  function getLastSavedSession() {
    return localStorage.getItem(STORAGE_KEY);
  }

  window.OpenLockDatabase = {
    cancelDisconnectSession,
    getLastSavedSession,
    queueDisconnectSession,
    saveSession
  };
})();
