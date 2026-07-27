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
| ○ 秒杀 | 1 | blank | `fast recall` |
| △ 想起但慢 | 1 | blank | `recalled but slow` |
| × 没思路 | 0 | U | `could not recall approach` |

The website rating does not prove `independent`, `hint_level`, confidence, or
verification, so those fields remain blank.
