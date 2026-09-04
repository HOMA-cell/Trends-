const TUS_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm";

export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;

let tusClientPromise = null;

function loadTusClient() {
  if (!tusClientPromise) {
    tusClientPromise = import(TUS_CLIENT_URL).catch((error) => {
      tusClientPromise = null;
      throw error;
    });
  }
  return tusClientPromise;
}

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Upload cancelled", "AbortError");
  }
  const error = new Error("Upload cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError();
}

function getResumableEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.slice(0, -".supabase.co".length);
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

async function uploadWithTus({
  supabase,
  supabaseUrl,
  bucket,
  path,
  file,
  cacheControl,
  signal,
  onProgress,
}) {
  throwIfAborted(signal);
  const [{ Upload }, sessionResult] = await Promise.all([
    loadTusClient(),
    supabase.auth.getSession(),
  ]);
  throwIfAborted(signal);

  const accessToken = sessionResult?.data?.session?.access_token || "";
  if (sessionResult?.error || !accessToken) {
    throw sessionResult?.error || new Error("Authentication session is unavailable.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let upload = null;

    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const handleAbort = () => {
      if (settled) return;
      const abortError = createAbortError();
      if (!upload) {
        finish(reject, abortError);
        return;
      }
      upload
        .abort()
        .catch(() => null)
        .finally(() => finish(reject, abortError));
    };

    const endpoint = getResumableEndpoint(supabaseUrl);
    upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      fingerprint: () =>
        Promise.resolve(
          [
            "trends",
            endpoint,
            bucket,
            path,
            file.name || "media",
            file.type || "application/octet-stream",
            file.size,
            file.lastModified || 0,
          ].join("-")
        ),
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: `${cacheControl}`,
      },
      onError: (error) => finish(reject, error),
      onProgress: (bytesUploaded, bytesTotal) => {
        const percent = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
        onProgress?.({
          bytesUploaded,
          bytesTotal,
          percent: Math.max(0, Math.min(100, percent)),
          resumable: true,
        });
      },
      onSuccess: () => finish(resolve, { path, resumable: true }),
    });

    signal?.addEventListener("abort", handleAbort, { once: true });
    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (settled || signal?.aborted) {
          handleAbort();
          return;
        }
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch((error) => finish(reject, error));
  });
}

async function uploadStandard({
  supabase,
  bucket,
  path,
  file,
  cacheControl,
  signal,
  onProgress,
}) {
  throwIfAborted(signal);
  onProgress?.({
    bytesUploaded: 0,
    bytesTotal: file.size,
    percent: 0,
    resumable: false,
  });
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: `${cacheControl}`,
  });
  if (error) throw error;
  if (signal?.aborted) {
    await supabase.storage.from(bucket).remove([path]);
    throw createAbortError();
  }
  onProgress?.({
    bytesUploaded: file.size,
    bytesTotal: file.size,
    percent: 100,
    resumable: false,
  });
  return { path, resumable: false };
}

export async function uploadStorageObject({
  supabase,
  supabaseUrl,
  bucket,
  path,
  file,
  cacheControl = "31536000",
  preferResumable = false,
  signal,
  onProgress,
}) {
  if (!supabase || !supabaseUrl || !bucket || !path || !file) {
    throw new Error("Upload configuration is incomplete.");
  }
  const shouldResume =
    preferResumable || file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES;
  if (shouldResume) {
    return uploadWithTus({
      supabase,
      supabaseUrl,
      bucket,
      path,
      file,
      cacheControl,
      signal,
      onProgress,
    });
  }
  return uploadStandard({
    supabase,
    bucket,
    path,
    file,
    cacheControl,
    signal,
    onProgress,
  });
}

export function isUploadAbortError(error) {
  return error?.name === "AbortError";
}
