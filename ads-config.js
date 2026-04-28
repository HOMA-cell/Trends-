// Optional global ad defaults.
// You can keep this empty and set values from Settings > Data tools > Ad monetization.
// localStorage values override this file.
window.__TRENDS_ADS__ = Object.assign(
  {
    enabled: false,
    client: "",
    feedSlot: "",
    testMode: true,
    feedInterval: 8,
    feedStartAt: 4,
    feedMaxAds: 3,
  },
  window.__TRENDS_ADS__ || {}
);

(function ensureDmSidebarTune() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.querySelector('link[href="dm-sidebar-tune.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "dm-sidebar-tune.css";
  document.head.appendChild(link);
})();
