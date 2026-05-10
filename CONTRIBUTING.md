# Development Process

**Established 2026-05-09** after a productive but chaotic cowboy coding session that exposed the cost of skipping process.

## Development Mode

**Current mode: 🟡 EXPLORE**

| Mode | When | What changes |
|------|------|-------------|
| 🟢 **YOLO** | Greenfield, nothing works yet | Skip everything. Just build. |
| 🟡 **EXPLORE** | Early phases, finding the shape | Rules 1, 5, 9 active (document intent, propose before big changes, no duplicate logic). Tests encouraged but not gating. Ship and iterate. |
| 🔴 **DEFEND** | Working features, real users, tests to protect | All 10 rules active. Full workflow. No exceptions. |

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

### 4. When a test fails, stop
Don't start fixing. Report the failure:
- What test failed
- Expected vs actual
- What the failure tells us about the code

Wait for confirmation before proceeding with a fix.

### 5. Propose, don't implement
Never start writing production code without describing the change and getting confirmation. The proposal should include:
- What changes
- Which files
- Which functions
- Expected impact on existing tests

### 6. Run tests after every change
`npm test` after every code change, before every commit. No exceptions. If tests fail, go to Rule 4.

### 7. One concern per commit
Each commit should do one thing. "Add sig column" and "fix sort parser" are two commits, not one. This makes rollbacks possible and history readable.

### 8. Verify the deployment
After deploying, verify the live site loads and the change works. Check the version stamp. Don't assume cache is busted — confirm it.

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
8. Commit (one concern)
9. Deploy
10. Verify deployment
```

## What Went Wrong (2026-05-09)

Captured here so we don't repeat it:

- **Dead code trap:** `executeQuery()` was a complete query pipeline that nothing called. All sig features were built into it. The actual entry point (`runQuery()`) never got the changes. **Lesson:** Always trace the call path from the entry point before editing.

- **Triple sort functions:** Three independent sort implementations (`executeQuery` inline sort, `sortRows`, `sortRowsInPlace`) with different field coverage. Adding a new sort field required updating all three, and we kept missing one. **Lesson:** No duplicate logic. One sort function, used everywhere.

- **Missing filter parity:** `sig` was added as a sort field but not a filter field. Then added as a filter in one pipeline but not the other. **Lesson:** Design invariants (filter/sort parity) need tests that enforce them.

- **Hacking without reading:** Multiple rounds of "fix, deploy, test, still broken" because we were patching symptoms without understanding the full code path. **Lesson:** Trace before touching. Read the code, don't guess.
