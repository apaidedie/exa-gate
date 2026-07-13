# Login error recovery copy

## Goal

Login failure messages always state what failed and the next recovery step (re-enter token, wait lockout, check EXA_ADMIN_TOKENS / demo).

## Evidence

- Invalid/lockout/expired messages exist but can be more actionable
- ui-ux-pro-max: errors need clear recovery paths

## Requirements

1. Polish invalid, lockout, empty, expired, logout messages
2. Keep DOM hooks / api contracts
3. Unit pins for new strings
4. Screenshots desktop + 390 of invalid login error
5. verify 110 + e2e 7

## Acceptance

- [ ] recovery-oriented login error strings
- [ ] verify 110 + e2e 7
