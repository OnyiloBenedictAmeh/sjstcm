(() => {
  const storageKeyFor = actorId => `sjstcm.staff.createRequestKey:${encodeURIComponent(String(actorId))}`;

  window.StaffCreateAttempt = {
    create({ storage, actorId, createKey }) {
      if (!actorId) throw new Error("An authenticated staff manager is required.");
      const storageKey = storageKeyFor(actorId);
      let key = null;
      try { key = storage?.getItem(storageKey) || null; } catch { /* Keep this page's key in memory. */ }

      const save = value => {
        try {
          if (value) storage?.setItem(storageKey, value);
          else storage?.removeItem(storageKey);
        } catch { /* Keep this page's key in memory. */ }
      };

      return {
        begin() {
          if (!key) {
            key = createKey();
            save(key);
          }
          return key;
        },
        abandon() {
          key = createKey();
          save(key);
          return key;
        },
        complete() {
          key = null;
          save(null);
        }
      };
    }
  };
})();
