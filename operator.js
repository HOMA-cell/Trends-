const COPY = {
  ja: {
    loading: "運営データを読み込んでいます…",
    loadFailed: "運営データを取得できませんでした。時間をおいて再試行してください。",
    accessDenied: "この画面を開く権限がありません。",
    reportUpdated: "通報を更新しました。",
    feedbackUpdated: "フィードバックを更新しました。",
    inviteSaved: "招待を追加しました。",
    inviteRevoked: "招待を停止しました。",
    actionFailed: "更新に失敗しました。",
    emptyReports: "対応が必要な通報はありません。",
    emptyFeedback: "フィードバックはまだありません。",
    emptyInvites: "招待はまだありません。",
    hidePrompt: "非公開にする理由を入力してください。",
    restorePrompt: "表示に戻す理由を入力してください。",
    confirmRevoke: "この招待を停止しますか？",
  },
  en: {
    loading: "Loading operator data…",
    loadFailed: "Operator data could not be loaded. Please try again.",
    accessDenied: "You do not have access to this page.",
    reportUpdated: "Report updated.",
    feedbackUpdated: "Feedback updated.",
    inviteSaved: "Invite saved.",
    inviteRevoked: "Invite revoked.",
    actionFailed: "The update failed.",
    emptyReports: "No reports need attention.",
    emptyFeedback: "No feedback yet.",
    emptyInvites: "No invites yet.",
    hidePrompt: "Enter the reason for hiding this content.",
    restorePrompt: "Enter the reason for restoring this content.",
    confirmRevoke: "Revoke this invite?",
  },
};

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDateTime(value, lang = "ja") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(lang === "en" ? "en" : "ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status, lang = "ja") {
  const labels = {
    ja: {
      pending: "未対応",
      reviewing: "対応中",
      resolved: "解決済み",
      dismissed: "問題なし",
      active: "有効",
      revoked: "停止",
      hidden: "非公開",
      visible: "表示中",
    },
    en: {
      pending: "Pending",
      reviewing: "Reviewing",
      resolved: "Resolved",
      dismissed: "Dismissed",
      active: "Active",
      revoked: "Revoked",
      hidden: "Hidden",
      visible: "Visible",
    },
  };
  return labels[lang === "en" ? "en" : "ja"][status] || status || "-";
}

export function createOperatorConsole({
  supabase,
  getCurrentUser,
  getCurrentLang,
  setActivePage,
  showToast,
}) {
  const state = {
    role: "",
    activeTab: "reports",
    reportFilter: "open",
    summary: null,
    reports: [],
    feedback: [],
    invites: [],
    loading: false,
  };

  const $ = (id) => document.getElementById(id);
  const lang = () => (getCurrentLang() === "en" ? "en" : "ja");
  const copy = () => COPY[lang()];

  function setStatus(message = "", tone = "") {
    const node = $("operator-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function setBusy(button, busy) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = !!busy;
    button.classList.toggle("is-loading", !!busy);
  }

  function reset() {
    state.role = "";
    state.summary = null;
    state.reports = [];
    state.feedback = [];
    state.invites = [];
    $("btn-account-open-operator")?.classList.add("hidden");
    $("operator-owner-tab")?.classList.add("hidden");
    render();
  }

  async function callRpc(name, args = undefined) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function refreshAccess(options = {}) {
    if (!getCurrentUser()) {
      reset();
      return false;
    }
    try {
      const role = `${await callRpc("get_my_operator_role") || ""}`.trim();
      if (!role) {
        reset();
        return false;
      }
      state.role = role;
      $("btn-account-open-operator")?.classList.remove("hidden");
      $("operator-owner-tab")?.classList.toggle("hidden", role !== "owner");
      const badge = $("operator-role-badge");
      if (badge) badge.textContent = role === "owner" ? "OWNER" : "MODERATOR";
      if (options.load === true) await refreshAll();
      return true;
    } catch (error) {
      const message = `${error?.message || ""}`.toLowerCase();
      if (!message.includes("could not find the function") && !message.includes("pgrst202")) {
        console.warn("operator access check failed", error);
      }
      reset();
      return false;
    }
  }

  function renderSummary() {
    const summary = state.summary || {};
    const values = {
      "operator-metric-reports": summary.pending_reports,
      "operator-metric-feedback": summary.pending_feedback,
      "operator-metric-invites": summary.active_invites,
      "operator-metric-errors": summary.runtime_errors_24h,
      "operator-metric-users": summary.active_users_7d,
      "operator-metric-posts": summary.posts_7d,
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = $(id);
      if (node) node.textContent = Number.isFinite(Number(value)) ? `${Number(value)}` : "-";
    });
    const generated = $("operator-generated-at");
    if (generated) generated.textContent = formatDateTime(summary.generated_at, lang());
  }

  function makeAction(label, action, variant = "") {
    const button = el("button", `operator-action ${variant}`.trim(), label);
    button.type = "button";
    button.addEventListener("click", () => action(button));
    return button;
  }

  function renderReports() {
    const list = $("operator-report-list");
    if (!list) return;
    list.replaceChildren();
    if (!state.reports.length) {
      list.append(el("div", "operator-empty", copy().emptyReports));
      return;
    }

    state.reports.forEach((report) => {
      const card = el("article", "operator-queue-card");
      const top = el("div", "operator-queue-top");
      const identity = el("div", "operator-queue-identity");
      identity.append(
        el("strong", "", report.target_name || "Unknown"),
        el(
          "span",
          "",
          [report.target_handle ? `@${report.target_handle}` : "", report.target_type]
            .filter(Boolean)
            .join(" · ")
        )
      );
      const badges = el("div", "operator-badges");
      badges.append(el("span", `operator-status-badge is-${report.status}`, statusLabel(report.status, lang())));
      if (report.moderation_state) {
        badges.append(
          el(
            "span",
            `operator-status-badge is-${report.moderation_state}`,
            statusLabel(report.moderation_state, lang())
          )
        );
      }
      top.append(identity, badges);

      const reason = el("div", "operator-report-reason", report.reason || "other");
      const details = el("p", "operator-queue-body", report.details || "詳細なし");
      const meta = el(
        "div",
        "operator-queue-meta",
        `${report.reporter_name || "Unknown"} · ${formatDateTime(report.created_at, lang())}`
      );
      const actions = el("div", "operator-queue-actions");

      if (report.status === "pending") {
        actions.append(
          makeAction(lang() === "en" ? "Start review" : "対応を開始", (button) =>
            updateReport(report, "reviewing", null, null, button)
          )
        );
      }
      if (["post", "comment"].includes(report.target_type) && report.moderation_state !== "hidden") {
        actions.append(
          makeAction(lang() === "en" ? "Hide + resolve" : "非公開にして解決", (button) => {
            const note = window.prompt(copy().hidePrompt, `Report ${report.id}`);
            if (note === null) return;
            return updateReport(report, "resolved", "hidden", note, button);
          }, "is-danger")
        );
      }
      if (["post", "comment"].includes(report.target_type) && report.moderation_state === "hidden") {
        actions.append(
          makeAction(lang() === "en" ? "Restore" : "表示に戻す", (button) => {
            const note = window.prompt(copy().restorePrompt, `Restored after report ${report.id}`);
            if (note === null) return;
            return updateReport(report, "resolved", "visible", note, button);
          })
        );
      }
      if (!['dismissed'].includes(report.status)) {
        actions.append(
          makeAction(lang() === "en" ? "Dismiss" : "問題なし", (button) =>
            updateReport(report, "dismissed", null, null, button)
          )
        );
      }

      card.append(top, reason, details, meta, actions);
      list.append(card);
    });
  }

  function renderFeedback() {
    const list = $("operator-feedback-list");
    if (!list) return;
    list.replaceChildren();
    if (!state.feedback.length) {
      list.append(el("div", "operator-empty", copy().emptyFeedback));
      return;
    }

    state.feedback.forEach((feedback) => {
      const card = el("article", "operator-queue-card");
      const top = el("div", "operator-queue-top");
      const identity = el("div", "operator-queue-identity");
      identity.append(
        el("strong", "", feedback.user_name || "Unknown"),
        el("span", "", [feedback.category, feedback.page].filter(Boolean).join(" · "))
      );
      top.append(
        identity,
        el(
          "span",
          `operator-status-badge is-${feedback.status}`,
          statusLabel(feedback.status, lang())
        )
      );
      const body = el("p", "operator-queue-body", feedback.message || "");
      const meta = el(
        "div",
        "operator-queue-meta",
        [feedback.build_version, formatDateTime(feedback.created_at, lang())]
          .filter(Boolean)
          .join(" · ")
      );
      const actions = el("div", "operator-queue-actions");
      if (feedback.status === "pending") {
        actions.append(
          makeAction(lang() === "en" ? "Start review" : "対応を開始", (button) =>
            updateFeedback(feedback, "reviewing", button)
          )
        );
      }
      if (!["resolved", "dismissed"].includes(feedback.status)) {
        actions.append(
          makeAction(lang() === "en" ? "Resolve" : "解決済み", (button) =>
            updateFeedback(feedback, "resolved", button)
          ),
          makeAction(lang() === "en" ? "Dismiss" : "対象外", (button) =>
            updateFeedback(feedback, "dismissed", button)
          )
        );
      }
      card.append(top, body, meta, actions);
      list.append(card);
    });
  }

  function renderInvites() {
    const list = $("operator-invite-list");
    if (!list) return;
    list.replaceChildren();
    if (state.role !== "owner") return;
    if (!state.invites.length) {
      list.append(el("div", "operator-empty", copy().emptyInvites));
      return;
    }

    state.invites.forEach((invite) => {
      const row = el("article", "operator-invite-row");
      const copyWrap = el("div", "operator-invite-copy");
      copyWrap.append(
        el("strong", "", invite.email || "-"),
        el(
          "span",
          "",
          [invite.note, invite.expires_at ? `期限 ${formatDateTime(invite.expires_at, lang())}` : "期限なし"]
            .filter(Boolean)
            .join(" · ")
        )
      );
      const actions = el("div", "operator-invite-actions");
      actions.append(el("span", `operator-status-badge is-${invite.status}`, statusLabel(invite.status, lang())));
      if (invite.status === "active") {
        actions.append(
          makeAction(lang() === "en" ? "Revoke" : "停止", (button) =>
            revokeInvite(invite, button)
          )
        );
      }
      row.append(copyWrap, actions);
      list.append(row);
    });
  }

  function renderTabs() {
    document.querySelectorAll("[data-operator-tab]").forEach((button) => {
      const tab = button.getAttribute("data-operator-tab");
      button.classList.toggle("is-active", tab === state.activeTab);
      button.setAttribute("aria-selected", tab === state.activeTab ? "true" : "false");
    });
    document.querySelectorAll("[data-operator-panel]").forEach((panel) => {
      panel.classList.toggle(
        "hidden",
        panel.getAttribute("data-operator-panel") !== state.activeTab
      );
    });
  }

  function render() {
    renderSummary();
    renderReports();
    renderFeedback();
    renderInvites();
    renderTabs();
  }

  async function refreshAll() {
    if (!state.role || state.loading) return;
    state.loading = true;
    const refreshButton = $("btn-operator-refresh");
    setBusy(refreshButton, true);
    setStatus(copy().loading, "loading");
    try {
      const requests = [
        callRpc("operator_dashboard_snapshot"),
        callRpc("operator_list_reports", {
          requested_status: state.reportFilter,
          requested_limit: 50,
        }),
        callRpc("operator_list_feedback", { requested_limit: 50 }),
      ];
      if (state.role === "owner") {
        requests.push(callRpc("operator_list_invites", { requested_limit: 100 }));
      }
      const [summary, reports, feedback, invites = []] = await Promise.all(requests);
      state.summary = summary || {};
      state.reports = asArray(reports);
      state.feedback = asArray(feedback);
      state.invites = asArray(invites);
      render();
      setStatus("", "");
    } catch (error) {
      console.error("operator data load failed", error);
      setStatus(copy().loadFailed, "error");
    } finally {
      state.loading = false;
      setBusy(refreshButton, false);
    }
  }

  async function updateReport(report, nextStatus, moderationState, note, button) {
    setBusy(button, true);
    try {
      await callRpc("operator_update_report", {
        requested_report_id: report.id,
        requested_status: nextStatus,
        requested_moderation_state: moderationState,
        requested_note: note,
      });
      showToast(copy().reportUpdated, "success");
      await refreshAll();
    } catch (error) {
      console.error("operator report update failed", error);
      showToast(copy().actionFailed, "error");
    } finally {
      setBusy(button, false);
    }
  }

  async function updateFeedback(feedback, nextStatus, button) {
    setBusy(button, true);
    try {
      await callRpc("operator_update_feedback", {
        requested_feedback_id: feedback.id,
        requested_status: nextStatus,
      });
      showToast(copy().feedbackUpdated, "success");
      await refreshAll();
    } catch (error) {
      console.error("operator feedback update failed", error);
      showToast(copy().actionFailed, "error");
    } finally {
      setBusy(button, false);
    }
  }

  async function saveInvite(event) {
    event.preventDefault();
    if (state.role !== "owner") return;
    const form = event.currentTarget;
    const button = $("btn-operator-invite-save");
    const email = `${$("operator-invite-email")?.value || ""}`.trim();
    const days = Number($("operator-invite-days")?.value || 30);
    const note = `${$("operator-invite-note")?.value || ""}`.trim();
    setBusy(button, true);
    try {
      await callRpc("operator_upsert_invite", {
        requested_email: email,
        requested_expires_days: days,
        requested_note: note,
      });
      form.reset();
      $("operator-invite-days").value = "30";
      showToast(copy().inviteSaved, "success");
      await refreshAll();
    } catch (error) {
      console.error("operator invite save failed", error);
      showToast(copy().actionFailed, "error");
    } finally {
      setBusy(button, false);
    }
  }

  async function revokeInvite(invite, button) {
    if (!window.confirm(copy().confirmRevoke)) return;
    setBusy(button, true);
    try {
      await callRpc("operator_revoke_invite", { requested_email: invite.email });
      showToast(copy().inviteRevoked, "success");
      await refreshAll();
    } catch (error) {
      console.error("operator invite revoke failed", error);
      showToast(copy().actionFailed, "error");
    } finally {
      setBusy(button, false);
    }
  }

  function setTab(tab) {
    if (tab === "invites" && state.role !== "owner") return;
    state.activeTab = ["reports", "feedback", "invites"].includes(tab)
      ? tab
      : "reports";
    renderTabs();
  }

  function setup() {
    $("btn-operator-refresh")?.addEventListener("click", refreshAll);
    $("operator-report-filter")?.addEventListener("change", (event) => {
      state.reportFilter = event.currentTarget.value || "open";
      refreshAll();
    });
    $("operator-invite-form")?.addEventListener("submit", saveInvite);
    document.querySelectorAll("[data-operator-tab]").forEach((button) => {
      button.addEventListener("click", () => setTab(button.getAttribute("data-operator-tab")));
    });
    render();
  }

  async function handlePageChange(page) {
    if (page !== "operator") return;
    const hasAccess = state.role || (await refreshAccess());
    if (!hasAccess) {
      showToast(copy().accessDenied, "warning");
      setActivePage("account", { skipAnimation: true });
      return;
    }
    await refreshAll();
  }

  return {
    setup,
    reset,
    refreshAccess,
    refreshAll,
    handlePageChange,
  };
}
