export function createCommentSync(options = {}) {
  const {
    supabase,
    translations = {},
    storageKey = "trends_comments_offline_queue_v1",
    getCurrentUser = () => null,
    getCurrentProfile = () => null,
    getCurrentLang = () => "ja",
    getCommentsByPost = () => new Map(),
    renderFeed = () => {},
    createNotification = async () => {},
    showToast = () => {},
  } = options;

  let queue = [];
  let queueLoaded = false;
  let queueFlushing = false;
  let syncListenersBound = false;
  const loadedPostIds = new Set();

  const getTranslator = () => {
    const lang = getCurrentLang?.() || "ja";
    return translations[lang] || translations.ja || {};
  };

  function isOnline() {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }

  function isLikelyTransientNetworkError(error) {
    if (!error) return false;
    if (!isOnline()) return true;
    const status = `${error.status || ""}`.toLowerCase();
    const code = `${error.code || ""}`.toLowerCase();
    const message = `${error.message || error.details || error.hint || error}`
      .toLowerCase()
      .trim();
    if (status === "0") return true;
    if (code.startsWith("08")) return true;
    return (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("timeout")
    );
  }

  function sortCommentsByCreatedAt(list = []) {
    return list.slice().sort((a, b) => {
      const aTs = new Date(a?.created_at || 0).getTime();
      const bTs = new Date(b?.created_at || 0).getTime();
      return aTs - bTs;
    });
  }

  function loadQueue() {
    if (queueLoaded) return;
    queueLoaded = true;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      queue = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("load comment queue failed", error);
      queue = [];
    }
  }

  function saveQueue() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Array.isArray(queue) ? queue : [])
      );
    } catch (error) {
      console.warn("save comment queue failed", error);
    }
  }

  function createActionId() {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `c_${stamp}_${rand}`;
  }

  function getCommentMap() {
    const map = getCommentsByPost?.();
    if (map instanceof Map) return map;
    return new Map();
  }

  function addPendingCommentToState(action, profile = null) {
    if (!action?.id || !action?.postId) return;
    const commentsByPost = getCommentMap();
    const pendingComment = {
      id: `pending_${action.id}`,
      post_id: action.postId,
      user_id: action.userId,
      body: action.body,
      created_at: action.createdAt,
      profile: profile || getCurrentProfile?.() || null,
      pending: true,
      pendingActionId: action.id,
    };
    const next = commentsByPost.get(action.postId)
      ? [...commentsByPost.get(action.postId)]
      : [];
    if (next.some((comment) => comment?.pendingActionId === action.id)) return;
    next.push(pendingComment);
    commentsByPost.set(action.postId, sortCommentsByCreatedAt(next));
  }

  function replacePendingCommentWithSynced(action, syncedComment) {
    if (!action?.postId || !action?.id || !syncedComment) return;
    const commentsByPost = getCommentMap();
    const next = commentsByPost.get(action.postId)
      ? [...commentsByPost.get(action.postId)]
      : [];
    const idx = next.findIndex((comment) => comment?.pendingActionId === action.id);
    if (idx >= 0) {
      next[idx] = syncedComment;
    } else {
      next.push(syncedComment);
    }
    commentsByPost.set(action.postId, sortCommentsByCreatedAt(next));
  }

  function removePendingComment(action) {
    if (!action?.postId || !action?.id) return;
    const commentsByPost = getCommentMap();
    const next = commentsByPost.get(action.postId)
      ? [...commentsByPost.get(action.postId)]
      : [];
    const filtered = next.filter((comment) => comment?.pendingActionId !== action.id);
    commentsByPost.set(action.postId, filtered);
  }

  function enqueueOfflineComment({
    postId,
    body,
    targetUserId,
    profile = null,
    createdAt = new Date().toISOString(),
  }) {
    const currentUser = getCurrentUser?.();
    if (!postId || !currentUser?.id || !body) return null;
    loadQueue();
    const action = {
      id: createActionId(),
      postId,
      userId: currentUser.id,
      body,
      targetUserId: targetUserId || null,
      createdAt,
    };
    queue.push(action);
    saveQueue();
    addPendingCommentToState(action, profile);
    return action;
  }

  function mergePendingComments(postId, fetchedComments = []) {
    const commentsByPost = getCommentMap();
    const existing = commentsByPost.get(postId) || [];
    const pending = existing.filter((comment) => comment?.pending);
    if (!pending.length) {
      return sortCommentsByCreatedAt(fetchedComments || []);
    }
    const merged = [...(fetchedComments || [])];
    const pendingIds = new Set(
      merged.map((comment) => comment?.pendingActionId).filter(Boolean)
    );
    pending.forEach((comment) => {
      if (!pendingIds.has(comment.pendingActionId)) {
        merged.push(comment);
      }
    });
    return sortCommentsByCreatedAt(merged);
  }

  async function flushQueue(options = {}) {
    loadQueue();
    if (!queue.length) return 0;
    if (queueFlushing) return 0;
    if (!supabase) return 0;
    const currentUser = getCurrentUser?.();
    if (!currentUser?.id || !isOnline()) return 0;
    const tr = getTranslator();
    const silent = !!options.silent;
    queueFlushing = true;
    let synced = 0;
    try {
      for (let idx = 0; idx < queue.length; ) {
        const action = queue[idx];
        if (
          !action ||
          action.userId !== currentUser.id ||
          !action.postId ||
          !action.body
        ) {
          idx += 1;
          continue;
        }
        try {
          const { data, error } = await supabase
            .from("comments")
            .insert({
              post_id: action.postId,
              user_id: action.userId,
              body: action.body,
            })
            .select("id, post_id, user_id, body, created_at")
            .single();
          if (error || !data) throw error || new Error("comment insert failed");

          replacePendingCommentWithSynced(action, {
            ...data,
            profile: getCurrentProfile?.() || null,
          });
          queue.splice(idx, 1);
          saveQueue();
          synced += 1;
          if (action.targetUserId && action.targetUserId !== action.userId) {
            await createNotification({
              userId: action.targetUserId,
              actorId: action.userId,
              type: "comment",
              postId: action.postId,
            });
          }
        } catch (error) {
          if (isLikelyTransientNetworkError(error)) {
            break;
          }
          console.error("flush comment queue error:", error);
          removePendingComment(action);
          queue.splice(idx, 1);
          saveQueue();
        }
      }
    } finally {
      queueFlushing = false;
    }
    if (synced > 0) {
      renderFeed?.();
      if (!silent) {
        showToast(
          tr.offlineSyncDone || "オフライン操作を同期しました。",
          "success"
        );
      }
    }
    return synced;
  }

  function setupOnlineSync() {
    if (syncListenersBound || typeof window === "undefined") return;
    syncListenersBound = true;
    window.addEventListener("online", () => {
      flushQueue().catch((error) => {
        console.error("flush comment queue on reconnect failed", error);
      });
    });
  }

  function isPostLoaded(postId) {
    return loadedPostIds.has(postId);
  }

  function markPostLoaded(postId) {
    if (!postId) return;
    loadedPostIds.add(postId);
  }

  function clearLoadedPosts() {
    loadedPostIds.clear();
  }

  function clearQueue() {
    queue = [];
    queueLoaded = false;
    queueFlushing = false;
    loadedPostIds.clear();
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("clear comment queue failed", error);
    }
  }

  return {
    isOnline,
    isLikelyTransientNetworkError,
    sortCommentsByCreatedAt,
    loadQueue,
    enqueueOfflineComment,
    mergePendingComments,
    flushQueue,
    setupOnlineSync,
    isPostLoaded,
    markPostLoaded,
    clearLoadedPosts,
    clearQueue,
  };
}
