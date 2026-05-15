# Development Process

**Established 2026-05-09** after a productive but chaotic cowboy coding session that exposed the cost of skipping process.

## Development Mode

**Current mode: 🟡 EXPLORE**

| Mode | When | What changes |
|------|------|-------------|
| 🟢 **YOLO** | Greenfield, nothing works yet | Skip everything. Just build. |
| 🟡 **EXPLORE** | Early phases, finding the shape | Rules 1, 5, 9 active (document intent, propose before big changes, no duplicate logic). Tests encouraged but not gating. Ship and iterate. |
| 🔴 **DEFEND** | Working features, real users, tests to protect | All 10 rules active. Full workflow. Test env required — deploy to test first, verify, then prod. No exceptions. |

**Mode is set here in this file, not in conversation.** Changing mode requires editing this section and committing. This survives compressions.

Patrick decides when to shift modes. Don't ask "should we switch to DEFEND?" — he'll know when.

---

## The Rules

### 1. Document first
Update DESIGN.md before writing code. If you can't describe the change in the design doc, you don't understand it well enough to build it.

### 2. Trace before touching
Before modifying any function, trace its **actual call path** from entry point to render. Verify:
- Is this function actually called? (We lost hours editing dead code.)
- Are there duplicate implementations? (We had three sort functions.)
- What other code paths need the same change?

Report the trace findings before proceeding.

### 3. Write tests next
Write tests that will verify the new behavior BEFORE writing the implementation. Tests define the contract. If you can't write a test for it, the requirement isn't clear enough.

**Tests encode intent, not implementation.** A test should express what DESIGN.md says should happen — the *what*, not the *how*. Test against the public API the app actually uses. Don't test internal helper functions that might get renamed or refactored; test the behavior those helpers produce.

### 4. When a test fails, stop and diagnose
Don't start fixing. The design→test→code pipeline means a failure lives in one of three layers. Figure out which one.

**Diagnosis checklist:**
1. **Is the test wrong?** Does it test a function that doesn't exist, use a stale API, or assert something DESIGN.md never promised? → Fix the test.
2. **Is the design wrong?** Does the test correctly encode an intent that turned out to be a bad idea? Has the design evolved but the doc wasn't updated? → Update DESIGN.md, then update the test to match.
3. **Is the code wrong?** Does DESIGN.md say X, the test asserts X, but the code does Y? → Fix the code.

**Report before acting:**
- What test failed
- Expected vs actual
- Which layer you think is wrong (test / design / code) and why

Wait for confirmation before proceeding. "Make red go green" is not a diagnosis.

### 5. Propose, don't implement
Never start writing production code without describing the change and getting confirmation. The proposal should include:
- What changes
- Which files
- Which functions
- Expected impact on existing tests

### 6. Run tests after every change
`npm test` after every code change, before every commit. No exceptions. If tests fail, go to Rule 4.

**When a test fails, the test is wrong or the code is wrong.** If the test is wrong, either the design doc is wrong or the test has a bug. Trace the intent chain: DESIGN.md → test → code. Adding production code to pass a test is correct *when the test faithfully encodes the design*. Adding production code to pass a test that has a bug (wrong function names, stale API, bad assumptions) papers over the real problem.

### 7. One concern per commit
Each commit should do one thing. "Add sig column" and "fix sort parser" are two commits, not one. This makes rollbacks possible and history readable.

### 8. Deploy correctly, then verify
**Deployment is a two-branch process.** Code lives on `main`. The live site serves from `gh-pages`. Pushing to `main` does NOT deploy.

**Deploy procedure: run `./scripts/deploy.sh`**

That's it. The script handles everything: push main, build gh-pages, clean stale files, verify only expected files exist, push gh-pages, switch back to main. If something looks wrong it aborts.

**Do not deploy manually.** The manual procedure has caused repeated failures (forgetting to push main, stale `app/` dirs leaking into gh-pages). The script exists to prevent this. Use it.

**Then verify:** Hard-refresh the live site (Ctrl+Shift+R). Check the browser console for errors. Run a known query and confirm the change is visible. Don't assume cache is busted — confirm it.

**After deploy, update `VERSION.md`:**
1. Set the environment's version and deploy timestamp (UTC).
2. Set accepted = `pending`.
3. Add a row to History with the version, target, timestamp, and notes.
4. When Patrick confirms the deploy looks good → update accepted to the confirmation timestamp.
5. **Read VERSION.md after every compression** to know what's deployed and what's pending acceptance.

**🔴 DEFEND mode adds:** Push to test environment first (`pakelly/patrickforaptca-test` pattern). Verify on test. Only then deploy to prod. No exceptions. VERSION.md tracks both environments — test must be accepted before prod deploy.

### 9. No duplicate logic
If a function exists that does X, use it. Don't write a second version. If the existing function doesn't quite fit, extend it — don't clone it. Before writing any new function, search for existing implementations.

### 10. Keep the test suite current
Every new feature gets tests. Every bug fix gets a regression test. Tests are not optional and not "later." If the test suite doesn't cover it, it's not done.

---

## Workflow

```
1. Describe the change (what + why)
2. Update DESIGN.md
3. Trace the affected code paths
4. Write/update tests
5. Get confirmation to proceed
6. Implement (smallest possible change)
7. Run tests
8. Commit to main (one concern)
9. Deploy to gh-pages (see Rule 8 procedure)
   - 🔴 DEFEND: deploy to test env first, verify, then prod
10. Verify live deployment (hard-refresh, run a query, check console)
```

## What Went Wrong (2026-05-09)

Captured here so we don't repeat it:

- **Dead code trap:** `executeQuery()` was a complete query pipeline that nothing called. All sig features were built into it. The actual entry point (`runQuery()`) never got the changes. **Lesson:** Always trace the call path from the entry point before editing.

- **Triple sort functions:** Three independent sort implementations (`executeQuery` inline sort, `sortRows`, `sortRowsInPlace`) with different field coverage. Adding a new sort field required updating all three, and we kept missing one. **Lesson:** No duplicate logic. One sort function, used everywhere.

- **Missing filter parity:** `sig` was added as a sort field but not a filter field. Then added as a filter in one pipeline but not the other. **Lesson:** Design invariants (filter/sort parity) need tests that enforce them.

- **Hacking without reading:** Multiple rounds of "fix, deploy, test, still broken" because we were patching symptoms without understanding the full code path. **Lesson:** Trace before touching. Read the code, don't guess.

- **Pushed to main, declared victory (2026-05-13, twice):** Pushed code to `main` and told Patrick it was live. GitHub Pages serves from `gh-pages`, not `main`. The site didn't update. Happened TWICE in the same session — the first time was a miss, the second time was embarrassing. **Lesson:** Know your deployment topology. `git push origin main` ≠ deployed. The deploy procedure is now explicit in Rule 8. Follow it every time.

- **Changed working code to satisfy broken tests (2026-05-15):** Tests referenced two functions (`computeAdjustedWeights`, `wcdAdjustmentFactor`) that never existed in app.js. Instead of fixing the tests to use the actual API, we added new functions to production code just to make the tests pass. This is backwards — it inverts the design→test→code flow and risks introducing bugs to satisfy stale expectations. **Lesson:** When tests fail, diagnose which layer is wrong. The rule ordering exists for a reason: design doc captures intent, tests encode intent as contracts, code fulfills contracts. A failing test means one of those three layers is wrong. Figure out which one before changing anything. Don't reflexively "make the red thing green."
