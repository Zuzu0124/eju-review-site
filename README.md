# eju-review-site
EJU review task generator single page app

- `index.html` — EJU 间隔复习应用
- `jlpt.html` — N1 오답 수거함: JLPT N1 错题回收站（粘贴/截图 → Claude 自动解析为卡片 → 简化SM-2间隔复习，韩语界面）

## AI Learning OS / Google Sheets sync

`index.html` records every new review as an event with a stable ID. After the
undo window, authenticated users call the `learning-os-sheet-sync-v6` Supabase Edge
Function. The function:

1. looks for an existing `eju_review_id` link;
2. otherwise permits only one exact normalized
   `subject + source + question_id` match;
3. appends a new `learning_log` row instead of overwriting the original attempt;
4. uses `review_event_id` to make retries idempotent.

Unmatched or ambiguous events stay in the browser/cloud data and can be retried
from the Data page. Existing historical reviews are not backfilled automatically.

### Required Google Sheet columns

Append these text columns to `learning_log`:

```text
eju_review_id
review_event_id
```

The target workbook used by this project already has these columns.

### Deploy the Apps Script and Edge Function

Deploy the bound Google Apps Script as a web app that executes as the spreadsheet
owner. Keep its URL and shared random sync secret out of the repository.

```bash
supabase secrets set \
  APPS_SCRIPT_URL='https://script.google.com/macros/s/.../exec' \
  APPS_SCRIPT_SYNC_SECRET='a-long-random-secret'

supabase functions deploy learning-os-sheet-sync-v6
```

The browser must be signed in with the app's existing Supabase account before
Learning OS synchronization runs.

The function keeps legacy JWT verification enabled. The Apps Script rejects
requests that do not contain the matching Edge Function sync secret.

### Rating mapping

| Website rating | `correct` | `error_group` | `mastery_note` |
| --- | --- | --- | --- |
| ○ 熟练完成 | 1 | blank | `fast recall` |
| △ 完成较慢 | 1 | blank | `recalled but slow` |
| × 未独立完成 | 0 | U | `could not recall approach` |

The website rating does not prove `independent`, `hint_level`, confidence, or
verification, so those fields remain blank.

## Mobile review flow (2026-09-05.1)

- Compact expandable exam countdown; the home screen prioritizes remaining work,
  subject selection and full or five-question sessions.
- Phone layout keeps the single column and bottom navigation. Controls have larger
  touch targets, review actions stay in the session footer, and long hints scroll
  within the session body. Existing iOS standalone safe-area behavior is retained.
- Entry drafts and the last book per subject/type are saved locally. Batch mode
  accepts comma-separated question numbers and ascending ranges, previews the
  result, and skips existing subject/type/source matches (maximum 50 per batch).
- Hints are collapsed in both review views. Rating buttons preview the next date;
  assisted or incorrect attempts belong under ×. Ratings are self-reports.
- New maintenance reviews: × returns tomorrow; △ returns in seven days. New
  events carry `scheduleVersion: 2`; unversioned historical events keep the original
  scheduling rules during replay and merge.
- The final question can be undone from the summary. The still-undoable session
  event is held back from Sheets. `removedReviewIds` records cancellations so stale
  cloud history cannot reintroduce a cancelled event. Use the current page version
  on all devices; older clients do not understand these additional fields.
- Statistics surface repeated difficulties and the next seven days of scheduled
  work before inventory totals. These are review metrics, not exam-score estimates.

## Design and motion refinement (2026-09-05.2)

- Warm graphite task surface, consistent typography and spacing, and a floating
  bottom navigation that retains safe-area padding and the iOS standalone shell.
- Countdown and sync information follow the main task. List-level quick ratings,
  optional entry notes, inventory statistics and advanced data actions expand on
  demand. Full and small-group session controls remain on the task surface.
- Tab navigation restores each page's scroll position; tapping the active tab
  scrolls to the top without rebuilding its form. New book names are entered in
  the page instead of a native prompt.
- A review session keeps its header and rating buttons mounted between questions;
  only the card changes. Transitions use short, consistent distances and durations,
  and both JavaScript and CSS honor the system's reduced-motion preference.
- The main text/CTA color pairs were checked numerically for contrast. The isolated
  regression suite now includes scroll restoration, persistent session controls,
  inline book entry and reduced motion (14 passing checks).

iPhone Safari, soft-keyboard behavior and mobile animation rendering still need
device verification; the regression suite does not provide a layout engine.

### Regression checks

The application remains buildless. The test-only dependency can be installed
outside the repository:

```bash
npm install --prefix /tmp/eju-review-qa --no-audit --no-fund linkedom@0.18.13
NODE_PATH=/tmp/eju-review-qa/node_modules node --test tests/mobile-review.test.cjs
```

The suite covers draft persistence, batch entry and duplicates, storage failure,
historical schedule compatibility, collapsed hints, final-card undo, stale cloud
merges, rapid double taps, filtering, and the five main views. It uses an isolated
DOM and synthetic records; it does not verify browser layout, iPhone Safari,
virtual-keyboard behavior, or live cloud/Sheets integration.
