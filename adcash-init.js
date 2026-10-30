// Adcash Autotag init (CSP-safe, non-blocking): the aclib library loads
// async, so this polls until it arrives, then runs the Autotag once.
// No inline script, no inline handler -- safe under a script-src that
// does not allow 'unsafe-inline'.
(function () {
  var tries = 0;
  function tryInit() {
    if (window.aclib && typeof window.aclib.runAutoTag === 'function') {
      window.aclib.runAutoTag({ zoneId: 'vpn9ubqsh9' });
    } else if (tries < 100) {
      tries++;
      setTimeout(tryInit, 100);
    }
  }
  tryInit();
})();
