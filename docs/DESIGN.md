# Watchdog: Design System

The interface is bright, rounded and alive. A cobalt page, white cards, one butter-yellow action colour, and a mascot, **Sentry**, a watchdog whose mood is the status of your sites. He naps when everything is up, listens when something is slow, and barks when something is down, and the whole page turns coral with him.

Related: [PRODUCT.md](./PRODUCT.md) · [TECHNICAL.md](./TECHNICAL.md) · [PRD.md](./PRD.md)

---

## 1. Principles

- **The mascot is the status.** Sentry's mood and the page colour carry the overall state. Everything else stays quiet so the state is the first thing you see.
- **Colour means something.** Coral is an outage. Butter is the main action. Green, amber and red appear only on status pills.
- **Soft and rounded.** Large radii, pill buttons, white cards with a soft shadow on a saturated background.
- **Motion has a job.** Animation shows state changes (Sentry waking up), guides attention (the scroll story) or adds delight on the landing page. App screens stay calm.
- **Say what is happening.** Every list has loading, empty and error states with a retry, and errors say what failed.
- **Accessible by default.** Text pairs meet WCAG AA, focus is always visible, and motion switches off under `prefers-reduced-motion`.

## 2. Colour

Tokens live in `client/src/index.css` under `@theme`, so Tailwind classes such as `bg-cobalt` and `text-soft` exist.

| Token | Hex | Use |
|---|---|---|
| `cobalt` | `#2b46ff` | Landing hero, login and signup |
| `deep` | `#1f35d9` | App pages (dashboard, incidents, add monitor) |
| `coral` | `#ff5a3c` | Outage state on the landing page, login errors |
| `redwall` | `#b92f19` | Dashboard background while something is down |
| `ink` | `#101536` | Text on light surfaces, dark buttons, banners |
| `soft` | `#4a4f73` | Secondary text on white |
| `butter` | `#ffe45e` | Primary action, active states, highlights |
| `cream` | `#fff6e5` | Light sections and inset panels |
| `sand` | `#ffcf86` | Sentry's fur |

Status pills:

| Status | Colours |
|---|---|
| Up, Resolved | `#0b5a32` on `#d3f5e2` |
| Slow | `#5c3d00` on `#ffd966` |
| Down, Open | white on `#c8321a` |
| Acknowledged | ink on butter |
| Paused | `#3d3a31` on `#d6d1c4` |
| Pending | `#3b3a52` on `#e6e3ee` |

Tiles change colour with state: white when up or pending, `#fff1c4` when slow, `#ffd9d0` when down, `#ece8df` when paused.

## 3. Type

| Role | Font | Notes |
|---|---|---|
| Display | Bricolage Grotesque 500 to 800 | Headlines, big numbers, brand. Tight tracking |
| UI and body | DM Sans 400 to 700 | 15 to 18 px body |

Both are loaded from Google Fonts in `index.html`.

## 4. Layout

- Content width is `1312px` on the dashboard and landing page and `960px` on the incidents page, with 24 px side padding on mobile and 64 px from `sm`.
- Monitors are tiles in a grid: one column on mobile, two from `md`, three from `lg`. Problem monitors sort first.
- The dashboard header pairs the small Sentry avatar with a headline that summarises the state ("API is down", "All 5 monitors are up").
- Login and signup are two columns on large screens: the form on the left and a large Sentry on the right who follows the cursor. Below `lg` only the form shows.
- The landing page is a sequence of sections: hero, three "stay calm" cards, scroll story, the live ticker, tiles, a compact closing card and a slim footer.
- The navbar is a floating rounded bar the same width as the page content, so its edges line up with the headline. It has three zones on one line: logo, links, actions. On the landing page a logged-in user sees a profile chip (initial and name) instead of Log in, with Start monitoring opening Add monitor, and the closing card and footer point to the dashboard. The app version shows the current page as a white pill, Add monitor in butter, a user chip with an initial, and Log out.

## 5. Components

| Component | Notes |
|---|---|
| `Sentry` | The large animated dog. Props `mode` (`up`, `slow`, `down`), `scale`, `intro`. Exposes `lookAt` so a parent can make his eyes follow the cursor |
| `SentryAvatar` | A small flat version used in the dashboard header and the page loader |
| `MonitorTile` | The Pulse card: name, URL and status pill, the big response time with 24 hour uptime beside it, a bar for each of the last 24 checks, the interval and last check time, and Edit, Pause or Resume and Delete with icons. Shakes briefly when down |
| `IntervalDial` | A rotary knob for the check interval with seven detents (1, 2, 5, 10, 15, 30 minutes and 1 hour), preset chips and a custom field for any whole number from 1 to 60. Drag it, use the arrow keys, tap a chip or type |
| `MonitorForm` | The form shared by Add monitor and Edit monitor: target, schedule (the dial and the timeout), detection and the "What will run" panel |
| `Icon` | Small stroke icons for edit, pause, resume and delete |
| `ConfirmDialog` | White card with a worried Sentry, a title, a message, Cancel and a red confirm button, over a dimmed and blurred page. Used through the `useConfirm` hook, which returns a promise, so a handler can write `await confirm({...})` |
| `LiveTicker` | The butter-yellow landing section: a "Live now" tag, the heading, a button, summary chips and a window of five site rows that slides up one row at a time. Rows are white with the site's own icon on a light tile (a coloured letter tile if there is no icon), the name and domain, 28 bars, uptime and response time |
| `Switch` | The on and off toggle used on the status page settings |
| `CheckBars` | The bars for recent checks, used on the monitor card (24 bars) and the public status page (30 bars) |
| `StatusBadge` | Pill for monitor and incident states |
| `IncidentList` | White card per incident: start, duration, failed checks, cause, latest error, acknowledge |
| `AuthLayout` | Two-column layout for login and signup with the reacting Sentry |
| `Logo` | A small dog-face tile and the "Watchdog" wordmark in Bricolage Grotesque 700 |
| `Navbar` | Floating bar for the app: logo, Monitors and Incidents (current page in white), Add monitor, user chip, Log out |
| `FormField`, `ChipGroup` | Label, hint and input wrapper; radio-style chips for interval, timeout, method and threshold |
| `ui.js` | Shared class strings for cards, inputs and buttons (butter, ink, outline) |

## 5a. Monitor card

Bars show the last 24 checks, oldest on the left. Height follows the response time, so a slow stretch is visible at a glance.

| Bar | Meaning |
|---|---|
| Green | Up and answered in under 1.5 seconds |
| Amber | Up but slower than 1.5 seconds |
| Short red | The check failed |
| Pale | No check yet in that slot |
| Grey | The monitor is paused |

Cards stay white in every state. A card never prints a missing value: when the last check got no reply, the readout says "No reply", and long readouts stay on one line instead of stretching the card. The status pill, the bars, the page colour and a short shake when down carry the state. Uptime is the share of checks that were up in the last 24 hours, or a dash when there are none.

## 5b. Public status page

The public page (`/status/:slug`) uses the same look without the app navbar: the logo, the page title, Sentry with a headline for the overall state, a white card per monitor with its pill, 30 bars, uptime and response time, then past incidents. The background is the calm blue and turns the outage red when something is down. It ends with "Powered by Watchdog".

A monitor card on the public page shows its domain under the name when the owner turned that on.

The owner's page (`/status-page`) shows the live link with Copy link and Open page, two switches (visible to everyone, show site domains), the title, the link name and a checklist of monitors.

## 6. Sentry

| Mode | Appearance | Used when |
|---|---|---|
| `up` | Eyes closed, ears drooped, floating z's, slow breathing | Everything is up, or nothing to show |
| `slow` | Eyes open and tracking, ears raised, brows lifted | A monitor answers slowly (over 1.5 seconds), or a form is being filled in |
| `down` | Eyes wide, brows angled, mouth barking, sound waves, shake | A monitor is down, or a form returned an error |

On login and signup he closes his eyes while you type a password and barks when the server returns an error. The mode is derived from the monitor list on the dashboard (`utils/monitorState.js`).

## 7. Motion

Animation uses GSAP, with ScrollTrigger on the landing page only. The landing route is lazy-loaded, so the app screens do not pay for it.

| Where | What |
|---|---|
| Landing hero | The navbar drops in, headline words slide in, Sentry bounces in, status chips pop in and drift, his eyes and head follow the cursor, a soft light follows the mouse, the All up, Slow and Down buttons change his mood and the page colour |
| Scroll story | A pinned four-step sequence scrubbed by the scrollbar: sites arrive, Sentry checks them, one goes down and an incident opens, it recovers. The page turns coral during the outage. Shown at 1280 px and wider, and as stacked cards below that |
| Live ticker | Rows slide up one at a time, 2.5 seconds still and 0.7 seconds moving, fading in at the bottom and out at the top. It pauses on hover and while off screen |
| Tiles | Rise in with a stagger, tilt toward the cursor, and the "Break the API" button turns one red |
| Dashboard and forms | Sentry avatar changes with the overall state, tiles shake briefly when down, colour changes use CSS transitions |

Reduced motion: all looping and scroll animation is skipped, mode changes are instant, and the scroll story becomes the stacked cards.

## 8. States and feedback

| State | Treatment |
|---|---|
| Loading | Pulsing placeholder blocks the shape of the content |
| Empty | A white card with one line and, on the dashboard, a button to add the first monitor |
| Error (page) | A white card with the message in red and a Try again button |
| Error (action) | An ink banner above the content with `role="alert"` |
| Error (form) | A red banner above the fields with `role="alert"` and the server's message |
| Confirm | A dialog inside the page (`ConfirmDialog`) before deleting a monitor or a status page. It names the item, explains what is lost and has Cancel and a red confirm button. Focus starts on Cancel, Escape or a click outside cancels, Tab stays inside, and the page behind cannot scroll |
| Live change | The dashboard and incidents refresh every 30 seconds without a loading state |

## 9. Writing

- Plain and specific: "Unexpected status 503", "Timed out after 5000 ms".
- Time is shown as relative text ("5 min ago") and durations as `2m 5s`.
- Server messages are written to be shown to users as they are.

## 10. Accessibility

Measured contrast of the main pairs:

| Pair | Ratio |
|---|---|
| White on cobalt `#2b46ff` | 6.1:1 |
| White on deep `#1f35d9` | 8.2:1 |
| White on redwall `#b92f19` | 6.0:1 |
| Ink on coral `#ff5a3c` | 5.7:1 |
| Ink on butter | 14.0:1 |
| Butter on cobalt | 4.8:1 |
| Ink on white | 17.8:1 |
| Soft `#4a4f73` on white | 7.9:1 |
| `#0b5a32` on `#d3f5e2` (Up pill) | 7.1:1 |
| White on `#c8321a` (Down pill) | 5.4:1 |

White text is never used on coral (3.1:1). Focus is a 3 px ink outline with a butter halo on every interactive element. Form fields have labels and hints wired to inputs, errors use `role="alert"`, and Sentry is decorative and hidden from assistive technology.

Known gaps: the page-level loading and error cards are not announced to screen readers, the landing page uses fixed-size compositions that have not been tested on phones, and keyboard-only use of the scroll story has not been checked.
