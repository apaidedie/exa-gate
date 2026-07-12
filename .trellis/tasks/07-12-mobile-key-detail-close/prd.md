# Mobile Key Detail Close Control

## Goal

Add an explicit control to collapse the mobile key detail panel (`#mobileDetails`) so operators can dismiss the open detail surface without relying only on filter/render side effects.

## Requirements

- `#closeMobileDetails` button in mobile details panel head with aria-label.
- Click sets `state.mobileDetailsOpen = false` and syncs panel class.
- Unit pins; verify green.

## Acceptance Criteria

- [x] Close control present.
- [x] Handler collapses panel.
- [ ] Verify green.
