/**
 * 週1回の分析メール（週報）
 *
 * 毎週月曜6時台に weeklyJob() が動き、先週（月〜日）の店舗ごとの傾向をメールで送る。
 *   ・売上・客数・客単価（前年同曜日の週・前週と比べる）と直近8週の推移
 *   ・廃棄（内訳・廃棄率、直近4週の平均と比べる）
 *   ・曜日別の数字
 *   ・時間帯（忙しい時間・朝昼夕深夜の客数の変化）
 *   ・「気づき」… 数字から決まった規則で書き出す（AIは使わない。数字に無いことは書かない）
 * 宛先は日報メールと同じ（To＝持ち主、BCC＝アプリで選んだ役職の在職者）。
 * 試しは sendTestWeeklyReport()（持ち主にだけ送る）。
 */

const WEEKLY = {
    RUN_WEEKDAY: 'MONDAY',
    RUN_HOUR: 6,
    TREND_WEEKS: 8,
    WASTE_RATE_ALERT_PT: 0.3,     // 廃棄率が4週平均よりこのポイント以上動いたら気づきに書く
    BAND_CHANGE_ALERT: 0.05,      // 時間帯の客数が前年比でこれ以上動いたら気づきに書く
    BANDS: [
        { key: 'morning', label: '朝 6〜9時台', hours: [6, 7, 8, 9] },
        { key: 'lunch', label: '昼 11〜13時台', hours: [11, 12, 13] },
        { key: 'evening', label: '夕方 17〜19時台', hours: [17, 18, 19] },
        { key: 'night', label: '深夜 22〜5時台', hours: [22, 23, 0, 1, 2, 3, 4, 5] },
    ],
};

// =============================================================================
// 入口
// =============================================================================

/** 毎週月曜の本処理。トリガーから呼ばれる */
function weeklyJob() {
    try {
        sendWeeklyReport(lastWeekEnd(todayJst()), true);
    } catch (e) {
        notifyError('週1回の分析メール', e);
        throw e;
    }
}

/** 試しに先週分の週報を送る（持ち主にだけ） */
function sendTestWeeklyReport() {
    sendWeeklyReport(lastWeekEnd(todayJst()), false);
}

/** 週報のトリガーを作り直す（setup() からも呼ばれる） */
function setupWeekly() {
    ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === 'weeklyJob')
        .forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('weeklyJob')
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay[WEEKLY.RUN_WEEKDAY])
        .atHour(WEEKLY.RUN_HOUR)
        .inTimezone('Asia/Tokyo')
        .create();
    Logger.log(`設定完了：毎週月曜 ${WEEKLY.RUN_HOUR}時台に weeklyJob を実行します。`);
}

// =============================================================================
// 週報の組み立て
// =============================================================================

function sendWeeklyReport(endStr, toEveryone) {
    const stores = resolveStores();
    const firstStr = addDays(endStr, -(WEEKLY.TREND_WEEKS * 7 - 1));
    const cyDates = dateRange(firstStr, endStr);
    const lyDates = cyDates.map(d => addDays(d, -364));
    const reqs = [];
    stores.forEach(s => {
        cyDates.forEach(d => reqs.push([CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${d}_${s.name}`]));
        lyDates.forEach(d => reqs.push([CONFIG.NHK_PROJECT, `${CONFIG.NHK_REPORTS}/${d}_${s.name}`]));
    });
    const docs = fsGetMany(reqs);
    const n = cyDates.length;
    const inputs = stores.map((s, i) => {
        const base = i * n * 2;
        const cy = {}, ly = {};
        cyDates.forEach((d, j) => { const x = docs[base + j]; if (x) cy[d] = fsDecodeDoc(x); });
        lyDates.forEach((d, j) => { const x = docs[base + n + j]; if (x) ly[cyDates[j]] = fsDecodeDoc(x); });   // 今年の日付で引けるようにする
        return { name: s.name, cy, ly };
    });
    const report = buildWeeklyReport(endStr, inputs);
    const msg = { to: mailTo(), subject: report.subject, htmlBody: report.html, body: report.text, name: '日販廃棄アプリ' };
    if (toEveryone) {
        const r = resolveRecipients();
        const bcc = r.enabled ? r.emails.filter(e => e.toLowerCase() !== mailTo().toLowerCase()) : [];
        if (bcc.length) msg.bcc = bcc.join(',');
    }
    MailApp.sendEmail(msg);
}

// ---- ここから下は Firestore にも Gmail にも触れない純粋な処理 ----

/** 今日から見た「先週の日曜日」。月曜に動けば前日になる */
function lastWeekEnd(todayStr) {
    const dow = new Date(parseYmd(todayStr)).getUTCDay();   // 0=日
    return addDays(todayStr, -(dow === 0 ? 7 : dow));
}

/** 1日分の数字 */
function dayFigures(doc) {
    if (!doc) return null;
    const sales = numOrNull(doc.sales), customers = numOrNull(doc.customers);
    const wasteVals = WASTE_FIELDS.map(f => numOrNull(doc[f.key]));
    const hasWaste = wasteVals.some(v => v !== null);
    let hourly = null;
    if (doc.hourlyData && summarizeHourly(doc.hourlyData).hoursFilled === 24) {
        const hs = summarizeHourly(doc.hourlyData);
        // 日販の客数と大きくずれる日は時間帯の集計に使わない（アプリの時間帯分析と同じ）
        if (!(customers && Math.abs(hs.custSum - customers) > Math.max(10, Math.round(customers * 0.03)))) {
            hourly = Array.from({ length: 24 }, (_, h) => {
                const e = doc.hourlyData[String(h)] || {};
                return { c: typeof e.customers === 'number' ? e.customers : 0, s: typeof e.sales === 'number' ? e.sales : 0 };
            });
        }
    }
    return {
        sales, customers,
        waste: wasteVals,
        wasteTotal: hasWaste ? wasteVals.reduce((s, v) => s + (v || 0), 0) : null,
        weather: doc.weather || null,
        hourly,
    };
}

/** 日付の並びについて合計する。比べる相手（pair）があれば、両方そろった日だけで合計する */
function sumDays(dates, getCy, getLy) {
    const t = { days: 0, sales: 0, customers: 0, lySales: 0, lyCustomers: 0 };
    dates.forEach(d => {
        const a = getCy(d), b = getLy ? getLy(d) : null;
        if (!a || a.sales === null || a.customers === null) return;
        if (getLy && (!b || b.sales === null || b.customers === null)) return;
        t.days++;
        t.sales += a.sales; t.customers += a.customers;
        if (b) { t.lySales += b.sales; t.lyCustomers += b.customers; }
    });
    return t;
}

function wasteOf(dates, get) {
    let total = 0, sales = 0, days = 0;
    const byField = WASTE_FIELDS.map(() => 0);
    dates.forEach(d => {
        const a = get(d);
        if (!a || a.wasteTotal === null || !a.sales) return;
        days++; total += a.wasteTotal; sales += a.sales;
        a.waste.forEach((v, i) => { byField[i] += v || 0; });
    });
    return { days, total, sales, rate: sales ? total / sales : null, byField };
}

function hourlyOf(dates, get) {
    const cust = Array(24).fill(0), sales = Array(24).fill(0);
    let days = 0;
    dates.forEach(d => {
        const a = get(d);
        if (!a || !a.hourly) return;
        days++;
        a.hourly.forEach((x, h) => { cust[h] += x.c; sales[h] += x.s; });
    });
    const total = cust.reduce((s, v) => s + v, 0);
    return {
        days,
        avg: cust.map(c => days ? c / days : null),
        spend: cust.map((c, h) => c ? sales[h] / c : null),
        bands: WEEKLY.BANDS.map(b => {
            const c = b.hours.reduce((s, h) => s + cust[h], 0);
            return { key: b.key, label: b.label, perDay: days ? c / days : null, share: total ? c / total : null };
        }),
    };
}

function analyzeWeekStore(endStr, input) {
    const week = dateRange(addDays(endStr, -6), endStr);
    const prevWeek = week.map(d => addDays(d, -7));
    const cy = d => dayFigures(input.cy[d]);
    const ly = d => dayFigures(input.ly[d]);
    const a = { name: input.name, week, cyDocs: input.cy };

    a.thisWeek = sumDays(week, cy);                    // 今週の実績（入力のある日すべて）
    a.vsLy = sumDays(week, cy, ly);                    // 前年同曜日の週と、両方そろった日で比べる
    a.vsPrev = sumDays(week, cy, d => cy(addDays(d, -7)));
    a.missingDays = week.filter(d => { const x = cy(d); return !x || x.sales === null || x.customers === null; });

    // 直近8週の推移（古い順）
    a.trend = [];
    for (let w = WEEKLY.TREND_WEEKS - 1; w >= 0; w--) {
        const dates = dateRange(addDays(endStr, -(w * 7 + 6)), addDays(endStr, -w * 7));
        const t = sumDays(dates, cy), c = sumDays(dates, cy, ly), ws = wasteOf(dates, cy);
        a.trend.push({
            from: dates[0], to: dates[6], days: t.days, sales: t.sales, customers: t.customers,
            lyRatio: c.days && c.lySales ? c.sales / c.lySales : null,
            custLyRatio: c.days && c.lyCustomers ? c.customers / c.lyCustomers : null,
            wasteRate: ws.rate,
        });
    }

    // 廃棄
    a.waste = wasteOf(week, cy);
    const prior4 = dateRange(addDays(endStr, -34), addDays(endStr, -7));
    a.waste4 = wasteOf(prior4, cy);
    a.wastePrev = wasteOf(prevWeek, cy);

    // 曜日別
    a.days = week.map(d => {
        const x = cy(d), y = ly(d);
        return {
            date: d, x, y,
            spend: x && x.sales !== null && x.customers ? x.sales / x.customers : null,
            lyRatio: x && y && x.sales !== null && y.sales ? x.sales / y.sales : null,
            wasteRate: x && x.wasteTotal !== null && x.sales ? x.wasteTotal / x.sales : null,
        };
    });

    // 時間帯
    a.hourly = hourlyOf(week, cy);
    a.hourlyLy = hourlyOf(week, ly);

    a.insights = weeklyInsights(a);
    return a;
}

/** 数字から「気づき」を書き出す。数字に無いことは書かない */
function weeklyInsights(a) {
    const out = [];
    const v = a.vsLy;
    if (v.days && v.lySales && v.lyCustomers) {
        const rs = v.sales / v.lySales, rc = v.customers / v.lyCustomers;
        const rsp = (v.sales / v.customers) / (v.lySales / v.lyCustomers);
        let driver = '';
        if (Math.abs(rc - 1) >= Math.abs(rsp - 1) + 0.01) driver = rc >= 1 ? '客数の増加が主な理由です。' : '客数の減少が主な理由です。';
        else if (Math.abs(rsp - 1) >= Math.abs(rc - 1) + 0.01) driver = rsp >= 1 ? '客単価の上昇が主な理由です。' : '客単価の低下が主な理由です。';
        out.push(`売上は前年同曜比 ${fmtPct(rs)}（客数 ${fmtPct(rc)}・客単価 ${fmtPct(rsp)}）。${driver}`);
    }
    // 前年比の連続
    const ratios = a.trend.map(t => t.lyRatio);
    if (ratios[ratios.length - 1] !== null) {
        const up = ratios[ratios.length - 1] >= 1;
        let k = 0;
        for (let i = ratios.length - 1; i >= 0 && ratios[i] !== null && (ratios[i] >= 1) === up; i--) k++;
        const span = k >= ratios.length ? `直近${k}週すべてで` : `${k}週続けて`;
        if (k >= 3) out.push(`売上の前年比は${span}${up ? '100%を超えています' : '100%を下回っています'}。`);
    }
    // 廃棄率
    if (a.waste.rate !== null && a.waste4.rate !== null) {
        const diff = (a.waste.rate - a.waste4.rate) * 100;
        if (Math.abs(diff) >= WEEKLY.WASTE_RATE_ALERT_PT) {
            out.push(`廃棄率は ${fmtPct(a.waste.rate, 2)} で、直近4週の平均（${fmtPct(a.waste4.rate, 2)}）より ${Math.abs(diff).toFixed(2)}ポイント${diff > 0 ? '高く' : '低く'}なりました。`);
        }
    }
    // 時間帯
    if (a.hourly.days && a.hourlyLy.days) {
        let best = null;
        a.hourly.bands.forEach((b, i) => {
            const l = a.hourlyLy.bands[i];
            if (b.perDay === null || !l.perDay) return;
            const r = b.perDay / l.perDay - 1;
            if (Math.abs(r) >= WEEKLY.BAND_CHANGE_ALERT && (!best || Math.abs(r) > Math.abs(best.r))) best = { label: b.label, r };
        });
        if (best) out.push(`${best.label}の客数が前年同曜比 ${best.r > 0 ? '+' : '−'}${Math.abs(best.r * 100).toFixed(1)}% と、時間帯の中で一番大きく${best.r > 0 ? '伸びました' : '減りました'}。`);
    }
    // 弱かった曜日
    const withRatio = a.days.filter(d => d.lyRatio !== null);
    if (withRatio.length >= 3) {
        const low = withRatio.reduce((m, d) => d.lyRatio < m.lyRatio ? d : m);
        if (low.lyRatio < 0.95) {
            const w = low.x && low.x.weather;
            const rain = w && typeof w.precipitation === 'number' && w.precipitation >= 1 ? `（${weatherText(w)}）` : '';
            out.push(`${dateLabel(low.date)} は前年同曜比 ${fmtPct(low.lyRatio)} と、週の中で一番弱い日でした${rain}。`);
        }
    }
    const negDays = dateRange(addDays(a.week[6], -34), a.week[6]).filter(d => { const x = dayFigures(a.cyDocs[d]); return x && x.waste.some(v => v !== null && v < -10000); });
    if (negDays.length) out.push(`${negDays.map(dateLabel).join('・')} に1万円を超えるマイナスの廃棄・値下げが入っています。廃棄率の比較が実際とずれている可能性があります。`);
    if (a.missingDays.length) out.push(`${a.missingDays.map(dateLabel).join('・')} は日販が未入力のため、集計に入っていません。`);
    return out;
}

function buildWeeklyReport(endStr, inputs) {
    const stores = inputs.map(i => analyzeWeekStore(endStr, i));
    const startStr = addDays(endStr, -6);
    const range = `${dateLabel(startStr)}〜${dateLabel(endStr)}`;
    const tot = { sales: 0, customers: 0, cmpSales: 0, lySales: 0, cmpCustomers: 0, lyCustomers: 0, storeCount: 0 };
    stores.forEach(s => {
        if (s.thisWeek.days) { tot.sales += s.thisWeek.sales; tot.customers += s.thisWeek.customers; tot.storeCount++; }
        if (s.vsLy.days) { tot.cmpSales += s.vsLy.sales; tot.lySales += s.vsLy.lySales; tot.cmpCustomers += s.vsLy.customers; tot.lyCustomers += s.vsLy.lyCustomers; }
    });
    let subject = `【週報】${range} ${tot.storeCount}店計 ${fmtYen(tot.sales)}`;
    if (tot.lySales) subject += `（前年同曜比${fmtPct(tot.cmpSales / tot.lySales)}）`;
    return { subject, html: buildWeeklyHtml(startStr, endStr, stores, tot), text: buildWeeklyText(range, stores, tot) };
}

// ---- HTML ----

function pctCell(r) {
    if (r === null || r === undefined || !isFinite(r)) return '－';
    return `<span style="${r >= 1 ? CSS.up : CSS.down}">${fmtPct(r)}</span>`;
}

function buildWeeklyHtml(startStr, endStr, stores, tot) {
    const h = [];
    h.push(`<div style="${CSS.wrap}">`);
    h.push(`<h1 style="${CSS.h1}">週報 ${esc(dateLabel(startStr))}〜${esc(dateLabel(endStr))}</h1>`);
    h.push(`<div style="${CSS.lyBox}">📅 <b>前年比は「日付」ではなく「曜日」で合わせています。</b><br>` +
        `前年の ${esc(dateLabel(addDays(startStr, -364)))}〜${esc(dateLabel(addDays(endStr, -364)))}（52週前の同じ曜日）と比べています。前週比は先々週の同じ曜日との比較です。</div>`);

    // 3店の一覧
    h.push(`<h2 style="${CSS.h2}">今週のまとめ</h2>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}"></th>` +
        stores.map(s => `<th style="${CSS.thNum}">${esc(shortName(s.name))}</th>`).join('') + `<th style="${CSS.thNum}">合計</th></tr>`);
    const row = (label, cells, total) => `<tr><td style="${CSS.td}">${label}</td>${cells.map(c => `<td style="${CSS.tdNum}">${c}</td>`).join('')}<td style="${CSS.tdTotal}">${total}</td></tr>`;
    h.push(row('売上', stores.map(s => s.thisWeek.days ? fmtYen(s.thisWeek.sales) : '－'), fmtYen(tot.sales)));
    h.push(row('前年同曜比', stores.map(s => s.vsLy.days ? pctCell(s.vsLy.sales / s.vsLy.lySales) : '－'), tot.lySales ? pctCell(tot.cmpSales / tot.lySales) : '－'));
    h.push(row('前週比', stores.map(s => s.vsPrev.days ? pctCell(s.vsPrev.sales / s.vsPrev.lySales) : '－'), '－'));
    h.push(row('客数', stores.map(s => s.thisWeek.days ? `${fmtInt(s.thisWeek.customers)}人` : '－'), `${fmtInt(tot.customers)}人`));
    h.push(row('客数 前年同曜比', stores.map(s => s.vsLy.days ? pctCell(s.vsLy.customers / s.vsLy.lyCustomers) : '－'), tot.lyCustomers ? pctCell(tot.cmpCustomers / tot.lyCustomers) : '－'));
    h.push(row('客単価', stores.map(s => s.thisWeek.customers ? fmtYen(Math.round(s.thisWeek.sales / s.thisWeek.customers)) : '－'), tot.customers ? fmtYen(Math.round(tot.sales / tot.customers)) : '－'));
    h.push(row('廃棄率', stores.map(s => s.waste.rate === null ? '－' : fmtPct(s.waste.rate, 2)), '－'));
    h.push('</table>');

    stores.forEach(s => h.push(buildWeeklyStoreHtml(s)));

    h.push(`<p style="${CSS.small}">時間帯の数字は、24時間そろっていて日販の客数と大きくずれない日だけで出しています。時間帯の売上は1,000円単位の入力のため、客単価は目安です。</p>`);
    h.push(`<p style="${CSS.small}"><a href="${CONFIG.APP_URL}">日販廃棄アプリを開く</a>（「時間帯分析」でグラフを見られます）</p>`);
    h.push('</div>');
    return h.join('\n');
}

function buildWeeklyStoreHtml(s) {
    const h = [];
    h.push(`<h2 style="${CSS.h2};margin-top:32px;font-size:17px;">${esc(s.name)}</h2>`);
    if (s.insights.length) {
        h.push(`<div style="${CSS.noticeBox}"><b>💡 気づき</b><ul style="margin:6px 0 0;padding-left:20px;">` +
            s.insights.map(t => `<li style="margin:2px 0;">${esc(t)}</li>`).join('') + '</ul></div>');
    }

    // 曜日別
    h.push(`<p style="font-weight:600;font-size:13px;margin:14px 0 6px;">曜日別</p>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}">日</th><th style="${CSS.thNum}">売上</th><th style="${CSS.thNum}">前年同曜比</th><th style="${CSS.thNum}">客数</th><th style="${CSS.thNum}">客単価</th><th style="${CSS.thNum}">廃棄率</th><th style="${CSS.th}">天気</th></tr>`);
    s.days.forEach(d => {
        const x = d.x;
        h.push(`<tr><td style="${CSS.td}">${esc(dateLabel(d.date))}</td>` +
            `<td style="${CSS.tdNum}">${x && x.sales !== null ? fmtYen(x.sales) : '－'}</td>` +
            `<td style="${CSS.tdNum}">${pctCell(d.lyRatio)}</td>` +
            `<td style="${CSS.tdNum}">${x && x.customers !== null ? fmtInt(x.customers) + '人' : '－'}</td>` +
            `<td style="${CSS.tdNum}">${d.spend === null ? '－' : fmtYen(Math.round(d.spend))}</td>` +
            `<td style="${CSS.tdNum}">${d.wasteRate === null ? '－' : fmtPct(d.wasteRate, 2)}</td>` +
            `<td style="${CSS.td}">${esc(weatherText(x && x.weather))}</td></tr>`);
    });
    h.push('</table>');

    // 廃棄
    h.push(`<p style="font-weight:600;font-size:13px;margin:14px 0 6px;">廃棄・値下げ</p>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}"></th><th style="${CSS.thNum}">今週</th><th style="${CSS.thNum}">前週</th><th style="${CSS.thNum}">直近4週の週平均</th></tr>`);
    WASTE_FIELDS.forEach((f, i) => {
        const avg4 = a4(s.waste4, i);
        h.push(`<tr><td style="${CSS.td}">${esc(f.label)}</td><td style="${CSS.tdNum}">${s.waste.days ? wasteCell(s.waste.byField[i]) : '－'}</td>` +
            `<td style="${CSS.tdNum}">${s.wastePrev.days ? wasteCell(s.wastePrev.byField[i]) : '－'}</td><td style="${CSS.tdNum}">${avg4 === null ? '－' : wasteCell(avg4)}</td></tr>`);
    });
    const avgTotal = s.waste4.days ? Math.round(s.waste4.total / s.waste4.days * 7) : null;
    h.push(`<tr><td style="${CSS.td}"><b>合計</b></td><td style="${CSS.tdTotal}">${s.waste.days ? fmtYen(s.waste.total) : '－'}</td><td style="${CSS.tdTotal}">${s.wastePrev.days ? fmtYen(s.wastePrev.total) : '－'}</td><td style="${CSS.tdTotal}">${avgTotal === null ? '－' : fmtYen(avgTotal)}</td></tr>`);
    h.push(`<tr><td style="${CSS.td}">廃棄率</td><td style="${CSS.tdNum}">${s.waste.rate === null ? '－' : fmtPct(s.waste.rate, 2)}</td><td style="${CSS.tdNum}">${s.wastePrev.rate === null ? '－' : fmtPct(s.wastePrev.rate, 2)}</td><td style="${CSS.tdNum}">${s.waste4.rate === null ? '－' : fmtPct(s.waste4.rate, 2)}</td></tr>`);
    h.push('</table>');

    // 時間帯
    if (s.hourly.days) {
        const top = s.hourly.avg.map((v, hr) => ({ hr, v })).sort((x, y) => y.v - x.v).slice(0, 3);
        h.push(`<p style="font-weight:600;font-size:13px;margin:14px 0 6px;">時間帯（${s.hourly.days}日分の平均）</p>`);
        h.push(`<p style="font-size:13px;margin:0 0 6px;">忙しい時間：${top.map((t, i) => `${i + 1}位 <b>${t.hr}時台</b>（${t.v.toFixed(1)}人）`).join('　')}</p>`);
        h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}">時間帯</th><th style="${CSS.thNum}">1日平均客数</th><th style="${CSS.thNum}">前年同曜比</th><th style="${CSS.thNum}">1日の客数に占める割合</th></tr>`);
        s.hourly.bands.forEach((b, i) => {
            const l = s.hourlyLy.bands[i];
            h.push(`<tr><td style="${CSS.td}">${esc(b.label)}</td><td style="${CSS.tdNum}">${b.perDay === null ? '－' : b.perDay.toFixed(1) + '人'}</td>` +
                `<td style="${CSS.tdNum}">${b.perDay !== null && l.perDay ? pctCell(b.perDay / l.perDay) : '－'}</td>` +
                `<td style="${CSS.tdNum}">${b.share === null ? '－' : fmtPct(b.share)}${l.share !== null ? `<span style="${CSS.small}">（前年 ${fmtPct(l.share)}）</span>` : ''}</td></tr>`);
        });
        h.push('</table>');
    }

    // 8週の推移
    h.push(`<p style="font-weight:600;font-size:13px;margin:14px 0 6px;">直近${WEEKLY.TREND_WEEKS}週の推移</p>`);
    h.push(`<table style="${CSS.table}"><tr><th style="${CSS.th}">週</th><th style="${CSS.thNum}">売上</th><th style="${CSS.thNum}">前年同曜比</th><th style="${CSS.thNum}">客数</th><th style="${CSS.thNum}">客数 前年比</th><th style="${CSS.thNum}">廃棄率</th></tr>`);
    s.trend.forEach((t, i) => {
        const last = i === s.trend.length - 1;
        const st = last ? CSS.tdTotal : CSS.tdNum;
        const [, m, d] = t.from.split('-').map(Number);
        h.push(`<tr><td style="${CSS.td}">${m}/${d}〜${last ? '（今週）' : ''}${t.days < 7 ? `<span style="${CSS.small}"> ${t.days}日分</span>` : ''}</td>` +
            `<td style="${st}">${t.days ? fmtYen(t.sales) : '－'}</td><td style="${st}">${pctCell(t.lyRatio)}</td>` +
            `<td style="${st}">${t.days ? fmtInt(t.customers) + '人' : '－'}</td><td style="${st}">${pctCell(t.custLyRatio)}</td>` +
            `<td style="${st}">${t.wasteRate === null ? '－' : fmtPct(t.wasteRate, 2)}</td></tr>`);
    });
    h.push('</table>');
    return h.join('\n');
}

/** 直近4週の「週あたり」平均（項目 i） */
function a4(w, i) {
    return w.days ? Math.round(w.byField[i] / w.days * 7) : null;
}

function buildWeeklyText(range, stores, tot) {
    const t = [`週報 ${range}`, '※前年比は曜日合わせ（52週前の同じ曜日と比較）', ''];
    t.push(`${tot.storeCount}店計 売上 ${fmtYen(tot.sales)}${tot.lySales ? `（前年同曜比 ${fmtPct(tot.cmpSales / tot.lySales)}）` : ''} ／ 客数 ${fmtInt(tot.customers)}人`);
    stores.forEach(s => {
        t.push('', `■${s.name}`);
        t.push(`  売上 ${s.thisWeek.days ? fmtYen(s.thisWeek.sales) : '－'} ／ 客数 ${s.thisWeek.days ? fmtInt(s.thisWeek.customers) + '人' : '－'} ／ 廃棄率 ${s.waste.rate === null ? '－' : fmtPct(s.waste.rate, 2)}`);
        s.insights.forEach(x => t.push(`  ・${x}`));
    });
    t.push('', CONFIG.APP_URL);
    return t.join('\n');
}
