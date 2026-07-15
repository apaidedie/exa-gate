# Implement: Project Full Cleanup

## Order (hard)

1. Child `07-14-workspace-hygiene` → gate → archive/complete  
2. Child `07-14-trellis-spec-closeout` → gate → archive/complete  
3. Child `07-14-admin-ui-module-split` → gate → archive/complete  
4. Parent integration review → `npm run verify` + `npm run test:e2e` → archive parent  

Do not start a later child while an earlier child is incomplete.

## Parent checklist

- [ ] All three children exist and linked under this parent
- [ ] Parent PRD/design/implement reviewed by user
- [ ] Child A started only after user asks to implement / `task.py start` on A
- [ ] After A: workspace policy applied; verify green
- [ ] After C: specs + bootstrap archived; B3 tree in frontend directory-structure
- [ ] After B3: module tree landed; R1 freeze held; verify + e2e green
- [ ] Parent final gate and archive

## Validation commands

```bash
npm run verify
npm run test:e2e
```

Phase A/C may skip e2e if zero product/UI code change; B3 may not skip.

## Risky areas

| Area | Risk | Mitigation |
|------|------|------------|
| `admin.js` shared closures | Hidden state breaks after move | Pass `state` / explicit deps; no new globals |
| DOM id renames | Mass e2e failure | R1: never rename |
| CSS split + static.ts | 404 assets in prod | Update assetPaths + copy script + build |
| `.codex` delete | Breaks someone’s Codex workflow | Confirm Trellis-only; note in commit |
| Unreviewed `admin.css` | Baselines B3 on noise | W1 resolve before B3 |

## Rollback points

1. After each hygiene commit  
2. After each B3 extraction package commit  
3. Before parent archive if integration fails — fix in B3 child or tiny integration commit only  

## Follow-up (explicitly not this program)

- Split `renderKeys.js` further if still &gt;800 LOC after B3  
- Organize or prune `scripts/qa-*.mts`  
- Product UX debt backlog  

## Start gate

User must approve planning artifacts, then explicitly start **child A** (not the parent as implementation target):

```bash
python ./.trellis/scripts/task.py start 07-14-workspace-hygiene
```
