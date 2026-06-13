---
name: "UI bug (real-browser repro)"
about: "File a UI bug with a concrete, reproducible repro. Observation only — no causal theory until it's proven."
title: "[UI] "
labels:
  - bug
  - ui
---

<!--
  Fill in the blanks. Report what the browser ACTUALLY DID, with exact inputs.
  RETRO LESSON (#35): leave the CAUSAL THEORY blank until it is PROVEN. A
  baked-in wrong theory ("swallowed click") anchored THREE failed fix attempts
  because every later attempt started by reading the wrong diagnosis. Hand the
  fixer a repro + observation, not a guess.
-->

### Page / URL
<!-- e.g. http://homepad-staging.10.17.2.213.nip.io/  (which app/env/build if known) -->


### How to auth / set up the repro
<!-- Exact steps. Cookie or login? e.g. "POST /api/login {email,password}, use the
     Set-Cookie; admin qa@test.local". Note viewport / touch / theme if it matters. -->


### Exact reproduction — coordinates / event sequence
<!-- The precise inputs, not "click the menu". e.g.
     - real mouse click at the ⋯ button center (x,y) — OR —
     - real touch tap (hasTouch context) at (x,y) — OR —
     - keyboard: focus button, press Enter
     Repeat count + rate (e.g. "0/5 tiles open on mouse click; 5/5 on keyboard"). -->


### Observed — element OR state actually seen
<!-- The concrete fact, measured. e.g.
     - gridScan: center → <a> (OCCLUDED), only left strip → button; 3/9 cells hit target
     - recorded events: pointerdown/up/click all landed on IMG#service-tile-icon
     - [role=menu] not visible after the gesture; console clean
     Paste the gridScan grid / event log / screenshot path. -->


### Expected vs actual
<!-- Expected: tapping ⋯ opens the overflow menu and it stays open.
     Actual:   menu does not open (mouse + touch); keyboard works. -->


### Scope / impact
<!-- Who is blocked, how badly. e.g. "favorites unreachable for pointer + touch
     users; touch is an explicit requirement → release gate." -->


### Artifacts
<!-- Screenshot paths, the QA script used, @@RESULT@@ JSON, console/network logs. -->


<!-- ──────────────────────────────────────────────────────────────────────────
### Causal theory — LEAVE BLANK UNTIL PROVEN
Do NOT fill this in with a hypothesis. Add it only once a real-browser test
demonstrates the cause (and then cite the evidence). A wrong theory written here
becomes the next fixer's anchor. Repro + observation above is the handoff.
────────────────────────────────────────────────────────────────────────── -->
