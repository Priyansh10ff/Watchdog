# Watchdog: Design System

The interface is warm, rounded and calm. Pages sit on a soft beige background, content lives on white cards, and a single orange accent marks the main action and the brand. Status is the only place colour carries meaning: green for up, red for down, orange for paused, yellow for acknowledged.

This document describes the interface as built. A planned redesign is described at the end.

Related: [PRODUCT.md](./PRODUCT.md) · [TECHNICAL.md](./TECHNICAL.md) · [PRD.md](./PRD.md)

---

## 1. Principles

- **Status is colour, everything else is quiet.** Green, red, orange and yellow appear only on status badges, banners and error text.
- **One orange action per view.** Orange (`#ff9918`) is for the primary button. The brand and active links use a deeper orange (`#ff6b35`).
- **Soft and rounded.** Cards use large radii, buttons and inputs are pills. Separation comes from white cards on a beige page, not from heavy borders.
- **Say what is happening.** Every list has a loading, empty and error state. Errors say what failed and offer a retry.
- **Live without being noisy.** Data refreshes silently every 30 seconds, with no spinner flashing.

## 2. Colour

Colours are applied with Tailwind utilities and arbitrary values.

| Role | Value | Use |
|---|---|---|
| Page background | `#f5f2ed` | Dashboard, incidents, add monitor |
| Auth background | `#D8D0C4` | Login and signup |
| Surface | `#ffffff` | Cards, auth card |
| Ink | `#303030` | Primary text, dark buttons, side panel |
| Secondary text | `#999999` | Descriptions and meta text |
| Label text | `#aaaaaa` | Small labels above values |
| Form input border | `#d5d5d5`, focus `#aaaaaa` | Inputs |
| Accent | `#ff9918`, hover `#f58c08` | Primary buttons |
| Brand and active | `#ff6b35` | Logo, active nav link, link hover |
| Neutral button | `#f5f2ed`, hover `#303030` with white text | Secondary buttons, logout |
| Danger | `bg-red-50` with `text-red-600`, hover solid red | Delete, error text |

Status colours:

| Status | Badge |
|---|---|
| Up, Resolved | green text on `green-50` |
| Down, Open | red text on `red-50` |
| Pending (unknown) | gray text on `gray-100` |
| Paused | orange text on `orange-50`, dot `#ff9918` |
| Acknowledged | yellow text on `yellow-50` |

## 3. Type

The interface uses the Tailwind default sans stack (system fonts). Sizes are set per element.

| Role | Size and weight |
|---|---|
| Page title | 24 px, semibold |
| Card title | 17 px, semibold |
| Body and values | 13 to 14 px |
| Labels | 12 to 13 px |
| Auth headline | 34 px, semibold, tight tracking |

## 4. Layout

- Content width is `max-w-7xl` on the dashboard and `max-w-4xl` on the incidents page, with responsive side padding.
- The navbar is sticky with a translucent white background, a bottom border and a blur.
- Monitors are cards in a responsive grid: one column on mobile, two from `md`, three from `lg`.
- Incidents are a vertical list of cards.
- Login and signup use one large rounded card. The form is on the left and a dark panel with the product message is on the right, hidden below `md`.

## 5. Components

| Component | Notes |
|---|---|
| `Navbar` | Brand, Dashboard and Incidents links with an active colour, user name, logout |
| `MonitorCard` | Name, URL, status badge, interval, last check, response time, pause or resume, delete |
| `StatusBadge` | Pill with a dot and label for monitor states (up, down, pending, paused) and incident states (open, acknowledged, resolved) |
| `IncidentList` | Card per incident with start, duration, failed checks, cause, latest error and an acknowledge button |
| `AuthSidePanel` | Dark panel with the tagline and a status legend |
| `ProtectedRoute`, `PublicRoute` | Redirect based on the session, with a loading state |

Form inputs are pills with a light border. The primary button is an orange pill that dims when disabled.

## 6. States and feedback

| State | Treatment |
|---|---|
| Loading | Plain text such as "Loading monitors...". Buttons switch to a working label and disable |
| Empty | A dashed white card with one line of explanation and, on the dashboard, a button to add the first monitor |
| Error (page) | A white card with the message and a Try again button |
| Error (action) | A red line under the page header |
| Error (form) | A red line above the fields with the server's message |
| Confirm | The browser confirm dialog before deleting a monitor |
| Live change | The dashboard and incidents refresh every 30 seconds without a loading state |

## 7. Writing

- Plain and specific. Failures say what happened: "Unexpected status 503", "Timed out after 5000 ms".
- Time is shown as relative text ("5 min ago") and durations as `2m 5s`.
- Server messages are written to be shown to users as they are.

## 8. Accessibility

Measured contrast of the current colours:

| Pair | Ratio | Result |
|---|---|---|
| `#303030` on `#f5f2ed` | 11.8:1 | Pass |
| `#303030` on white | 13.2:1 | Pass |
| `#303030` on `#ff9918` | 6.2:1 | Pass |
| `#bdbdbd` on `#303030` | 7.0:1 | Pass |
| `#999999` on white | 2.9:1 | Fails AA |
| `#aaaaaa` on white | 2.3:1 | Fails AA |
| White on `#ff9918` (primary button text) | 2.1:1 | Fails AA |
| `#ff6b35` on white | 2.8:1 | Fails AA |

Known gaps to fix in the redesign: secondary and label text is too light, the white text on the orange button is too low in contrast (dark text on orange passes), and the brand orange is too light for small text. Text inputs remove the browser focus outline and only change the border from `#d5d5d5` to `#aaaaaa`, which is hard to see. Loading and error messages are plain text and are not announced to screen readers.

## 9. Planned redesign

The visual design is deferred until the features are complete. The intended direction is a mascot-led look (Sentry, a watchdog whose mood mirrors the status), with these tokens:

| Role | Value |
|---|---|
| Cobalt (hero) | `#2b46ff` |
| Deep cobalt | `#1f35d9` |
| Coral (outage) | `#ff5a3c` |
| Ink | `#101536` |
| Butter | `#ffe45e` |
| Cream | `#fff6e5` |

Fonts would be Bricolage Grotesque for display and DM Sans for body. The page would turn coral during an outage, and motion (GSAP with scroll-driven sections) would be used for the landing page. The redesign should also close the accessibility gaps in section 8.
