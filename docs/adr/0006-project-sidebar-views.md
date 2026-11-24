# 6. Project sidebar: activity bar with a view registry, built on resizable panels

- Status: accepted
- Date: 2026-11-24

## Context

The file tree on the project page always takes space, which hurts on small screens, and more side views are coming (outline, search, later comments or history). We prototyped four layouts: an activity bar (VS Code), a sidebar that peeks in on hover, stacked collapsible sections, and header layout toggles with a command palette.

## Decision

- **Activity bar plus one panel.** A 48px bar of view icons sits on the left. The panel next to it shows one view at a time. Clicking the active icon collapses the panel. Views come from a static, typed list in code (`id`, icon, title, body, actions, visibility by role). The first views are Files, Outline and Search.
- **Our own composition, not the shadcn Sidebar component.** The panel is a collapsible `ResizablePanel`: it can be resized, and dragging it narrow enough collapses it. Below Tailwind's `lg` it opens in a shadcn `Sheet` instead. It is built from shadcn components (`Button`, `Tooltip`, `Tabs`, `ToggleGroup`, `Command`) and the same tokens as the rest of the app (`background`, `muted`), not the `--sidebar-*` ones, so it doesn't stand out as a differently colored strip.
- **Breakpoints.** At `lg` and up the panel is docked. Its state (open, view, width) and the header's editor and PDF toggles are kept in `localStorage` for all projects. From `md` to `lg` the panel is an overlay that starts closed and closes after a file is opened. Below `md`, one pane is shown at a time, with a bottom tab bar: the active view (Files, Outline or Search), Code and PDF.
- **Command palette.** `Ctrl+P` opens files, `>` runs commands and `@` jumps to an Outline heading. Views add their own commands, filtered by role.
- **Shortcuts.** `Ctrl+B` stays free for bold text. `Ctrl+Shift+B` toggles the sidebar, with `Ctrl+\` as the fallback if a browser won't release it. We avoid `Ctrl+Alt+<letter>`, because AltGr types Polish letters, and `Ctrl+Shift+P`, which Firefox won't release.

## Alternatives

- **shadcn Sidebar** (the `sidebar-09` nested layout): gives us the icon rail, mobile sheet and persistence for free. Its width is a fixed CSS variable, though, so the file tree would lose drag-to-resize, which it has today.
- **Peeking sidebar** (Arc, Linear): looks clean, but tabs at the top only fit three or four views, and hover doesn't work on touch screens.
- **Stacked sections** (VS Code Explorer): shows files and outline at once, but gets cramped with more sections. It can still be added later as a second way to render the same list of views.
- **Layout toggles and the palette alone**: hidden from new users, and every new view would add another header button.

## Consequences

- A new side feature is one more entry in the view list: no layout changes, no new breakpoints.
- File tabs are left out on purpose. The URL hash still holds the one open file.
- Compile errors don't get a view. They will get a panel under the PDF.
