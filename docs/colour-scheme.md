# Colour Scheme

GraphRelay uses the dark palette defined in [styles.css](../src/client/styles.css). Use the existing Tailwind tokens and shared [form controls](../src/client/components/FormControls.tsx).

## The Palette

| Role | Tokens |
|---|---|
| Page and layered surfaces | `background`, `background-container-low`, `background-container`, `background-container-high`, `background-container-highest` |
| Hover and overlay | `background-bright`, `overlay` |
| Brand and primary actions | `primary` (`#e50914`), `primary-dim` (`#ae0610`) |
| Text and outlines | `on-surface`, `on-surface-variant`, `outline-variant` |
| Status | `success` (`#22c55e`), `warning` (`#f59e0b`), `error` (`#f07070`) |

## Contrast And Feedback

Use readable text and a focus indicator for interactive elements. Pair colour with a label or icon where it conveys state. Successful actions such as saving, syncing and copying can briefly show a green button with the result in its label. Keep errors, warnings and persistent results readable separately.

Use existing page, section, form and dialog components to keep spacing, colours and keyboard interactions consistent. Check dense views and dialogs at desktop and mobile widths.
