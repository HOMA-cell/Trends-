import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateDisplay,
  formatHeight,
  formatWeight,
  formatVolume,
  computeStreak,
  computeWorkoutStats,
  toDateKey,
  normalizeUrl,
  normalizeHandleUrl,
} from "./utils.js";

let profileContext = {
  getCurrentUser: () => null,
  getCurrentLang: () => "ja",
  getCurrentProfile: () => null,
  setCurrentProfile: () => {},
  getSettings: () => ({}),
  getAllPosts: () => [],
  getUserPosts: () => [],
  getProfilePostCount: () => 0,
  getFollowingCount: () => 0,
  getFollowersCount: () => 0,
  getFollowingIds: () => new Set(),
  getCurrentPublicProfileId: () => null,
  setCurrentPublicProfileId: () => {},
  getPublicPostsVisibleCount: () => 0,
  setPublicPostsVisibleCount: () => {},
  getPublicPostsPageSize: () => 4,
  setCurrentGalleryPosts: () => {},
  getGalleryPage: () => 1,
  setGalleryPage: () => {},
  renderGalleryPage: () => {},
  getProfile: async () => null,
  getFollowCounts: async () => ({ following: 0, followers: 0 }),
  setActivePage: () => {},
  toggleFollowForUser: async () => {},
  loadFollowStats: async () => {},
};

export function setProfileContext(next = {}) {
  profileContext = { ...profileContext, ...next };
}

const getCurrentUser = () => profileContext.getCurrentUser?.();
const getCurrentLang = () => profileContext.getCurrentLang?.() || "ja";
const getCurrentProfile = () => profileContext.getCurrentProfile?.();
const setCurrentProfile = (profile) => profileContext.setCurrentProfile?.(profile);
const getSettings = () => profileContext.getSettings?.() || {};
const getAllPosts = () => profileContext.getAllPosts?.() || [];
const getUserPosts = () => profileContext.getUserPosts?.() || [];
const getProfilePostCount = () => profileContext.getProfilePostCount?.() || 0;
const getFollowingCount = () => profileContext.getFollowingCount?.() || 0;
const getFollowersCount = () => profileContext.getFollowersCount?.() || 0;
const getFollowingIds = () => profileContext.getFollowingIds?.() || new Set();
const getCurrentPublicProfileId = () => profileContext.getCurrentPublicProfileId?.();
const setCurrentPublicProfileId = (id) => profileContext.setCurrentPublicProfileId?.(id);
const getPublicPostsVisibleCount = () => profileContext.getPublicPostsVisibleCount?.() || 0;
const setPublicPostsVisibleCount = (count) => profileContext.setPublicPostsVisibleCount?.(count);
const getPublicPostsPageSize = () => profileContext.getPublicPostsPageSize?.() || 4;
const setCurrentGalleryPosts = (posts) => profileContext.setCurrentGalleryPosts?.(posts);
const getGalleryPage = () => profileContext.getGalleryPage?.() || 1;
const setGalleryPage = (page) => profileContext.setGalleryPage?.(page);
const renderGalleryPage = () => profileContext.renderGalleryPage?.();
const getProfile = (...args) => profileContext.getProfile?.(...args);
const getFollowCounts = (...args) => profileContext.getFollowCounts?.(...args);
const setActivePage = (page) => profileContext.setActivePage?.(page);
const toggleFollowForUser = (...args) => profileContext.toggleFollowForUser?.(...args);
const loadFollowStats = (...args) => profileContext.loadFollowStats?.(...args);
const toggleSectionVisibility = (titleId, containerEl) => {
  const titleEl = titleId ? $(titleId) : null;
  const hasContent = !!containerEl && containerEl.children.length > 0;
  if (titleEl) titleEl.classList.toggle("hidden", !hasContent);
  if (containerEl) containerEl.classList.toggle("hidden", !hasContent);
};
const toggleCollapsibleVisibility = (key, hasContent) => {
  if (!key) return;
  const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
  const button = wrapper?.querySelector("[data-collapsible-btn]");
  const content = wrapper?.querySelector("[data-collapsible-content]");
  if (button) button.classList.toggle("hidden", !hasContent);
  if (content) {
    content.classList.toggle("hidden", !hasContent);
    if (!hasContent) {
      content.classList.remove("is-open");
    }
  }
};

export function formatExperience(value, tr) {
  if (!value) return "";
  const map = {
    beginner: tr.experienceBeginner || "Beginner",
    intermediate: tr.experienceIntermediate || "Intermediate",
    advanced: tr.experienceAdvanced || "Advanced",
    pro: tr.experiencePro || "Competitive",
  };
  return map[value] || value;
}

export function getProfileDisplayName(profile, fallback = "user") {
  return (
    profile?.display_name ||
    profile?.handle ||
    profile?.username ||
    fallback
  );
}

export function applyProfileTheme(container, profile) {
  if (!container) return;
  const accent = profile?.accent_color || "#e4572e";
  container.style.setProperty("--profile-accent", accent);
}

export function applyProfileBanner(bannerEl, profile) {
  if (!bannerEl) return;
  const url = profile?.banner_url;
  if (url) {
    bannerEl.style.backgroundImage = `url('${url}')`;
  } else {
    bannerEl.style.removeProperty("background-image");
  }
}

export function renderProfileFacts(factsEl, profile, tr) {
  if (!factsEl) return;
  factsEl.innerHTML = "";
  const settings = getSettings();
  const heightText = profile?.height_cm
    ? formatHeight(profile.height_cm, settings.heightUnit)
    : "";
  const experienceText = formatExperience(profile?.experience_level, tr);
  const items = [
    { label: tr.profileLocation || "Location", value: profile?.location },
    { label: tr.profileHeight || "Height", value: heightText },
    { label: tr.profileExperience || "Experience", value: experienceText },
    { label: tr.profileGym || "Gym", value: profile?.gym },
    { label: tr.profileSplit || "Split", value: profile?.training_split },
  ]
    .filter((item) => item.value)
    .slice(0, 2);
  items.forEach((item) => {
    if (!item.value) return;
    const card = document.createElement("div");
    card.className = "profile-fact";
    const label = document.createElement("div");
    label.className = "profile-fact-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-fact-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    factsEl.appendChild(card);
  });
}

export function renderProfileHighlights(highlightsEl, profile, tr) {
  if (!highlightsEl) return;
  highlightsEl.innerHTML = "";
  const items = [
    { label: tr.profileGoal || "Goal", value: profile?.training_goal },
    {
      label: tr.profileFavoriteLifts || "Favorite lifts",
      value: profile?.favorite_lifts,
    },
  ]
    .filter((item) => item.value)
    .slice(0, 1);
  items.forEach((item) => {
    if (!item.value) return;
    const card = document.createElement("div");
    card.className = "profile-highlight";
    const label = document.createElement("div");
    label.className = "profile-highlight-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-highlight-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    highlightsEl.appendChild(card);
  });
}

export function renderProfileLinks(linksEl, profile, tr) {
  if (!linksEl) return;
  linksEl.innerHTML = "";
  const links = [
    {
      label: tr.profileInstagram || "Instagram",
      value: profile?.instagram,
      url: normalizeHandleUrl("https://instagram.com", profile?.instagram),
      prefix: "@",
    },
    {
      label: tr.profileTiktok || "TikTok",
      value: profile?.tiktok,
      url: normalizeHandleUrl("https://tiktok.com/@", profile?.tiktok),
      prefix: "@",
    },
    {
      label: tr.profileYouTube || "YouTube",
      value: profile?.youtube,
      url: normalizeUrl(profile?.youtube),
    },
    {
      label: tr.profileWebsite || "Website",
      value: profile?.website,
      url: normalizeUrl(profile?.website),
    },
  ]
    .filter((item) => item.value && item.url)
    .slice(0, 2);
  links.forEach((item) => {
    if (!item.value || !item.url) return;
    let displayValue = item.value;
    if (item.prefix && !displayValue.startsWith(item.prefix)) {
      displayValue = `${item.prefix}${displayValue}`;
    }
    const link = document.createElement("a");
    link.className = "profile-link-pill";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${item.label}: ${displayValue
      .replace("https://", "")
      .replace("http://", "")}`;
    linksEl.appendChild(link);
  });
}

export function renderProfileStatsGrid(targetEl, posts, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  targetEl.classList.add("hidden");
}

export function renderProfileQuickStats(targetEl, posts, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  targetEl.classList.add("hidden");
}

export function updateProfileSummary() {
  const cardEl = $("profile-section");
  const bannerEl = $("profile-banner");
  const factsEl = $("profile-facts");
  const highlightsEl = $("profile-highlights");
  const linksEl = $("profile-links");
  const statsGridEl = $("profile-stats-grid");
  const quickStatsEl = $("profile-quick-stats");
  const avatarEl = $("profile-avatar");
  const nameEl = $("profile-name");
  const emailEl = $("profile-email");
  const bioEl = $("profile-bio");
  const joinedEl = $("profile-joined");
  const postsEl = $("profile-posts");
  const followingEl = $("profile-following");
  const followersEl = $("profile-followers");
  const streakEl = $("profile-streak");
  const statTodayEl = $("stat-today");
  const statStreakEl = $("stat-streak");
  const statTotalEl = $("stat-total");

  const currentUser = getCurrentUser();
  const currentProfile = getCurrentProfile();
  const tr = t[getCurrentLang()] || t.ja;

  if (
    !cardEl &&
    !bannerEl &&
    !factsEl &&
    !highlightsEl &&
    !linksEl &&
    !statsGridEl &&
    !quickStatsEl &&
    !avatarEl &&
    !nameEl &&
    !emailEl &&
    !bioEl &&
    !joinedEl &&
    !postsEl &&
    !followingEl &&
    !followersEl &&
    !streakEl &&
    !statTodayEl &&
    !statStreakEl &&
    !statTotalEl
  ) {
    return;
  }

  if (!currentUser) {
    if (cardEl) applyProfileTheme(cardEl, null);
    if (bannerEl) {
      applyProfileBanner(bannerEl, null);
      bannerEl.classList.add("hidden");
    }
    if (factsEl) {
      factsEl.innerHTML = "";
      factsEl.classList.add("hidden");
    }
    if (highlightsEl) {
      highlightsEl.innerHTML = "";
      highlightsEl.classList.add("hidden");
    }
    if (linksEl) {
      linksEl.innerHTML = "";
      linksEl.classList.add("hidden");
    }
    if (statsGridEl) {
      statsGridEl.innerHTML = "";
      statsGridEl.classList.add("hidden");
    }
    if (quickStatsEl) {
      quickStatsEl.innerHTML = "";
      quickStatsEl.classList.add("hidden");
    }
    if (avatarEl) renderAvatar(avatarEl, null, "-");
    if (nameEl) nameEl.textContent = "-";
    if (emailEl) emailEl.textContent = "-";
    if (bioEl) {
      bioEl.textContent = "";
      bioEl.classList.add("hidden");
    }
    if (joinedEl) joinedEl.textContent = "-";
    if (postsEl) postsEl.textContent = `${tr.profilePosts || "Posts"}: -`;
    if (followingEl)
      followingEl.textContent = `${tr.profileFollowing || "Following"}: -`;
    if (followersEl)
      followersEl.textContent = `${tr.profileFollowers || "Followers"}: -`;
    if (streakEl) streakEl.textContent = `${tr.profileStreak || "Streak"}: -`;
    if (statTodayEl) statTodayEl.textContent = "-";
    if (statStreakEl) statStreakEl.textContent = "-";
    if (statTotalEl) statTotalEl.textContent = "-";
    toggleSectionVisibility("profile-facts-title", factsEl);
    toggleSectionVisibility("profile-highlights-title", highlightsEl);
    toggleSectionVisibility("profile-links-title", linksEl);
    toggleCollapsibleVisibility("profile-details", false);
    return;
  }

  const joinedStr = currentProfile?.created_at
    ? formatDateDisplay(currentProfile.created_at)
    : "-";

  const userPosts = getUserPosts();
  const postCount = userPosts.length || getProfilePostCount() || 0;

  const dateKeys = new Set(
    userPosts.map((post) => toDateKey(post.date || post.created_at)).filter(Boolean)
  );
  const todayKey = toDateKey(new Date());
  const todayCount = todayKey
    ? userPosts.filter(
        (post) => toDateKey(post.date || post.created_at) === todayKey
      ).length
    : 0;
  const streak = todayKey && dateKeys.has(todayKey) ? computeStreak(dateKeys) : 0;

  const followingCount = getFollowingCount();
  const followersCount = getFollowersCount();

  const displayName = getProfileDisplayName(currentProfile, currentUser.email || "-");
  const handleLabel = currentProfile?.handle ? formatHandle(currentProfile.handle) : "";
  const nameText =
    handleLabel && displayName !== handleLabel
      ? `${displayName} (${handleLabel})`
      : displayName;

  if (avatarEl) {
    renderAvatar(
      avatarEl,
      currentProfile,
      (displayName || handleLabel || "?").charAt(0).toUpperCase()
    );
  }
  if (cardEl) applyProfileTheme(cardEl, currentProfile);
  if (bannerEl) {
    applyProfileBanner(bannerEl, currentProfile);
    bannerEl.classList.toggle("hidden", !currentProfile?.banner_url);
  }
  if (nameEl) {
    nameEl.textContent = nameText;
  }
  if (emailEl) {
    emailEl.textContent = currentUser.email || "-";
  }
  if (bioEl) {
    const bioText = (currentProfile?.bio || "").trim();
    bioEl.textContent = bioText;
    bioEl.classList.toggle("hidden", !bioText);
  }
  renderProfileFacts(factsEl, currentProfile, tr);
  renderProfileHighlights(highlightsEl, currentProfile, tr);
  renderProfileLinks(linksEl, currentProfile, tr);
  toggleSectionVisibility("profile-facts-title", factsEl);
  toggleSectionVisibility("profile-highlights-title", highlightsEl);
  toggleSectionVisibility("profile-links-title", linksEl);
  const hasProfileExtras = Boolean(
    currentProfile?.banner_url ||
      (factsEl && factsEl.children.length) ||
      (highlightsEl && highlightsEl.children.length) ||
      (linksEl && linksEl.children.length)
  );
  toggleCollapsibleVisibility("profile-details", hasProfileExtras);
  renderProfileStatsGrid(statsGridEl, userPosts, tr);
  renderProfileQuickStats(quickStatsEl, userPosts, tr);
  if (joinedEl) {
    joinedEl.textContent = `${tr.profileJoined || "Joined"}: ${joinedStr}`;
  }
  if (postsEl) {
    postsEl.textContent = `${tr.profilePosts || "Posts"}: ${postCount}`;
  }
  if (followingEl) {
    followingEl.textContent = `${tr.profileFollowing || "Following"}: ${followingCount}`;
  }
  if (followersEl) {
    followersEl.textContent = `${tr.profileFollowers || "Followers"}: ${followersCount}`;
  }
  if (streakEl) {
    streakEl.textContent = `${tr.profileStreak || "Streak"}: ${streak}${tr.profileStreakUnit || ""}`;
  }
  if (statTodayEl) statTodayEl.textContent = `${todayCount}`;
  if (statStreakEl) statStreakEl.textContent = `${streak}`;
  if (statTotalEl) statTotalEl.textContent = `${postCount}`;
}

export function setupProfileLinks() {
  const feedList = $("feed-list");
  if (feedList) {
    feedList.addEventListener("click", (e) => {
      const link = e.target.closest(".profile-link");
      if (!link) return;
      const userId = link.getAttribute("data-user-id");
      if (userId) {
        openPublicProfile(userId);
      }
    });
  }

  const backBtn = $("btn-back-to-feed");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      setActivePage("feed");
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname);
      }
      setCurrentPublicProfileId(null);
    });
  }

  const prevBtn = $("btn-gallery-prev");
  const nextBtn = $("btn-gallery-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      setGalleryPage(Math.max(1, getGalleryPage() - 1));
      renderGalleryPage();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      setGalleryPage(getGalleryPage() + 1);
      renderGalleryPage();
    });
  }

  const shareBtn = $("btn-share-profile");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const currentPublicProfileId = getCurrentPublicProfileId();
      if (!currentPublicProfileId) return;
      const base = window.location.href.split("#")[0];
      const url = `${base}#profile=${currentPublicProfileId}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("プロフィールURLをコピーしました。", "success");
      } catch {
        window.prompt("このURLをコピーしてください", url);
      }
    });
  }

  const followBtn = $("btn-public-follow");
  if (followBtn) {
    followBtn.addEventListener("click", async () => {
      if (followBtn.classList.contains("is-loading")) return;
      const currentUser = getCurrentUser();
      const currentPublicProfileId = getCurrentPublicProfileId();
      if (!currentUser || !currentPublicProfileId) return;
      followBtn.classList.add("is-loading");
      followBtn.disabled = true;
      try {
        await toggleFollowForUser(currentPublicProfileId);
        await loadFollowStats();
        await openPublicProfile(currentPublicProfileId);
      } finally {
        followBtn.classList.remove("is-loading");
        followBtn.disabled = false;
      }
    });
  }
}

export async function openPublicProfile(userId) {
  const currentLang = profileContext.getCurrentLang?.() || "ja";
  const tr = t[currentLang] || t.ja;
  if (!userId) return;
  const prevPublicId = getCurrentPublicProfileId();
  setCurrentPublicProfileId(userId);
  if (prevPublicId !== userId) {
    setPublicPostsVisibleCount(getPublicPostsPageSize());
    toggleCollapsibleVisibility("public-profile-details", false);
  }

  const profile = await getProfile(userId);
  const handle = profile?.handle || profile?.username || "user";

  const cardEl = $("public-profile-card");
  const bannerEl = $("public-profile-banner");
  const factsEl = $("public-profile-facts");
  const highlightsEl = $("public-profile-highlights");
  const linksEl = $("public-profile-links");
  const statsGridEl = $("public-profile-stats-grid");
  const quickStatsEl = $("public-profile-quick-stats");
  const avatarEl = $("public-profile-avatar");
  const displayEl = $("public-profile-name");
  const nameEl = $("public-profile-handle");
  const bioEl = $("public-profile-bio");
  const joinedEl = $("public-profile-joined");
  const postsEl = $("public-profile-posts");
  const followingEl = $("public-profile-following");
  const followersEl = $("public-profile-followers");
  const followBtn = $("btn-public-follow");

  const handleText = formatHandle(handle) || "@user";
  const displayName = profile?.display_name || handleText.replace("@", "");
  if (displayEl) displayEl.textContent = displayName;
  if (nameEl) nameEl.textContent = handleText;
  if (bioEl) {
    const bioText = (profile?.bio || "").trim();
    bioEl.textContent = bioText;
    bioEl.classList.toggle("hidden", !bioText);
  }
  if (avatarEl) {
    const initial = (displayName || handleText || "U")
      .replace("@", "")
      .charAt(0)
      .toUpperCase();
    renderAvatar(avatarEl, profile, initial);
  }
  if (cardEl) applyProfileTheme(cardEl, profile);
  if (bannerEl) {
    applyProfileBanner(bannerEl, profile);
    bannerEl.classList.toggle("hidden", !profile?.banner_url);
  }
  renderProfileFacts(factsEl, profile, tr);
  renderProfileHighlights(highlightsEl, profile, tr);
  renderProfileLinks(linksEl, profile, tr);
  toggleSectionVisibility("public-profile-facts-title", factsEl);
  toggleSectionVisibility("public-profile-highlights-title", highlightsEl);
  toggleSectionVisibility("public-profile-links-title", linksEl);
  const hasPublicExtras = Boolean(
    profile?.banner_url ||
      (factsEl && factsEl.children.length) ||
      (highlightsEl && highlightsEl.children.length) ||
      (linksEl && linksEl.children.length)
  );
  toggleCollapsibleVisibility("public-profile-details", hasPublicExtras);
  if (joinedEl) {
    joinedEl.textContent = `${tr.profileJoined || "Joined"}: ${
      profile?.created_at ? formatDateDisplay(profile.created_at) : "-"
    }`;
  }

  const currentUser = getCurrentUser();
  const allPosts = getAllPosts();
  const userPosts = Array.isArray(allPosts)
    ? allPosts.filter(
        (post) =>
          post.user_id === userId &&
          (post.visibility !== "private" ||
            (currentUser && currentUser.id === userId))
      )
    : [];

  renderProfileStatsGrid(statsGridEl, userPosts, tr);
  renderProfileQuickStats(quickStatsEl, userPosts, tr);

  if (postsEl) {
    postsEl.textContent = `${tr.profilePosts || "Posts"}: ${userPosts.length}`;
  }

  const counts = await getFollowCounts(userId);
  if (followingEl) {
    followingEl.textContent = `${tr.profileFollowing || "Following"}: ${counts.following}`;
  }
  if (followersEl) {
    followersEl.textContent = `${tr.profileFollowers || "Followers"}: ${counts.followers}`;
  }

  if (followBtn) {
    if (!currentUser || currentUser.id === userId) {
      followBtn.style.display = "none";
    } else {
      followBtn.style.display = "inline-flex";
      const isFollowing = getFollowingIds().has(userId);
      followBtn.textContent = isFollowing ? tr.unfollow || "Following" : tr.follow || "Follow";
      followBtn.classList.toggle("is-following", isFollowing);
      followBtn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
    }
  }

  const list = $("public-profile-posts-list");
  const moreWrap = $("public-posts-more");
  const moreHint = $("public-posts-hint");
  const moreBtn = $("btn-public-posts-more");
  if (list) {
    list.innerHTML = "";
    if (!userPosts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = tr.emptyFeed || "No posts.";
      list.appendChild(empty);
    } else {
      const visiblePosts = userPosts.slice(0, getPublicPostsVisibleCount());
      visiblePosts.forEach((post) => {
        const clone = document.createElement("div");
        clone.className = "post-card";
        clone.setAttribute("data-post-id", post.id);
        const title = document.createElement("div");
        title.className = "post-sub";
        title.textContent = formatDateDisplay(post.date || post.created_at || "");
        const body = document.createElement("div");
        body.className = "post-body";
        const rawText = (post.note || post.caption || "").toString().trim();
        const maxLen = 80;
        let preview = rawText;
        if (preview.length > maxLen) {
          preview = `${preview.slice(0, maxLen)}…`;
        }
        body.textContent = preview || "—";
        clone.appendChild(title);
        clone.appendChild(body);
        list.appendChild(clone);
      });
    }
  }

  if (moreWrap && moreBtn && moreHint) {
    const remaining = Math.max(0, userPosts.length - getPublicPostsVisibleCount());
    moreWrap.classList.toggle("hidden", remaining === 0);
    moreHint.textContent = remaining
      ? (tr.feedMoreHint || "あと{count}件").replace("{count}", remaining)
      : "";
    moreBtn.textContent = tr.feedMore || "もっと見る";
    if (!moreBtn.dataset.bound) {
      moreBtn.dataset.bound = "true";
      moreBtn.addEventListener("click", () => {
        setPublicPostsVisibleCount(getPublicPostsVisibleCount() + getPublicPostsPageSize());
        openPublicProfile(userId);
      });
    }
  }

  const mediaPosts = userPosts.filter((post) => post.media_url);
  setCurrentGalleryPosts(mediaPosts);
  setGalleryPage(1);
  renderGalleryPage();

  setActivePage("public-profile");
  if (window.location.hash !== `#profile=${userId}`) {
    window.location.hash = `profile=${userId}`;
  }
}
