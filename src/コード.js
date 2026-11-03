// 接続設定はスクリプトプロパティから取得する。
const ACCESS_TOKEN = SETTINGS_property_('ACCESS_TOKEN');

const LINE_ENDPOINT_REPLY = "https://api.line.me/v2/bot/message/reply";
const LINE_ENDPOINT_PUSH  = "https://api.line.me/v2/bot/message/push";

// ▼スプレッドシート関係
const SHEET_ID = SETTINGS_property_('SHEET_ID');

// 相手にも通知（必要ならIDをセット）
const USER_A = SETTINGS_property_('USER_A');
const USER_B = SETTINGS_property_('USER_B');

// 実行ごとに1回だけ接続する。別の実行にはキャッシュを持ち越さない。
let spreadsheetCache_;
function getSpreadsheet_() {
  if (!spreadsheetCache_) spreadsheetCache_ = SpreadsheetApp.openById(SHEET_ID);
  return spreadsheetCache_;
}

function getSheetFixedItems_() {
  // 費目マスタ（項目・固定費）
  return getSpreadsheet_().getSheetByName("項目・固定費");
}

function getSheetUchiwake_() {
  // 登録先（内訳）
  return getSpreadsheet_().getSheetByName("内訳");
}

// ================================
// doGet: 費目リスト取得API
//   /exec?action=himo
// ================================
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";

  if (action === "himo") {
    const list = getFixedHimoList_(); // ["水道","電気",...]
    return ContentService
      .createTextOutput(JSON.stringify(list))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function getFixedHimoList_() {
  const sheet = getSheetFixedItems_();
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // A1ヘッダー、データなし

  // A2:A だけ取得
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  const list = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    const s = (v === null || v === undefined) ? "" : String(v).trim();
    if (!s) continue;
    list.push(s);
  }

  // 重複除去
  return Array.from(new Set(list));
}

// ================================
// doPost: LINE Webhook
// ================================
function doPost(e) {
  const json = JSON.parse(e.postData.contents);

  const replyToken = json && json.events && json.events[0] && json.events[0].replyToken;
  if (!replyToken) return;

  const event = json.events[0];

  // 送信者ユーザーID
  const userId = event && event.source && event.source.userId ? event.source.userId : "";

  // ----------------
  // Postback処理
  // ----------------
  if (event.type === "postback") {
    const data = (event.postback && event.postback.data) ? String(event.postback.data) : "";

    // data例:
    //   action=Register&day=...&item=...&amount=...&memo=...
    const postbackData = parsePostbackData_(data);

    if (postbackData.action === "Register") {
      // day,item,amount,memo を配列にして既存登録関数へ
      const arr = [
        decodeURIComponentSafe_(postbackData.day),
        decodeURIComponentSafe_(postbackData.item),
        decodeURIComponentSafe_(postbackData.amount),
        decodeURIComponentSafe_(postbackData.memo)
      ];

      const validate = isValid_(arr);
      if (validate !== "OK") {
        replyMessage_(replyToken, validate);
        return;
      }

      const result = registData_(arr);

      // 返信
      replyMessage_(replyToken, result.selfMsg);

      // 相手にも通知
      if (userId === USER_A) {
        replyMessageToUser_(USER_B, result.otherMsg);
      } else if (userId === USER_B) {
        replyMessageToUser_(USER_A, result.otherMsg);
      }
      return;
    }

    if (postbackData.action === "calcSubjectSum") {
      const msg = calcSubjectSum_();
      replyMessage_(replyToken, msg);
      return;
    }

    // それ以外はキャンセル扱い
    replyMessage_(replyToken, "キャンセルしました。");
    return;
  }

  // ----------------
  // Message処理
  // ----------------
  if (event.type !== "message" || !event.message || event.message.type !== "text") {
    replyMessage_(replyToken, "テキストで送ってください。");
    return;
  }

  const userMessage = event.message.text || "";

  // 想定:
  //   0: "YYYY年M月" or "YYYY/MM/DD" 等
  //   1: "費目"
  //   2: "1234円"
  //   3: "メモ" (任意)
  const arr = String(userMessage).split(/\r\n|\n/);

  const validate = isValid_(arr);
  if (validate !== "OK") {
    replyMessage_(replyToken, validate);
    return;
  }

  const result = registData_(arr);

  // 返信
  replyMessage_(replyToken, result.selfMsg);

  // 相手にも通知（必要な場合のみ）
  if (userId === USER_A) {
    replyMessageToUser_(USER_B, result.otherMsg);
  } else if (userId === USER_B) {
    replyMessageToUser_(USER_A, result.otherMsg);
  }
}

// ================================
// LINE送信（Reply / Push）
// ================================
function replyMessage_(replyToken, message) {
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "Authorization": "Bearer " + ACCESS_TOKEN
  };

  const payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: message }]
  };

  const options = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload)
  };

  UrlFetchApp.fetch(LINE_ENDPOINT_REPLY, options);
}

function replyMessageToUser_(toUserId, message) {
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "Authorization": "Bearer " + ACCESS_TOKEN
  };

  const payload = {
    to: toUserId,
    messages: [{ type: "text", text: message }]
  };

  const options = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload)
  };

  UrlFetchApp.fetch(LINE_ENDPOINT_PUSH, options);
}

// ================================
// 入力日付を Date に変換
//   対応:
//     "YYYY年M月"（LIFFからの入力）
//     "YYYY/MM/DD" , "YYYY-MM-DD"
//     "YYYY/MM" , "YYYY-MM"
// ================================
function parseInputDate_(s) {
  const now = new Date();
  const str = String(s || "").trim();

  // "YYYY年M月"
  let m = str.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);

    const today = new Date();
    const todayDate = today.getDate(); // 当日の日付（1〜31）

    return new Date(y, mo - 1, todayDate);
  }

  const normalized = str.replace(/-/g, "/");

  // YYYY/MM/DD
  m = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // YYYY/MM
  m = normalized.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return now;
}

// ================================
// 登録後にソートし、当月より前の行をグループ化して折りたたむ。
// 関数名は既存トリガーとの互換性のため維持する。
// ================================
function sortAndHideBeforeThisMonth_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return;

  const startRow = 2;
  const count = lastRow - 1;
  sheet.showRows(startRow, count);
  sheet.getRange(startRow, 1, count, lastCol).sort({ column: 1, ascending: true });

  const dateRange = sheet.getRange(startRow, 1, count, 1);
  const dates = dateRange.getValues();
  dateRange.shiftRowGroupDepth(-8);
  sheet.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE);

  const timeZone = sheet.getParent().getSpreadsheetTimeZone();
  const currentMonth = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM');
  let groupStart = -1;
  for (let i = 0; i <= dates.length; i++) {
    const value = i < dates.length ? dates[i][0] : null;
    const date = value ? (value instanceof Date ? value : new Date(value)) : null;
    const isPast = date && !isNaN(date.getTime()) &&
      Utilities.formatDate(date, timeZone, 'yyyy-MM') < currentMonth;
    if (isPast && groupStart === -1) groupStart = i;
    if (!isPast && groupStart !== -1) {
      const row = startRow + groupStart;
      sheet.getRange(row, 1, i - groupStart, 1).shiftRowGroupDepth(1);
      sheet.getRowGroup(row, 1).collapse();
      groupStart = -1;
    }
  }
}

// ================================
// スプレッドシートへの書き込み
// ================================
function registData_(arr) {
  const sheet = getSheetUchiwake_();

  const dateObj = parseInputDate_(arr[0]);
  const himo = String(arr[1] || "").trim();
  const amount = String(arr[2] || "").replace(/円/g, "").trim();
  const memo = (arr.length >= 4) ? String(arr[3] || "").trim() : "";

  const lastRow = sheet.getLastRow();
  const targetRow = lastRow + 1;

  sheet.getRange(targetRow, 1, 1, 4).setValues([[dateObj, himo, amount, memo]]);

  // 登録後：ソート + 当月より前の行をグループ化して折りたたむ
  sortAndHideBeforeThisMonth_(sheet);

  const selfMsg =
    `${arr[0]}に${himo}${memo ? `(${memo})` : ""}として${arr[2]}を登録しました。`;
  const otherMsg =
    `${arr[0]}に${himo}${memo ? `(${memo})` : ""}として${arr[2]}が登録されました。`;

  return { selfMsg: selfMsg, otherMsg: otherMsg };
}

// ================================
// 値のチェック
// ================================
function isValid_(arr) {
  if (!arr || arr.length < 3) {
    return "入力形式が違います。\n例:\n2026年3月\n食費\n1200円\n（メモ任意）";
  }

  const dateStr = String(arr[0] || "").trim();
  const himo = String(arr[1] || "").trim();
  const amountStr = String(arr[2] || "").trim();

  // 日付チェック
  const d = parseInputDate_(dateStr);
  if (!d || isNaN(d.getTime())) {
    return "年月の形式が違います。\n例: 2026年3月";
  }

  // 金額チェック
  const amount = String(amountStr).replace(/円/g, "").trim();
  if (amount === "" || isNaN(Number(amount))) {
    return "金額を正しく入力してください";
  }

  // 費目チェック（「項目・固定費」から）
  const list = getFixedHimoList_();
  const exists = list.indexOf(himo) !== -1;

  if (!exists) {
    return "費目に存在しません： " + himo;
  }

  return "OK";
}

function calcSubjectSum_() {
  let result = "";

  const ss = getSpreadsheet_();

  const now = new Date();
  const yearString = String(now.getFullYear());         // 例: "2026"
  const resultSheet = ss.getSheetByName(yearString);    // 年シート

  if (!resultSheet) {
    return `シート「${yearString}」が見つかりません。`;
  }

  const lastRow = resultSheet.getLastRow();
  if (lastRow < 2) {
    return `シート「${yearString}」にデータがありません。`;
  }

  const currentMonthIndex = new Date().getMonth(); // 0=1月 ... 11=12月

  // 科目名と12か月の値を一度に取得する。
  const rows = resultSheet.getRange(2, 1, lastRow - 1, 13).getValues();

  // 「余り」行まで出す（余り行も含む）
  for (let i = 0; i < rows.length; i++) {
    const subjectName = rows[i][0];

    if (subjectName === "" || subjectName === null || subjectName === undefined) continue;

    const monthValueForSubject = rows[i][currentMonthIndex + 1]; // 当月

    result += `${subjectName}: ${monthValueForSubject}円\n`;

    // 「余り」行に到達したらそこで終了（余りまででいい）
    if (String(subjectName).trim() === "余り") {
      break;
    }
  }

  return result.trim();
}

// ================================
// Postback data を "a=b&c=d" → {a:"b",c:"d"} に変換
// ================================
function parsePostbackData_(data) {
  const out = {};
  const s = String(data || "");
  if (!s) return out;

  const parts = s.split("&");
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split("=");
    const k = kv[0] ? String(kv[0]) : "";
    const v = (kv.length >= 2) ? String(kv.slice(1).join("=")) : "";
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function decodeURIComponentSafe_(s) {
  const str = (s === null || s === undefined) ? "" : String(s);
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

// トリガーから実行する関数
function sortAndHideBeforeThisMonth() {
  const sheet = getSheetUchiwake_();
  if (!sheet) {
    throw new Error("シート「内訳」が見つかりません。");
  }

  sortAndHideBeforeThisMonth_(sheet);
}

// ================================
// （任意）ログ
// ================================
function logToSheet(message) {
  const ss = getSpreadsheet_();
  const logSheet = ss.getSheetByName("ログ");
  if (!logSheet) return;
  const lastRow = logSheet.getLastRow();
  logSheet.getRange(lastRow + 1, 1).setValue(message);
}
// 秘密情報をソースに保持しない。任意の通知先は空文字で登録できる。
function SETTINGS_property_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value === null) throw new Error('スクリプトプロパティが未登録です：' + key);
  return value;
}
