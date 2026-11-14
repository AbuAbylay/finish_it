# Finish-it coach: design spec

The user is a working adult, 28 to 40, studying at 9 pm, often on a phone. The UI should feel calm and spacious, and make the next step obvious. Every page has exactly one dark primary action. Green means done or correct, and nothing else. Selection is shown in neutral dark, not green.

Tokens live in `app/globals.css` (`@theme`). Use only the utilities listed here. Tailwind's default palette (`stone-*`, `emerald-*`, …) remains only for legacy components until they are migrated; new code must not use it.

## 1. Color tokens

Contrast ratios are text on the given background (WCAG AA: 4.5 for body text, 3 for large text and UI boundaries).

| Token | Hex | Utilities | Use | Contrast |
|---|---|---|---|---|
| canvas | `#f6f5f2` | `bg-canvas` | Page background | ink 16.0, ink-muted 6.2 |
| surface | `#ffffff` | `bg-surface` | Cards, inputs, popover | ink 17.4, ink-muted 6.8, ink-faint 4.6 |
| surface-muted | `#f1efeb` | `bg-surface-muted` | Date blocks, key points, skeleton | ink 15.4, ink-muted 6.0 |
| sidebar | `#fbfaf8` | `bg-sidebar` | Sidebar and drawer | ink 16.9 |
| sidebar-active | `#e9e6e1` | `bg-sidebar-active` | Active nav item, ghost hover (neutral grey) | ink 13.9 |
| overlay | `#1c1a17` at 40% | `bg-overlay` | Drawer scrim | — |
| ink | `#1c1a17` | `text-ink` | Primary text | — |
| ink-muted | `#5f5a53` | `text-ink-muted` | Secondary text, meta | 6.8 on surface |
| ink-faint | `#7a746b` | `text-ink-faint` | Placeholder, disabled, rest days | 4.6 on surface |
| line | `#e4e1db` | `border-line`, `divide-line` | Card borders, dividers (decorative) | — |
| line-strong | `#948d83` | `border-line-strong` | Input and unselected control borders | 3.3 on surface (UI) |
| primary | `#1c1a17` | `bg-primary`, `hover:bg-primary-hover` | The one dark action per screen | on-primary 17.4 |
| on-primary | `#ffffff` | `text-on-primary` | Text on primary | — |
| accent | `#1f7a55` | `bg-accent`, `text-accent`, `border-accent` | Done, correct, on track, studied day | white on it 5.3, on surface 5.3 |
| accent-strong | `#165c40` | `text-accent-strong` | Accent text on accent-soft | 7.4 on accent-soft |
| accent-soft | `#e6f2ec` | `bg-accent-soft` | Done pill, correct answer | — |
| warn | `#8a5a00` | `text-warn` | Needs review, behind, why line label, demo | 5.9 on surface, 5.3 on warn-soft |
| warn-soft | `#fbf1dc` | `bg-warn-soft` | Why line, demo block, needs-review pill | — |
| warn-line | `#ebcf94` | `border-warn-line` | Why line and demo block border | — |
| danger | `#b4233c` | `text-danger`, `bg-danger` | Wrong answer, missed day, errors, reset | 6.5 on surface, white on it 6.5 |
| danger-soft | `#fbe9ec` | `bg-danger-soft` | Wrong option, error card, missed cell | danger 5.7 |
| info | `#1d5f8a` | `text-info` | Known (from the short test) | 6.9 on surface, 6.1 on info-soft |
| info-soft | `#e5f0f8` | `bg-info-soft` | Known pill | — |
| locked | `#6b665f` | `text-locked` | Locked rows and pills | 5.7 on surface, 5.0 on locked-soft |
| locked-soft | `#efede9` | `bg-locked-soft` | Locked pill, locked state card, dev banner | — |
| band-green / band-sand / band-sky | `#e3f0e8` / `#f6ecd8` / `#e2ecf5` | via `band-*` utilities | Card header bands | — |
| ring | `#1f7a55` | (base `:focus-visible`) | Focus outline | 5.3 on surface |

**Color is never the only signal.** Each state has a fixed color, icon and text label:

| State | Pill classes | Icon | Text |
|---|---|---|---|
| Done | `bg-accent-soft text-accent-strong` | check | Done |
| Known | `bg-info-soft text-info` | check-circle | Known |
| Needs review | `bg-warn-soft text-warn` | refresh | Needs review |
| Up next | `bg-primary text-on-primary` | arrow-right | Up next |
| Locked | `bg-locked-soft text-locked` | lock | Locked |
| Missed day | `bg-danger-soft text-danger` | close (×) | Missed |
| On track | `text-accent-strong` | check-circle | On track… |
| Behind | `text-warn` | alert | Behind by N lessons… |

## 2. Type scale

The font is the system stack (`font-sans`), with no web fonts. The ID is set in `font-mono`.

| Utility | Size / line height | Weight | Use |
|---|---|---|---|
| `text-display-lg` | 40 / 46 | 700, -0.025em | Hero on /enter at ≥768 px |
| `text-display` | 32 / 38 | 700, -0.02em | Hero on mobile, pace line on /plan |
| `text-h1` | 26 / 32 | 700 | Page titles, lesson title |
| `text-h2` | 20 / 28 | 700 | Card titles, section headings |
| `text-h3` | 17 / 25 | 600 | Sub-headings, top bar title, row titles |
| `text-body-lg` | 17 / 28 | 400 | Lesson reading text (`.prose-lesson`) |
| `text-body` | 16 / 24 | 400 | UI text, buttons |
| `text-small` | 14 / 20 | 400 | Meta, helper text |
| `text-caption` | 12 / 16 | 600, 0.06em, use `uppercase` | Labels: "WHY THIS LESSON", "FROM YOUR COURSE" |

## 3. Spacing, radius, shadow, focus

- **Spacing:** Tailwind's 4 px scale. Use 1, 2, 3, 4, 5, 6, 8, 10 and 12 (4 to 48 px). Card padding is `p-5` on mobile and `md:p-6`. Section gaps are `space-y-5` on mobile and `md:space-y-6`. Page gutter is `px-4` (16 px) on mobile and `md:px-8`.
- **Radius:** `rounded-card` (20 px) for cards, popover and drawer panel; `rounded-control` (14 px) for buttons, chips, inputs and rows; `rounded-cell` (10 px) for calendar cells and date blocks; `rounded-full` for pills and avatars.
- **Shadow:** `shadow-card` for resting cards, `shadow-raised` for hovered rows and the sticky action bar, `shadow-popover` for the popover, drawer and search results.
- **Focus:** a global `:focus-visible` gives a 2 px `ring` outline with 2 px offset. Never remove it. On dark buttons the offset shows the canvas, so it stays visible.
- **Tap targets:** at least 44 × 44 px (`min-h-tap`, `min-w-tap`, `size-tap`). Primary buttons are 48 px (`h-12`).
- **Motion:** 150 ms ease-out for colors. The popover fades and scales from 0.98 over 120 ms; the drawer slides over 200 ms. `prefers-reduced-motion` disables all of it.

## 4. Layout

| Width | Shell |
|---|---|
| < 768 (375 first) | Top bar `h-topbar-mobile` (56 px): menu button, page title, calendar button at the far right. Sidebar becomes a left drawer (`w-drawer`, 280 px) over `bg-overlay`. No search field. |
| 768–1279 | Sidebar collapsed to an icon rail (`w-sidebar-collapsed`, 72 px) by default, expandable. Top bar `h-topbar` (64 px) with search. |
| ≥ 1280 | Sidebar expanded (`w-sidebar`, 240 px) by default, collapsible. The choice persists in localStorage. |

- **Content width:** `max-w-content` (896 px) for Home, Lessons and Plan; `max-w-reading` (672 px) for lesson text and the survey. Content is centered in the area to the right of the sidebar.
- **Home grid at ≥1024:** the Today card spans full width; My course and Review coming up sit side by side (`lg:grid-cols-2`).
- **Sticky action bars** (survey, quiz) are pinned to the bottom with `bg-canvas/95 backdrop-blur` and a `border-t border-line`, and must not cover content: pad the page bottom with `pb-24`.

## 5. Components

| Component | Anatomy | States |
|---|---|---|
| **AppShell** | Sidebar + TopBar + `<main>` with page gutter; DevBanner above main when the stub is active | signed out → redirect to /enter |
| **Sidebar** | Brand mark (32 px `bg-accent` rounded square with check icon + "Finish-it coach"), nav items Home / Lessons / Plan (icon 20 + label, `h-tap rounded-control`), bottom block: caption "YOUR ID", ID in `font-mono` masked (`kq7m2-•••••-•••••-r8vb3`) with Show and Copy icon buttons, Sign out ghost button, collapse toggle | expanded, collapsed (icons only, `aria-label` + `title`), drawer (mobile, focus trapped, Escape and scrim close, returns focus to the menu button); active item `bg-sidebar-active text-ink font-semibold` + `aria-current="page"`; inactive `text-ink-muted hover:bg-sidebar-active/60` |
| **TopBar** | Left: menu button (mobile) and page title `text-h3`. Middle (md+): search field `h-tap rounded-full bg-surface border border-line` with search icon, placeholder "Search topics". Searches unit titles and shows results with a state pill; locked results are shown but not linked. Right: calendar icon button (`size-tap`), the last item | default, search open (results in a `shadow-popover` list), simulated date: a `bg-warn` dot on the calendar button plus a visually hidden "demo date active" |
| **CalendarPopover** | `role="dialog"`, `aria-labelledby` month title. Header: month `text-h3` + prev/next `size-tap` chevrons. Weekday row in `text-caption`. 7-column grid of cells (40 px, `rounded-cell`). Legend (glyph + text). Pace line block. Demo controls block | open/closed; Escape and outside click close it, focus returns to the trigger; at 375 px it is `fixed inset-x-4 top-[--spacing-topbar-mobile]`, at md+ it is anchored right with `w-popover` |
| — cell: planned | `bg-surface border border-line-strong text-ink` | aria-label "Tue 17 Nov: planned" |
| — cell: studied | `bg-accent text-on-primary`, small check glyph | "studied" |
| — cell: missed | `bg-danger-soft text-danger`, small × glyph | "missed" |
| — cell: today | adds `outline-2 outline-ink outline-offset-1` to any state | "today" |
| — cell: exam | `bg-primary text-on-primary`, flag glyph, "Exam" in legend | "exam day" |
| — cell: rest / other month | `text-ink-faint`; other-month days at 40% opacity | "rest day" |
| — pace line | check-circle or alert icon + `text-h3` line + `text-small text-ink-muted` detail | on track / behind |
| — demo block | `rounded-control border border-dashed border-warn-line bg-warn-soft p-4`; caption "DEMO CONTROLS"; simulated-date badge (clock icon, `bg-surface text-warn rounded-full`); secondary buttons Skip to tomorrow, Skip 3 days; Reset demo as a ghost button that turns into an inline confirm (danger button + Cancel) | offset 0: badge reads the real date |
| **Card** | `bg-surface rounded-card border border-line shadow-card overflow-hidden`; optional band `h-24 md:h-28` with `band-green` / `band-sand` / `band-sky`, holding a 48 px `bg-surface rounded-full shadow-card` circle with a 24 px icon at the bottom left, overlapping the body by 24 px; body `p-5 md:p-6` | default, loading (skeleton band + lines), error (body replaced by ErrorState) |
| **Button** | `inline-flex items-center justify-center gap-2 rounded-control font-semibold min-h-tap px-5`; `h-12` for primary page actions | primary `bg-primary text-on-primary hover:bg-primary-hover`; secondary `bg-surface border border-line-strong text-ink hover:bg-surface-muted`; ghost `text-ink-muted hover:bg-sidebar-active hover:text-ink`; danger `bg-danger text-on-primary`; disabled `bg-surface-muted text-ink-faint cursor-not-allowed`; busy shows a spinner and the busy label |
| **Chip** | `min-h-tap rounded-control border px-4 text-left`, full-width in a grid on mobile | idle `border-line bg-surface`; selected `border-2 border-primary bg-surface-muted` + check icon at the right; skip `bg-locked-soft text-locked line-through` + "Skip" label; `aria-pressed` always |
| **StatusPill** | `inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-small font-semibold` + 16 px icon + label | per the state table in §1 |
| **LessonRow** | Grid `[date-block][content][status]`, `min-h-[72px] rounded-control bg-surface border border-line p-3 gap-3`. Date block `w-date-block rounded-cell bg-surface-muted` with weekday `text-caption uppercase text-ink-muted` over day number `text-h2`. Content: title `text-h3` (2-line clamp) and meta `text-small text-ink-muted` ("15 min · Studied Mon 16 Nov"). Status pill on the right | openable: whole row is a link, hover `shadow-raised`; up next: `border-2 border-primary` + chevron; locked: not a link, `aria-disabled`, title `text-ink-muted`, lock pill; done/known date block `bg-accent-soft` / `bg-info-soft`. Under 400 px wide the pill moves under the meta line |
| **QuestionCard** | Prompt `text-h3`, then options as full-width buttons `min-h-tap rounded-control border px-4 py-3` with a radio glyph, then feedback | idle `border-line bg-surface`; selected `border-2 border-primary bg-surface-muted`, filled radio; checked-correct `bg-accent-soft border-accent` + check + "Right."; checked-wrong: chosen `bg-danger-soft border-danger` + ×, correct option `bg-accent-soft border-accent` + check, feedback "Not quite. The answer is …"; other options `text-ink-faint`; feedback block `rounded-control p-4` with explanation + SourceQuote |
| **WhyLine** | `rounded-card border border-warn-line bg-warn-soft p-4`; caption "WHY THIS LESSON" `text-warn`; text `text-body text-ink`, `**bold**` rendered | — |
| **SourceQuote** | `border-l-4 border-accent bg-accent-soft/50 rounded-r-control py-2 pl-4 pr-3`; caption "FROM YOUR COURSE" `text-accent-strong`; quote `italic text-ink` in curly quotes | — |
| **EmptyState** | Small band circle (64 px `band-*` rounded-full + icon), `text-h3` title, `text-small text-ink-muted` line, optional secondary action | — |
| **Skeleton** | `skeleton` utility blocks sized with `h-*`/`w-*`; mirrors the real layout (band, title, 3 lines) | shimmer; static under reduced motion |
| **ErrorState** | `rounded-card bg-danger-soft border border-danger/30 p-5`; alert icon + message `text-body text-ink` (`role="alert"`); secondary "Try again" button with refresh icon | retryable / not retryable (429: no retry, link back instead) |
| **LockedState** | `rounded-card bg-locked-soft p-5`; lock icon, `text-h3` "Locked", line "Unlocks after you pass {unit}.", primary link to the open lesson | — |
| **DevBanner** | One line, `bg-locked-soft text-locked text-small px-4 py-2`, info icon: "Dev stub: lessons are generated without a model." No close button, not sticky | shown only when the AI layer is the stub |
| **Spinner** | 20 px ring `border-2 border-line border-t-ink animate-spin` + label `text-ink-muted` (`role="status"`) | — |

## 6. Page states

| Page | Empty | Loading | Error | Locked |
|---|---|---|---|---|
| /enter | ID field empty, Generate is the primary action | Generate button busy ("Creating your ID…") | Inline under the field: alert icon + `text-danger` message; 429 says to wait | — |
| / (Home) | Review card: EmptyState "Nothing to review yet." with a line on when missed questions return | Three skeleton cards with bands | ErrorState per card, with retry | — |
| /lessons | — (a plan always has units) | 6 skeleton rows | ErrorState with retry | Locked rows as specified |
| /lesson | — | Progress text cycling + skeleton of title, why line and sections | ErrorState; 429 not retryable | LockedState when a locked unit is requested |
| /lesson (re-read) | — | as above | as above | Banner `bg-info-soft text-info`: "Re-reading. This doesn't change your progress." |
| /plan | — | Skeleton stat tiles + calendar | ErrorState with retry | — |
| /survey, /test | — | Spinner then content | ErrorState with retry | — |

## 7. Icons

Inline SVG, `viewBox="0 0 24 24"`, 20 px (`size-5`), `fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`, `aria-hidden="true"`. Icon-only buttons need an `aria-label`. Put them in one module, `components/icons.tsx`.

| Name | Paths |
|---|---|
| home | `M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z` |
| lessons | `M4 6h16M4 12h16M4 18h10` |
| plan | `M4 20V11M10 20V5M16 20v-6M3 20h18` |
| calendar | `M7 3v3M17 3v3M3.5 9.5h17` + rect `x=3.5 y=5 w=17 h=15.5 rx=2` |
| search | circle `cx=11 cy=11 r=6.5` + `m20 20-4.2-4.2` |
| lock | rect `x=5 y=11 w=14 h=10 rx=2` + `M8.5 11V8a3.5 3.5 0 0 1 7 0v3` |
| check | `m5 12.5 4.5 4.5L19 7.5` |
| check-circle | circle `r=9` + `m8 12.5 3 3 5-6` |
| alert | circle `r=9` + `M12 7.5v5.5M12 16.5h.01` |
| refresh | `M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7` |
| chevron-left / right / down | `m15 6-6 6 6 6` / `m9 6 6 6-6 6` / `m6 9 6 6 6-6` |
| arrow-right | `M5 12h14M13 6l6 6-6 6` |
| menu | `M4 7h16M4 12h16M4 17h16` |
| close | `M6 6l12 12M18 6 6 18` |
| sign-out | `M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10` |
| copy | rect `x=9 y=9 w=11 h=11 rx=2` + `M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15` |
| clock | circle `r=9` + `M12 7v5l3 2` |
| flag | `M5 21V4M5 4h11l-2 4 2 4H5` |
| eye | `M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z` + circle `r=3` |
| info | circle `r=9` + `M12 11v5.5M12 7.5h.01` |
