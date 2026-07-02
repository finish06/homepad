# STATUS — Wide-viewport pane-fill / tile-reflow (auto-first Phase 1)

**Task:** build Phase 1 (R1–R4) of the auto-first pane-fill layout, after Joe ratified
the direction on PR #271. **Outcome this run: BLOCKED — did not merge #271, did not build.**
Two verified blockers; both need a board action, not more code.

## Blocker 1 — PR #271 is a revert-trap. DO NOT MERGE.
- Branch `spec/pane-fill-auto-first` (`a13bc96`) sits on top of main `1aae773` but its
  tree is the **pre-App-Grid v14 tree**. Merging = fast-forward → main tree loses App Grid.
- Deletes `AppGrid.tsx`, `appGrid.ts`, all `app-grid-*` tests + browser gates,
  `SPEC-242`/`SPEC-245` docs; reverts `App.tsx` (→ `<Catalog>`) and strips 581 lines of
  `index.css`. Wipes #238, #240/241, #243, #246, #253, #245/#224, #242/#257/#266.
- Gitea `mergeable:True` is a clean-**revert** illusion — it does not protect against this.
- Flagged on the PR: Code/homepad#271 comment (id 4799).

## Blocker 2 — spec anchored on dead code; R3/R4 need an unratified product call.
- `SPEC-pane-fill-reflow.md` + the #271 scope revision target `Catalog.tsx` / `.tile-field`
  / `.panel-tiles` / `.category-panel` (v14). Live component is `<AppGrid>`; classes are
  `.app-grid` / `.app-grid-box` / `.app-grid-tools`.
- R1 (frame-fill) and R2 (auto-fill 190px) map cleanly. **R2 already shipped**
  (`.app-grid-tools { grid-template-columns: repeat(auto-fill, 190px) }`, index.css ~2176).
- **R3/R4 collide with shipped admin control.** App Grid box width = admin-set `--w`
  (`grid_width` 1–8, WidthSelector, backend migration 0009, `appGrid.ts:boxWidthPx`). The
  v14 spec assumed box width = `min(appCount,4)` auto. "flex-grow weighted by app count,
  capped at content-max" (R3) + "lone pane 100%" (R4) **override/remove `--w`** — a decision
  the spec never makes (it predates `--w`).
- Also: **R1 and R3 are coupled.** R1 alone widens the shared frame (CONTENT_WIDTH
  `max-w-[1536px]` → padding-capped-64px fluid), which *widens the intra-field void* when
  boxes still left-pack. Reads worse than today for the multi-box case. Don't half-ship R1.

## The one decision that unblocks the build
> In auto-first **Phase 1**, does the auto-packer **replace** the shipped admin `--w`
> control — auto-size every box by app-count, hide the WidthSelector, and bring `--w` back
> in **Phase 2** as an override? **Or** does `--w` stay a **floor** boxes only grow above to
> fill row slack?

**Stitch recommendation:** the former (spec says "no per-category configuration"; Joe says
"explicit per-pane column control lands in Phase 2"). But it disables a Caleb-set feature in
Phase 1, so it's Walt/Kare/Joe's call, not mine.

## When unblocked, Phase 1 build plan (over LIVE App Grid)
1. `useLayout` row-packer over `boxesFromData` output: bin-pack boxes into rows by content
   width at current frame width; per-box flex-basis/max; mark lone-in-row → 100%.
2. R1: CONTENT_WIDTH → fluid, horizontal padding caps at 64px (shared token — keeps
   header/status/grid aligned per #196; update the `max-w-[1536px]` test locks).
3. R3: box flex-grow weighted by appCount, capped at content-max (`min(appCount, cols)*190`);
   no empty glass. Per the `--w` decision: either replace `--w` (hide WidthSelector) or floor.
4. R4: lone box → 100%, tiles left-packed.
5. R2: already shipped — lock with a guard test.
6. RED first (jsdom source-guard + **real-Chromium** dead-space + uniform-190 measure at
   1440/1920/2560 — jsdom is blind to layout, #35 lesson) → GREEN → PR to staging → Gracie.
7. HOLD Phase 2 entirely (admin drag UI, width%, DB migration).
