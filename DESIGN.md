# UI Design Baseline

## Purpose

This document is the UI clarity baseline for the Revenue Reconciliation Dashboard.

It complements `PRODUCT.md` (what the product must do) and `HLD.md` (how major parts fit together). It does not invent product requirements or architecture.

## Principles

1. Prefer clarity and actionability over decoration.
2. Use one visual system app-wide.
3. Prefer shared tokens and `components/ui` primitives over page-local styling.
4. Do not trade correctness or completion for visual polish.

## Typography

- Use the system sans stack from CSS tokens (`--font-sans` / `--font-heading` in `app/globals.css`).
- Do not add font packages unless a later task demonstrates a need.
- Body text must remain readable; muted text stays secondary but legible.

## Controls

- Default `Button` and `Input` heights are comfortable (~40px / `h-10`).
- Use `Button` `size="sm"` or `xs` for dense chrome (headers, table row actions).
- Keep primary form actions on the default size.
- Preserve `Input` `text-base` on small screens (`md:text-sm` only from `md` up) to avoid mobile zoom.

## Spacing

- Prefer Card and stack gaps from shared primitives.
- Keep page padding consistent via auth and app layouts.
- Do not invent one-off spacing systems per screen.

## Color

- Use existing shadcn CSS variables in `app/globals.css`.
- Do not introduce an ad-hoc brand palette.
- Use semantic tokens only (`destructive`, `muted`, etc.).

## Components

- Build screens with `components/ui/*`.
- Add shadcn primitives when a stage needs them (for example table or badge in Stage 7).
- Do not introduce a second styling approach alongside the shared primitives.

## Non-goals

- Liquid Glass, blur, gradients, or motion for show
- Speculative theming or dark-mode redesigns beyond token consistency
- Page-specific visual systems
- Brand books or Material-scale design systems
