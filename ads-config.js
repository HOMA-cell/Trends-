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
