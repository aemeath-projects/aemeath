# SDD Progress Ledger

**Plan:** `docs/superpowers/plans/2026-07-08-routing-priority-mode-and-account-lifecycle.md`
**Started:** 2026-07-08

## napcat (E:\aemeath-projects\napcat)
Base: 88db131

- Task 1: complete (WebSocketTransport giveUp event)
- Task 2: complete (SseTransport giveUp event)
- Task 3: complete (NapCatClient forward giveUp event)

## exostrider (E:\aemeath-projects\exostrider)
Base: 78dad7d

- Task 4: complete (getClientRole() + dead data cleanup)

## aemeath (E:\aemeath-projects\aemeath)
Base: a17c107

- Task 5: complete (Settings accounts.priority_mode)
- Task 6: complete (roles.ts cleanup + MessageRouter priority)
- Task 7: complete (MultiAccountBootstrap settings injection)
- Task 8: complete (AccountService listAccountsWithStatus + priorityMode)
- Task 9: complete (routes + delete /api/routing)
- Task 10: complete (aemeath.config.ts + CLAUDE.md cleanup)
- Task 11: complete (NapCatClientAdapter maxRetries + giveUp)
- Task 12: complete (auto-disable after giveUp)
- Task 13: complete (auto-connect on create/enable)
- Task 14: complete (delete connect/disconnect routes)
- Task 15: complete (frontend apis/accounts.ts)
- Task 16: complete (AccountsView.vue rewrite)
- Task 17: complete (AccountCard.vue enable toggle)

## Verification (Task 18)
- napcat: 285 tests PASS, lint PASS
- exostrider: 529 tests PASS, lint PASS
- aemeath backend: 492/493 PASS (1 pre-existing failure in chat/main.test.ts), lint 0 errors, type-check PASS
- aemeath frontend: 147 tests PASS, lint PASS, type-check PASS

## Post-Review Fix
- **Critical #1**: Fixed dynamically created/enabled accounts not registering GroupBotRegistry notice listeners.
  - Added `_registerGroupNotices()` method in `AccountService` that mirrors the notice registration from `MultiAccountBootstrap.start()`
  - Injected `groupBotRegistry` as optional 5th constructor param
  - Updated API routes (POST /api/accounts, PUT /api/accounts/:id, GET /api/accounts/status) to pass `groupBotRegistry`
  - Verified: 492/493 tests PASS, lint 0 errors, type-check PASS
