const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_IMPORT_URL = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/+esm";

let heicModulePromise = null;

function getExtension(file) {
  const name = String(file?.name || "");
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return String(extension || "").trim().toLowerCase();
}

export function isHeicImageFile(file) {
  return (
    HEIC_MIME_TYPES.has(String(file?.type || "").toLowerCase()) ||
    ["heic", "heif", "hif"].includes(getExtension(file))
  );
}

function hasBytes(bytes, expected, offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function bytesToAscii(bytes) {
  return Array.from(bytes, (value) => String.fromCharCode(value)).join("");
}

export async function hasValidPostMediaSignature(file) {
  if (!file || typeof file.slice !== "function") return false;
  const bytes = new Uint8Array(await file.slice(0, 96).arrayBuffer());
  const ascii = bytesToAscii(bytes);
  const type = String(file.type || "").toLowerCase();

  if (isHeicImageFile(file)) {
    return (
      ascii.includes("ftyp") &&
      /heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(ascii)
    );
  }
  if (type === "image/jpeg") return hasBytes(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/png") {
    return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (type === "image/gif") return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
  if (type === "image/webp") {
    return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  }
  if (type === "video/webm") {
    return hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (type === "video/mp4" || type === "video/quicktime") {
    return ascii.includes("ftyp");
  }
  return false;
}

function loadHeicModule() {
  if (!heicModulePromise) {
    heicModulePromise = import(HEIC_IMPORT_URL).catch((error) => {
      heicModulePromise = null;
      throw error;
    });
  }
  return heicModulePromise;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Image export failed."));
      },
      type,
      quality
    );
  });
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Fall through for browsers with partial createImageBitmap support.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const cleanup = () => URL.revokeObjectURL(url);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Image decode failed."));
    };
    image.src = url;
  });
}

function getOutputType(sourceType) {
  return sourceType === "image/png" || sourceType === "image/webp"
    ? "image/webp"
    : "image/jpeg";
}

function buildOutputName(file, outputType) {
  const sourceName = String(file?.name || "photo");
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const extension =
    outputType === "image/webp" ? "webp" : outputType === "image/png" ? "png" : "jpg";
  return `${base || "photo"}.${extension}`;
}

export async function normalizePostImage(
  file,
  { maxDimension = 2048, quality = 0.88 } = {}
) {
  if (!file || file.type === "image/gif") {
    return { file, normalized: false };
  }

  let sourceBlob = file;
  let sourceType = String(file.type || "").toLowerCase();
  const convertedFromHeic = isHeicImageFile(file);
  let source = null;
  if (convertedFromHeic) {
    try {
      source = await decodeImage(file);
    } catch {
      const { heicTo } = await loadHeicModule();
      const converted = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.94,
      });
      sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(sourceBlob instanceof Blob)) {
        throw new Error("HEIC conversion returned no image.");
      }
      sourceType = "image/jpeg";
    }
  }

  source = source || (await decodeImage(sourceBlob));
  try {
    const sourceWidth = Number(source.width || source.naturalWidth || 0);
    const sourceHeight = Number(source.height || source.naturalHeight || 0);
    if (!sourceWidth || !sourceHeight) throw new Error("Image dimensions are unavailable.");

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Image canvas is unavailable.");
    context.drawImage(source, 0, 0, width, height);

    const requestedType = getOutputType(sourceType);
    const blob = await canvasToBlob(canvas, requestedType, quality);
    const outputType = ["image/jpeg", "image/png", "image/webp"].includes(blob.type)
      ? blob.type
      : requestedType;
    const normalizedFile = new File(
      [blob],
      buildOutputName(file, outputType),
      {
        type: outputType,
        lastModified: Date.now(),
      }
    );
    return {
      file: normalizedFile,
      normalized: true,
      convertedFromHeic,
      originalBytes: file.size,
      outputBytes: normalizedFile.size,
      width,
      height,
    };
  } finally {
    source.close?.();
  }
}
