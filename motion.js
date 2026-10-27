/*
  ClearCard — motion layer (same approach as the AgentEval site).

  Progressive enhancement only: script.js owns every behaviour, and nothing here
  changes it. A tiny inline script in <head> adds `motion` + `motion-pending` to
  <html> (skipped under prefers-reduced-motion); the editorial CSS hides the
  hooked elements until this script takes over, and a head-side failsafe drops
  both classes if this script never reports ready.

  Markup hooks:
    data-intro        wrapper whose hooks play once on load as one timeline
    data-split        headline flipped in letter by letter (chars) or word by word
    data-intro-item   block that rises into place in the intro sequence
    data-reveal       block that rises when it scrolls into view (stacked mobile layout)
    data-magnetic     desktop-only pull toward the cursor

  Also: the judge's score counts up and its ring fills when the verdict renders —
  watched from outside with a MutationObserver, so script.js stays untouched.

  All tuning lives in MOTION below.
*/
(function () {
  "use strict";

  var MOTION = {
    // load intro
    intro: {
      ease: "expo.out",
      splitDuration: 1.5,
      splitStagger: 0.07,
      splitFlip: -100,      // deg on X: letters flip up from lying flat
      splitRise: 60,        // yPercent the letters start below their line
      perspective: 600,
      distance: 60,         // px the blocks rise
      scaleFrom: 0.94,
      duration: 1.3,
      stagger: 0.12,
      overlap: "-=1.05"
    },
    // scroll reveal (mobile, where the sidebar stacks below the chat)
    reveal: { ease: "power3.out", duration: 1, distance: 48, start: "top 90%" },
    // verdict score
    score: { ease: "power2.out", duration: 1.6, delay: 0.25 },
    // magnetic pull
    magneticStrength: 0.3,
    magneticMax: 12,
    magneticDuration: 0.6,
    fontWait: 700
  };

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function release() {
    root.classList.remove("motion-pending");
  }

  if (reduced || !root.classList.contains("motion") || !window.gsap || !window.ScrollTrigger) {
    root.classList.remove("motion");
    release();
    return;
  }

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  if (window.SplitText) gsap.registerPlugin(window.SplitText);

  /* ---------- load intro ----------
     Headline, then each intro block, in DOM order. fromTo, not from: the targets
     are still hidden by .motion-pending when these tweens are created. */
  function initIntro() {
    var scope = document.querySelector("[data-intro]");
    if (!scope) return;
    var cfg = MOTION.intro;
    var tl = gsap.timeline({ defaults: { ease: cfg.ease } });
    scope.querySelectorAll("[data-split], [data-intro-item]").forEach(function (el, i) {
      var at = i === 0 ? 0 : cfg.overlap;
      if (el.hasAttribute("data-split") && window.SplitText) {
        // Keep the readable text for assistive tech; the split spans are presentational.
        el.setAttribute("aria-label", el.textContent.trim());
        var split = new window.SplitText(el, { type: "chars", aria: "hidden" });
        gsap.set(el, { opacity: 1 });
        tl.fromTo(split.chars,
          { yPercent: cfg.splitRise, rotationX: cfg.splitFlip, opacity: 0, transformOrigin: "50% 100%", transformPerspective: cfg.perspective },
          { yPercent: 0, rotationX: 0, opacity: 1, duration: cfg.splitDuration, stagger: cfg.splitStagger,
            onComplete: function () { split.revert(); el.removeAttribute("aria-label"); gsap.set(el, { clearProps: "opacity" }); } },
          at);
        return;
      }
      tl.fromTo(el,
        { opacity: 0, y: cfg.distance, scale: cfg.scaleFrom },
        { opacity: 1, y: 0, scale: 1, duration: cfg.duration, clearProps: "transform,opacity" },
        at);
    });
  }

  /* ---------- scroll reveal ---------- */
  function initReveals() {
    var cfg = MOTION.reveal;
    gsap.utils.toArray("[data-reveal]").forEach(function (el) {
      gsap.fromTo(el, { opacity: 0, y: cfg.distance }, {
        opacity: 1,
        y: 0,
        duration: cfg.duration,
        ease: cfg.ease,
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: el, start: cfg.start, once: true }
      });
    });
  }

  /* ---------- verdict score: count up + ring fill ----------
     script.js renders the ring with --score and the final number already in place,
     so without this the result is simply shown as-is. */
  function animateScore(ring) {
    if (ring.hasAttribute("data-counted")) return;
    ring.setAttribute("data-counted", "");
    var label = ring.querySelector("span");
    var target = parseFloat(getComputedStyle(ring).getPropertyValue("--score")) || 0;
    var state = { v: 0 };
    ring.style.setProperty("--score", 0);
    if (label) label.textContent = "0";
    gsap.to(state, {
      v: target,
      duration: MOTION.score.duration,
      delay: MOTION.score.delay,
      ease: MOTION.score.ease,
      onUpdate: function () {
        ring.style.setProperty("--score", state.v);
        if (label) label.textContent = Math.round(state.v);
      }
    });
  }

  function initScoreWatch() {
    var body = document.getElementById("verdict-modal-body");
    if (!body || !window.MutationObserver) return;
    new MutationObserver(function () {
      var ring = body.querySelector(".score-ring:not([data-counted])");
      if (ring) animateScore(ring);
    }).observe(body, { childList: true, subtree: true });
  }

  /* ---------- magnetic (desktop only) ---------- */
  function initMagnetic() {
    if (!finePointer) return;
    gsap.utils.toArray("[data-magnetic]").forEach(function (el) {
      var toX = gsap.quickTo(el, "x", { duration: MOTION.magneticDuration, ease: "power3.out" });
      var toY = gsap.quickTo(el, "y", { duration: MOTION.magneticDuration, ease: "power3.out" });
      var clamp = gsap.utils.clamp(-MOTION.magneticMax, MOTION.magneticMax);
      el.addEventListener("pointermove", function (e) {
        if (el.disabled) return;
        var r = el.getBoundingClientRect();
        toX(clamp((e.clientX - (r.left + r.width / 2)) * MOTION.magneticStrength));
        toY(clamp((e.clientY - (r.top + r.height / 2)) * MOTION.magneticStrength));
      });
      el.addEventListener("pointerleave", function () { toX(0); toY(0); });
    });
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([
      document.fonts.ready,
      new Promise(function (resolve) { setTimeout(resolve, MOTION.fontWait); })
    ]);
  }

  function start() {
    fontsReady().then(function () {
      initIntro();
      initReveals();
      initScoreWatch();
      initMagnetic();
      root.classList.add("motion-ready");
      release();
      window.addEventListener("load", function () { ScrollTrigger.refresh(); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
