import { supabase } from "./supabaseClient.js";
import { isFeatureEnabled } from "./monetization.js";
import {
  $,
  formatHandle,
  renderAvatar,
  setButtonLoading,
  showToast,
} from "./utils.js";

const COACH_SELECT_FIELDS =
  "user_id,headline,about,specialties,service_area,experience_years,online_available,in_person_available,accepting_inquiries,status,created_at,updated_at";
const INQUIRY_SELECT_FIELDS =
  "id,coach_user_id,sender_user_id,topic,message,status,read_at,created_at,updated_at";

const copy = {
  ja: {
    nav: "コーチ",
    feedEntry: "コーチを探す",
    directoryKicker: "COACH FREE",
    directoryTitle: "自分に合うコーチを見つける",
    directorySub: "得意分野と対応方法を比べて、気になるコーチへ直接相談できます。",
    directoryDisclaimer: "掲載内容は本人申告です。Coach Freeは資格や指導品質を認証する表示ではありません。",
    ownerEntry: "コーチとして掲載",
    searchPlaceholder: "名前・得意分野・エリアで検索",
    all: "すべて",
    online: "オンライン",
    inPerson: "対面",
    refresh: "更新",
    count: "{count}人のコーチ",
    loading: "コーチを読み込んでいます...",
    empty: "条件に合うコーチはまだいません。",
    unavailable: "Coach Freeは現在準備中です。",
    loadFailed: "コーチ一覧を読み込めませんでした。",
    profile: "プロフィール",
    inquire: "相談してみる",
    manage: "掲載を管理",
    accepting: "相談受付中",
    paused: "受付停止中",
    years: "指導経験 {count}年",
    area: "対応エリア",
    dashboardTitle: "コーチ掲載",
    dashboardSub: "無料プロフィールを公開して、トレーニング相談を受け付けられます。",
    viewDirectory: "一覧を見る",
    editProfile: "編集",
    notRegistered: "未登録",
    draft: "下書き",
    published: "公開中",
    profilePaused: "非公開",
    emptyTitle: "Coach Freeを始める",
    emptyNote: "得意分野、対応エリア、相談方法を登録するだけで掲載できます。",
    start: "無料で登録",
    headlineLabel: "ひとこと紹介",
    headlinePlaceholder: "例：初心者向けの習慣づくりをサポート",
    aboutLabel: "コーチ紹介",
    aboutPlaceholder: "指導方針や相談できる内容を書いてください",
    aboutHint: "公開には20文字以上必要です。",
    specialtiesLabel: "得意分野",
    specialtiesPlaceholder: "筋肥大, ダイエット, フォーム改善",
    specialtiesHint: "カンマ区切り・最大8件",
    areaLabel: "対応エリア",
    areaPlaceholder: "東京都 / 全国オンライン",
    experienceLabel: "指導経験（年）",
    onlineTitle: "オンライン対応",
    onlineNote: "場所を問わず相談を受付",
    personTitle: "対面対応",
    personNote: "指定エリアで直接指導",
    acceptingTitle: "問い合わせ受付",
    acceptingNote: "新しい相談を受け取る",
    publishTitle: "プロフィールを公開する",
    publishNote: "公開前は下書きとして保存されます。",
    close: "閉じる",
    save: "保存",
    saving: "保存中...",
    saveSuccess: "コーチプロフィールを保存しました。",
    saveFailed: "コーチプロフィールを保存できませんでした。",
    publishProfileRequired: "公開前に通常プロフィールの表示名と@handleを設定してください。",
    publishFieldsRequired: "公開には紹介文、20文字以上の説明、得意分野、対応方法が必要です。",
    inboxTitle: "問い合わせ",
    inboxSub: "相談内容を確認して、DMで返信できます。",
    inboxEmpty: "新しい問い合わせはまだありません。",
    inboxFailed: "問い合わせを読み込めませんでした。",
    markRead: "既読にする",
    closeInquiry: "完了",
    replyDm: "DMで返信",
    newInquiry: "新着",
    readInquiry: "確認済み",
    closedInquiry: "完了",
    publicBadge: "COACH FREE",
    publicDisclaimer: "本人申告・未認証プロフィール",
    directoryBack: "コーチ一覧",
    inquiryKicker: "COACH INQUIRY",
    inquiryTitle: "コーチに相談する",
    topicLabel: "相談内容",
    messageLabel: "メッセージ",
    messagePlaceholder: "目標や現在困っていることを具体的に書いてください",
    privacy: "この内容は相手のコーチだけに表示されます。返信はDMで届きます。",
    cancel: "キャンセル",
    submit: "問い合わせを送る",
    sending: "送信中...",
    inquirySuccess: "問い合わせを送りました。返信はDMで届きます。",
    inquiryFailed: "問い合わせを送れませんでした。",
    inquiryLogin: "問い合わせを送るにはログインしてください。",
    selfInquiry: "自分自身には問い合わせできません。",
    inquiryTooShort: "メッセージは20文字以上で入力してください。",
    noLongerAccepting: "このコーチは現在問い合わせを受け付けていません。",
    topicProgramming: "メニュー作成",
    topicForm: "フォーム相談",
    topicOnline: "オンライン指導",
    topicPerson: "対面指導",
    topicOther: "その他",
    unknownUser: "ユーザー",
    coachFormFallback: "お問い合わせありがとうございます。相談内容を確認しました。",
  },
  en: {
    nav: "Coaches",
    feedEntry: "Find a coach",
    directoryKicker: "COACH FREE",
    directoryTitle: "Find the right coach for you",
    directorySub: "Compare specialties and coaching options, then contact a coach directly.",
    directoryDisclaimer: "Listings are self-reported. Coach Free does not verify qualifications or coaching quality.",
    ownerEntry: "List as a coach",
    searchPlaceholder: "Search name, specialty, or area",
    all: "All",
    online: "Online",
    inPerson: "In person",
    refresh: "Refresh",
    count: "{count} coaches",
    loading: "Loading coaches...",
    empty: "No coaches match these filters yet.",
    unavailable: "Coach Free is being prepared.",
    loadFailed: "Could not load coaches.",
    profile: "Profile",
    inquire: "Ask a question",
    manage: "Manage listing",
    accepting: "Accepting inquiries",
    paused: "Inquiries paused",
    years: "{count} years coaching",
    area: "Service area",
    dashboardTitle: "Coach listing",
    dashboardSub: "Publish a free profile and receive training inquiries.",
    viewDirectory: "View directory",
    editProfile: "Edit",
    notRegistered: "Not registered",
    draft: "Draft",
    published: "Published",
    profilePaused: "Hidden",
    emptyTitle: "Start Coach Free",
    emptyNote: "Add your specialties, service area, and coaching options to get listed.",
    start: "Register free",
    headlineLabel: "Short headline",
    headlinePlaceholder: "Example: Helping beginners build lasting habits",
    aboutLabel: "About your coaching",
    aboutPlaceholder: "Describe your coaching approach and what people can ask about",
    aboutHint: "At least 20 characters are required to publish.",
    specialtiesLabel: "Specialties",
    specialtiesPlaceholder: "Hypertrophy, fat loss, form",
    specialtiesHint: "Comma-separated, up to 8",
    areaLabel: "Service area",
    areaPlaceholder: "Tokyo / Online worldwide",
    experienceLabel: "Years coaching",
    onlineTitle: "Online coaching",
    onlineNote: "Accept inquiries from anywhere",
    personTitle: "In-person coaching",
    personNote: "Coach in your selected area",
    acceptingTitle: "Accept inquiries",
    acceptingNote: "Receive new coaching requests",
    publishTitle: "Publish profile",
    publishNote: "Keep this off to save as a draft.",
    close: "Close",
    save: "Save",
    saving: "Saving...",
    saveSuccess: "Coach profile saved.",
    saveFailed: "Could not save the coach profile.",
    publishProfileRequired: "Set a display name and @handle in your main profile before publishing.",
    publishFieldsRequired: "Publishing requires a headline, a 20-character description, a specialty, and a coaching option.",
    inboxTitle: "Inquiries",
    inboxSub: "Review each request and reply in DM.",
    inboxEmpty: "No inquiries yet.",
    inboxFailed: "Could not load inquiries.",
    markRead: "Mark read",
    closeInquiry: "Close",
    replyDm: "Reply in DM",
    newInquiry: "New",
    readInquiry: "Read",
    closedInquiry: "Closed",
    publicBadge: "COACH FREE",
    publicDisclaimer: "Self-reported, unverified profile",
    directoryBack: "Coach directory",
    inquiryKicker: "COACH INQUIRY",
    inquiryTitle: "Contact this coach",
    topicLabel: "Topic",
    messageLabel: "Message",
    messagePlaceholder: "Share your goal and what you need help with",
    privacy: "Only this coach can see the inquiry. Their reply will arrive in DM.",
    cancel: "Cancel",
    submit: "Send inquiry",
    sending: "Sending...",
    inquirySuccess: "Inquiry sent. The reply will arrive in DM.",
    inquiryFailed: "Could not send the inquiry.",
    inquiryLogin: "Sign in to contact a coach.",
    selfInquiry: "You cannot contact yourself.",
    inquiryTooShort: "Enter at least 20 characters.",
    noLongerAccepting: "This coach is not accepting inquiries right now.",
    topicProgramming: "Program design",
    topicForm: "Form check",
    topicOnline: "Online coaching",
    topicPerson: "In-person coaching",
    topicOther: "Other",
    unknownUser: "User",
    coachFormFallback: "Thanks for your inquiry. I have reviewed the details.",
  },
};

let coachContext = {
  getCurrentUser: () => null,
  getCurrentLang: () => "ja",
  getCurrentProfile: () => null,
  getProfilesForUsers: async () => new Map(),
  setActivePage: () => {},
  openPublicProfile: () => {},
  openDmConversation: () => {},
};

const state = {
  directory: [],
  ownProfile: null,
  inquiries: [],
  directoryLoaded: false,
  ownLoadedFor: "",
  inboxLoadedFor: "",
  serviceFilter: "all",
  publicCoach: null,
  publicUserId: "",
  inquiryCoach: null,
};

const getCurrentUser = () => coachContext.getCurrentUser?.() || null;
const getCurrentLang = () => coachContext.getCurrentLang?.() || "ja";
const getCurrentProfile = () => coachContext.getCurrentProfile?.() || null;
const tr = () => copy[getCurrentLang()] || copy.ja;
const coachEnabled = () => isFeatureEnabled("coach_directory", getCurrentUser()?.id || "");
const inquiriesEnabled = () => isFeatureEnabled("coach_inquiries", getCurrentUser()?.id || "");

export function setCoachContext(next = {}) {
  coachContext = { ...coachContext, ...next };
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function setPlaceholder(id, value) {
  const node = $(id);
  if (node) node.placeholder = value;
}

function normalizeSpecialties(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,、]/);
  const seen = new Set();
  return source
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function normalizeCoach(row = {}) {
  if (!row?.user_id) return null;
  return {
    ...row,
    user_id: String(row.user_id),
    headline: String(row.headline || "").trim(),
    about: String(row.about || "").trim(),
    specialties: normalizeSpecialties(row.specialties),
    service_area: String(row.service_area || "").trim(),
    experience_years:
      row.experience_years === null || row.experience_years === undefined
        ? null
        : Number(row.experience_years),
    online_available: row.online_available === true,
    in_person_available: row.in_person_available === true,
    accepting_inquiries: row.accepting_inquiries === true,
    status: ["draft", "published", "paused"].includes(row.status)
      ? row.status
      : "draft",
  };
}

function isMissingCoachTable(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (/coach_profiles|coach_inquiries/i.test(message) &&
      /not find|does not exist|schema cache/i.test(message))
  );
}

function getProfileName(profile) {
  return (
    String(profile?.display_name || "").trim() ||
    formatHandle(profile?.handle || profile?.username || "") ||
    tr().unknownUser
  );
}

function getTopicLabel(topic) {
  const labels = {
    programming: tr().topicProgramming,
    form_check: tr().topicForm,
    online: tr().topicOnline,
    in_person: tr().topicPerson,
    other: tr().topicOther,
  };
  return labels[topic] || labels.other;
}

function formatCoachDate(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(getCurrentLang() === "ja" ? "ja-JP" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function openCoachDirectory() {
  coachContext.setActivePage?.("coaches", { scrollBehavior: "smooth" });
  if (window.location.hash !== "#coaches") {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#coaches`);
  }
  loadCoachDirectory({ force: true }).catch((error) => {
    console.error("coach directory open error", error);
  });
}

function openCoachDashboard({ edit = false } = {}) {
  const user = getCurrentUser();
  if (window.location.hash === "#coaches") {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  coachContext.setActivePage?.("account", { scrollBehavior: "smooth" });
  if (!user) {
    showToast(tr().inquiryLogin, "warning");
    $("btn-auth-open-form")?.click();
    return;
  }
  refreshCoachAuthState({ loadInbox: true }).then(() => {
    if (edit || !state.ownProfile) setCoachFormOpen(true);
    $("coach-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function syncCoachFeatureVisibility() {
  const enabled = coachEnabled();
  ["nav-coaches", "btn-feed-coaches"].forEach((id) => {
    $(id)?.classList.toggle("hidden", !enabled);
  });
  const page = document.querySelector('.page-view[data-page="coaches"]');
  if (page) page.dataset.featureEnabled = enabled ? "true" : "false";
  refreshCoachDashboardVisibility();
}

function refreshCoachDashboardVisibility() {
  const dashboard = $("coach-dashboard");
  if (!dashboard) return;
  dashboard.classList.toggle("hidden", !coachEnabled() || !getCurrentUser());
}

export function applyCoachTranslations() {
  const value = tr();
  setText("nav-coaches-label", value.nav);
  setText("btn-feed-coaches", value.feedEntry);
  setText("coach-directory-kicker", value.directoryKicker);
  setText("coach-directory-title", value.directoryTitle);
  setText("coach-directory-sub", value.directorySub);
  setText("coach-directory-disclaimer", value.directoryDisclaimer);
  setText("btn-coach-owner-entry", value.ownerEntry);
  setPlaceholder("coach-search", value.searchPlaceholder);
  setText("coach-filter-all", value.all);
  setText("coach-filter-online", value.online);
  setText("coach-filter-person", value.inPerson);
  setText("btn-coach-refresh", value.refresh);
  setText("coach-dashboard-title", value.dashboardTitle);
  setText("coach-dashboard-sub", value.dashboardSub);
  setText("btn-coach-view-directory", value.viewDirectory);
  setText("btn-coach-edit-profile", value.editProfile);
  setText("coach-empty-title", value.emptyTitle);
  setText("coach-empty-note", value.emptyNote);
  setText("btn-coach-start", value.start);
  setText("coach-headline-label", value.headlineLabel);
  setPlaceholder("coach-headline", value.headlinePlaceholder);
  setText("coach-about-label", value.aboutLabel);
  setPlaceholder("coach-about", value.aboutPlaceholder);
  setText("coach-about-hint", value.aboutHint);
  setText("coach-specialties-label", value.specialtiesLabel);
  setPlaceholder("coach-specialties", value.specialtiesPlaceholder);
  setText("coach-specialties-hint", value.specialtiesHint);
  setText("coach-area-label", value.areaLabel);
  setPlaceholder("coach-area", value.areaPlaceholder);
  setText("coach-experience-label", value.experienceLabel);
  setText("coach-online-title", value.onlineTitle);
  setText("coach-online-note", value.onlineNote);
  setText("coach-person-title", value.personTitle);
  setText("coach-person-note", value.personNote);
  setText("coach-accepting-title", value.acceptingTitle);
  setText("coach-accepting-note", value.acceptingNote);
  setText("coach-published-title", value.publishTitle);
  setText("coach-published-note", value.publishNote);
  setText("btn-coach-cancel", value.close);
  setText("btn-coach-save", value.save);
  setText("coach-inbox-title", value.inboxTitle);
  setText("coach-inbox-sub", value.inboxSub);
  setText("public-profile-coach-badge", value.publicBadge);
  setText("public-profile-coach-disclaimer", value.publicDisclaimer);
  setText("btn-public-coach-inquiry", value.inquire);
  setText("btn-public-coach-directory", value.directoryBack);
  setText("coach-inquiry-kicker", value.inquiryKicker);
  setText("coach-inquiry-title", value.inquiryTitle);
  setText("coach-inquiry-topic-label", value.topicLabel);
  setText("coach-inquiry-message-label", value.messageLabel);
  setPlaceholder("coach-inquiry-message", value.messagePlaceholder);
  setText("coach-inquiry-privacy", value.privacy);
  setText("btn-coach-inquiry-cancel", value.cancel);
  setText("btn-coach-inquiry-submit", value.submit);
  setText("coach-topic-programming", value.topicProgramming);
  setText("coach-topic-form", value.topicForm);
  setText("coach-topic-online", value.topicOnline);
  setText("coach-topic-person", value.topicPerson);
  setText("coach-topic-other", value.topicOther);
  renderCoachDirectory();
  renderOwnCoachProfile();
  renderCoachInbox();
  if (state.publicCoach) renderPublicCoachCard(state.publicCoach);
  syncCoachFeatureVisibility();
}

function createSpecialtyChip(label) {
  const chip = document.createElement("span");
  chip.className = "coach-specialty-chip";
  chip.textContent = label;
  return chip;
}

function createCoachCard(coach) {
  const profile = coach.profile || null;
  const user = getCurrentUser();
  const card = document.createElement("article");
  card.className = "coach-directory-card";
  card.dataset.userId = coach.user_id;

  const top = document.createElement("div");
  top.className = "coach-card-top";
  const avatar = document.createElement("button");
  avatar.className = "avatar coach-card-avatar";
  avatar.type = "button";
  avatar.setAttribute("aria-label", `${getProfileName(profile)} ${tr().profile}`);
  renderAvatar(avatar, profile, getProfileName(profile).charAt(0).toUpperCase());
  avatar.addEventListener("click", () => coachContext.openPublicProfile?.(coach.user_id));

  const identity = document.createElement("div");
  identity.className = "coach-card-identity";
  const name = document.createElement("button");
  name.className = "coach-card-name";
  name.type = "button";
  name.textContent = getProfileName(profile);
  name.addEventListener("click", () => coachContext.openPublicProfile?.(coach.user_id));
  const handle = document.createElement("div");
  handle.className = "coach-card-handle";
  handle.textContent = formatHandle(profile?.handle || profile?.username || "");
  identity.append(name, handle);

  const availability = document.createElement("span");
  availability.className = `coach-profile-status${coach.accepting_inquiries ? " is-live" : ""}`;
  availability.textContent = coach.accepting_inquiries ? tr().accepting : tr().paused;
  top.append(avatar, identity, availability);

  const headline = document.createElement("h2");
  headline.className = "coach-card-headline";
  headline.textContent = coach.headline;
  const about = document.createElement("p");
  about.className = "coach-card-about";
  about.textContent = coach.about;

  const specialties = document.createElement("div");
  specialties.className = "coach-specialty-list";
  coach.specialties.forEach((item) => specialties.appendChild(createSpecialtyChip(item)));

  const meta = document.createElement("div");
  meta.className = "coach-card-meta";
  if (coach.online_available) {
    const item = document.createElement("span");
    item.textContent = tr().online;
    meta.appendChild(item);
  }
  if (coach.in_person_available) {
    const item = document.createElement("span");
    item.textContent = tr().inPerson;
    meta.appendChild(item);
  }
  if (coach.service_area) {
    const item = document.createElement("span");
    item.textContent = coach.service_area;
    meta.appendChild(item);
  }
  if (Number.isFinite(coach.experience_years)) {
    const item = document.createElement("span");
    item.textContent = tr().years.replace("{count}", coach.experience_years);
    meta.appendChild(item);
  }

  const actions = document.createElement("div");
  actions.className = "coach-card-actions";
  const profileButton = document.createElement("button");
  profileButton.className = "btn btn-ghost";
  profileButton.type = "button";
  profileButton.textContent = tr().profile;
  profileButton.addEventListener("click", () => coachContext.openPublicProfile?.(coach.user_id));
  const action = document.createElement("button");
  action.className = "btn btn-primary";
  action.type = "button";
  const own = user?.id === coach.user_id;
  action.textContent = own ? tr().manage : tr().inquire;
  action.disabled = !own && !coach.accepting_inquiries;
  action.addEventListener("click", () => {
    if (own) openCoachDashboard({ edit: true });
    else openCoachInquiry(coach);
  });
  actions.append(profileButton, action);
  card.append(top, headline, about, specialties, meta, actions);
  return card;
}

function getVisibleCoaches() {
  const query = String($("coach-search")?.value || "").trim().toLocaleLowerCase();
  return state.directory.filter((coach) => {
    if (state.serviceFilter === "online" && !coach.online_available) return false;
    if (state.serviceFilter === "in_person" && !coach.in_person_available) return false;
    if (!query) return true;
    const profile = coach.profile || {};
    const haystack = [
      profile.display_name,
      profile.handle,
      coach.headline,
      coach.about,
      coach.service_area,
      ...coach.specialties,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(query);
  });
}

export function renderCoachDirectory() {
  const list = $("coach-directory-list");
  const status = $("coach-directory-status");
  if (!list || !status) return;
  list.replaceChildren();
  if (!coachEnabled()) {
    setText("coach-directory-count", tr().count.replace("{count}", "0"));
    status.textContent = tr().unavailable;
    return;
  }
  const visible = getVisibleCoaches();
  setText("coach-directory-count", tr().count.replace("{count}", visible.length));
  visible.forEach((coach) => list.appendChild(createCoachCard(coach)));
  status.textContent = visible.length ? "" : tr().empty;
}

export async function loadCoachDirectory({ force = false } = {}) {
  const status = $("coach-directory-status");
  if (!coachEnabled()) {
    renderCoachDirectory();
    return [];
  }
  if (state.directoryLoaded && !force) {
    renderCoachDirectory();
    return state.directory;
  }
  if (status) status.textContent = tr().loading;
  const { data, error } = await supabase
    .from("coach_profiles")
    .select(COACH_SELECT_FIELDS)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    if (!isMissingCoachTable(error)) console.error("coach directory load error", error);
    state.directory = [];
    state.directoryLoaded = false;
    if (status) status.textContent = isMissingCoachTable(error) ? tr().unavailable : tr().loadFailed;
    return [];
  }
  const coaches = (data || []).map(normalizeCoach).filter(Boolean);
  const profiles = await coachContext.getProfilesForUsers?.(
    coaches.map((coach) => coach.user_id)
  );
  state.directory = coaches
    .map((coach) => ({ ...coach, profile: profiles?.get?.(coach.user_id) || null }))
    .filter((coach) => coach.profile);
  state.directoryLoaded = true;
  renderCoachDirectory();
  return state.directory;
}

async function loadOwnCoachProfile({ force = false } = {}) {
  const user = getCurrentUser();
  if (!user || !coachEnabled()) {
    state.ownProfile = null;
    state.ownLoadedFor = "";
    renderOwnCoachProfile();
    return null;
  }
  if (!force && state.ownLoadedFor === user.id) return state.ownProfile;
  const { data, error } = await supabase
    .from("coach_profiles")
    .select(COACH_SELECT_FIELDS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error && !isMissingCoachTable(error)) {
    console.error("own coach profile load error", error);
  }
  state.ownProfile = error ? null : normalizeCoach(data);
  state.ownLoadedFor = user.id;
  renderOwnCoachProfile();
  return state.ownProfile;
}

function getCoachStatusLabel(profile) {
  if (!profile) return tr().notRegistered;
  if (profile.status === "published") return tr().published;
  if (profile.status === "paused") return tr().profilePaused;
  return tr().draft;
}

function populateCoachForm(profile = state.ownProfile) {
  if ($("coach-headline")) $("coach-headline").value = profile?.headline || "";
  if ($("coach-about")) $("coach-about").value = profile?.about || "";
  if ($("coach-specialties")) {
    $("coach-specialties").value = (profile?.specialties || []).join(", ");
  }
  if ($("coach-area")) $("coach-area").value = profile?.service_area || "";
  if ($("coach-experience")) {
    $("coach-experience").value = Number.isFinite(profile?.experience_years)
      ? String(profile.experience_years)
      : "";
  }
  if ($("coach-online")) $("coach-online").checked = profile?.online_available === true;
  if ($("coach-in-person")) {
    $("coach-in-person").checked = profile?.in_person_available === true;
  }
  if ($("coach-accepting")) {
    $("coach-accepting").checked = profile?.accepting_inquiries !== false;
  }
  if ($("coach-published")) $("coach-published").checked = profile?.status === "published";
}

function setCoachFormOpen(open) {
  const form = $("coach-profile-form");
  if (!form) return;
  form.classList.toggle("hidden", !open);
  if (open) {
    populateCoachForm();
    $("coach-headline")?.focus();
  }
  const status = $("coach-profile-form-status");
  if (status) status.textContent = "";
}

function renderOwnCoachProfile() {
  const dashboard = $("coach-dashboard");
  if (!dashboard) return;
  refreshCoachDashboardVisibility();
  const profile = state.ownProfile;
  const empty = $("coach-dashboard-empty");
  const inbox = $("coach-inbox");
  empty?.classList.toggle("hidden", !!profile);
  inbox?.classList.toggle("hidden", !profile);
  const badge = $("coach-profile-status");
  if (badge) {
    badge.textContent = getCoachStatusLabel(profile);
    badge.classList.toggle("is-live", profile?.status === "published");
  }
  $("btn-coach-edit-profile")?.classList.toggle("hidden", !profile);
  if (profile && !$("coach-profile-form")?.classList.contains("hidden")) {
    populateCoachForm(profile);
  }
}

async function saveCoachProfile(event) {
  event?.preventDefault?.();
  const user = getCurrentUser();
  if (!user) return;
  const profile = getCurrentProfile();
  const headline = String($("coach-headline")?.value || "").trim();
  const about = String($("coach-about")?.value || "").trim();
  const specialties = normalizeSpecialties($("coach-specialties")?.value || "");
  const serviceArea = String($("coach-area")?.value || "").trim();
  const experienceRaw = String($("coach-experience")?.value || "").trim();
  const online = $("coach-online")?.checked === true;
  const inPerson = $("coach-in-person")?.checked === true;
  const accepting = $("coach-accepting")?.checked === true;
  const published = $("coach-published")?.checked === true;
  const formStatus = $("coach-profile-form-status");
  if (published && (!String(profile?.display_name || "").trim() || !String(profile?.handle || "").trim())) {
    if (formStatus) formStatus.textContent = tr().publishProfileRequired;
    showToast(tr().publishProfileRequired, "warning");
    return;
  }
  if (published && (headline.length < 5 || about.length < 20 || !specialties.length || (!online && !inPerson))) {
    if (formStatus) formStatus.textContent = tr().publishFieldsRequired;
    showToast(tr().publishFieldsRequired, "warning");
    return;
  }
  const experience = experienceRaw ? Number(experienceRaw) : null;
  const payload = {
    user_id: user.id,
    headline,
    about,
    specialties,
    service_area: serviceArea || null,
    experience_years: Number.isFinite(experience) ? experience : null,
    online_available: online,
    in_person_available: inPerson,
    accepting_inquiries: accepting,
    status: published ? "published" : "draft",
  };
  const button = $("btn-coach-save");
  setButtonLoading(button, true, tr().saving);
  if (formStatus) formStatus.textContent = "";
  const { data, error } = await supabase
    .from("coach_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(COACH_SELECT_FIELDS)
    .single();
  setButtonLoading(button, false);
  if (error) {
    console.error("coach profile save error", error);
    if (formStatus) formStatus.textContent = tr().saveFailed;
    showToast(tr().saveFailed, "error");
    return;
  }
  state.ownProfile = normalizeCoach(data);
  state.ownLoadedFor = user.id;
  state.directoryLoaded = false;
  renderOwnCoachProfile();
  setCoachFormOpen(false);
  showToast(tr().saveSuccess, "success");
}

async function loadCoachInbox({ force = false } = {}) {
  const user = getCurrentUser();
  if (!user || !state.ownProfile || !inquiriesEnabled()) {
    state.inquiries = [];
    state.inboxLoadedFor = "";
    renderCoachInbox();
    return [];
  }
  if (!force && state.inboxLoadedFor === user.id) return state.inquiries;
  const status = $("coach-inbox-status");
  if (status) status.textContent = tr().loading;
  const { data, error } = await supabase
    .from("coach_inquiries")
    .select(INQUIRY_SELECT_FIELDS)
    .eq("coach_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (!isMissingCoachTable(error)) console.error("coach inbox load error", error);
    state.inquiries = [];
    state.inboxLoadedFor = "";
    if (status) status.textContent = tr().inboxFailed;
    return [];
  }
  const inquiries = data || [];
  const profiles = await coachContext.getProfilesForUsers?.(
    inquiries.map((item) => item.sender_user_id)
  );
  state.inquiries = inquiries.map((item) => ({
    ...item,
    senderProfile: profiles?.get?.(item.sender_user_id) || null,
  }));
  state.inboxLoadedFor = user.id;
  renderCoachInbox();
  return state.inquiries;
}

async function updateInquiryStatus(inquiry, nextStatus) {
  const user = getCurrentUser();
  if (!user || !inquiry?.id) return false;
  const payload = {
    status: nextStatus,
    read_at: inquiry.read_at || new Date().toISOString(),
  };
  const { error } = await supabase
    .from("coach_inquiries")
    .update(payload)
    .eq("id", inquiry.id)
    .eq("coach_user_id", user.id);
  if (error) {
    console.error("coach inquiry status update error", error);
    showToast(tr().inboxFailed, "error");
    return false;
  }
  inquiry.status = nextStatus;
  inquiry.read_at = payload.read_at;
  renderCoachInbox();
  return true;
}

function createInquiryCard(inquiry) {
  const card = document.createElement("article");
  card.className = `coach-inbox-card is-${inquiry.status}`;
  const header = document.createElement("div");
  header.className = "coach-inbox-card-header";
  const avatar = document.createElement("button");
  avatar.className = "avatar coach-inbox-avatar";
  avatar.type = "button";
  renderAvatar(avatar, inquiry.senderProfile, getProfileName(inquiry.senderProfile).charAt(0).toUpperCase());
  avatar.addEventListener("click", () => coachContext.openPublicProfile?.(inquiry.sender_user_id));
  const identity = document.createElement("div");
  identity.className = "coach-inbox-identity";
  const name = document.createElement("strong");
  name.textContent = getProfileName(inquiry.senderProfile);
  const meta = document.createElement("span");
  meta.textContent = `${getTopicLabel(inquiry.topic)} · ${formatCoachDate(inquiry.created_at)}`;
  identity.append(name, meta);
  const status = document.createElement("span");
  status.className = "coach-profile-status";
  status.textContent =
    inquiry.status === "new"
      ? tr().newInquiry
      : inquiry.status === "closed"
        ? tr().closedInquiry
        : tr().readInquiry;
  header.append(avatar, identity, status);

  const message = document.createElement("p");
  message.className = "coach-inbox-message";
  message.textContent = inquiry.message;
  const actions = document.createElement("div");
  actions.className = "coach-inbox-actions";
  if (inquiry.status === "new") {
    const read = document.createElement("button");
    read.className = "btn btn-ghost btn-xs";
    read.type = "button";
    read.textContent = tr().markRead;
    read.addEventListener("click", () => updateInquiryStatus(inquiry, "read"));
    actions.appendChild(read);
  }
  if (inquiry.status !== "closed") {
    const reply = document.createElement("button");
    reply.className = "btn btn-primary btn-xs";
    reply.type = "button";
    reply.textContent = tr().replyDm;
    reply.addEventListener("click", async () => {
      if (inquiry.status === "new") await updateInquiryStatus(inquiry, "read");
      await coachContext.openDmConversation?.(inquiry.sender_user_id, {
        entryContext: {
          source: "coach_inquiry",
          partnerId: inquiry.sender_user_id,
          actorName: getProfileName(inquiry.senderProfile),
          actorHandle: inquiry.senderProfile?.handle || "",
          prefillMessage: tr().coachFormFallback,
        },
      });
    });
    const close = document.createElement("button");
    close.className = "btn btn-ghost btn-xs";
    close.type = "button";
    close.textContent = tr().closeInquiry;
    close.addEventListener("click", () => updateInquiryStatus(inquiry, "closed"));
    actions.append(reply, close);
  }
  card.append(header, message, actions);
  return card;
}

function renderCoachInbox() {
  const list = $("coach-inbox-list");
  const status = $("coach-inbox-status");
  if (!list || !status) return;
  list.replaceChildren();
  state.inquiries.forEach((inquiry) => list.appendChild(createInquiryCard(inquiry)));
  const newCount = state.inquiries.filter((item) => item.status === "new").length;
  setText("coach-inbox-count", String(newCount));
  status.textContent = state.inquiries.length ? "" : tr().inboxEmpty;
}

function openModal(backdrop) {
  if (!backdrop) return;
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => backdrop.classList.add("is-open"));
}

function closeModal(backdrop) {
  if (!backdrop) return;
  backdrop.classList.remove("is-open");
  window.setTimeout(() => backdrop.classList.add("hidden"), 200);
}

function openCoachInquiry(coach) {
  const user = getCurrentUser();
  if (!user) {
    showToast(tr().inquiryLogin, "warning");
    coachContext.setActivePage?.("account", { scrollBehavior: "smooth" });
    $("btn-auth-open-form")?.click();
    return;
  }
  if (user.id === coach?.user_id) {
    showToast(tr().selfInquiry, "warning");
    return;
  }
  if (!coach?.accepting_inquiries || !inquiriesEnabled()) {
    showToast(tr().noLongerAccepting, "warning");
    return;
  }
  state.inquiryCoach = coach;
  setText("coach-inquiry-recipient", getProfileName(coach.profile));
  if ($("coach-inquiry-message")) $("coach-inquiry-message").value = "";
  if ($("coach-inquiry-topic")) $("coach-inquiry-topic").value = "programming";
  setText("coach-inquiry-counter", "0 / 1500");
  setText("coach-inquiry-status", "");
  openModal($("coach-inquiry-backdrop"));
  $("coach-inquiry-message")?.focus();
}

async function submitCoachInquiry(event) {
  event?.preventDefault?.();
  const user = getCurrentUser();
  const coach = state.inquiryCoach;
  if (!user || !coach) return;
  const message = String($("coach-inquiry-message")?.value || "").trim();
  const topic = String($("coach-inquiry-topic")?.value || "other");
  const status = $("coach-inquiry-status");
  if (message.length < 20) {
    if (status) status.textContent = tr().inquiryTooShort;
    return;
  }
  const button = $("btn-coach-inquiry-submit");
  setButtonLoading(button, true, tr().sending);
  const { error } = await supabase.from("coach_inquiries").insert({
    coach_user_id: coach.user_id,
    sender_user_id: user.id,
    topic,
    message,
  });
  setButtonLoading(button, false);
  if (error) {
    console.error("coach inquiry send error", error);
    const tooMany = /too many|limit/i.test(String(error.message || ""));
    if (status) status.textContent = tooMany ? error.message : tr().inquiryFailed;
    showToast(tr().inquiryFailed, "error");
    return;
  }
  closeModal($("coach-inquiry-backdrop"));
  state.inquiryCoach = null;
  showToast(tr().inquirySuccess, "success");
}

function renderPublicCoachCard(coach) {
  const section = $("public-profile-coach");
  if (!section) return;
  section.classList.toggle("hidden", !coach);
  if (!coach) return;
  setText("public-profile-coach-headline", coach.headline);
  setText("public-profile-coach-about", coach.about);
  const availability = $("public-profile-coach-availability");
  if (availability) {
    availability.textContent = coach.accepting_inquiries ? tr().accepting : tr().paused;
    availability.classList.toggle("is-live", coach.accepting_inquiries);
  }
  const specialties = $("public-profile-coach-specialties");
  if (specialties) {
    specialties.replaceChildren();
    coach.specialties.forEach((item) => specialties.appendChild(createSpecialtyChip(item)));
  }
  const meta = $("public-profile-coach-meta");
  if (meta) {
    meta.replaceChildren();
    const labels = [];
    if (coach.online_available) labels.push(tr().online);
    if (coach.in_person_available) labels.push(tr().inPerson);
    if (coach.service_area) labels.push(coach.service_area);
    if (Number.isFinite(coach.experience_years)) {
      labels.push(tr().years.replace("{count}", coach.experience_years));
    }
    labels.forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      meta.appendChild(item);
    });
  }
  const inquiryButton = $("btn-public-coach-inquiry");
  if (inquiryButton) {
    const own = getCurrentUser()?.id === coach.user_id;
    inquiryButton.textContent = own ? tr().manage : tr().inquire;
    inquiryButton.disabled = !own && !coach.accepting_inquiries;
  }
}

async function loadPublicCoach(userId) {
  const section = $("public-profile-coach");
  state.publicUserId = String(userId || "").trim();
  if (!coachEnabled() || !userId) {
    state.publicCoach = null;
    section?.classList.add("hidden");
    return null;
  }
  const { data, error } = await supabase
    .from("coach_profiles")
    .select(COACH_SELECT_FIELDS)
    .eq("user_id", userId)
    .eq("status", "published")
    .maybeSingle();
  if (error && !isMissingCoachTable(error)) {
    console.error("public coach profile load error", error);
  }
  const coach = error ? null : normalizeCoach(data);
  if (coach) {
    const profiles = await coachContext.getProfilesForUsers?.([coach.user_id]);
    coach.profile = profiles?.get?.(coach.user_id) || null;
  }
  state.publicCoach = coach;
  renderPublicCoachCard(coach);
  return coach;
}

export async function refreshCoachAuthState({ loadInbox = false } = {}) {
  const user = getCurrentUser();
  if (!user) {
    state.ownProfile = null;
    state.inquiries = [];
    state.ownLoadedFor = "";
    state.inboxLoadedFor = "";
    renderOwnCoachProfile();
    renderCoachInbox();
    syncCoachFeatureVisibility();
    return;
  }
  syncCoachFeatureVisibility();
  await loadOwnCoachProfile();
  if (loadInbox && state.ownProfile) await loadCoachInbox({ force: true });
}

export function handleCoachPageChange(page) {
  if (page === "coaches") {
    if (window.location.hash !== "#coaches") {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#coaches`);
    }
    loadCoachDirectory().catch((error) => console.error("coach page load error", error));
  }
  if (page === "account") {
    refreshCoachAuthState({ loadInbox: true }).catch((error) =>
      console.error("coach dashboard load error", error)
    );
  }
}

export function setupCoachControls() {
  applyCoachTranslations();
  $("btn-feed-coaches")?.addEventListener("click", openCoachDirectory);
  $("btn-coach-refresh")?.addEventListener("click", () => loadCoachDirectory({ force: true }));
  $("btn-coach-owner-entry")?.addEventListener("click", () => openCoachDashboard({ edit: true }));
  $("btn-coach-view-directory")?.addEventListener("click", openCoachDirectory);
  $("btn-coach-edit-profile")?.addEventListener("click", () => setCoachFormOpen(true));
  $("btn-coach-start")?.addEventListener("click", () => setCoachFormOpen(true));
  $("btn-coach-cancel")?.addEventListener("click", () => setCoachFormOpen(false));
  $("coach-profile-form")?.addEventListener("submit", saveCoachProfile);
  $("coach-search")?.addEventListener("input", renderCoachDirectory);
  document.querySelectorAll("[data-coach-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.serviceFilter = button.dataset.coachFilter || "all";
      document.querySelectorAll("[data-coach-filter]").forEach((peer) => {
        peer.classList.toggle("chip-active", peer === button);
      });
      renderCoachDirectory();
    });
  });
  $("btn-public-coach-directory")?.addEventListener("click", openCoachDirectory);
  $("btn-public-coach-inquiry")?.addEventListener("click", () => {
    if (!state.publicCoach) return;
    if (getCurrentUser()?.id === state.publicCoach.user_id) {
      openCoachDashboard({ edit: true });
    } else {
      openCoachInquiry(state.publicCoach);
    }
  });
  $("btn-coach-inquiry-close")?.addEventListener("click", () => closeModal($("coach-inquiry-backdrop")));
  $("btn-coach-inquiry-cancel")?.addEventListener("click", () => closeModal($("coach-inquiry-backdrop")));
  $("coach-inquiry-form")?.addEventListener("submit", submitCoachInquiry);
  $("coach-inquiry-message")?.addEventListener("input", () => {
    const length = String($("coach-inquiry-message")?.value || "").length;
    setText("coach-inquiry-counter", `${length} / 1500`);
  });
  $("coach-inquiry-backdrop")?.addEventListener("click", (event) => {
    if (event.target === $("coach-inquiry-backdrop")) closeModal($("coach-inquiry-backdrop"));
  });
  window.addEventListener("trends-public-profile-opened", (event) => {
    loadPublicCoach(event.detail?.userId || "").catch((error) =>
      console.error("coach public profile event error", error)
    );
  });
  window.addEventListener("trends-monetization-changed", () => {
    syncCoachFeatureVisibility();
    if (coachEnabled()) {
      refreshCoachAuthState().catch((error) => console.error("coach feature refresh error", error));
      if (state.publicUserId) {
        loadPublicCoach(state.publicUserId).catch((error) =>
          console.error("coach public feature refresh error", error)
        );
      }
    }
  });
  syncCoachFeatureVisibility();
}
