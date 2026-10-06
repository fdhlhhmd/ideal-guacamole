# Procurement Log: System Description

A mobile-friendly web app (PWA-style) for tracking procurement orders: create, view, edit and delete orders, see how many units have arrived and how many are still pending, and review supplier activity. It runs entirely in the browser and keeps its data on the device.

## 1. Overview

| Item | Detail |
|---|---|
| Delivery | One self-contained HTML file (HTML + CSS + vanilla JavaScript, no framework or build step) |
| Storage | IndexedDB on the user's device (works offline); theme preference in `localStorage` |
| Layout | Responsive: table layout on desktop, stacked cards on phones |
| Theme | Light and dark, toggled by the user, remembered between visits |
| Currency | MYR (Malaysian ringgit) |
| Fonts | Space Grotesk (UI) and JetBrains Mono (numbers, codes) |

## 2. Core concepts

### Order

Each order is stored as one record.

| Field | Meaning |
|---|---|
| `id` | Unique internal ID (UUID) |
| `po` | Order number, e.g. `po-1042` (next number suggested automatically) |
| `date` | Order date |
| `supplier` | Supplier name (free text) |
| `type` | Category, e.g. Raw materials, Office, Equipment, Packaging, Services (free text with suggestions) |
| `units` | Units ordered |
| `got` | Units arrived so far |
| `cost` | Order cost in MYR |
| `status` | `pending`, `arrived`, `completed` or `cancelled` |
| `eta` | Expected arrival date (optional) |
| `note` | Free-text note (optional) |

### Status rules

- **Pending**: the order is open and goods are still expected.
- **Arrived**: all ordered units have arrived (`got = units`). Setting an order to arrived fills the arrived count. If a pending order's arrived count reaches the ordered count, it becomes arrived automatically.
- **Completed**: the order was closed early at its current arrived count (for example 2/4). The ordered units are not changed, and the remaining units are no longer treated as pending.
- **Cancelled**: the order is excluded from totals and counts (except where the cancelled filter is chosen).
- **Fulfilled** (used in filters and the dashboard) means arrived or completed.
- The arrived count is always kept between 0 and the ordered units.

## 3. Screens

### Dashboard
- Four summary tiles: incoming orders, awaiting arrival, fulfilled, total value (MYR).
- Arrival progress bar for units: arrived versus still pending.
- Pending value grouped by supplier.
- "Next to arrive": the five pending orders with the earliest expected date, overdue ones flagged, each with action buttons.

### Orders
- Summary tiles that follow the active filters, including the total value of the filtered results.
- Search box (order number, supplier, type, note).
- Filters: status (All, Pending, Fulfilled, Cancelled), type, supplier, month.
- Sort by order date, newest or oldest first.
- Table columns: Order, Date, Type, Supplier, Arrived (shown as `2/4`), Cost, Status, Actions.
- Tap or click a row to edit the order. "Reset filters" appears when any filter is active.

### Suppliers
- Chart of orders per month, stacked by supplier, for the last 3, 6 or 12 months. The top five suppliers get their own colour and the rest are grouped as "Others".
- Ranking list next to the chart, with the supplier that has the most orders tagged.
- Supplier gallery: one card per supplier showing orders made (and cancelled), types supplied, units arrived progress, pending orders, total value and last order date. Tapping a card opens the Orders tab filtered to that supplier.
- Cancelled orders are not counted as orders made.

## 4. Actions

| Action | Where | What it does |
|---|---|---|
| New order | Header | Opens the order form |
| Edit / Delete | Order form | Updates or removes an order (delete asks for confirmation) |
| All arrived (box with tick icon) | Pending orders | Sets arrived units equal to ordered units and marks the order arrived |
| Complete (flag icon) | Pending orders and the edit form | Closes the order at its current arrived count, after confirmation |
| Cancel (circle with X icon) | Pending orders | Cancels the order, after confirmation |
| Copy CSV | Header | Copies all orders as CSV text to the clipboard |
| Demo data | Header | Adds 35 sample orders across about 11 months, with many suppliers, types and statuses |
| Reset | Header | Deletes every order on the device, after confirmation |
| Theme toggle | Header | Switches between light and dark |

Action icon buttons are shown only for pending orders. Confirmations use in-page dialogs, because the browser's built-in popups are blocked in embedded pages.

## 5. Design

The visual style follows the supplied procurement ledger mockup: warm grey-green background, thin rules instead of heavy boxes, 2px corners, monospaced numbers and outlined status tags of equal size. Colours are defined as variables, so the light and dark themes share the same layout. On phones the layout switches to stacked order cards and larger touch targets, and content stays clear of the screen notch and system bars.

## 6. Data and privacy

- All data stays in the browser's IndexedDB on one device. Nothing is sent to a server.
- There is no account, login or sync between devices. Clearing browser data removes the orders.
- If IndexedDB is unavailable, the app still runs but keeps data in memory only for that session.
- Orders saved by earlier versions are upgraded automatically on load (missing arrived count, type and date are filled in).

## 7. PWA status and limitations

- The page includes an inline web app manifest and mobile-friendly settings, so it can be added to a home screen where the browser allows it.
- A service worker is not included, because a single published page cannot register one. For full offline loading and install prompts, host the file on HTTPS together with a `sw.js` and a standard `manifest.json` with icons.
- Suppliers exist only as names on orders; there are no supplier contact records (phone, email, address).
- There is no import, file download or multi-user access. Export is by copying CSV to the clipboard.
- Action buttons apply to pending orders only. To reopen a closed or cancelled order, edit it and change its status.
