import assert from "node:assert/strict";
import {
  isUploadAbortError,
  uploadStorageObject,
} from "../mediaUpload.js";
import {
  hasValidPostMediaSignature,
  isHeicImageFile,
} from "../mediaProcessing.js";

const createStorageStub = ({ delayMs = 0 } = {}) => {
  const calls = [];
  return {
    calls,
    client: {
      storage: {
        from(bucket) {
          return {
            async upload(path, file, options) {
              calls.push({ action: "upload", bucket, path, file, options });
              if (delayMs) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
              }
              return { error: null };
            },
            async remove(paths) {
              calls.push({ action: "remove", bucket, paths });
              return { error: null };
            },
          };
        },
      },
    },
  };
};

const image = new Blob(["small-image"], { type: "image/jpeg" });
const successStub = createStorageStub();
const progress = [];
const result = await uploadStorageObject({
  supabase: successStub.client,
  supabaseUrl: "https://example.supabase.co",
  bucket: "post-media",
  path: "public/user/image.jpg",
  file: image,
  onProgress: ({ percent }) => progress.push(percent),
});

assert.equal(result.resumable, false);
assert.deepEqual(progress, [0, 100]);
assert.equal(successStub.calls[0].action, "upload");
assert.equal(successStub.calls[0].options.cacheControl, "31536000");

const abortStub = createStorageStub({ delayMs: 20 });
const abortController = new AbortController();
const abortedUpload = uploadStorageObject({
  supabase: abortStub.client,
  supabaseUrl: "https://example.supabase.co",
  bucket: "post-media",
  path: "public/user/aborted.jpg",
  file: image,
  signal: abortController.signal,
});
setTimeout(() => abortController.abort(), 2);

await assert.rejects(abortedUpload, (error) => isUploadAbortError(error));
assert.equal(abortStub.calls.at(-1).action, "remove");
assert.deepEqual(abortStub.calls.at(-1).paths, ["public/user/aborted.jpg"]);

const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])], {
  type: "image/jpeg",
});
const disguisedJpeg = new Blob(["not-an-image"], { type: "image/jpeg" });
const heic = new Blob(["\0\0\0\u0018ftypheic\0\0\0\0mif1heic"], {
  type: "image/heic",
});

assert.equal(await hasValidPostMediaSignature(jpeg), true);
assert.equal(await hasValidPostMediaSignature(disguisedJpeg), false);
assert.equal(isHeicImageFile(heic), true);
assert.equal(await hasValidPostMediaSignature(heic), true);

console.log("OK Media upload checks");
