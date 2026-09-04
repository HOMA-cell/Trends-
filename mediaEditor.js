const IMAGE_ASPECTS = {
  original: null,
  square: 1,
  portrait: 4 / 5,
  story: 9 / 16,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getLanguageCopy = (language = "ja") =>
  language === "en"
    ? {
        imageTitle: "Edit photo",
        imageHint: "Adjust the crop before posting",
        videoTitle: "Choose cover",
        videoHint: "Pick the frame people see first",
        processing: "Processing...",
        imageError: "Could not edit this image. Try another file.",
        videoError: "Could not create a cover from this video.",
      }
    : {
        imageTitle: "写真を編集",
        imageHint: "投稿前に見せたい範囲を整えます",
        videoTitle: "カバーを選択",
        videoHint: "最初に見せるフレームを選びます",
        processing: "処理中...",
        imageError: "この画像を編集できませんでした。別の画像をお試しください。",
        videoError: "この動画からカバーを作成できませんでした。",
      };

const formatTime = (seconds = 0) => {
  const numericSeconds = Number(seconds);
  const safeSeconds = Number.isFinite(numericSeconds)
    ? Math.max(0, numericSeconds)
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(Math.floor(safeSeconds % 60)).padStart(2, "0")}`;
};

const loadImage = (file, objectUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image"));
    image.src = objectUrl || URL.createObjectURL(file);
  });

const canvasToBlob = (canvas, type = "image/jpeg", quality = 0.9) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Unable to export canvas"));
      },
      type,
      quality
    );
  });

const getRotatedImageSize = (image, rotation = 0) => {
  const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return quarterTurn
    ? { width: image.naturalHeight, height: image.naturalWidth }
    : { width: image.naturalWidth, height: image.naturalHeight };
};

const getOutputSize = (aspect, maxDimension = 1600) => {
  const safeAspect = Number(aspect) > 0 ? Number(aspect) : 1;
  if (safeAspect >= 1) {
    return {
      width: maxDimension,
      height: Math.max(1, Math.round(maxDimension / safeAspect)),
    };
  }
  return {
    width: Math.max(1, Math.round(maxDimension * safeAspect)),
    height: maxDimension,
  };
};

const buildEditedImageName = (file) => {
  const rawName = `${file?.name || "photo"}`;
  const baseName = rawName.replace(/\.[^.]+$/, "").slice(0, 80) || "photo";
  return `${baseName}-edited.jpg`;
};

export function createPostMediaEditor({
  getLanguage = () => "ja",
  openBackdrop,
  closeBackdrop,
  onImageApply,
  onVideoApply,
  onToast,
} = {}) {
  const byId = (id) => document.getElementById(id);
  const backdrop = byId("post-media-editor-backdrop");
  const panel = byId("post-media-editor-panel");
  const canvas = byId("post-image-editor-canvas");
  const video = byId("post-video-editor-preview");
  const imageControls = byId("post-image-editor-controls");
  const videoControls = byId("post-video-editor-controls");
  const title = byId("post-media-editor-title");
  const subtitle = byId("post-media-editor-subtitle");
  const zoomInput = byId("post-image-editor-zoom");
  const coverInput = byId("post-video-cover-time");
  const coverTime = byId("post-video-cover-time-label");
  const applyButton = byId("btn-post-media-editor-apply");
  const closeButton = byId("btn-post-media-editor-close");

  let activeMode = "";
  let activeFile = null;
  let activeObjectUrl = "";
  let imageElement = null;
  let imageConfig = null;
  let videoMetadata = null;
  let pointerState = null;
  let setupComplete = false;
  let openGeneration = 0;
  let returnFocus = null;

  const notify = (message, tone = "warning") => {
    if (typeof onToast === "function") onToast(message, tone);
  };

  const cleanupObjectUrl = () => {
    if (!activeObjectUrl) return;
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  };

  const setLoading = (loading) => {
    if (!panel || !applyButton) return;
    panel.classList.toggle("is-processing", loading);
    applyButton.disabled = loading;
    const copy = getLanguageCopy(getLanguage());
    if (loading) {
      applyButton.dataset.previousText = applyButton.textContent || "";
      applyButton.textContent = copy.processing;
    } else if (applyButton.dataset.previousText) {
      applyButton.textContent = applyButton.dataset.previousText;
      delete applyButton.dataset.previousText;
    }
  };

  const close = () => {
    openGeneration += 1;
    if (typeof closeBackdrop === "function") {
      closeBackdrop(backdrop);
    } else {
      backdrop?.classList.remove("is-open");
      backdrop?.classList.add("hidden");
    }
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    cleanupObjectUrl();
    activeMode = "";
    activeFile = null;
    imageElement = null;
    videoMetadata = null;
    pointerState = null;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus();
    }
    returnFocus = null;
  };

  const getImageAspect = () => {
    if (!imageElement || !imageConfig) return 1;
    const explicitAspect = IMAGE_ASPECTS[imageConfig.aspect];
    if (explicitAspect) return explicitAspect;
    const rotated = getRotatedImageSize(imageElement, imageConfig.rotation);
    return rotated.width / Math.max(1, rotated.height);
  };

  const renderImage = (targetCanvas = canvas, maxDimension = 960) => {
    if (!targetCanvas || !imageElement || !imageConfig) return;
    const aspect = getImageAspect();
    const output = getOutputSize(aspect, maxDimension);
    if (targetCanvas.width !== output.width || targetCanvas.height !== output.height) {
      targetCanvas.width = output.width;
      targetCanvas.height = output.height;
    }
    const context = targetCanvas.getContext("2d", { alpha: false });
    if (!context) return;

    const sourceWidth = imageElement.naturalWidth;
    const sourceHeight = imageElement.naturalHeight;
    const rotated = getRotatedImageSize(imageElement, imageConfig.rotation);
    const baseScale = Math.max(
      targetCanvas.width / Math.max(1, rotated.width),
      targetCanvas.height / Math.max(1, rotated.height)
    );
    const scale = baseScale * imageConfig.zoom;
    const renderedWidth = rotated.width * scale;
    const renderedHeight = rotated.height * scale;
    const maxPanX = Math.max(0, (renderedWidth - targetCanvas.width) / 2);
    const maxPanY = Math.max(0, (renderedHeight - targetCanvas.height) / 2);
    const panX = imageConfig.offsetX * maxPanX;
    const panY = imageConfig.offsetY * maxPanY;

    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(targetCanvas.width / 2 + panX, targetCanvas.height / 2 + panY);
    context.rotate((imageConfig.rotation * Math.PI) / 180);
    context.scale(scale, scale);
    context.drawImage(
      imageElement,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight
    );
    context.restore();
  };

  const syncAspectButtons = () => {
    document.querySelectorAll("[data-editor-aspect]").forEach((button) => {
      const selected = button.dataset.editorAspect === imageConfig?.aspect;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  };

  const updateVideoTime = (time) => {
    const rawDuration = Number(videoMetadata?.duration || video?.duration || 0);
    const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
    const safeTime = clamp(Number(time) || 0, 0, Math.max(0, duration - 0.05));
    if (coverInput) coverInput.value = `${safeTime}`;
    if (coverTime) {
      coverTime.textContent = `${formatTime(safeTime)} / ${formatTime(duration)}`;
    }
    if (video && Number.isFinite(safeTime)) {
      video.currentTime = safeTime;
    }
  };

  const openImage = async ({ file, config, generation }) => {
    const copy = getLanguageCopy(getLanguage());
    activeMode = "image";
    activeFile = file;
    activeObjectUrl = URL.createObjectURL(file);
    imageConfig = {
      aspect: IMAGE_ASPECTS[config?.aspect] === undefined ? "original" : config.aspect,
      rotation: Number(config?.rotation || 0),
      zoom: clamp(Number(config?.zoom || 1), 1, 3),
      offsetX: clamp(Number(config?.offsetX || 0), -1, 1),
      offsetY: clamp(Number(config?.offsetY || 0), -1, 1),
    };
    title && (title.textContent = copy.imageTitle);
    subtitle && (subtitle.textContent = copy.imageHint);
    canvas?.classList.remove("hidden");
    video?.classList.add("hidden");
    imageControls?.classList.remove("hidden");
    videoControls?.classList.add("hidden");
    if (zoomInput) zoomInput.value = `${imageConfig.zoom}`;
    syncAspectButtons();
    try {
      imageElement = await loadImage(file, activeObjectUrl);
      if (generation !== openGeneration) return;
      renderImage();
    } catch (error) {
      if (generation !== openGeneration) return;
      console.error("image editor load error:", error);
      notify(copy.imageError, "error");
      close();
    }
  };

  const openVideo = ({ file, metadata, posterTime }) => {
    const copy = getLanguageCopy(getLanguage());
    activeMode = "video";
    activeFile = file;
    videoMetadata = metadata || null;
    activeObjectUrl = URL.createObjectURL(file);
    title && (title.textContent = copy.videoTitle);
    subtitle && (subtitle.textContent = copy.videoHint);
    canvas?.classList.add("hidden");
    video?.classList.remove("hidden");
    imageControls?.classList.add("hidden");
    videoControls?.classList.remove("hidden");
    if (!video) return;
    video.src = activeObjectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      const rawDuration = Number(video.duration || metadata?.duration || 0);
      const duration = Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0;
      videoMetadata = {
        ...(metadata || {}),
        duration,
        width: Number(video.videoWidth || metadata?.width || 0),
        height: Number(video.videoHeight || metadata?.height || 0),
      };
      if (coverInput) {
        coverInput.max = `${Math.max(0.1, duration - 0.05)}`;
        coverInput.step = duration > 30 ? "0.25" : "0.1";
      }
      const suggested = Math.min(Math.max(duration * 0.18, 0.15), 1.5);
      updateVideoTime(Number.isFinite(posterTime) ? posterTime : suggested);
    };
  };

  const open = async ({ file, originalFile, metadata, imageConfig: config, posterTime } = {}) => {
    if (!backdrop || !file) return;
    const generation = ++openGeneration;
    returnFocus = document.activeElement;
    cleanupObjectUrl();
    if (typeof openBackdrop === "function") {
      openBackdrop(backdrop);
    } else {
      backdrop.classList.remove("hidden");
      requestAnimationFrame(() => backdrop.classList.add("is-open"));
    }
    requestAnimationFrame(() => closeButton?.focus());
    if (file.type.startsWith("video")) {
      openVideo({ file, metadata, posterTime });
      return;
    }
    await openImage({ file: originalFile || file, config, generation });
  };

  const applyImage = async () => {
    if (!canvas || !activeFile || !imageConfig) return;
    const copy = getLanguageCopy(getLanguage());
    setLoading(true);
    try {
      const exportCanvas = document.createElement("canvas");
      renderImage(exportCanvas, 1600);
      const blob = await canvasToBlob(exportCanvas, "image/jpeg", 0.9);
      const editedFile = new File([blob], buildEditedImageName(activeFile), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      if (typeof onImageApply === "function") {
        await onImageApply({ file: editedFile, config: { ...imageConfig } });
      }
      close();
    } catch (error) {
      console.error("image editor export error:", error);
      notify(copy.imageError, "error");
    } finally {
      setLoading(false);
    }
  };

  const waitForVideoFrame = () =>
    new Promise((resolve, reject) => {
      if (!video) {
        reject(new Error("Video is unavailable"));
        return;
      }
      if (video.readyState >= 2 && !video.seeking) {
        resolve();
        return;
      }
      let timeoutId = 0;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener("seeked", handleReady);
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("error", handleError);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Video frame is unavailable"));
      };
      video.addEventListener("seeked", handleReady);
      video.addEventListener("loadeddata", handleReady);
      video.addEventListener("error", handleError);
      timeoutId = window.setTimeout(handleError, 4000);
    });

  const captureVideoFrame = async () => {
    await waitForVideoFrame();
    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error("Video frame is not ready");
    }
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    frameCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = frameCanvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#0d1119";
    context.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
    context.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    return canvasToBlob(frameCanvas, "image/jpeg", 0.86);
  };

  const applyVideo = async () => {
    const copy = getLanguageCopy(getLanguage());
    setLoading(true);
    try {
      const blob = await captureVideoFrame();
      const time = Number(video?.currentTime || coverInput?.value || 0);
      const rawDuration = Number(video?.duration || videoMetadata?.duration || 0);
      const metadata = {
        ...(videoMetadata || {}),
        duration: Number.isFinite(rawDuration) ? Math.max(0, rawDuration) : 0,
        width: Number(video?.videoWidth || videoMetadata?.width || 0),
        height: Number(video?.videoHeight || videoMetadata?.height || 0),
      };
      if (typeof onVideoApply === "function") {
        await onVideoApply({ blob, time, metadata });
      }
      close();
    } catch (error) {
      console.error("video cover capture error:", error);
      notify(copy.videoError, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetImage = () => {
    if (!imageConfig) return;
    imageConfig = {
      aspect: "original",
      rotation: 0,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    };
    if (zoomInput) zoomInput.value = "1";
    syncAspectButtons();
    renderImage();
  };

  const setup = () => {
    if (setupComplete || !backdrop) return;
    setupComplete = true;

    closeButton?.addEventListener("click", close);
    byId("btn-post-media-editor-cancel")?.addEventListener("click", close);
    byId("btn-post-media-editor-reset")?.addEventListener("click", resetImage);
    byId("btn-post-image-rotate-left")?.addEventListener("click", () => {
      if (!imageConfig) return;
      imageConfig.rotation = (imageConfig.rotation - 90) % 360;
      imageConfig.offsetX = 0;
      imageConfig.offsetY = 0;
      renderImage();
    });
    byId("btn-post-image-rotate-right")?.addEventListener("click", () => {
      if (!imageConfig) return;
      imageConfig.rotation = (imageConfig.rotation + 90) % 360;
      imageConfig.offsetX = 0;
      imageConfig.offsetY = 0;
      renderImage();
    });

    document.querySelectorAll("[data-editor-aspect]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!imageConfig || IMAGE_ASPECTS[button.dataset.editorAspect] === undefined) return;
        imageConfig.aspect = button.dataset.editorAspect;
        imageConfig.offsetX = 0;
        imageConfig.offsetY = 0;
        syncAspectButtons();
        renderImage();
      });
    });

    zoomInput?.addEventListener("input", () => {
      if (!imageConfig) return;
      imageConfig.zoom = clamp(Number(zoomInput.value || 1), 1, 3);
      renderImage();
    });

    canvas?.addEventListener("pointerdown", (event) => {
      if (!imageConfig) return;
      pointerState = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    });
    canvas?.addEventListener("pointermove", (event) => {
      if (!pointerState || !imageConfig || !imageElement) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const deltaX = ((event.clientX - pointerState.x) / rect.width) * canvas.width;
      const deltaY = ((event.clientY - pointerState.y) / rect.height) * canvas.height;
      pointerState = { x: event.clientX, y: event.clientY };

      const rotated = getRotatedImageSize(imageElement, imageConfig.rotation);
      const scale =
        Math.max(canvas.width / rotated.width, canvas.height / rotated.height) *
        imageConfig.zoom;
      const maxPanX = Math.max(0, (rotated.width * scale - canvas.width) / 2);
      const maxPanY = Math.max(0, (rotated.height * scale - canvas.height) / 2);
      const currentX = imageConfig.offsetX * maxPanX;
      const currentY = imageConfig.offsetY * maxPanY;
      imageConfig.offsetX = maxPanX
        ? clamp((currentX + deltaX) / maxPanX, -1, 1)
        : 0;
      imageConfig.offsetY = maxPanY
        ? clamp((currentY + deltaY) / maxPanY, -1, 1)
        : 0;
      renderImage();
    });
    const releasePointer = (event) => {
      pointerState = null;
      canvas?.classList.remove("is-dragging");
      if (canvas?.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    canvas?.addEventListener("pointerup", releasePointer);
    canvas?.addEventListener("pointercancel", releasePointer);

    coverInput?.addEventListener("input", () => {
      updateVideoTime(coverInput.value);
    });
    video?.addEventListener("timeupdate", () => {
      if (activeMode !== "video" || video.seeking) return;
      if (coverTime) {
        const rawDuration = Number(videoMetadata?.duration || video.duration || 0);
        const duration = Number.isFinite(rawDuration) ? rawDuration : 0;
        coverTime.textContent = `${formatTime(video.currentTime)} / ${formatTime(
          duration
        )}`;
      }
    });

    applyButton?.addEventListener("click", () => {
      if (activeMode === "video") {
        void applyVideo();
      } else if (activeMode === "image") {
        void applyImage();
      }
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && backdrop.classList.contains("is-open")) {
        close();
      }
    });
  };

  setup();
  return { open, close };
}
