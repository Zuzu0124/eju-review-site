import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ReviewItem = {
  id: string;
  board?: string;
  subject: string;
  source: string;
  note?: string;
  addedDate?: string;
};

type ReviewEvent = {
  id: string;
  date: string;
  rating: "○" | "△" | "×";
  createdAt?: string;
};

type SheetRow = {
  rowNumber: number;
  values: string[];
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

async function googleAccessToken(serviceAccountJson: string) {
  const account = JSON.parse(serviceAccountJson);
  if (!account.client_email || !account.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const pem = String(account.private_key).replace(/\\n/g, "\n");
  const keyBytes = Uint8Array.from(
    atob(
      pem.replace(
        /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
        "",
      ),
    ),
    (char) => char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      `Google OAuth failed: ${
        tokenData.error_description || tokenData.error || tokenResponse.status
      }`,
    );
  }
  return tokenData.access_token as string;
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000\-‐‑‒–—―_.,，。:：/\\()[\]{}「」『』【】]/g, "");
}

function sheetSubject(subject: string) {
  if (subject === "数学") return "math";
  if (subject === "物理") return "physics";
  if (subject.startsWith("化学")) return "chemistry";
  return "other";
}

function validatePayload(item: ReviewItem, event: ReviewEvent) {
  if (!item?.id || !item?.subject || !item?.source) {
    throw new Error("Invalid item payload");
  }
  if (!event?.id || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    throw new Error("Invalid event payload");
  }
  if (!["○", "△", "×"].includes(event.rating)) {
    throw new Error("Invalid rating");
  }
}

async function sheetRequest(
  accessToken: string,
  url: string,
  init: RequestInit = {},
) {
  const result = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await result.json();
  if (!result.ok) {
    throw new Error(
      `Google Sheets API failed: ${data.error?.message || result.status}`,
    );
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return response({ status: "error", message: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return response(
        { status: "error", message: "Missing authorization" },
        401,
      );
    }

    const authClient = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: authorization } },
      },
    );
    const { data: authData, error: authError } = await authClient.auth
      .getUser();
    if (authError || !authData.user) {
      return response({ status: "error", message: "Invalid session" }, 401);
    }

    const { item, event } = await req.json() as {
      item: ReviewItem;
      event: ReviewEvent;
    };
    validatePayload(item, event);

    const spreadsheetId = requiredEnv("GOOGLE_SPREADSHEET_ID");
    const sheetName = Deno.env.get("GOOGLE_SHEET_NAME") || "learning_log";
    const accessToken = await googleAccessToken(
      requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON"),
    );
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }`;
    const spreadsheetMeta = await sheetRequest(
      accessToken,
      `${baseUrl}?fields=sheets(properties(sheetId,title),tables(tableId,name,range))`,
    );
    const sheetMeta = spreadsheetMeta.sheets?.find(
      (sheet: { properties?: { title?: string } }) =>
        sheet.properties?.title === sheetName,
    );
    if (!sheetMeta?.properties?.sheetId) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    const tableMeta = sheetMeta.tables?.find(
      (table: { name?: string }) => table.name === "LearningLogTable",
    ) || sheetMeta.tables?.[0];
    const readRange = encodeURIComponent(`${sheetName}!A:AA`);
    const sheetData = await sheetRequest(
      accessToken,
      `${baseUrl}/values/${readRange}?majorDimension=ROWS`,
    );
    const values = Array.isArray(sheetData.values)
      ? sheetData.values as string[][]
      : [];
    if (!values.length) throw new Error("learning_log has no header row");

    const headers = values[0].map(String);
    const index = new Map(headers.map((name, i) => [name, i]));
    const requiredHeaders = [
      "date",
      "subject",
      "source",
      "question_id",
      "record_scope",
      "attempt_number",
      "seen_before",
      "correct",
      "error_group",
      "mastery_note",
      "notes",
      "eju_review_id",
      "review_event_id",
    ];
    const missing = requiredHeaders.filter((name) => !index.has(name));
    if (missing.length) {
      throw new Error(`learning_log is missing columns: ${missing.join(", ")}`);
    }

    const rows: SheetRow[] = values.slice(1).map((row, i) => ({
      rowNumber: i + 2,
      values: row.map((value) => String(value ?? "")),
    }));
    const get = (row: SheetRow, name: string) =>
      row.values[index.get(name)!] || "";

    const duplicate = rows.find((row) =>
      get(row, "review_event_id") === event.id
    );
    if (duplicate) {
      return response({
        status: "synced",
        message: "Event was already present; no duplicate row was added.",
        rowNumber: duplicate.rowNumber,
      });
    }

    let linked = rows.filter((row) => get(row, "eju_review_id") === item.id);
    if (!linked.length) {
      const itemKey = normalizeKey(item.source);
      const candidates = rows.filter((row) => {
        if (get(row, "eju_review_id")) return false;
        if (get(row, "subject") !== sheetSubject(item.subject)) return false;
        return Boolean(itemKey) &&
          normalizeKey(`${get(row, "source")} ${get(row, "question_id")}`) ===
            itemKey;
      });
      if (!candidates.length) {
        return response({
          status: "unmatched",
          message: "No exact subject + source + question_id match was found.",
        });
      }
      if (candidates.length > 1) {
        return response({
          status: "ambiguous",
          message:
            `Found ${candidates.length} exact candidates; automatic linking was skipped.`,
        });
      }
      const baseline = candidates[0];
      const linkRange = encodeURIComponent(
        `${sheetName}!Z${baseline.rowNumber}:Z${baseline.rowNumber}`,
      );
      await sheetRequest(
        accessToken,
        `${baseUrl}/values/${linkRange}?valueInputOption=RAW`,
        { method: "PUT", body: JSON.stringify({ values: [[item.id]] }) },
      );
      while (baseline.values.length < headers.length) baseline.values.push("");
      baseline.values[index.get("eju_review_id")!] = item.id;
      linked = [baseline];
    }

    const template = linked.slice().sort((a, b) => {
      const aAttempt = Number(get(a, "attempt_number")) ||
        Number.MAX_SAFE_INTEGER;
      const bAttempt = Number(get(b, "attempt_number")) ||
        Number.MAX_SAFE_INTEGER;
      return aAttempt - bAttempt || a.rowNumber - b.rowNumber;
    })[0];
    const maxAttempt = rows
      .filter((row) =>
        get(row, "eju_review_id") === item.id ||
        row.rowNumber === template.rowNumber
      )
      .reduce(
        (max, row) => Math.max(max, Number(get(row, "attempt_number")) || 0),
        0,
      );

    const output: Array<string | number> = new Array(headers.length).fill("");
    const set = (name: string, value: string | number) =>
      output[index.get(name)!] = value;
    set("date", event.date);
    set("subject", get(template, "subject"));
    set("topic", get(template, "topic"));
    set("source", get(template, "source"));
    set("assessment_id", get(template, "assessment_id"));
    set("question_id", get(template, "question_id"));
    set("variant_family", get(template, "variant_family"));
    set("record_scope", "selected_item");
    set("attempt_number", Math.max(1, maxAttempt) + 1);
    set("seen_before", "1");
    set("correct", event.rating === "×" ? "0" : "1");
    set("error_group", event.rating === "×" ? "U" : "");
    set(
      "mastery_note",
      event.rating === "○"
        ? "fast recall"
        : event.rating === "△"
        ? "recalled but slow"
        : "could not recall approach",
    );
    set("notes", `eju-review rating=${event.rating}`);
    set("eju_review_id", item.id);
    set("review_event_id", event.id);

    const appendRange = encodeURIComponent(`${sheetName}!A:AA`);
    const appendData = await sheetRequest(
      accessToken,
      `${baseUrl}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [output] }) },
    );
    const appendedRange = String(appendData.updates?.updatedRange || "");
    const appendedRow = Number(
      appendedRange.match(/(\d+)(?::[A-Z]+(\d+))?$/)?.[2] ||
        appendedRange.match(/(\d+)(?::[A-Z]+\d+)?$/)?.[1] || 0,
    );
    if (tableMeta?.tableId && appendedRow) {
      await sheetRequest(accessToken, `${baseUrl}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: [{
            updateTable: {
              table: {
                tableId: tableMeta.tableId,
                range: {
                  sheetId: sheetMeta.properties.sheetId,
                  startRowIndex: tableMeta.range?.startRowIndex || 0,
                  endRowIndex: appendedRow,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
              },
              fields: "range",
            },
          }],
        }),
      });
    }
    return response({
      status: "synced",
      message: "A new review attempt was appended to learning_log.",
      updatedRange: appendedRange || null,
    });
  } catch (error) {
    console.error(error);
    return response({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
