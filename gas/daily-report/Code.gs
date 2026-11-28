/**
 * 日販廃棄アプリ 毎朝の日報メール（Google Apps Script）
 *
 * 毎朝5時台に dailyJob() が自動で動き、次の2つを行う。
 *   1. 作業割当アプリの時間帯データ（直近7日分）を日販廃棄アプリへ取り込む
 *      （アプリの「時間帯取込」ボタンと同じ6項目だけを書き込む。日販・廃棄には触れない）
 *   2. 前日の 日販・客数・廃棄・各店の状況 と、時間帯データとのずれ をメールで報告する
 *
 * 宛先：スクリプトの持ち主（To）＋ 従業員マスタのうち、アプリで選んだ役職の在職者（BCC）。
 *       全員に3店舗分を送る。
 *
 * 初回だけ setup() を実行して「許可」する。以後は毎朝自動で動く。
 * 動かなかった場合（エラー）も、その内容をメールで知らせる。
 */

const CONFIG = {
    NHK_PROJECT: 'hattyuu-kanri-app-test',
    NHK_REPORTS: 'artifacts/hattyuu-kanri-app-test/public/data/daily_reports',
    SAGYOU_PROJECT: 'new-check-137f9',
    SAGYOU_HOURLY: 'hourly_metrics',
    SAGYOU_STORES: 'artifacts/general-master-data/public/data/stores',
    SAGYOU_EMPLOYEES: 'artifacts/general-master-data/public/data/employees',
    // 宛先の役職はアプリの「日報メール設定」画面で選ぶ。ここはその保存先
    MAIL_SETTINGS: 'artifacts/hattyuu-kanri-app-test/public/data/app_settings/daily_report_mail',
    DEFAULT_ROLES: ['リーダー', 'クルー', '経営者', '本部OFC'],  // 設定が未保存のときの役職
    STORE_NAMES: ['伊賀平野東町店', '伊賀平野北谷店', '伊賀忍者市駅南店'],
    IMPORT_DAYS: 7,                 // 毎朝、直近何日分の時間帯データを取り込み直すか
    BACKFILL_FROM: '2026-08-03',    // backfillHourly() で取り込む開始日
    ALERT_CUSTOMERS_DIFF: 1,        // 客数がこの人数以上ずれたら要確認
    ALERT_SALES_DIFF: 10000,        // 売上がこの金額以上ずれたら要確認（1,000円単位の丸め誤差は無視）
    RUN_HOUR: 5,                    // 毎朝この時台に実行
    MAIL_TO: '',                    // 宛先（To）。空欄ならこのスクリプトの持ち主の Gmail。役職の人たちは BCC で送る
    APP_URL: 'https://nippan-haiki-app.web.app/',
};

const WASTE_FIELDS = [
    { key: 'waste_product', label: '商品廃棄' },
    { key: 'waste_owner_8', label: 'オーナー値下げ8%' },
    { key: 'waste_owner_10', label: 'オーナー値下げ10%' },
    { key: 'waste_promo_8', label: '販促値下げ8%' },
    { key: 'waste_promo_10', label: '販促値下げ10%' },
];

const HOURLY_FIELDS = ['hourlyData', 'hourly_hoursFilled', 'hourly_customers_sum', 'hourly_sales_sum', 'hourly_syncedAt', 'hourly_sourceId'];

// =============================================================================
// 入口（トリガー・手動実行用）
// =============================================================================

/** 毎朝の本処理。トリガーから呼ばれる */
function dailyJob() {
    try {
        const yesterday = addDays(todayJst(), -1);
        const imported = importHourly(addDays(yesterday, -(CONFIG.IMPORT_DAYS - 1)), yesterday);
        sendDailyReport(yesterday, imported, true);
    } catch (e) {
        notifyError('毎朝の日報メール', e);
        throw e;
    }
}

/** 初回に1回だけ実行する：毎朝5時台のトリガーを作り直す */
function setup() {
    ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === 'dailyJob')
        .forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('dailyJob')
        .timeBased()
        .atHour(CONFIG.RUN_HOUR)
        .everyDays(1)
        .inTimezone('Asia/Tokyo')
        .create();
    setupWeekly();   // 週1回の分析メール（Weekly.gs）のトリガーも作る
    // 両プロジェクトに読み取りできるか確認しておく
    resolveStores();
    const r = resolveRecipients();
    Logger.log(`設定完了：毎朝 ${CONFIG.RUN_HOUR}時台に dailyJob を実行します。To：${mailTo()} ／ BCC ${r.emails.length}人（${r.roles.join('・')}）`);
}

/** 試しに今すぐ前日分の日報メールを送る（取り込みはしない・自分にだけ送る） */
function sendTestReport() {
    sendDailyReport(addDays(todayJst(), -1), null, false);
}

/** 今の設定で誰に届くかをログに出すだけ（送信はしない） */
function checkRecipients() {
    const r = resolveRecipients();
    Logger.log(`配信：${r.enabled ? 'オン' : 'オフ（自分にだけ届く）'} ／ 役職：${r.roles.join('・')}`);
    Logger.log(`To：${mailTo()}`);
    r.list.forEach(x => Logger.log(`BCC：${x.name}（${x.role}・${x.store}）`));
    r.skipped.forEach(x => Logger.log(`対象外：${x.name}（${x.role}）… ${x.reason}`));
}

/** 8/3 以降の取り込み漏れをまとめて取り込む（必要なときに1回だけ手動実行） */
function backfillHourly() {
    const result = importHourly(CONFIG.BACKFILL_FROM, addDays(todayJst(), -1));
    Logger.log(JSON.stringify(result));
}

// =============================================================================
// 時間帯データの取り込み
// =============================================================================

function importHourly(fromStr, toStr) {
    const stores = resolveStores();
    const dates = dateRange(fromStr, toStr);
    const pairs = [];
    stores.forEach(s => dates.forEach(d => pairs.push({ store: s, date: d })));

    const srcDocs = fsGetMany(pairs.map(p => [CONFIG.SAGYOU_PROJECT, `${CONFIG.SAGYOU_HOURLY}/${p.store.sagyouId}_${p.date}`]));
    const tgtDocs = fsGetMany(pairs.map(p => [CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${p.date}_${p.store.name}`]));

    const writes = [];
    let unchanged = 0, noSource = 0;
    pairs.forEach((p, i) => {
        const src = srcDocs[i];
        const rawHourly = src && src.fields && src.fields.hourlyData;
        if (!rawHourly || !rawHourly.mapValue || !rawHourly.mapValue.fields || Object.keys(rawHourly.mapValue.fields).length === 0) {
            noSource++;
            return;
        }
        const tgt = tgtDocs[i];
        const tgtHourly = tgt && tgt.fields && tgt.fields.hourlyData;
        if (tgtHourly && stableStringify(fsDecode(tgtHourly)) === stableStringify(fsDecode(rawHourly))) {
            unchanged++;
            return;
        }
        const sum = summarizeHourly(fsDecode(rawHourly));
        const fields = {
            hourlyData: rawHourly,                                   // 作業割当側の値をそのまま写す
            hourly_hoursFilled: fsEncode(sum.hoursFilled),
            hourly_customers_sum: fsEncode(sum.custSum),
            hourly_sales_sum: fsEncode(sum.salesSum),
            hourly_syncedAt: { timestampValue: new Date().toISOString() },
            hourly_sourceId: fsEncode(`${p.store.sagyouId}_${p.date}`),
        };
        const mask = HOURLY_FIELDS.slice();
        // 取り込み先がまだ無い日だけ store / date を補う（アプリと同じ扱い）
        if (!tgt) {
            fields.store = fsEncode(p.store.name);
            fields.date = { timestampValue: jstMidnightIso(p.date) };
            mask.push('store', 'date');
        }
        writes.push([CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${p.date}_${p.store.name}`, fields, mask]);
    });
    fsPatchMany(writes);
    return { from: fromStr, to: toStr, written: writes.length, unchanged, noSource };
}

function resolveStores() {
    const docs = fsList(CONFIG.SAGYOU_PROJECT, CONFIG.SAGYOU_STORES);
    const idByName = {};
    docs.forEach(d => {
        const name = fsDecodeDoc(d).name;
        if (name) idByName[name] = d.name.split('/').pop();
    });
    return CONFIG.STORE_NAMES.map(name => {
        if (!idByName[name]) throw new Error(`作業割当アプリの店舗マスタに「${name}」が見つかりません`);
        return { name, sagyouId: idByName[name] };
    });
}

// =============================================================================
// 日報メール
// =============================================================================

function sendDailyReport(dateStr, imported, toEveryone) {
    const stores = resolveStores();
    const lyStr = addDays(dateStr, -364);
    const reqs = [];
    stores.forEach(s => {
        reqs.push([CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${dateStr}_${s.name}`]);
        reqs.push([CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${lyStr}_${s.name}`]);
        reqs.push([CONFIG.SAGYOU_PROJECT, `${CONFIG.SAGYOU_HOURLY}/${s.sagyouId}_${dateStr}`]);
    });
    const docs = fsGetMany(reqs);
    const inputs = stores.map((s, i) => ({
        name: s.name,
        daily: docs[i * 3] ? fsDecodeDoc(docs[i * 3]) : null,
        dailyLy: docs[i * 3 + 1] ? fsDecodeDoc(docs[i * 3 + 1]) : null,
        hourly: docs[i * 3 + 2] ? (fsDecodeDoc(docs[i * 3 + 2]).hourlyData || null) : null,
    }));
    const report = buildReport(dateStr, inputs, imported);
    const msg = { to: mailTo(), subject: report.subject, htmlBody: report.html, body: report.text, name: '日販廃棄アプリ' };
    if (toEveryone) {
        const r = resolveRecipients();
        const bcc = r.enabled ? r.emails.filter(e => e.toLowerCase() !== mailTo().toLowerCase()) : [];
        if (bcc.length) msg.bcc = bcc.join(',');
    }
    MailApp.sendEmail(msg);
}

/** アプリの設定（役職）と従業員マスタから、BCC の宛先を決める */
function resolveRecipients() {
    const [settingsDoc] = fsGetMany([[CONFIG.NHK_PROJECT, CONFIG.MAIL_SETTINGS]]);
    const settings = settingsDoc ? fsDecodeDoc(settingsDoc) : {};
    const employees = fsList(CONFIG.SAGYOU_PROJECT, CONFIG.SAGYOU_EMPLOYEES).map(fsDecodeDoc);
    const stores = {};
    fsList(CONFIG.SAGYOU_PROJECT, CONFIG.SAGYOU_STORES).forEach(d => { stores[d.name.split('/').pop()] = fsDecodeDoc(d).name; });
    return pickRecipients(settings, employees, todayJst(), stores);
}

function mailTo() {
    return CONFIG.MAIL_TO || Session.getEffectiveUser().getEmail();
}

function notifyError(title, e) {
    try {
        MailApp.sendEmail({
            to: mailTo(),
            subject: `【日報】⚠️ ${title}が失敗しました`,
            body: `${title}の実行中にエラーが起きました。\n\n${e && e.stack ? e.stack : e}\n\n` +
                `今朝の日報メールは届いていません。時間帯データの取り込みも行われていない可能性があります。`,
            name: '日販廃棄アプリ',
        });
    } catch (ignore) { /* 通知自体の失敗は握りつぶす（ログには残る） */ }
}

// ---- ここから下は Firestore にも Gmail にも触れない純粋な処理 ----

/**
 * 宛先の選び方（アプリの「日報メール設定」画面と同じ規則）
 *   ・選んだ役職であること
 *   ・在職中（退職日が空、または今日より後）
 *   ・メールアドレスが正しい形
 *   ・同じアドレスは1回だけ
 */
function pickRecipients(settings, employees, todayStr, storeNames) {
    const roles = Array.isArray(settings.roles) ? settings.roles : CONFIG.DEFAULT_ROLES;
    const enabled = settings.enabled !== false;
    const list = [], skipped = [], seen = {};
    employees.forEach(e => {
        if (!roles.includes(e.role) || e.archivedDuplicate) return;
        const name = employeeName(e);
        const retire = typeof e.retirementDate === 'string' ? e.retirementDate.trim() : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(retire) && retire <= todayStr) return;   // 退職者は黙って除く
        const email = typeof e.email === 'string' ? e.email.trim() : '';
        if (!isValidEmail(email)) { skipped.push({ name, role: e.role, reason: 'メールアドレス未登録・形式不正' }); return; }
        const key = email.toLowerCase();
        if (seen[key]) { skipped.push({ name, role: e.role, reason: '同じアドレスが重複' }); return; }
        seen[key] = true;
        list.push({ name, role: e.role, store: (storeNames && storeNames[e.store]) || e.store || '', email });
    });
    return { enabled, roles, list, skipped, emails: list.map(x => x.email) };
}

function employeeName(e) {
    return `${(e.lastName || '').trim()} ${(e.firstName || '').trim()}`.trim() || (e.nickname || '').trim() || '(名前なし)';
}

function isValidEmail(s) {
    return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);
}

function summarizeHourly(hourlyData) {
    let hoursFilled = 0, custSum = 0, salesSum = 0;
    for (let h = 0; h < 24; h++) {
        const e = hourlyData && hourlyData[String(h)];
        if (!e) continue;
        hoursFilled++;
        if (typeof e.customers === 'number') custSum += e.customers;
        if (typeof e.sales === 'number') salesSum += e.sales;
    }
    return { hoursFilled, custSum, salesSum };
}

function numOrNull(v) {
    return typeof v === 'number' && !isNaN(v) ? v : null;
}

function analyzeStore(input) {
    const d = input.daily || {};
    const ly = input.dailyLy || {};
    const a = { name: input.name };
    a.sales = numOrNull(d.sales);
    a.customers = numOrNull(d.customers);
    a.spend = (a.sales !== null && a.customers) ? a.sales / a.customers : null;
    a.lySales = numOrNull(ly.sales);
    a.lyCustomers = numOrNull(ly.customers);
    a.lySpend = (a.lySales !== null && a.lyCustomers) ? a.lySales / a.lyCustomers : null;
    a.waste = WASTE_FIELDS.map(f => ({ label: f.label, value: numOrNull(d[f.key]) }));
    a.hasWaste = a.waste.some(w => w.value !== null);
    a.wasteTotal = a.hasWaste ? a.waste.reduce((s, w) => s + (w.value || 0), 0) : null;
    a.wasteRate = (a.wasteTotal !== null && a.sales) ? a.wasteTotal / a.sales : null;
    a.weather = d.weather || null;
    a.inputBySales = d.inputBy_sales || '';
    a.inputByWaste = d.inputBy_waste || '';

    a.hourly = input.hourly && Object.keys(input.hourly).length > 0 ? summarizeHourly(input.hourly) : null;
    a.custDiff = (a.hourly && a.customers !== null) ? a.hourly.custSum - a.customers : null;
    a.salesDiff = (a.hourly && a.sales !== null) ? a.hourly.salesSum - a.sales : null;

    a.alerts = [];    // ずれ（要確認）
    a.notices = [];   // 未入力など
    if (a.sales === null) a.notices.push('日販が未入力');
    else if (a.customers === null) a.notices.push('客数が未入力');
    if (!a.hasWaste) a.notices.push('廃棄が未入力');
    if (!a.hourly) a.notices.push('時間帯データ（作業割当アプリ）が未入力');
    else if (a.hourly.hoursFilled < 24) a.notices.push(`時間帯データが${a.hourly.hoursFilled}時間分しかない`);

    if (a.custDiff !== null && Math.abs(a.custDiff) >= CONFIG.ALERT_CUSTOMERS_DIFF) {
        a.alerts.push(`客数がずれています：日販入力 ${fmtInt(a.customers)}人 ／ 時間帯合計 ${fmtInt(a.hourly.custSum)}人（差 ${fmtSigned(a.custDiff)}人）`);
    }
    if (a.salesDiff !== null && Math.abs(a.salesDiff) >= CONFIG.ALERT_SALES_DIFF) {
        a.alerts.push(`売上がずれています：日販入力 ${fmtYen(a.sales)} ／ 時間帯合計 ${fmtYen(a.hourly.salesSum)}（差 ${fmtSigned(a.salesDiff)}円）`);
    }
    // 売上欄と客数欄の取り違え（アプリの時間帯取込画面と同じ判定）
    if (a.salesDiff !== null && Math.abs(a.salesDiff) > 50000 && (
        (a.customers !== null && Math.abs(a.hourly.salesSum / 1000 - a.customers) < 2) ||
        Math.abs(a.sales / 1000 - a.hourly.custSum) < 2)) {
        a.alerts.push('売上欄と客数欄の取り違えの疑いがあります');
    }
    return a;
}

function buildReport(dateStr, inputs, imported) {
    const stores = inputs.map(analyzeStore);
    const lyStr = addDays(dateStr, -364);
    // 合計は、日販と客数がそろっている店だけで出す（未入力の店があっても他の店の合計は見られるように）
    const complete = stores.filter(s => s.sales !== null && s.customers !== null);
    const sum = (list, key) => list.length === 0 ? null : list.reduce((x, s) => x + s[key], 0);
    const lyComplete = complete.filter(s => s.lySales !== null && s.lyCustomers !== null);
    const total = {
        storeCount: complete.length,
        missingStores: stores.filter(s => !complete.includes(s)).map(s => shortName(s.name)),
        sales: sum(complete, 'sales'),
        customers: sum(complete, 'customers'),
        // 前年比は、前年の値もある店どうしで比べる
        cmpSales: sum(lyComplete, 'sales'), cmpCustomers: sum(lyComplete, 'customers'),
        lySales: sum(lyComplete, 'lySales'), lyCustomers: sum(lyComplete, 'lyCustomers'),
    };
    const wasteStores = complete.filter(s => s.wasteTotal !== null);
    total.wasteTotal = sum(wasteStores, 'wasteTotal');
    const wasteSales = sum(wasteStores, 'sales');
    total.spend = (total.sales !== null && total.customers) ? total.sales / total.customers : null;
    total.cmpSpend = (total.cmpSales !== null && total.cmpCustomers) ? total.cmpSales / total.cmpCustomers : null;
    total.lySpend = (total.lySales !== null && total.lyCustomers) ? total.lySales / total.lyCustomers : null;
    total.wasteRate = (total.wasteTotal !== null && wasteSales) ? total.wasteTotal / wasteSales : null;
    total.label = total.missingStores.length === 0 ? '3店合計' : `${total.storeCount}店合計（${total.missingStores.join('・')}は未入力のため除く）`;
    total.shortLabel = `${total.storeCount}店計`;

    const alertCount = stores.reduce((n, s) => n + s.alerts.length, 0);
    const noticeCount = stores.reduce((n, s) => n + s.notices.length, 0);
    const label = dateLabel(dateStr);

    let subject = `【日報】${label}`;
    if (total.sales !== null) {
        subject += ` ${total.shortLabel} ${fmtYen(total.sales)}`;
        if (total.lySales) subject += `（前年同曜比${fmtPct(total.cmpSales / total.lySales)}）`;
    }
    subject += alertCount > 0 ? ` ⚠️要確認${alertCount}件` : (noticeCount > 0 ? ` ／未入力あり` : ' ✅ずれなし');

    return {
        subject,
        html: buildHtml(dateStr, lyStr, stores, total, imported),
        text: buildText(dateStr, stores, total, alertCount),
    };
}

// ---- HTML 組み立て ----

const CSS = {
    wrap: 'font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;color:#1f2937;max-width:760px;',
    h1: 'font-size:20px;margin:0 0 4px;',
    sub: 'font-size:12px;color:#6b7280;margin:0 0 16px;',
    h2: 'font-size:15px;margin:22px 0 8px;padding-left:8px;border-left:4px solid #3b82f6;',
    table: 'border-collapse:collapse;width:100%;font-size:13px;',
    th: 'background:#f3f4f6;border:1px solid #e5e7eb;padding:6px 8px;text-align:left;font-weight:600;white-space:nowrap;',
    thNum: 'background:#f3f4f6;border:1px solid #e5e7eb;padding:6px 8px;text-align:right;font-weight:600;white-space:nowrap;',
    td: 'border:1px solid #e5e7eb;padding:6px 8px;white-space:nowrap;',
    tdNum: 'border:1px solid #e5e7eb;padding:6px 8px;text-align:right;white-space:nowrap;',
    tdTotal: 'border:1px solid #e5e7eb;padding:6px 8px;text-align:right;white-space:nowrap;font-weight:700;background:#f9fafb;',
    small: 'font-size:11px;color:#6b7280;',
    alertBox: 'background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 12px;margin:0 0 8px;font-size:13px;',
    lyBox: 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px;margin:0 0 16px;font-size:13px;color:#1e3a8a;',
    okBox: 'background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 12px;margin:0 0 8px;font-size:13px;',
    noticeBox: 'background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;margin:0 0 8px;font-size:13px;',
    kpi: 'display:inline-block;min-width:150px;margin:0 8px 8px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top;',
    kpiLabel: 'font-size:11px;color:#6b7280;',
    kpiValue: 'font-size:20px;font-weight:700;',
    up: 'color:#047857;', down: 'color:#b91c1c;',
};

function buildHtml(dateStr, lyStr, stores, total, imported) {
    const h = [];
    h.push(`<div style="${CSS.wrap}">`);
    h.push(`<h1 style="${CSS.h1}">日報 ${esc(dateLabel(dateStr))}</h1>`);
    h.push(`<div style="${CSS.lyBox}">📅 <b>前年比は「日付」ではなく「曜日」で合わせています。</b><br>` +
        `${esc(dateLabel(dateStr))} は、前年の <b>${esc(dateLabel(lyStr))}</b>（52週前の同じ曜日）と比べています。` +
        `このメールの前年比はすべてこの比べ方です。</div>`);

    // 要確認
    const alerts = [], notices = [];
    stores.forEach(s => {
        s.alerts.forEach(m => alerts.push(`<b>${esc(s.name)}</b>：${esc(m)}`));
        s.notices.forEach(m => notices.push(`<b>${esc(s.name)}</b>：${esc(m)}`));
    });
    if (alerts.length > 0) {
        h.push(`<div style="${CSS.alertBox}"><b>⚠️ 要確認（時間帯データとのずれ）</b><br>${alerts.join('<br>')}</div>`);
    } else {
        h.push(`<div style="${CSS.okBox}">✅ 時間帯データとのずれはありません（客数 ${CONFIG.ALERT_CUSTOMERS_DIFF}人以上・売上 ${fmtInt(CONFIG.ALERT_SALES_DIFF)}円以上のずれを確認）</div>`);
    }
    if (notices.length > 0) {
        h.push(`<div style="${CSS.noticeBox}"><b>📝 未入力・不足</b><br>${notices.join('<br>')}</div>`);
    }

    // 3店合計
    h.push(`<h2 style="${CSS.h2}">${esc(total.label)}</h2>`);
    h.push(kpi('日販', fmtYen(total.sales), ratioHtml(total.cmpSales, total.lySales)));
    h.push(kpi('客数', total.customers === null ? '－' : `${fmtInt(total.customers)}人`, ratioHtml(total.cmpCustomers, total.lyCustomers)));
    h.push(kpi('客単価', total.spend === null ? '－' : `${fmtInt(Math.round(total.spend))}円`, ratioHtml(total.cmpSpend, total.lySpend)));
    h.push(kpi('廃棄・値下げ計', fmtYen(total.wasteTotal), total.wasteRate === null ? '' : `日販の ${fmtPct(total.wasteRate, 2)}`));

    // 店舗別
    h.push(`<h2 style="${CSS.h2}">店舗別</h2>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}"></th>${stores.map(s => `<th style="${CSS.thNum}">${esc(shortName(s.name))}</th>`).join('')}</tr>`);
    const row = (label, cells, bold) => `<tr><th style="${CSS.th}">${label}</th>${cells.map(c => `<td style="${bold ? CSS.tdTotal : CSS.tdNum}">${c}</td>`).join('')}</tr>`;
    h.push(row('天気', stores.map(s => esc(weatherText(s.weather)))));
    h.push(row('日販', stores.map(s => `${fmtYen(s.sales)}<br><span style="${CSS.small}">${ratioHtml(s.sales, s.lySales)}</span>`)));
    h.push(row('客数', stores.map(s => `${s.customers === null ? '－' : fmtInt(s.customers) + '人'}<br><span style="${CSS.small}">${ratioHtml(s.customers, s.lyCustomers)}</span>`)));
    h.push(row('客単価', stores.map(s => `${s.spend === null ? '－' : fmtInt(Math.round(s.spend)) + '円'}<br><span style="${CSS.small}">${ratioHtml(s.spend, s.lySpend)}</span>`)));
    WASTE_FIELDS.forEach((f, idx) => {
        h.push(row(esc(f.label), stores.map(s => wasteCell(s.waste[idx].value))));
    });
    h.push(row('廃棄・値下げ計', stores.map(s => fmtYen(s.wasteTotal)), true));
    h.push(row('廃棄率', stores.map(s => s.wasteRate === null ? '－' : fmtPct(s.wasteRate, 2))));
    h.push(row('入力者', stores.map(s => `<span style="${CSS.small}">日販 ${esc(s.inputBySales || '－')}<br>廃棄 ${esc(s.inputByWaste || '－')}</span>`)));
    h.push('</table>');

    // 時間帯データとの照合
    h.push(`<h2 style="${CSS.h2}">時間帯データ（作業割当アプリ）との照合</h2>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}"></th>${stores.map(s => `<th style="${CSS.thNum}">${esc(shortName(s.name))}</th>`).join('')}</tr>`);
    h.push(row('客数（日販入力）', stores.map(s => s.customers === null ? '－' : fmtInt(s.customers) + '人')));
    h.push(row('客数（時間帯合計）', stores.map(s => s.hourly ? fmtInt(s.hourly.custSum) + '人' : '－')));
    h.push(row('客数の差', stores.map(s => diffCell(s.custDiff, CONFIG.ALERT_CUSTOMERS_DIFF, '人'))));
    h.push(row('売上（日販入力）', stores.map(s => fmtYen(s.sales))));
    h.push(row('売上（時間帯合計）', stores.map(s => s.hourly ? fmtYen(s.hourly.salesSum) : '－')));
    h.push(row('売上の差', stores.map(s => diffCell(s.salesDiff, CONFIG.ALERT_SALES_DIFF, '円'))));
    h.push(row('時間帯の入力', stores.map(s => s.hourly ? `${s.hourly.hoursFilled}/24時間` : '－')));
    h.push('</table>');
    h.push(`<p style="${CSS.small}">時間帯の売上は1,000円単位で入力されるため、${fmtInt(CONFIG.ALERT_SALES_DIFF)}円未満の差は丸め誤差として扱っています。</p>`);

    // フッター
    if (imported) {
        h.push(`<p style="${CSS.small}">時間帯データの取り込み：${esc(imported.from)}〜${esc(imported.to)} のうち ${imported.written}件を取り込みました（変更なし ${imported.unchanged}件）。</p>`);
    }
    h.push(`<p style="${CSS.small}"><a href="${CONFIG.APP_URL}">日販廃棄アプリを開く</a></p>`);
    h.push('</div>');
    return h.join('\n');
}

function kpi(label, value, sub) {
    return `<div style="${CSS.kpi}"><div style="${CSS.kpiLabel}">${esc(label)}</div><div style="${CSS.kpiValue}">${value}</div><div style="${CSS.small}">${sub || ''}</div></div>`;
}

function ratioHtml(cy, ly) {
    if (cy === null || cy === undefined || !ly) return '前年比 －';
    const r = cy / ly;
    return `前年比 <span style="${r >= 1 ? CSS.up : CSS.down}">${fmtPct(r)}</span>`;
}

function wasteCell(v) {
    if (v === null) return '－';
    return v < 0 ? `<span style="${CSS.down}">${fmtYen(v)}</span>` : fmtYen(v);
}

function diffCell(diff, threshold, unit) {
    if (diff === null) return '－';
    const text = `${fmtSigned(diff)}${unit}`;
    return Math.abs(diff) >= threshold ? `<span style="${CSS.down}"><b>⚠️ ${text}</b></span>` : `✅ ${text}`;
}

function buildText(dateStr, stores, total, alertCount) {
    const t = [];
    t.push(`日報 ${dateLabel(dateStr)}`);
    t.push(`※前年比は曜日合わせ（前年の ${dateLabel(addDays(dateStr, -364))} と比較）`);
    t.push(`${total.label} 日販 ${fmtYen(total.sales)} ／ 客数 ${total.customers === null ? '－' : fmtInt(total.customers) + '人'} ／ 廃棄・値下げ計 ${fmtYen(total.wasteTotal)}`);
    t.push('');
    stores.forEach(s => {
        t.push(`■${s.name}`);
        t.push(`  日販 ${fmtYen(s.sales)} ／ 客数 ${s.customers === null ? '－' : fmtInt(s.customers) + '人'} ／ 廃棄・値下げ計 ${fmtYen(s.wasteTotal)}`);
        s.alerts.forEach(m => t.push(`  ⚠️ ${m}`));
        s.notices.forEach(m => t.push(`  📝 ${m}`));
    });
    t.push('');
    t.push(alertCount > 0 ? `要確認 ${alertCount}件` : '時間帯データとのずれはありません');
    t.push(CONFIG.APP_URL);
    return t.join('\n');
}

// ---- 書式・日付 ----

function fmtInt(n) { return Number(n).toLocaleString('ja-JP'); }
function fmtYen(n) { return (n === null || n === undefined) ? '－' : `${fmtInt(n)}円`; }
function fmtSigned(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + fmtInt(Math.abs(n)); }
function fmtPct(r, digits) { return `${(r * 100).toFixed(digits === undefined ? 1 : digits)}%`; }
function shortName(name) { return name.replace(/^伊賀/, '').replace(/^平野/, ''); }
function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const WEATHER_CODES = [
    [0, '快晴'], [1, '晴れ'], [2, '晴れ時々曇り'], [3, '曇り'], [45, '霧'], [48, '霧'],
    [51, '霧雨'], [53, '霧雨'], [55, '霧雨'], [61, '雨'], [63, '雨'], [65, '大雨'],
    [71, '雪'], [73, '雪'], [75, '大雪'], [80, 'にわか雨'], [81, 'にわか雨'], [82, '激しいにわか雨'],
    [95, '雷雨'], [96, '雷雨'], [99, '雷雨'],
];
function weatherText(w) {
    if (!w) return '－';
    const hit = WEATHER_CODES.find(([c]) => c === w.weatherCode);
    const parts = [hit ? hit[1] : '－'];
    if (typeof w.maxTemp === 'number') parts.push(`${w.maxTemp.toFixed(1)}℃`);
    if (typeof w.precipitation === 'number' && w.precipitation > 0) parts.push(`${w.precipitation}mm`);
    return parts.join(' ');
}

function todayJst() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function ymdFromUtc(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(s, n) { return ymdFromUtc(parseYmd(s) + n * 86400000); }
function dateRange(from, to) {
    const out = [];
    for (let ms = parseYmd(from); ms <= parseYmd(to); ms += 86400000) out.push(ymdFromUtc(ms));
    return out;
}
function dateLabel(s) {
    const [y, m, d] = s.split('-').map(Number);
    const dow = '日月火水木金土'[new Date(parseYmd(s)).getUTCDay()];
    return `${y}/${m}/${d}(${dow})`;
}
/** 'YYYY-MM-DD' の日本時間0時（アプリの getTimestampFromDateString と同じ値） */
function jstMidnightIso(s) { return new Date(parseYmd(s) - 9 * 3600000).toISOString(); }

function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

// ---- Firestore の値の変換 ----

function fsDecode(v) {
    if (!v) return null;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) {
        const o = {}, f = v.mapValue.fields || {};
        Object.keys(f).forEach(k => { o[k] = fsDecode(f[k]); });
        return o;
    }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecode);
    return null;
}
function fsDecodeDoc(doc) {
    const o = {}, f = (doc && doc.fields) || {};
    Object.keys(f).forEach(k => { o[k] = fsDecode(f[k]); });
    return o;
}
function fsEncode(x) {
    if (x === null || x === undefined) return { nullValue: null };
    if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
    if (typeof x === 'boolean') return { booleanValue: x };
    return { stringValue: String(x) };
}

// =============================================================================
// Firestore REST（スクリプトの持ち主の Google アカウントの権限で読み書きする）
// =============================================================================

function fsDocUrl(project, path) {
    return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/` +
        path.split('/').map(encodeURIComponent).join('/');
}

function fsAuthHeaders() {
    return { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` };
}

/** [[project, path], ...] をまとめて取得。無いドキュメントは null */
function fsGetMany(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 50) {
        const chunk = list.slice(i, i + 50);
        const res = UrlFetchApp.fetchAll(chunk.map(([p, path]) => ({
            url: fsDocUrl(p, path), method: 'get', headers: fsAuthHeaders(), muteHttpExceptions: true,
        })));
        res.forEach((r, j) => {
            const code = r.getResponseCode();
            if (code === 404) out.push(null);
            else if (code === 200) out.push(JSON.parse(r.getContentText()));
            else throw new Error(`Firestore 読み取りエラー ${code}: ${chunk[j][1]}\n${r.getContentText().slice(0, 300)}`);
        });
    }
    return out;
}

/** [[project, path, fields, maskPaths], ...] をまとめて部分更新（指定した項目以外は触らない） */
function fsPatchMany(list) {
    for (let i = 0; i < list.length; i += 50) {
        const chunk = list.slice(i, i + 50);
        const res = UrlFetchApp.fetchAll(chunk.map(([p, path, fields, mask]) => ({
            url: `${fsDocUrl(p, path)}?${mask.map(m => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&')}`,
            method: 'patch', contentType: 'application/json', headers: fsAuthHeaders(),
            payload: JSON.stringify({ fields }), muteHttpExceptions: true,
        })));
        res.forEach((r, j) => {
            if (r.getResponseCode() !== 200) {
                throw new Error(`Firestore 書き込みエラー ${r.getResponseCode()}: ${chunk[j][1]}\n${r.getContentText().slice(0, 300)}`);
            }
        });
    }
}

function fsList(project, collectionPath) {
    const docs = [];
    let token = '';
    do {
        const url = `${fsDocUrl(project, collectionPath)}?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
        const r = UrlFetchApp.fetch(url, { headers: fsAuthHeaders(), muteHttpExceptions: true });
        if (r.getResponseCode() !== 200) throw new Error(`Firestore 一覧取得エラー ${r.getResponseCode()}: ${collectionPath}`);
        const body = JSON.parse(r.getContentText());
        (body.documents || []).forEach(d => docs.push(d));
        token = body.nextPageToken || '';
    } while (token);
    return docs;
}
