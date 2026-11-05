export async function withSessionLock(run: () => Promise<void>) {
  if (navigator.locks) {
    await navigator.locks.request("monterey-session", run);
    return;
  }

  // localStorage read/write tickets are not atomic across documents. IndexedDB
  // serializes readwrite transactions on this store, including in other tabs.
  // The store stays empty: session credentials remain exclusively HttpOnly.
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("monterey-session-coordination", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore("locks");
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("No pudimos coordinar el inicio de tu sesión."));
    };
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("locks", "readwrite");
      const store = transaction.objectStore("locks");
      let started = false;
      let finished = false;
      let failure: unknown;

      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(failure ?? transaction.error ?? new Error("No pudimos iniciar tu sesión."));

      const holdLock = () => {
        const request = store.get("session");
        request.onsuccess = () => {
          // The first request runs only after this transaction owns the lock.
          if (!started) {
            started = true;
            void Promise.resolve().then(run).then(
              () => { finished = true; },
              (error: unknown) => {
                failure = error;
                transaction.abort();
              },
            );
          }
          // Keep a request pending across both the POST and confirming GET.
          // Otherwise IndexedDB would auto-commit while fetch is awaiting.
          if (!finished) holdLock();
        };
      };
      holdLock();
    });
  } finally {
    database.close();
  }
}
