type UploadOptions = {
  onProgress?: (pct: number) => void;
  /** Called once the whole file has been sent and the server starts working. */
  onUploaded?: () => void;
};

type UploadResult<T> = { ok: true; data: T } | { ok: false; error: string };

function send(url: string, formData: FormData, responseType: XMLHttpRequestResponseType, options: UploadOptions) {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = responseType;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => options.onUploaded?.();
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(new Error("Network error. Is the server running?"));
    xhr.send(formData);
  });
}

function errorFrom(body: string, status: number) {
  try {
    return String(JSON.parse(body).error || `Request failed (${status}).`);
  } catch {
    return `Server returned an unexpected response (${status}).`;
  }
}

const isOk = (xhr: XMLHttpRequest) => xhr.status >= 200 && xhr.status < 300;

/** POSTs a form and parses a JSON reply. Uses XHR (not fetch) to report upload progress. */
export async function postJSON<T>(url: string, formData: FormData, options: UploadOptions = {}): Promise<UploadResult<T>> {
  const xhr = await send(url, formData, "text", options);
  if (!isOk(xhr)) return { ok: false, error: errorFrom(xhr.responseText, xhr.status) };
  try {
    return { ok: true, data: JSON.parse(xhr.responseText) as T };
  } catch {
    return { ok: false, error: errorFrom(xhr.responseText, xhr.status) };
  }
}

/** POSTs a form and returns the reply as a file (e.g. a rendered video). */
export async function postForBlob(url: string, formData: FormData, options: UploadOptions = {}): Promise<UploadResult<Blob>> {
  const xhr = await send(url, formData, "blob", options);
  const blob = xhr.response as Blob;
  if (!isOk(xhr)) return { ok: false, error: errorFrom(await blob.text(), xhr.status) };
  return { ok: true, data: blob };
}
