import React, { useState, useEffect, useMemo, useRef } from 'react';
import { APP_VERSION, BUILD_TIME, formatBuildTime } from './version.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch, onSnapshot, query, where, Timestamp, limit, documentId, deleteField } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

// ==============================================================================
// Configuration & Setup
// ==============================================================================

// Chart.jsのコンポーネントを登録
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

// Firebase Configuration (User Provided)
const firebaseConfig = {
    apiKey: "AIzaSyC4TIW_bxuU0mGpSx79ZPpaRptD5K2Db6E",
    authDomain: "hattyuu-kanri-app-test.firebaseapp.com",
    projectId: "hattyuu-kanri-app-test",
    storageBucket: "hattyuu-kanri-app-test.firebasestorage.app",
    messagingSenderId: "1067476817134",
    appId: "1:1067476817134:web:5014590398dd1adb634fff",
    measurementId: "G-21NW0LZLBH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 作業割当アプリ（CONV-SAGYOU-APP）のFirebase設定 ※読み取り専用
const sagyouFirebaseConfig = {
    apiKey: "AIzaSyAvxKaj49CfK9T5-h4AycKcguU2gsSXTxc",
    authDomain: "new-check-137f9.firebaseapp.com",
    projectId: "new-check-137f9",
    storageBucket: "new-check-137f9.firebasestorage.app",
    messagingSenderId: "534868750946",
    appId: "1:534868750946:web:8e4341569853712bd8573b",
};

// 第2引数で名前を付けることで既存インスタンスと共存させる
const sagyouApp = initializeApp(sagyouFirebaseConfig, 'sagyou');
const sagyouDb = getFirestore(sagyouApp);

// Firestore Paths
// 【修正完了】写真から判明した正しいパス構造に修正しました。
// マスターデータ（店舗・従業員）は共有の場所から、日報データはアプリ固有の場所から取得します。

// マスターデータ（店舗・従業員）のベースパス
const masterBasePath = "artifacts/general-master-data/public/data";
const storesPath = `${masterBasePath}/stores`;
const employeesPath = `${masterBasePath}/employees`;

// アプリ固有データ（日報）のベースパス
const appBasePath = "artifacts/hattyuu-kanri-app-test/public/data";
const dailyReportsPath = `${appBasePath}/daily_reports`;

// 作業割当プロジェクト（new-check-137f9）側のパス ※読み取り専用
const SAGYOU_HOURLY_PATH = 'hourly_metrics';
const SAGYOU_STORES_PATH = 'artifacts/general-master-data/public/data/stores';

// PapaParse Loader
const usePapaParse = () => {
    const [ready, setReady] = useState(typeof window !== 'undefined' && !!window.Papa);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        if (window.Papa) {
            setReady(true);
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.3.2/papaparse.min.js";
        script.async = true;
        script.onload = () => setReady(true);
        script.onerror = () => {
            console.error("PapaParseの読み込みに失敗しました");
            setReady(false);
        };
        document.body.appendChild(script);
        
        return () => {
            // クリーンアップ: スクリプトタグを削除
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []);
    return ready;
};

// ==============================================================================
// SVG Icons
// ==============================================================================
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
const SalesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
const ListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const UploadCloudIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>;
const SlidersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>;
const CsvIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12c-2 0-2 2-2 2s0 2 2 2h2c2 0 2-2 2-2s0-2-2-2h-2z"/><path d="M10 10V5l4 4"/><path d="M14 14v5l-4-4"/><path d="M4 12h1.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H4v-3h2"/><path d="M20 12h-1.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5H20v-3h-2"/><path d="M4 20h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.95 2.05.55 11.55a1.41 1.41 0 0 0 0 2l9.4 9.4a1.41 1.41 0 0 0 2 0l9.4-9.4a1.41 1.41 0 0 0 0-2L11.95 2.05a1.41 1.41 0 0 0-2 0Z"/><path d="M12 6v12"/><path d="M16 10H8"/></svg>;
const RefreshCwIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
const BrainIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2.25A2.25 2.25 0 0 1 11.75 0h.5A2.25 2.25 0 0 1 14.5 2.25v1.5a.25.25 0 0 1-.25.25h-4.5a.25.25 0 0 1-.25-.25v-1.5Zm-3 3A2.25 2.25 0 0 0 4.25 3h-.5A2.25 2.25 0 0 0 1.5 5.25v1.5a.25.25 0 0 0 .25.25h4.5a.25.25 0 0 0 .25-.25v-1.5Zm9 0A2.25 2.25 0 0 1 17.75 3h.5A2.25 2.25 0 0 1 22.5 5.25v1.5a.25.25 0 0 1-.25.25h-4.5a.25.25 0 0 1-.25-.25v-1.5ZM12 12a2.25 2.25 0 0 0-2.25-2.25h-1.5a.25.25 0 0 0-.25.25v4.5a.25.25 0 0 0 .25.25h1.5A2.25 2.25 0 0 0 12 12Zm0 0a2.25 2.25 0 0 1 2.25-2.25h1.5a.25.25 0 0 1 .25.25v4.5a.25.25 0 0 1-.25.25h-1.5A2.25 2.25 0 0 1 12 12Z"/><path d="M4.25 18.25a.25.25 0 0 0-.25.25v1.5A2.25 2.25 0 0 0 6.25 24h.5A2.25 2.25 0 0 0 9 21.75v-1.5a.25.25 0 0 0-.25-.25h-4.5Zm9 0a.25.25 0 0 1 .25.25v1.5A2.25 2.25 0 0 1 15.25 24h-.5A2.25 2.25 0 0 1 12.5 21.75v-1.5a.25.25 0 0 1 .25-.25h.5Z"/></svg>;
const MicIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const DatabaseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
const NoteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

// ==============================================================================
// Helper Functions & Hooks
// ==============================================================================

const getLocalDateString = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const getWeekdayLabel = (date) => {
    const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(`${date}T00:00:00`));
    return WEEKDAY_LABELS[d.getDay()];
};

const formatDateWithWeekday = (dateInput) => {
    const dateStr = typeof dateInput === 'string' ? dateInput : getLocalDateString(dateInput);
    const d = new Date(`${dateStr}T00:00:00`);
    return `${dateStr} (${getWeekdayLabel(d)})`;
};

const parseLocalDate = (dateInput) => {
    if (dateInput instanceof Date) return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    if (dateInput?.toDate) return dateInput.toDate();
    return new Date(`${dateInput}T00:00:00`);
};

const getSameCalendarDateLastYear = (cyDate) => {
    const cy = parseLocalDate(cyDate);
    return new Date(cy.getFullYear() - 1, cy.getMonth(), cy.getDate());
};

/** 前年の同日付付近で、本年と同じ曜日の日を返す（±3日以内） */
const getSameWeekdayNearLastYearDate = (cyDate) => {
    const cy = parseLocalDate(cyDate);
    const anchor = new Date(cy.getFullYear() - 1, cy.getMonth(), cy.getDate());
    const targetDow = cy.getDay();
    let best = anchor;
    let bestDiff = 7;
    for (let offset = -3; offset <= 3; offset++) {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() + offset);
        if (d.getDay() === targetDow) {
            const diff = Math.abs(offset);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = d;
            }
        }
    }
    return best;
};

const getExtendedLyFetchRange = (startDateLY, endDateLY) => {
    const start = new Date(startDateLY);
    start.setDate(start.getDate() - 7);
    const end = new Date(endDateLY);
    end.setDate(end.getDate() + 7);
    return { start, end };
};

/** 前年ドキュメントから数値を取得（日販入力の sales / 一括入力の sales_ly の両方に対応） */
const getLySourceValue = (report, key) => {
    if (!report) return undefined;
    const direct = report[key];
    const hasDirect = direct != null && direct !== '';
    // 0 は「未入力のまま保存された値」の可能性があるため、一括入力の値があればそちらを優先する
    if (hasDirect && direct !== 0) return direct;
    const lyField = report[`${key}_ly`];
    if (lyField != null && lyField !== '') return lyField;
    return hasDirect ? direct : undefined;
};

const getLyCustomerSpend = (report) => {
    const spend = getLySourceValue(report, 'customer_spend');
    if (spend != null) return spend;
    const sales = getLySourceValue(report, 'sales');
    const customers = getLySourceValue(report, 'customers');
    if (customers > 0 && sales != null) return sales / customers;
    return undefined;
};

const mergeCalendarYearLyReports = (reports, reportsLY) => {
    const lyData = reportsLY.map(r => {
        if (!r.date) return null;
        const lyDate = r.date.toDate();
        const cyDate = new Date(lyDate.getFullYear() + 1, lyDate.getMonth(), lyDate.getDate());
        return {
            date: Timestamp.fromDate(cyDate),
            store: r.store,
            sales_ly: getLySourceValue(r, 'sales'),
            customers_ly: getLySourceValue(r, 'customers'),
            customer_spend_ly: getLyCustomerSpend(r),
            waste_product_ly: getLySourceValue(r, 'waste_product'),
            waste_owner_8_ly: getLySourceValue(r, 'waste_owner_8'),
            waste_owner_10_ly: getLySourceValue(r, 'waste_owner_10'),
            waste_promo_8_ly: getLySourceValue(r, 'waste_promo_8'),
            waste_promo_10_ly: getLySourceValue(r, 'waste_promo_10'),
        };
    }).filter(Boolean);

    const reportsById = new Map();
    reports.forEach(r => {
        reportsById.set(r.id, r);
    });
    lyData.forEach(r_ly => {
        const cyDateStr = getLocalDateString(r_ly.date.toDate());
        const docId = `${cyDateStr}_${r_ly.store}`;
        const existingReport = reportsById.get(docId) || { id: docId, date: r_ly.date, store: r_ly.store };
        reportsById.set(docId, { ...existingReport, ...r_ly });
    });

    return Array.from(reportsById.values());
};

const enrichReportsWithWeekdayLy = (mergedReports, reportsLY, dateRange = null) => {
    const lyLookup = new Map();
    reportsLY.forEach(r => {
        if (!r.date || !r.store) return;
        lyLookup.set(`${getLocalDateString(r.date.toDate())}_${r.store}`, r);
    });

    const entriesById = new Map();
    mergedReports.forEach(r => entriesById.set(r.id, r));

    // 本年・前年同日のデータが無い日付×店舗でも、前年曜日のデータがあれば行を作る
    if (dateRange?.startDate && dateRange?.endDate) {
        const storeNames = new Set();
        reportsLY.forEach(r => { if (r.store) storeNames.add(r.store); });
        const cursor = parseLocalDate(dateRange.startDate);
        const endD = parseLocalDate(dateRange.endDate);
        while (cursor <= endD) {
            const dateStr = getLocalDateString(cursor);
            const lyDowStr = getLocalDateString(getSameWeekdayNearLastYearDate(cursor));
            storeNames.forEach(store => {
                const id = `${dateStr}_${store}`;
                if (!entriesById.has(id) && lyLookup.has(`${lyDowStr}_${store}`)) {
                    entriesById.set(id, { id, date: Timestamp.fromDate(new Date(cursor)), store });
                }
            });
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    return Array.from(entriesById.values()).map(report => {
        if (!report.date) return report;
        const cyDate = report.date.toDate();
        const lyDowDate = getSameWeekdayNearLastYearDate(cyDate);
        const lyDowStr = getLocalDateString(lyDowDate);
        const lyCalStr = getLocalDateString(getSameCalendarDateLastYear(cyDate));
        const lyCalReport = lyLookup.get(`${lyCalStr}_${report.store}`);
        const lyDowReport = lyLookup.get(`${lyDowStr}_${report.store}`);

        const dowPatch = {
            lyDowCompareDate: lyDowStr,
            lyDateCompareDate: lyCalStr,
        };
        if (lyCalReport?.weather) dowPatch.weather_ly = lyCalReport.weather;
        if (lyDowReport?.weather) dowPatch.weather_ly_dow = lyDowReport.weather;
        if (lyDowReport) {
            dowPatch.sales_ly_dow = getLySourceValue(lyDowReport, 'sales');
            dowPatch.customers_ly_dow = getLySourceValue(lyDowReport, 'customers');
            dowPatch.customer_spend_ly_dow = getLyCustomerSpend(lyDowReport);
            dowPatch.waste_product_ly_dow = getLySourceValue(lyDowReport, 'waste_product');
            dowPatch.waste_owner_8_ly_dow = getLySourceValue(lyDowReport, 'waste_owner_8');
            dowPatch.waste_owner_10_ly_dow = getLySourceValue(lyDowReport, 'waste_owner_10');
            dowPatch.waste_promo_8_ly_dow = getLySourceValue(lyDowReport, 'waste_promo_8');
            dowPatch.waste_promo_10_ly_dow = getLySourceValue(lyDowReport, 'waste_promo_10');
        }
        return { ...report, ...dowPatch };
    });
};

const buildTableCombinedReports = (reports, reportsLY, dateRange = null) =>
    enrichReportsWithWeekdayLy(mergeCalendarYearLyReports(reports, reportsLY), reportsLY, dateRange);

const buildWeatherByDate = (reports) => {
    const map = new Map();
    reports.forEach(r => {
        if (!r.date || !r.weather) return;
        const dateStr = getLocalDateString(r.date.toDate());
        if (!map.has(dateStr)) map.set(dateStr, r.weather);
    });
    return map;
};

const getLyWeatherColumnCount = (showLyWeather, lyCompareMode, yoyMode) => {
    if (!showLyWeather || yoyMode === 'cy') return 0;
    if (lyCompareMode === 'both') return 6;
    return 3;
};

const getTableMetaColumnCount = (tableConfig) =>
    3 + getLyWeatherColumnCount(tableConfig.showLyWeather, tableConfig.lyCompareMode, tableConfig.yoyMode);

const resolveRowWeather = (storeData, pickKey) => {
    const report = Object.values(storeData).find(r => r && r[pickKey]);
    return report?.[pickKey] ?? null;
};

const WeatherMetaHeader = ({ label, subLabel, isPriorYear, isWeekdayLy = false }) => (
    <th
        rowSpan={3}
        className={`px-2 py-3 text-center text-xs font-bold tracking-wider align-bottom border-b border-gray-200 ${isPriorYear ? 'text-gray-400 font-medium' : 'text-gray-500'} ${isPriorYear ? (isWeekdayLy ? 'bg-amber-50/80' : 'bg-slate-100') : 'bg-slate-100'}`}
        style={isPriorYear ? (isWeekdayLy ? lyColumnHatchStyleDow : lyColumnHatchStyle) : undefined}
    >
        {subLabel && <div className="text-[10px] font-semibold leading-tight mb-0.5">{subLabel}</div>}
        <div>{label}</div>
    </th>
);

const WeatherMetaCells = ({ weather, isPriorYear = false, lyCompareKind = null, lyCompareDate = null, isWeekdayLy = false }) => {
    const cellStyle = isPriorYear ? (isWeekdayLy ? lyColumnHatchStyleDow : lyColumnHatchStyle) : undefined;
    const priorClass = isPriorYear ? 'text-gray-500' : 'text-gray-600';
    const title = isPriorYear && lyCompareKind && lyCompareDate
        ? (lyCompareKind === 'weekday'
            ? `前年曜日: ${formatDateWithWeekday(lyCompareDate)}`
            : `前年同日: ${formatDateWithWeekday(lyCompareDate)}`)
        : undefined;
    return (
        <>
            <td title={title} className={`px-2 py-3 text-center border-b border-gray-100 ${priorClass}`} style={cellStyle}>
                {weather ? getWeatherIcon(weather.weatherCode) : '-'}
            </td>
            <td title={title} className={`px-2 py-3 text-right text-sm border-b border-gray-100 ${priorClass}`} style={cellStyle}>
                {weather ? `${weather.maxTemp}°C` : '-'}
            </td>
            <td title={title} className={`px-2 py-3 text-right text-sm border-b border-gray-100 ${priorClass}`} style={cellStyle}>
                {weather ? `${weather.precipitation}mm` : '-'}
            </td>
        </>
    );
};

const renderWeatherMetaHeaders = (tableConfig) => {
    const headers = [
        <WeatherMetaHeader key="cy-weather" label="天気" subLabel="本年" />,
        <WeatherMetaHeader key="cy-temp" label="気温" subLabel="本年" />,
        <WeatherMetaHeader key="cy-precip" label="降水" subLabel="本年" />,
    ];
    if (!tableConfig.showLyWeather || tableConfig.yoyMode === 'cy') return headers;
    if (tableConfig.lyCompareMode === 'date' || tableConfig.lyCompareMode === 'both') {
        headers.push(
            <WeatherMetaHeader key="ly-date-weather" label="天気" subLabel="前年同日" isPriorYear />,
            <WeatherMetaHeader key="ly-date-temp" label="気温" subLabel="前年同日" isPriorYear />,
            <WeatherMetaHeader key="ly-date-precip" label="降水" subLabel="前年同日" isPriorYear />,
        );
    }
    if (tableConfig.lyCompareMode === 'weekday' || tableConfig.lyCompareMode === 'both') {
        headers.push(
            <WeatherMetaHeader key="ly-dow-weather" label="天気" subLabel="前年曜日" isPriorYear isWeekdayLy />,
            <WeatherMetaHeader key="ly-dow-temp" label="気温" subLabel="前年曜日" isPriorYear isWeekdayLy />,
            <WeatherMetaHeader key="ly-dow-precip" label="降水" subLabel="前年曜日" isPriorYear isWeekdayLy />,
        );
    }
    return headers;
};

const renderWeatherMetaCells = (tableConfig, { storeData, date }) => {
    const sampleReport = Object.values(storeData).find(r => r);
    const dailyWeather = resolveRowWeather(storeData, 'weather');
    const lyDateStr = sampleReport?.lyDateCompareDate
        || getLocalDateString(getSameCalendarDateLastYear(new Date(`${date}T00:00:00`)));
    const lyDowStr = sampleReport?.lyDowCompareDate
        || getLocalDateString(getSameWeekdayNearLastYearDate(new Date(`${date}T00:00:00`)));
    const weatherLy = resolveRowWeather(storeData, 'weather_ly') || tableConfig.weatherByDateLy?.get(lyDateStr) || null;
    const weatherLyDow = resolveRowWeather(storeData, 'weather_ly_dow') || tableConfig.weatherByDateLy?.get(lyDowStr) || null;

    const cells = [
        <WeatherMetaCells key="cy" weather={dailyWeather} />,
    ];
    if (!tableConfig.showLyWeather || tableConfig.yoyMode === 'cy') return cells;
    if (tableConfig.lyCompareMode === 'date' || tableConfig.lyCompareMode === 'both') {
        cells.push(
            <WeatherMetaCells key="ly-date" weather={weatherLy} isPriorYear lyCompareKind="date" lyCompareDate={lyDateStr} />
        );
    }
    if (tableConfig.lyCompareMode === 'weekday' || tableConfig.lyCompareMode === 'both') {
        cells.push(
            <WeatherMetaCells key="ly-dow" weather={weatherLyDow} isPriorYear lyCompareKind="weekday" lyCompareDate={lyDowStr} isWeekdayLy />
        );
    }
    return cells;
};

const getTimestampFromDateString = (dateString) => {
    const localDate = new Date(`${dateString}T00:00:00`);
    return Timestamp.fromDate(localDate);
};

// ==============================================================================
// 時間帯データ取込（作業割当プロジェクトからの読み取り専用アクセス）
// ==============================================================================

// 作業割当側の店舗ID → 店舗名 のマップを作る
const fetchSagyouStoreMap = async () => {
    const snap = await getDocs(collection(sagyouDb, SAGYOU_STORES_PATH));
    const map = {};
    snap.forEach(d => {
        const name = d.data().name;
        if (name) map[d.id] = name;
    });
    return map;   // { "b2og29...": "伊賀忍者市駅南店", ... }
};

// 指定店舗・指定期間の時間帯データを取得
const fetchSagyouHourly = async (sagyouStoreId, fromDate, toDate) => {
    const q = query(
        collection(sagyouDb, SAGYOU_HOURLY_PATH),
        where(documentId(), '>=', `${sagyouStoreId}_${fromDate}`),
        where(documentId(), '<=', `${sagyouStoreId}_${toDate}`)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, hourlyData: d.data().hourlyData || {} }));
};

const summarizeHourly = (hourlyData) => {
    let hoursFilled = 0, custSum = 0, salesSum = 0;
    for (let h = 0; h < 24; h++) {
        const e = hourlyData[String(h)];
        if (!e) continue;                          // 欠測時間はスキップ
        hoursFilled++;
        if (typeof e.customers === 'number') custSum  += e.customers;
        if (typeof e.sales     === 'number') salesSum += e.sales;
    }
    return { hoursFilled, custSum, salesSum };
};

// プレビュー行の判定（警告は表示のみ。取り込み自体は実行する）
const judgeHourlyRow = ({ hoursFilled, custSum, salesSum, sales, customers }) => {
    const labels = [];
    let level = 'ok';
    const salesDiff = (typeof sales === 'number') ? sales - salesSum : null;

    // 取り違えは両方向に起こるため、どちらか一方でも成立したら疑いとする
    //   ケースA: 時間帯側の売上欄に客数を入れた → 時間帯売上 ≒ 日販客数
    //   ケースB: 日販側の売上欄に客数を入れた   → 日販売上   ≒ 時間帯客数
    const swapSuspect = salesDiff !== null && Math.abs(salesDiff) > 50000 && (
        (typeof customers === 'number' && Math.abs(salesSum / 1000 - customers) < 2) ||
        Math.abs(sales / 1000 - custSum) < 2
    );
    if (swapSuspect) {
        labels.push('🔴 取り違え疑い');
        level = 'danger';
    }
    if (hoursFilled !== 24) {
        labels.push('⚠️ 不完全');
        if (level === 'ok') level = 'warn';
    }
    if (salesDiff !== null && Math.abs(salesDiff) > 3000) {
        labels.push('⚠️ 売上差大');
        if (level === 'ok') level = 'warn';
    }
    if (typeof customers === 'number' && customers !== custSum) {
        labels.push('⚠️ 客数不一致');
        if (level === 'ok') level = 'warn';
    }
    if (labels.length === 0) labels.push('✅ 正常');
    return { level, labels };
};

// 日販入力画面向けの突合メッセージ（judgeHourlyRow の結果を表示用に変換）
const getNippoHourlyMessages = (judgeResult, hourlySummary, salesInYen, customersCount) => {
    const messages = [];
    if (judgeResult.level === 'danger') {
        messages.push({ type: 'danger', text: '🔴 売上と客数が入れ替わっている可能性があります' });
    }
    if (typeof salesInYen === 'number' && !isNaN(salesInYen)) {
        const salesDiff = salesInYen - hourlySummary.salesSum;
        if (Math.abs(salesDiff) > 3000) {
            messages.push({ type: 'warn', text: `⚠️ 時間帯データとの差が大きいです（差：${salesDiff.toLocaleString()}円）` });
        }
    }
    if (typeof customersCount === 'number' && !isNaN(customersCount) && customersCount !== hourlySummary.custSum) {
        messages.push({ type: 'warn', text: `⚠️ 客数が一致しません（時間帯データ：${hourlySummary.custSum.toLocaleString()}人）` });
    }
    if (messages.length === 0 && (typeof salesInYen === 'number' || typeof customersCount === 'number')) {
        messages.push({ type: 'ok', text: '✅ 時間帯データと整合しています' });
    }
    return messages;
};

// 取り込んだ時間帯データを削除（hourly_* 6フィールドのみ。既存フィールドは触らない）
const rollbackHourly = async (targetDocIds, onProgress) => {
    const BATCH_SIZE = 400;
    const deletePayload = {
        hourlyData:           deleteField(),
        hourly_hoursFilled:   deleteField(),
        hourly_customers_sum: deleteField(),
        hourly_sales_sum:     deleteField(),
        hourly_syncedAt:      deleteField(),
        hourly_sourceId:      deleteField(),
    };
    let success = 0, failed = 0;
    for (let i = 0; i < targetDocIds.length; i += BATCH_SIZE) {
        const chunk = targetDocIds.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(id => {
            batch.update(doc(db, dailyReportsPath, id), deletePayload);
        });
        try {
            await batch.commit();
            success += chunk.length;
        } catch (error) {
            console.error('時間帯データの削除エラー: ', error);
            failed += chunk.length;
        }
        onProgress?.({ done: Math.min(i + BATCH_SIZE, targetDocIds.length), total: targetDocIds.length });
    }
    return { success, failed };
};

const getWeatherIcon = (weatherCode) => {
    const icons = {
        0: '☀️', 1: '🌤️', 2: '⛅️', 3: '☁️', 45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
        80: '⛈️', 81: '⛈️', 82: '⛈️',
    };
    return icons[weatherCode] || '❓';
};

// Open-Meteo から指定日の天気を取得（取得できなければ null）
const fetchOpenMeteoDaily = async (baseUrl, date) => {
    try {
        const url = `${baseUrl}?latitude=34.77&longitude=136.13&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.daily || data.daily.weathercode?.[0] == null || data.daily.temperature_2m_max?.[0] == null) return null;
        return {
            weatherCode: data.daily.weathercode[0],
            maxTemp: data.daily.temperature_2m_max[0],
            precipitation: data.daily.precipitation_sum?.[0] ?? 0,
        };
    } catch (error) {
        console.error("天気データの取得に失敗しました:", error);
        return null;
    }
};

// 指定日の天気を返す。保存済みの天気があればそれを使い、無ければ Open-Meteo から取得する
const fetchWeatherForDate = async (date) => {
    try {
        const weatherQuery = query(
            collection(db, dailyReportsPath),
            where("date", "==", getTimestampFromDateString(date)),
            limit(10)
        );
        const weatherSnapshot = await getDocs(weatherQuery);
        const reportWithWeather = weatherSnapshot.docs.find(doc => doc.data().weather);
        if (reportWithWeather) return reportWithWeather.data().weather;
    } catch (error) {
        console.error("保存済み天気データの取得に失敗しました:", error);
    }
    // 予報APIは約3か月前までしか返さないため、1週間より前の日付は過去実績APIを先に使う
    const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
    const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
    const daysAgo = Math.floor((new Date() - new Date(`${date}T00:00:00`)) / (1000 * 60 * 60 * 24));
    const urls = daysAgo > 7 ? [ARCHIVE_URL, FORECAST_URL] : [FORECAST_URL, ARCHIVE_URL];
    for (const baseUrl of urls) {
        const weather = await fetchOpenMeteoDaily(baseUrl, date);
        if (weather) return weather;
    }
    return null;
};

const useReports = (startDate, endDate, trigger) => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        return onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        if (!user || !startDate || !endDate || startDate > endDate) {
            setData([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);
        const q = query(collection(db, dailyReportsPath), where("date", ">=", startTimestamp), where("date", "<=", endTimestamp));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(fetchedData);
            setIsLoading(false);
        }, (error) => {
            console.error("レポートの取得中にエラーが発生しました: ", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [startDate, endDate, trigger, user]);

    return { data, isLoading };
};

const useMasterData = (path, statusFilter = null) => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);

    useEffect(() => {
        return onAuthStateChanged(auth, setUser);
    }, []);

    useEffect(() => {
        if (!user) return;
        setIsLoading(true);
        
        let q = collection(db, path);
        if (statusFilter) {
            q = query(q, where("status", "==", statusFilter));
        }

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            let fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (path === employeesPath) {
                const roleOrder = ['経営者', 'マネージャー', 'リーダー', 'クルー', 'サポーター', 'トレーニー', '外注業者'];
                fetchedData.sort((a, b) => {
                    const roleAIndex = roleOrder.indexOf(a.role);
                    const roleBIndex = roleOrder.indexOf(b.role);
                    if (roleAIndex === -1) return 1;
                    if (roleBIndex === -1) return -1;
                    return roleAIndex - roleBIndex;
                });
            } else if (fetchedData.length > 0 && fetchedData[0].order !== undefined) {
                fetchedData.sort((a,b) => a.order - b.order);
            }
            setData(fetchedData);
            setIsLoading(false);
        }, (error) => {
            console.error(`'${path}'からのマスターデータ取得中にエラーが発生しました: `, error); 
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [path, statusFilter, user]);
    return { data, isLoading };
}

// ==============================================================================
// Component Definitions
// ==============================================================================

const NavItem = ({ icon, label, isActive, onClick }) => {
    const IconWrapper = ({ children, isActive }) => (
        <div className={`w-12 h-12 flex items-center justify-center rounded-lg mb-3 transition-all duration-300 ${
            isActive 
                ? 'bg-white/20 backdrop-blur-sm' 
                : 'bg-gray-100 group-hover:bg-blue-50'
        }`}>
            <div className={`${isActive ? 'text-white' : 'text-gray-600 group-hover:text-blue-600'}`} style={{ width: '24px', height: '24px' }}>
                {children}
            </div>
        </div>
    );

    return (
        <button
            type="button"
            onClick={(e) => { e.preventDefault(); onClick(); }} 
            className={`group relative flex flex-col items-center justify-center p-5 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer min-h-[120px] w-full ${
                isActive 
                    ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-xl ring-4 ring-blue-200/50 scale-[1.02]' 
                    : 'bg-white text-gray-700 shadow-lg hover:shadow-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-white'
            }`}
        >
            <IconWrapper isActive={isActive}>
                {icon}
            </IconWrapper>
            <span className={`text-xs font-bold text-center leading-tight px-1 ${isActive ? 'text-white' : 'text-gray-700 group-hover:text-blue-700'}`}>
                {label}
            </span>
            {isActive && (
                <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-white rounded-full shadow-md animate-pulse"></div>
            )}
        </button>
    );
};

const InputField = ({ label, ...props }) => (
    <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input {...props} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500" />
    </div>
);

const BasicInfoSelectors = ({ date, setDate, storeName, setStoreName, stores, inputBy, setInputBy, employees, weatherData, isWeatherLoading }) => (
    <div className="p-4 border rounded-lg bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">日付</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">店舗</label>
                <select value={storeName} onChange={(e) => setStoreName(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                    <option value="" disabled>-- 店舗を選択してください --</option>
                    {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">入力者</label>
                <select value={inputBy} onChange={(e) => setInputBy(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                    <option value="" disabled>-- 選択してください --</option>
                    {employees.map(e => {
                        const displayName = (e.nickname || '').trim() || `${e.lastName || ''} ${e.firstName || ''}`.trim();
                        return <option key={e.id} value={displayName}>{displayName}</option>
                    })}
                </select>
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700">天気</label>
                <div className="mt-1 flex items-center justify-center h-10 p-2 border border-gray-300 rounded-md shadow-sm bg-white">
                    {isWeatherLoading ? (
                        <span className="text-sm text-gray-500">読み込み中...</span>
                    ) : weatherData ? (
                        <span className="text-lg">{getWeatherIcon(weatherData.weatherCode)} {weatherData.maxTemp}°C</span>
                    ) : (
                        <span className="text-sm text-gray-500">-</span>
                    )}
                </div>
            </div>
        </div>
    </div>
);

const NippoInputPage = ({ stores, employees }) => {
    const [date, setDate] = useState(getLocalDateString(new Date()));
    const [storeName, setStoreName] = useState('');
    const [inputBy, setInputBy] = useState('');
    const [formData, setFormData] = useState({ sales: '', customers: ''});
    const [weatherData, setWeatherData] = useState(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);
    const [hourlySummary, setHourlySummary] = useState(null);   // { hoursFilled, custSum, salesSum } | null
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        // 日付・店舗を素早く切り替えたとき、古い読み込み結果で画面を上書きしないためのフラグ
        let cancelled = false;
        const processDateChange = async () => {
            if (!date) return;

            setIsWeatherLoading(true);
            setWeatherData(null);
            setHourlySummary(null);

            const weather = await fetchWeatherForDate(date);
            if (cancelled) return;
            setWeatherData(weather);
            setIsWeatherLoading(false);

            // 作業割当から当日の時間帯データを取得（天気取得と同タイミング）
            if (storeName) {
                try {
                    const sagyouMap = await fetchSagyouStoreMap();
                    const sagyouStoreId = Object.entries(sagyouMap).find(([, name]) => name === storeName)?.[0];
                    if (sagyouStoreId) {
                        const docs = await fetchSagyouHourly(sagyouStoreId, date, date);
                        if (cancelled) return;
                        const hourlyData = docs[0]?.hourlyData;
                        if (hourlyData && Object.keys(hourlyData).length > 0) {
                            setHourlySummary(summarizeHourly(hourlyData));
                        }
                    }
                } catch (error) {
                    console.error("時間帯データの取得に失敗しました:", error);
                }
            }
            
            if (storeName) {
                const docId = `${date}_${storeName}`;
                const docRef = doc(db, dailyReportsPath, docId);
                const docSnap = await getDoc(docRef);
                if (cancelled) return;
                if (docSnap.exists()) { 
                    const data = docSnap.data();
                    setFormData({ 
                        sales: data.sales ? data.sales / 1000 : '', 
                        customers: data.customers || '' 
                    });
                } else { 
                    setFormData({ sales: '', customers: '' });
                }
            } else {
                setFormData({ sales: '', customers: '' });
            }
        };
        
        processDateChange();
        return () => { cancelled = true; };
    }, [date, storeName]);

    const hourlyComparison = useMemo(() => {
        if (!hourlySummary) return null;
        const salesInYen = formData.sales !== '' ? Number(formData.sales) * 1000 : null;
        const customersCount = formData.customers !== '' ? Number(formData.customers) : null;
        if (salesInYen === null && customersCount === null) return null;
        const sales = (typeof salesInYen === 'number' && !isNaN(salesInYen)) ? salesInYen : null;
        const customers = (typeof customersCount === 'number' && !isNaN(customersCount)) ? customersCount : null;
        const judgeResult = judgeHourlyRow({
            hoursFilled: hourlySummary.hoursFilled,
            custSum: hourlySummary.custSum,
            salesSum: hourlySummary.salesSum,
            sales,
            customers,
        });
        return getNippoHourlyMessages(judgeResult, hourlySummary, sales, customers);
    }, [hourlySummary, formData.sales, formData.customers]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true); setMessage('');
        if (!date || !storeName || !inputBy) {
            setMessage({ type: 'error', text: '日付、店舗、入力者を選択してください。' });
            setIsLoading(false);
            return;
        }
        // 空欄の項目は保存しない（既存の値を0で上書きしないため）
        const salesText = String(formData.sales).trim();
        const customersText = String(formData.customers).trim();
        if (salesText === '' && customersText === '') {
            setMessage({ type: 'error', text: '日販または客数を入力してください。' });
            setIsLoading(false);
            return;
        }
        if ((salesText !== '' && isNaN(Number(salesText))) || (customersText !== '' && isNaN(Number(customersText)))) {
            setMessage({ type: 'error', text: '日販・客数は半角の数値で入力してください。' });
            setIsLoading(false);
            return;
        }
        const docId = `${date}_${storeName}`;
        try {
            const docRef = doc(db, dailyReportsPath, docId);
            let salesInYen = salesText !== '' ? Number(salesText) * 1000 : null;
            let customersCount = customersText !== '' ? Number(customersText) : null;
            const payload = {
                store: storeName,
                date: getTimestampFromDateString(date),
                inputBy_sales: inputBy,
                updatedAt_sales: Timestamp.now(),
            };
            if (salesInYen !== null) payload.sales = salesInYen;
            if (customersCount !== null) payload.customers = customersCount;
            // 片方だけ入力された場合は、保存済みの値と組み合わせて客単価を計算する
            if (salesInYen === null || customersCount === null) {
                const existing = (await getDoc(docRef)).data() || {};
                if (salesInYen === null && typeof existing.sales === 'number') salesInYen = existing.sales;
                if (customersCount === null && typeof existing.customers === 'number') customersCount = existing.customers;
            }
            if (salesInYen !== null && customersCount !== null) {
                payload.customer_spend = (salesInYen > 0 && customersCount > 0) ? (salesInYen / customersCount) : 0;
            }
            if (weatherData) {
                payload.weather = weatherData;
            }

            await setDoc(docRef, payload, { merge: true });
            setMessage({ type: 'success', text: '日販データを保存しました！' });
            setFormData({ sales: '', customers: '' });
            setInputBy('');
        } catch (error) { 
            setMessage({ type: 'error', text: `エラー: ${error.message}` }); 
        } finally { 
            setIsLoading(false); 
            setTimeout(() => setMessage(''), 4000); 
        }
    };
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-6">日販入力</h1>
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow max-w-4xl mx-auto space-y-6">
            <BasicInfoSelectors date={date} setDate={setDate} storeName={storeName} setStoreName={setStoreName} stores={stores} inputBy={inputBy} setInputBy={setInputBy} employees={employees} weatherData={weatherData} isWeatherLoading={isWeatherLoading} />
            {hourlySummary && (
                <div className="p-4 border rounded-lg bg-blue-50 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">作業割当アプリの時間帯データ</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>客数合計：<span className="font-semibold">{hourlySummary.custSum.toLocaleString()}人</span></div>
                        <div>売上合計：<span className="font-semibold">{hourlySummary.salesSum.toLocaleString()}円</span></div>
                        <div>
                            入力済み時間：
                            <span className={`font-semibold ${hourlySummary.hoursFilled !== 24 ? 'text-yellow-600' : ''}`}>
                                {hourlySummary.hoursFilled} / 24
                            </span>
                        </div>
                    </div>
                    {hourlyComparison && hourlyComparison.map((msg, i) => (
                        <p key={i} className={`text-sm font-medium p-2 rounded ${
                            msg.type === 'danger' ? 'bg-red-100 text-red-700'
                            : msg.type === 'warn' ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-700'
                        }`}>{msg.text}</p>
                    ))}
                </div>
            )}
            <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">本日のデータ</h3>
                <InputField label="日販 (千円)" name="sales" value={formData.sales} onChange={(e) => setFormData({...formData, sales: e.target.value})} type="text" inputMode="decimal" placeholder="例: 567 (567,000円の場合)" />
                <InputField label="客数" name="customers" value={formData.customers} onChange={(e) => setFormData({...formData, customers: e.target.value})} type="text" inputMode="decimal" placeholder="例: 500" />
            </div>
            <div className="text-center pt-4">
                <button type="submit" disabled={isLoading || !inputBy || !storeName} className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">{isLoading ? '保存中...' : '日販データを保存'}</button>
            </div>
            {message && <p className={`mt-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}
        </form>
      </div>
    );
};

const HaikiInputPage = ({ stores, employees }) => {
    const [date, setDate] = useState(getLocalDateString(new Date()));
    const [storeName, setStoreName] = useState('');
    const [inputBy, setInputBy] = useState('');
    const [formData, setFormData] = useState({ waste_product: '', waste_owner_8: '', waste_owner_10: '', waste_promo_8: '', waste_promo_10: '' });
    const [weatherData, setWeatherData] = useState(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        // 日付・店舗を素早く切り替えたとき、古い読み込み結果で画面を上書きしないためのフラグ
        let cancelled = false;
        const processDateChange = async () => {
            if (!date) return;

            setIsWeatherLoading(true);
            setWeatherData(null);

            const weather = await fetchWeatherForDate(date);
            if (cancelled) return;
            setWeatherData(weather);
            setIsWeatherLoading(false);
            
            if (storeName) {
                const docId = `${date}_${storeName}`;
                const docRef = doc(db, dailyReportsPath, docId);
                const docSnap = await getDoc(docRef);
                if (cancelled) return;
                if (docSnap.exists()) { 
                    const data = docSnap.data();
                    setFormData({ waste_product: data.waste_product || '', waste_owner_8: data.waste_owner_8 || '', waste_owner_10: data.waste_owner_10 || '', waste_promo_8: data.waste_promo_8 || '', waste_promo_10: data.waste_promo_10 || '' });
                } else { 
                    setFormData({ waste_product: '', waste_owner_8: '', waste_owner_10: '', waste_promo_8: '', waste_promo_10: '' });
                }
            } else {
                setFormData({ waste_product: '', waste_owner_8: '', waste_owner_10: '', waste_promo_8: '', waste_promo_10: '' });
            }
        };
        
        processDateChange();
        return () => { cancelled = true; };
    }, [date, storeName]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true); setMessage('');
        if (!date || !storeName || !inputBy) {
            setMessage({ type: 'error', text: '日付、店舗、入力者を選択してください。' });
            setIsLoading(false);
            return;
        }
        const wasteKeys = HAIKI_WASTE_FIELDS.map(f => f.key);
        const enteredKeys = wasteKeys.filter(key => String(formData[key]).trim() !== '');
        if (enteredKeys.length === 0) {
            setMessage({ type: 'error', text: '廃棄・値下げの金額を1項目以上入力してください。' });
            setIsLoading(false);
            return;
        }
        if (enteredKeys.some(key => isNaN(Number(formData[key])))) {
            setMessage({ type: 'error', text: '金額は半角の数値で入力してください。' });
            setIsLoading(false);
            return;
        }
        const docId = `${date}_${storeName}`;
        try {
            const docRef = doc(db, dailyReportsPath, docId);
            const payload = {
                store: storeName,
                date: getTimestampFromDateString(date),
                inputBy_waste: inputBy,
                updatedAt_waste: Timestamp.now(),
            };
            // 空欄の項目は、保存済みの値があれば上書きしない。まだ値が無い場合のみ0を入れる
            const existing = (await getDoc(docRef)).data() || {};
            wasteKeys.forEach(key => {
                if (enteredKeys.includes(key)) {
                    payload[key] = Number(formData[key]);
                } else if (existing[key] == null) {
                    payload[key] = 0;
                }
            });
             if (weatherData) {
                payload.weather = weatherData;
            }

            await setDoc(docRef, payload, { merge: true });
            setMessage({ type: 'success', text: '廃棄データを保存しました！' });
            setFormData({ waste_product: '', waste_owner_8: '', waste_owner_10: '', waste_promo_8: '', waste_promo_10: '' });
            setInputBy('');
        } catch (error) { 
            setMessage({ type: 'error', text: `エラー: ${error.message}` }); 
        } finally { 
            setIsLoading(false); 
            setTimeout(() => setMessage(''), 4000); 
        }
    };
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">廃棄・値下げ入力</h1>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow max-w-4xl mx-auto space-y-6">
                <BasicInfoSelectors date={date} setDate={setDate} storeName={storeName} setStoreName={setStoreName} stores={stores} inputBy={inputBy} setInputBy={setInputBy} employees={employees} weatherData={weatherData} isWeatherLoading={isWeatherLoading} />
                <div className="border-t pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <InputField label="商品廃棄" name="waste_product" value={formData.waste_product} onChange={(e) => setFormData({...formData, waste_product: e.target.value})} type="text" inputMode="decimal" />
                    <InputField label="オーナー値下げ (8%)" name="waste_owner_8" value={formData.waste_owner_8} onChange={(e) => setFormData({...formData, waste_owner_8: e.target.value})} type="text" inputMode="decimal" />
                    <InputField label="オーナー値下げ (10%)" name="waste_owner_10" value={formData.waste_owner_10} onChange={(e) => setFormData({...formData, waste_owner_10: e.target.value})} type="text" inputMode="decimal" />
                    <InputField label="販促値下げ (8%)" name="waste_promo_8" value={formData.waste_promo_8} onChange={(e) => setFormData({...formData, waste_promo_8: e.target.value})} type="text" inputMode="decimal" />
                    <InputField label="販促値下げ (10%)" name="waste_promo_10" value={formData.waste_promo_10} onChange={(e) => setFormData({...formData, waste_promo_10: e.target.value})} type="text" inputMode="decimal" />
                </div>
                <div className="text-center"><button type="submit" disabled={isLoading || !inputBy || !storeName} className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">{isLoading ? '保存中...' : '廃棄データを保存'}</button></div>
                {message && <p className={`mt-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}
            </form>
        </div>
    );
};

const BulkInputPage = ({ stores }) => {
    const currentYear = new Date().getFullYear();
    const [storeName, setStoreName] = useState('');
    const [year, setYear] = useState(currentYear - 1);
    const [month, setMonth] = useState(1);
    const [gridData, setGridData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchMonthData = async () => {
            const daysInMonth = new Date(year, month, 0).getDate();
            let newGridData = Array.from({ length: daysInMonth }, (_, i) => ({
                day: i + 1,
                dateString: `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
                sales_ly: '', customers_ly: ''
            }));

            if (!storeName) {
                setGridData(newGridData);
                return;
            }

            setIsLoading(true);
            
            const startDate = getTimestampFromDateString(`${year}-${String(month).padStart(2, '0')}-01`);
            const endDate = getTimestampFromDateString(`${year}-${String(month).padStart(2, '0')}-${daysInMonth}`);
            
            const q = query(collection(db, dailyReportsPath), where("store", "==", storeName), where("date", ">=", startDate), where("date", "<=", endDate));
            
            try {
                const querySnapshot = await getDocs(q);

                const reportsForStore = {};
                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    const dateStr = getLocalDateString(data.date.toDate());
                    reportsForStore[dateStr] = data;
                });

                newGridData = newGridData.map(dayData => {
                    const report = reportsForStore[dayData.dateString];
                    if (report) {
                        return {
                            ...dayData,
                            sales_ly: report.sales_ly ? report.sales_ly / 1000 : (report.sales ? report.sales / 1000 : ''),
                            customers_ly: report.customers_ly || report.customers || ''
                        };
                    }
                    return dayData;
                });

                setGridData(newGridData);
            } catch (error) {
                console.error("一括入力データの取得エラー:", error);
                setMessage({type: 'error', text: 'データの取得に失敗しました。'});
            } finally {
                setIsLoading(false);
            }
        };
        fetchMonthData();
    }, [storeName, year, month]);

    const handleInputChange = (index, field, value) => {
        const updatedGrid = [...gridData];
        updatedGrid[index][field] = value;
        setGridData(updatedGrid);
    };

    const handleBlurSave = async (index) => {
        if (!storeName) {
            setMessage({ type: 'error', text: '先に店舗を選択してください。' });
            setTimeout(() => setMessage(''), 3000);
            return;
        }

        const dayData = gridData[index];
        if (!dayData.sales_ly && !dayData.customers_ly) {
            return;
        }

        setMessage({ type: 'info', text: `${dayData.dateString}のデータを保存中...` });
        const docId = `${dayData.dateString}_${storeName}`;
        const docRef = doc(db, dailyReportsPath, docId);

        try {
            const salesValue = (Number(dayData.sales_ly) || 0) * 1000;
            const customersValue = Number(dayData.customers_ly) || 0;
            
            const payload = {
                store: storeName,
                date: getTimestampFromDateString(dayData.dateString),
                sales_ly: salesValue,
                customers_ly: customersValue,
                customer_spend_ly: customersValue > 0 ? salesValue / customersValue : 0
            };

            await setDoc(docRef, payload, { merge: true });
            setMessage({ type: 'success', text: `${dayData.dateString} のデータを保存しました。` });

        } catch (error) {
            setMessage({ type: 'error', text: `保存エラー: ${error.message}` });
        } finally {
            setTimeout(() => setMessage(''), 3000);
        }
    };
    
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">前年データ一括入力</h1>
            <div className="bg-white p-8 rounded-lg shadow space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-gray-50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">店舗</label>
                        <select value={storeName} onChange={e => setStoreName(e.target.value)} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm">
                           <option value="" disabled>-- 店舗を選択 --</option>
                           {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">年</label>
                        <select value={year} onChange={e => setYear(Number(e.target.value))} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm">
                            {[...Array(3)].map((_, i) => {
                                const y = new Date().getFullYear() - i;
                                return <option key={y} value={y}>{y}</option>
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">月</label>
                        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="mt-1 block w-full p-2 border-gray-300 rounded-md shadow-sm">
                            {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1}月</option>)}
                        </select>
                    </div>
                </div>
                {message && <p className={`mb-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : message.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}
                {storeName ? (
                    <>
                        <div className="overflow-x-auto border rounded-lg max-h-[60vh]">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">日付</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">前年売上 (千円)</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">前年客数</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {isLoading ? (
                                        <tr><td colSpan="3" className="text-center p-8 text-gray-500">読み込み中...</td></tr>
                                    ) : (
                                        gridData.map((row, index) => (
                                            <tr key={row.day} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-800">{row.dateString}</td>
                                                <td className="px-4 py-2"><input type="text" inputMode="decimal" className="w-full p-1 border rounded-md" value={row.sales_ly} onChange={e => handleInputChange(index, 'sales_ly', e.target.value)} onBlur={() => handleBlurSave(index)} /></td>
                                                <td className="px-4 py-2"><input type="text" inputMode="decimal" className="w-full p-1 border rounded-md" value={row.customers_ly} onChange={e => handleInputChange(index, 'customers_ly', e.target.value)} onBlur={() => handleBlurSave(index)} /></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <p>まず、店舗を選択してください。</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const HomeDashboard = ({ dateRange, onRefresh }) => {
    const { data: allReports, isLoading } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    
    const { summaryDateStr, summaryReports } = useMemo(() => {
        const today = new Date();
        const todayStr = getLocalDateString(today);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);

        const todaysReports = allReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === todayStr);

        if (todaysReports.length > 0) {
            return { summaryDateStr: todayStr, summaryReports: todaysReports };
        } else {
            const yesterdaysReports = allReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === yesterdayStr);
            return { summaryDateStr: yesterdayStr, summaryReports: yesterdaysReports };
        }
    }, [allReports]);

    const summary = useMemo(() => {
        let totalSales = 0, totalWaste = 0;
        summaryReports.forEach(r => {
            totalSales += r.sales || 0;
            totalWaste += (r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0);
        });
        return { totalSales, totalWaste };
    }, [summaryReports]);
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent mb-2">ホーム</h1>
                <h2 className="text-xl text-gray-600 font-medium">サマリー ({summaryDateStr})</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gradient-to-br from-white to-blue-50 p-8 rounded-2xl shadow-lg border-2 border-blue-100 transform hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-600">合計売上</h2>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <SalesIcon />
                        </div>
                    </div>
                    <p className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent mt-2">¥{summary.totalSales.toLocaleString()}</p>
                </div>
                <div className="bg-gradient-to-br from-white to-red-50 p-8 rounded-2xl shadow-lg border-2 border-red-100 transform hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-600">合計 廃棄・値下げ</h2>
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <TrashIcon />
                        </div>
                    </div>
                    <p className="text-5xl font-bold bg-gradient-to-r from-red-600 to-red-800 bg-clip-text text-transparent mt-2">¥{summary.totalWaste.toLocaleString()}</p>
                </div>
            </div>
            <div className="mt-10 bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl shadow-lg border-2 border-gray-200">
                <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white text-xl">👋</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">ようこそ！</h2>
                </div>
                <div className="space-y-2 text-gray-700 leading-relaxed">
                    <p className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        左のメニューから各機能をご利用ください。
                    </p>
                    <p className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        分析画面では、左下のカレンダーで対象期間を変更できます。
                    </p>
                </div>
            </div>
        </div>
    );
};

const ChartCard = ({ title, children }) => ( 
    <div className="bg-white p-6 rounded-lg shadow"> 
        <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2> 
        <div className="h-80">{children}</div> 
    </div> 
);

const buildDateLabelEntries = (startDate, endDate) => {
    const entries = [];
    let currentDate = new Date(startDate);
    if (currentDate > endDate) return entries;
    while (currentDate <= endDate) {
        entries.push({
            key: getLocalDateString(currentDate),
            label: formatDateWithWeekday(currentDate),
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return entries;
};

const DashboardLyCompareControls = ({ lyCompareMode, setLyCompareMode }) => (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-50 border border-gray-200 rounded-xl">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">前年比較</span>
        <div className="flex p-1 bg-gray-100 rounded-lg">
            <button type="button" onClick={() => setLyCompareMode('date')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'date' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>前年同日</button>
            <button type="button" onClick={() => setLyCompareMode('weekday')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'weekday' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>前年曜日</button>
            <button type="button" onClick={() => setLyCompareMode('both')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'both' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>同日+曜日</button>
        </div>
        <span className="text-xs text-gray-500">実線＝本年 / 長破線＝前年同日 / 短破線＝前年曜日</span>
    </div>
);

const useDashboardCombinedReports = (dateRange, onRefresh) => {
    const lyFetchRange = useMemo(
        () => getExtendedLyFetchRange(dateRange.startDateLY, dateRange.endDateLY),
        [dateRange.startDateLY, dateRange.endDateLY]
    );
    const { data: reports, isLoading: isLoadingReports } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const { data: reportsLY, isLoading: isLoadingReportsLY } = useReports(lyFetchRange.start, lyFetchRange.end, onRefresh);
    const combinedReports = useMemo(
        () => buildTableCombinedReports(reports, reportsLY, dateRange),
        [reports, reportsLY, dateRange]
    );
    return {
        combinedReports,
        isLoading: isLoadingReports || isLoadingReportsLY,
    };
};

const getStoreChartColors = (stores) => {
    const baseColors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)'];
    const colors = {};
    stores.forEach((store, index) => {
        colors[store.name] = baseColors[index % baseColors.length];
    });
    return colors;
};

const buildStoreMetricChartData = ({
    stores,
    labelEntries,
    combinedReports,
    cyKey,
    lyKey,
    lyCompareMode,
    colors,
    getCyValue,
    getLyDateValue,
    getLyDowValue,
}) => {
    const labels = labelEntries.map(entry => entry.label);
    const datasets = stores.flatMap(store => {
        const storeData = new Array(labelEntries.length).fill(null);
        const storeDataLyDate = new Array(labelEntries.length).fill(null);
        const storeDataLyDow = new Array(labelEntries.length).fill(null);

        combinedReports.filter(r => r.store === store.name).forEach(r => {
            if (!r.date) return;
            const reportDateStr = getLocalDateString(r.date.toDate());
            const index = labelEntries.findIndex(entry => entry.key === reportDateStr);
            if (index === -1) return;
            storeData[index] = getCyValue ? getCyValue(r) : (r[cyKey] ?? 0);
            const lyDateVal = getLyDateValue ? getLyDateValue(r) : (r[lyKey] ?? null);
            const lyDowVal = getLyDowValue ? getLyDowValue(r) : (r[`${lyKey}_dow`] ?? null);
            storeDataLyDate[index] = lyDateVal;
            storeDataLyDow[index] = lyDowVal;
        });

        const color = colors[store.name];
        const result = [{
            label: `${store.name} (本年)`,
            data: storeData,
            borderColor: color,
            backgroundColor: color.replace('1)', '0.1)'),
            fill: true,
            tension: 0.1,
        }];
        if (lyCompareMode === 'date' || lyCompareMode === 'both') {
            result.push({
                label: `${store.name} (前年同日)`,
                data: storeDataLyDate,
                borderColor: color,
                borderDash: [6, 4],
                fill: false,
                tension: 0.1,
            });
        }
        if (lyCompareMode === 'weekday' || lyCompareMode === 'both') {
            result.push({
                label: `${store.name} (前年曜日)`,
                data: storeDataLyDow,
                borderColor: color,
                borderDash: [2, 3],
                borderWidth: 2,
                fill: false,
                tension: 0.1,
            });
        }
        return result;
    });
    return { labels, datasets };
};

const dashboardLineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
};

const NippoDashboard = ({ stores, dateRange, onRefresh }) => {
    const [lyCompareMode, setLyCompareMode] = useState('date');
    const { combinedReports, isLoading } = useDashboardCombinedReports(dateRange, onRefresh);

    const lineChartData = useMemo(() => {
        const labelEntries = buildDateLabelEntries(dateRange.startDate, dateRange.endDate);
        if (labelEntries.length === 0) {
            return { sales: { labels: [], datasets: [] }, customers: { labels: [], datasets: [] }, customer_spend: { labels: [], datasets: [] } };
        }
        const colors = getStoreChartColors(stores);
        const metrics = [
            { key: 'sales', ly_key: 'sales_ly' },
            { key: 'customers', ly_key: 'customers_ly' },
            { key: 'customer_spend', ly_key: 'customer_spend_ly' },
        ];
        const chartDataSets = {};
        metrics.forEach(metric => {
            chartDataSets[metric.key] = buildStoreMetricChartData({
                stores,
                labelEntries,
                combinedReports,
                cyKey: metric.key,
                lyKey: metric.ly_key,
                lyCompareMode,
                colors,
            });
        });
        return chartDataSets;
    }, [combinedReports, stores, dateRange, lyCompareMode]);
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">日販分析（前年比較）</h1>
            <DashboardLyCompareControls lyCompareMode={lyCompareMode} setLyCompareMode={setLyCompareMode} />
            <div className="grid grid-cols-1 gap-8">
                <ChartCard title="売上（日販）推移"><Line data={lineChartData.sales} options={dashboardLineChartOptions} /></ChartCard>
                <ChartCard title="客数 推移"><Line data={lineChartData.customers} options={dashboardLineChartOptions} /></ChartCard>
                <ChartCard title="客単価 推移"><Line data={lineChartData.customer_spend} options={dashboardLineChartOptions} /></ChartCard>
            </div>
        </div>
    );
};

const HAIKI_WASTE_FIELDS = [
    { key: 'waste_product', lyKey: 'waste_product_ly', label: '商品廃棄', color: 'rgba(255, 99, 132, 1)' },
    { key: 'waste_owner_8', lyKey: 'waste_owner_8_ly', label: 'オーナー値下げ8%', color: 'rgba(54, 162, 235, 1)' },
    { key: 'waste_owner_10', lyKey: 'waste_owner_10_ly', label: 'オーナー値下げ10%', color: 'rgba(255, 206, 86, 1)' },
    { key: 'waste_promo_8', lyKey: 'waste_promo_8_ly', label: '販促値下げ8%', color: 'rgba(75, 192, 192, 1)' },
    { key: 'waste_promo_10', lyKey: 'waste_promo_10_ly', label: '販促値下げ10%', color: 'rgba(153, 102, 255, 1)' },
];

const sumHaikiWaste = (report, variant = 'cy') => {
    if (!report) return 0;
    return HAIKI_WASTE_FIELDS.reduce((sum, field) => {
        let key = field.key;
        if (variant === 'date') key = field.lyKey;
        if (variant === 'dow') key = `${field.key}_ly_dow`;
        return sum + (report[key] || 0);
    }, 0);
};

const getHaikiLyVariant = (lyCompareMode) => (lyCompareMode === 'weekday' ? 'dow' : 'date');

const HaikiDashboard = ({ stores, dateRange, onRefresh }) => {
    const [lyCompareMode, setLyCompareMode] = useState('date');
    const { combinedReports, isLoading } = useDashboardCombinedReports(dateRange, onRefresh);
    const [filterStore, setFilterStore] = useState('');
    
    useEffect(() => {
        if (stores.length > 0 && !filterStore) {
            setFilterStore(stores[0].name);
        }
    }, [stores, filterStore]);

    const { doughnutData, summaryData, totalWasteChartData, itemLineChartData } = useMemo(() => {
        const filteredReports = filterStore ? combinedReports.filter(r => r.store === filterStore) : combinedReports;
        const lyVariant = getHaikiLyVariant(lyCompareMode);
        
        const results = { total: 0, totalLy: 0, breakdown: [0, 0, 0, 0, 0], breakdownLy: [0, 0, 0, 0, 0] };
        
        filteredReports.forEach(report => {
            HAIKI_WASTE_FIELDS.forEach((field, index) => {
                const value = report[field.key] || 0;
                const valueLy = lyVariant === 'dow'
                    ? (report[`${field.key}_ly_dow`] || 0)
                    : (report[field.lyKey] || 0);
                results.breakdown[index] += value;
                results.breakdownLy[index] += valueLy;
                results.total += value;
                results.totalLy += valueLy;
            });
        });
        
        const dayCount = (dateRange.endDate > dateRange.startDate) ? Math.max(1, Math.round((dateRange.endDate - dateRange.startDate) / (1000 * 60 * 60 * 24)) + 1) : 1;
        const labelEntries = buildDateLabelEntries(dateRange.startDate, dateRange.endDate);
        const storeColors = getStoreChartColors(stores);

        const totalWasteChartData = buildStoreMetricChartData({
            stores,
            labelEntries,
            combinedReports,
            lyCompareMode,
            colors: storeColors,
            getCyValue: (r) => sumHaikiWaste(r, 'cy'),
            getLyDateValue: (r) => sumHaikiWaste(r, 'date') || null,
            getLyDowValue: (r) => sumHaikiWaste(r, 'dow') || null,
        });

        const itemLineChartData = {
            labels: labelEntries.map(entry => entry.label),
            datasets: HAIKI_WASTE_FIELDS.flatMap(item => {
                const cyData = labelEntries.map(entry => {
                    const reportsForDay = filteredReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === entry.key);
                    return reportsForDay.reduce((sum, r) => sum + (r[item.key] || 0), 0);
                });
                const lyDateData = labelEntries.map(entry => {
                    const reportsForDay = filteredReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === entry.key);
                    const val = reportsForDay.reduce((sum, r) => sum + (r[item.lyKey] || 0), 0);
                    return val || null;
                });
                const lyDowData = labelEntries.map(entry => {
                    const reportsForDay = filteredReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === entry.key);
                    const val = reportsForDay.reduce((sum, r) => sum + (r[`${item.key}_ly_dow`] || 0), 0);
                    return val || null;
                });
                const datasets = [{
                    label: `${item.label} (本年)`,
                    data: cyData,
                    borderColor: item.color,
                    backgroundColor: item.color.replace('1)', '0.15)'),
                    fill: false,
                    tension: 0.1,
                }];
                if (lyCompareMode === 'date' || lyCompareMode === 'both') {
                    datasets.push({
                        label: `${item.label} (前年同日)`,
                        data: lyDateData,
                        borderColor: item.color,
                        borderDash: [6, 4],
                        fill: false,
                        tension: 0.1,
                    });
                }
                if (lyCompareMode === 'weekday' || lyCompareMode === 'both') {
                    datasets.push({
                        label: `${item.label} (前年曜日)`,
                        data: lyDowData,
                        borderColor: item.color,
                        borderDash: [2, 3],
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                    });
                }
                return datasets;
            }),
        };
        
        const productWasteTotal = results.breakdown[0];
        const owner8Total = results.breakdown[1];
        const productWasteTotalLy = results.breakdownLy[0];
        const owner8TotalLy = results.breakdownLy[1];
        const productWasteAndOwner8Total = productWasteTotal + owner8Total;
        const productWasteAndOwner8TotalLy = productWasteTotalLy + owner8TotalLy;
        
        return {
            doughnutData: {
                labels: ['商品廃棄', 'オーナー値下げ8%', 'オーナー値下げ10%', '販促値下げ8%', '販促値下げ10%'],
                datasets: [{ label: '廃棄・値下げ内訳', data: results.breakdown, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'] }],
            },
            summaryData: { 
                total: results.total,
                totalLy: results.totalLy,
                average: results.total / dayCount,
                averageLy: results.totalLy / dayCount,
                yoyDiff: results.total - results.totalLy,
                yoyRatio: results.totalLy > 0 ? ((results.total / results.totalLy) * 100) : null,
                productWasteTotal,
                productWasteTotalLy,
                productWasteAverage: productWasteTotal / dayCount,
                productWasteAverageLy: productWasteTotalLy / dayCount,
                owner8Total,
                owner8TotalLy,
                owner8Average: owner8Total / dayCount,
                owner8AverageLy: owner8TotalLy / dayCount,
                productWasteAndOwner8Total,
                productWasteAndOwner8TotalLy,
                productWasteAndOwner8Average: productWasteAndOwner8Total / dayCount,
                productWasteAndOwner8AverageLy: productWasteAndOwner8TotalLy / dayCount,
            },
            totalWasteChartData,
            itemLineChartData,
        };
    }, [combinedReports, filterStore, dateRange, stores, lyCompareMode]);

    const doughnutOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.raw;
                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                        return `${label}: ¥${value.toLocaleString()} (${percentage})`;
                    }
                }
            }
        }
    };

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
            y: {
                ticks: {
                    callback: (value) => `¥${Number(value).toLocaleString()}`,
                },
            },
        },
    };

    const renderYoYSummaryRow = (cyValue, lyValue, cyAverage, lyAverage) => (
        <div className="text-xs text-gray-500 space-y-0.5 text-right">
            <div>前年: ¥{Math.round(lyValue).toLocaleString()}</div>
            <div>1日平均 本年 ¥{Math.round(cyAverage).toLocaleString(undefined, { maximumFractionDigits: 0 })} / 前年 ¥{Math.round(lyAverage).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
                </div>
            </div>
        );
    }

    const lySummaryLabel = lyCompareMode === 'weekday' ? '前年曜日' : lyCompareMode === 'both' ? '前年同日' : '前年';

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">廃棄・値下げ分析（前年比較）</h1>
            <DashboardLyCompareControls lyCompareMode={lyCompareMode} setLyCompareMode={setLyCompareMode} />
            <div className="flex flex-wrap justify-center gap-2 mb-6">
                {stores.map(s => (<button key={s.id} onClick={() => setFilterStore(s.name)} className={`px-3 py-2 text-sm rounded-lg transition-all ${filterStore === s.name ? 'bg-blue-600 text-white shadow' : 'bg-gray-200 hover:bg-gray-300'}`}>{s.name}</button>))}
            </div>
            <div className="grid grid-cols-1 gap-8">
                <ChartCard title="廃棄・値下げ合計推移（店舗別・前年比較）">
                    <Line data={totalWasteChartData} options={lineChartOptions} />
                </ChartCard>
                <ChartCard title={`${filterStore || '全店舗'} 廃棄・値下げ項目別推移（前年比較）`}>
                    <Line data={itemLineChartData} options={lineChartOptions} />
                </ChartCard>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 bg-white p-6 rounded-lg shadow"><h2 className="text-xl font-bold text-gray-800 mb-4">{filterStore || '全店舗'} の内訳（本年）</h2><div className="h-80"><Doughnut data={doughnutData} options={doughnutOptions}/></div></div>
                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="space-y-4">
                            <div className="text-center pb-4 border-b">
                                <h3 className="text-lg font-semibold text-gray-500 mb-2">選択期間の累計</h3>
                                <p className="text-4xl font-bold text-red-600">¥{summaryData.total.toLocaleString()}</p>
                                <p className="text-sm text-gray-500 mt-2">{lySummaryLabel}: ¥{summaryData.totalLy.toLocaleString()}</p>
                                <p className={`text-sm font-semibold mt-1 ${summaryData.yoyDiff > 0 ? 'text-red-600' : summaryData.yoyDiff < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                    前年差 {summaryData.yoyDiff >= 0 ? '+' : ''}¥{Math.round(summaryData.yoyDiff).toLocaleString()}
                                    {summaryData.yoyRatio != null && `（${summaryData.yoyRatio.toFixed(1)}%）`}
                                </p>
                            </div>
                            
                            <div className="space-y-3 pt-2">
                                <h4 className="text-base font-bold text-gray-700 mb-3">商品廃棄・オーナー値下げ8%</h4>
                                
                                <div className="bg-red-50 p-3 rounded-lg">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <span className="text-sm font-medium text-gray-600">商品廃棄</span>
                                        <div className="text-right">
                                            <span className="text-lg font-bold text-red-600">¥{summaryData.productWasteTotal.toLocaleString()}</span>
                                            {renderYoYSummaryRow(summaryData.productWasteTotal, summaryData.productWasteTotalLy, summaryData.productWasteAverage, summaryData.productWasteAverageLy)}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-blue-50 p-3 rounded-lg">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <span className="text-sm font-medium text-gray-600">オーナー値下げ8%</span>
                                        <div className="text-right">
                                            <span className="text-lg font-bold text-blue-600">¥{summaryData.owner8Total.toLocaleString()}</span>
                                            {renderYoYSummaryRow(summaryData.owner8Total, summaryData.owner8TotalLy, summaryData.owner8Average, summaryData.owner8AverageLy)}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-purple-50 p-3 rounded-lg border-2 border-purple-300">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <span className="text-sm font-bold text-gray-700">合計</span>
                                        <div className="text-right">
                                            <span className="text-xl font-bold text-purple-700">¥{summaryData.productWasteAndOwner8Total.toLocaleString()}</span>
                                            {renderYoYSummaryRow(summaryData.productWasteAndOwner8Total, summaryData.productWasteAndOwner8TotalLy, summaryData.productWasteAndOwner8Average, summaryData.productWasteAndOwner8AverageLy)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-2 border-t">
                                <div className="text-center">
                                    <h3 className="text-sm font-semibold text-gray-500 mb-1">1日あたりの全廃棄・値下げ平均</h3>
                                    <p className="text-2xl font-bold text-red-500">¥{summaryData.average.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                    <p className="text-sm text-gray-500 mt-1">前年: ¥{summaryData.averageLy.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NIPPO_METRIC_OPTIONS = [
    { id: 'sales', label: '売上', prefix: '¥' },
    { id: 'customers', label: '客数' },
    { id: 'customer_spend', label: '客単価', prefix: '¥' },
];

const HAIKI_METRIC_OPTIONS = [
    { id: 'waste_product', label: '商品廃棄' },
    { id: 'waste_owner_8', label: 'オーナー8%' },
    { id: 'waste_owner_10', label: 'オーナー10%' },
    { id: 'waste_promo_8', label: '販促8%' },
    { id: 'waste_promo_10', label: '販促10%' },
    { id: 'total', label: '当日計' },
];

const DataTablePage = ({ stores, dateRange, onRefresh }) => {
    const [view, setView] = useState('nippo');
    const [displayMode, setDisplayMode] = useState('focus');
    const [yoyMode, setYoyMode] = useState('both');
    const [lyCompareMode, setLyCompareMode] = useState('both');
    const [showLyWeather, setShowLyWeather] = useState(false);
    const [selectedSections, setSelectedSections] = useState(() => ['total', ...stores.map(s => s.name)]);
    const [selectedNippoMetrics, setSelectedNippoMetrics] = useState(() => NIPPO_METRIC_OPTIONS.map(m => m.id));
    const [selectedHaikiMetrics, setSelectedHaikiMetrics] = useState(() => HAIKI_METRIC_OPTIONS.map(m => m.id));
    const lyFetchRange = useMemo(
        () => getExtendedLyFetchRange(dateRange.startDateLY, dateRange.endDateLY),
        [dateRange.startDateLY, dateRange.endDateLY]
    );
    const { data: reports, isLoading: isLoadingReports } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const { data: reportsLY, isLoading: isLoadingReportsLY } = useReports(lyFetchRange.start, lyFetchRange.end, onRefresh);

    useEffect(() => {
        setSelectedSections(['total', ...stores.map(s => s.name)]);
        if (view === 'nippo') {
            setSelectedNippoMetrics(NIPPO_METRIC_OPTIONS.map(m => m.id));
        } else {
            setSelectedHaikiMetrics(HAIKI_METRIC_OPTIONS.map(m => m.id));
        }
    }, [view, stores]);

    const combinedReports = useMemo(
        () => buildTableCombinedReports(reports, reportsLY, dateRange),
        [reports, reportsLY, dateRange]
    );
    const weatherByDateLy = useMemo(() => buildWeatherByDate(reportsLY), [reportsLY]);

    const tableConfig = useMemo(() => ({
        mode: displayMode,
        yoyMode,
        lyCompareMode,
        showLyWeather,
        weatherByDateLy,
        selectedSections: displayMode === 'detail' ? ['total', ...stores.map(s => s.name)] : selectedSections,
        selectedMetricIds: view === 'nippo'
            ? (displayMode === 'detail' ? NIPPO_METRIC_OPTIONS.map(m => m.id) : selectedNippoMetrics)
            : (displayMode === 'detail' ? HAIKI_METRIC_OPTIONS.map(m => m.id) : selectedHaikiMetrics),
    }), [displayMode, yoyMode, lyCompareMode, showLyWeather, weatherByDateLy, selectedSections, selectedNippoMetrics, selectedHaikiMetrics, view, stores]);

    const toggleSection = (sectionId) => {
        setSelectedSections(prev => {
            const next = prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId];
            return next.length > 0 ? next : prev;
        });
    };

    const toggleMetric = (metricId) => {
        const setter = view === 'nippo' ? setSelectedNippoMetrics : setSelectedHaikiMetrics;
        setter(prev => {
            const next = prev.includes(metricId) ? prev.filter(id => id !== metricId) : [...prev, metricId];
            return next.length > 0 ? next : prev;
        });
    };

    const metricOptions = view === 'nippo' ? NIPPO_METRIC_OPTIONS : HAIKI_METRIC_OPTIONS;
    const activeMetrics = view === 'nippo' ? selectedNippoMetrics : selectedHaikiMetrics;

    if(isLoadingReports || isLoadingReportsLY) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
                </div>
            </div>
        );
    }

    return(
        <div>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
                <h1 className="text-3xl font-bold text-gray-800">データ一覧</h1>
                <div className="flex space-x-2 p-1 bg-gray-200 rounded-xl">
                    <button onClick={() => setView('nippo')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${view === 'nippo' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'}`}>日販データ</button>
                    <button onClick={() => setView('haiki')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${view === 'haiki' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'}`}>廃棄データ</button>
                </div>
            </div>

            <div className="mb-5 bg-gradient-to-br from-slate-50 to-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider w-20 shrink-0">表示</span>
                    <div className="flex p-1 bg-gray-100 rounded-lg">
                        <button onClick={() => setDisplayMode('focus')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${displayMode === 'focus' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>フォーカス</button>
                        <button onClick={() => setDisplayMode('detail')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${displayMode === 'detail' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>詳細（全列）</button>
                    </div>
                    <div className="flex p-1 bg-gray-100 rounded-lg">
                        <button onClick={() => setYoyMode('both')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${yoyMode === 'both' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>本年+前年</button>
                        <button onClick={() => setYoyMode('cy')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${yoyMode === 'cy' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>本年のみ</button>
                        <button onClick={() => setYoyMode('ly')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${yoyMode === 'ly' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>前年のみ</button>
                    </div>
                    {yoyMode !== 'cy' && (
                        <div className="flex p-1 bg-gray-100 rounded-lg">
                            <button onClick={() => setLyCompareMode('date')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'date' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>前年同日</button>
                            <button onClick={() => setLyCompareMode('weekday')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'weekday' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>前年曜日</button>
                            <button onClick={() => setLyCompareMode('both')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${lyCompareMode === 'both' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>同日+曜日</button>
                        </div>
                    )}
                </div>

                {displayMode === 'focus' && (
                    <>
                        <div className="flex flex-wrap items-start gap-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider w-20 shrink-0 pt-1.5">店舗</span>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => toggleSection('total')} className={`px-3 py-1.5 text-sm rounded-full border transition-all ${selectedSections.includes('total') ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>3店合計</button>
                                {stores.map(store => (
                                    <button key={store.id} onClick={() => toggleSection(store.name)} className={`px-3 py-1.5 text-sm rounded-full border transition-all ${selectedSections.includes(store.name) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>{store.name}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-start gap-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider w-20 shrink-0 pt-1.5">項目</span>
                            <div className="flex flex-wrap gap-2">
                                {metricOptions.map(metric => (
                                    <button key={metric.id} onClick={() => toggleMetric(metric.id)} className={`px-3 py-1.5 text-sm rounded-full border transition-all ${activeMetrics.includes(metric.id) ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-300'}`}>{metric.label}</button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-gray-100 text-xs text-gray-500">
                    <label className={`inline-flex items-center gap-2 cursor-pointer ${yoyMode === 'cy' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={showLyWeather}
                            disabled={yoyMode === 'cy'}
                            onChange={(e) => setShowLyWeather(e.target.checked)}
                        />
                        前年の天気を表示
                    </label>
                    <span><span className="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200 mr-1 align-middle"></span>選択中の項目を強調表示</span>
                    <span><span className="font-semibold text-gray-800">太字</span>＝本年</span>
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-8 h-3 rounded border border-gray-200" style={lyColumnHatchStyle}></span>
                        ＝前年（同日 / 曜日）
                    </span>
                    <span>前年曜日＝前年の同日付付近で同じ曜日の日（セルにホバーで対比日表示）</span>
                </div>
            </div>

            {view === 'nippo'
                ? <NippoTable reports={combinedReports} stores={stores} dateRange={dateRange} tableConfig={tableConfig} />
                : <HaikiTable reports={combinedReports} stores={stores} dateRange={dateRange} tableConfig={tableConfig} />}
        </div>
    );
}

const lyColumnHatchStyle = {
    backgroundImage: 'repeating-linear-gradient(-45deg, rgba(241,245,249,1) 0px, rgba(241,245,249,1) 4px, rgba(203,213,225,0.45) 4px, rgba(203,213,225,0.45) 8px)',
};

const lyColumnHatchStyleDow = {
    backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,251,235,1) 0px, rgba(255,251,235,1) 4px, rgba(251,191,36,0.25) 4px, rgba(251,191,36,0.25) 8px)',
};

const formatTableValue = (value, prefix = '') => (
    value != null && isFinite(value) ? `${prefix}${Math.round(value).toLocaleString()}` : '-'
);

const YoYMetricGroupHeader = ({ label, colSpan, highlighted = false, isFirst = false }) => (
    <th
        colSpan={colSpan}
        className={`px-3 py-2 text-center text-xs font-bold tracking-wide border-b border-gray-200 ${isFirst ? 'border-l-2 border-l-blue-300' : 'border-l border-gray-200'} ${highlighted ? 'bg-blue-100 text-blue-900' : 'bg-gray-50 text-gray-600'}`}
    >
        {label}
    </th>
);

const YoYTableHeader = ({ label, isPriorYear, className = '', highlighted = false, compact = false }) => {
    const text = compact ? (isPriorYear ? '前年' : '本年') : label;
    if (isPriorYear) {
        return (
            <th className={`px-2 py-2 text-right text-[11px] font-medium text-gray-400 tracking-wider ${highlighted ? 'bg-blue-50' : 'bg-slate-100'} ${className}`} style={lyColumnHatchStyle}>
                {text}
            </th>
        );
    }
    return (
        <th className={`px-2 py-2 text-right text-[11px] font-bold text-gray-700 tracking-wider border-l border-gray-200 ${highlighted ? 'bg-blue-50 text-blue-900' : ''} ${className}`}>
            {text}
        </th>
    );
};

const YoYTableCell = ({ value, isPriorYear, prefix = '', isFooter = false, highlighted = false, lyCompareKind = null, lyCompareDate = null, cellStyle = lyColumnHatchStyle }) => {
    const display = formatTableValue(value, prefix);
    const padding = isFooter ? 'py-3' : 'py-2.5';
    const title = isPriorYear && lyCompareKind && lyCompareDate
        ? (lyCompareKind === 'weekday'
            ? `前年曜日比: ${formatDateWithWeekday(lyCompareDate)}`
            : `前年同日: ${formatDateWithWeekday(lyCompareDate)}`)
        : undefined;
    if (isPriorYear) {
        return (
            <td
                title={title}
                className={`px-3 ${padding} whitespace-nowrap text-sm font-normal text-gray-500 text-right tabular-nums ${highlighted ? 'bg-blue-50/80' : 'bg-slate-50'}`}
                style={cellStyle}
            >
                {display}
            </td>
        );
    }
    return (
        <td className={`px-3 ${padding} whitespace-nowrap text-sm text-right tabular-nums border-l border-gray-100 ${highlighted ? 'bg-blue-50/60' : ''} ${isFooter ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
            {display}
        </td>
    );
};

const getYoYColSpan = (yoyMode, lyCompareMode = 'date') => {
    let cols = 0;
    if (yoyMode !== 'ly') cols += 1;
    if (yoyMode !== 'cy') {
        if (lyCompareMode === 'both') cols += 2;
        else cols += 1;
    }
    return cols;
};

const renderYoYCellsForMetric = ({ data, cyKey, lyKey, prefix = '', yoyMode, lyCompareMode = 'date', highlighted = false, isFooter = false }) => {
    const cells = [];
    if (yoyMode !== 'ly') {
        cells.push(<YoYTableCell key={`${cyKey}-cy`} value={data?.[cyKey]} isPriorYear={false} prefix={prefix} isFooter={isFooter} highlighted={highlighted} />);
    }
    if (yoyMode !== 'cy') {
        if (lyCompareMode === 'date' || lyCompareMode === 'both') {
            cells.push(
                <YoYTableCell
                    key={`${cyKey}-ly-date`}
                    value={data?.[lyKey]}
                    isPriorYear={true}
                    prefix={prefix}
                    isFooter={isFooter}
                    highlighted={highlighted}
                    lyCompareKind="date"
                    lyCompareDate={isFooter ? null : data?.lyDateCompareDate}
                />
            );
        }
        if (lyCompareMode === 'weekday' || lyCompareMode === 'both') {
            cells.push(
                <YoYTableCell
                    key={`${cyKey}-ly-dow`}
                    value={data?.[`${lyKey}_dow`]}
                    isPriorYear={true}
                    prefix={prefix}
                    isFooter={isFooter}
                    highlighted={highlighted}
                    lyCompareKind="weekday"
                    lyCompareDate={isFooter ? null : data?.lyDowCompareDate}
                    cellStyle={lyCompareMode === 'both' ? lyColumnHatchStyleDow : lyColumnHatchStyle}
                />
            );
        }
    }
    return cells;
};

const renderYoYHeadersForMetric = ({ cyLabel, lyLabel, yoyMode, lyCompareMode = 'date', highlighted = false, compact = true }) => {
    const headers = [];
    if (yoyMode !== 'ly') headers.push(<YoYTableHeader key={`${cyLabel}-cy`} label={cyLabel} isPriorYear={false} highlighted={highlighted} compact={compact} />);
    if (yoyMode !== 'cy') {
        if (lyCompareMode === 'date' || lyCompareMode === 'both') {
            headers.push(
                <YoYTableHeader
                    key={`${cyLabel}-ly-date`}
                    label={lyCompareMode === 'both' ? '前年同日' : (compact ? '前年' : lyLabel)}
                    isPriorYear={true}
                    highlighted={highlighted}
                    compact={compact}
                />
            );
        }
        if (lyCompareMode === 'weekday' || lyCompareMode === 'both') {
            headers.push(
                <YoYTableHeader
                    key={`${cyLabel}-ly-dow`}
                    label={lyCompareMode === 'both' ? '前年曜日' : (compact ? '前年曜' : `${lyLabel}(曜)`)}
                    isPriorYear={true}
                    highlighted={highlighted}
                    compact={compact}
                    className={lyCompareMode === 'both' ? 'bg-amber-50/80' : ''}
                />
            );
        }
    }
    return headers;
};

const hasCyNippoInput = (report) =>
    report && (report.updatedAt_sales != null || report.sales != null || report.customers != null);

const NippoTable = ({ reports, stores, dateRange, tableConfig }) => {
    const { tableData, grandTotal, grandAverage } = useMemo(() => {
        const dataByDate = new Map();
        let dayCount = 0;

        let currentDate = new Date(dateRange.startDate);
        if (currentDate <= dateRange.endDate) {
            while (currentDate <= dateRange.endDate) {
                dataByDate.set(getLocalDateString(currentDate), { storeData: {} });
                currentDate.setDate(currentDate.getDate() + 1);
                dayCount++;
            }
        }
        dayCount = dayCount || 1;

        reports.forEach(report => {
            if (!report.date) return;
            const dateStr = getLocalDateString(report.date.toDate());
            if (!dataByDate.has(dateStr)) return;
            const existingData = dataByDate.get(dateStr).storeData[report.store] || {};
            dataByDate.get(dateStr).storeData[report.store] = { ...existingData, ...report };
        });

        const sortedData = Array.from(dataByDate.entries()).map(([date, data]) => {
            const total = {
                sales: null, customers: null, customer_spend: null,
                sales_ly: 0, customers_ly: 0,
                sales_ly_dow: 0, customers_ly_dow: 0,
                lyDateCompareDate: getLocalDateString(getSameCalendarDateLastYear(new Date(`${date}T00:00:00`))),
                lyDowCompareDate: getLocalDateString(getSameWeekdayNearLastYearDate(new Date(`${date}T00:00:00`))),
            };
            let hasCyNippo = false;
            stores.forEach(store => {
                const report = data.storeData[store.name];
                if (report) {
                    if (hasCyNippoInput(report)) {
                        hasCyNippo = true;
                        total.sales = (total.sales ?? 0) + (report.sales || 0);
                        total.customers = (total.customers ?? 0) + (report.customers || 0);
                    }
                    total.sales_ly += report.sales_ly || 0;
                    total.customers_ly += report.customers_ly || 0;
                    total.sales_ly_dow += report.sales_ly_dow || 0;
                    total.customers_ly_dow += report.customers_ly_dow || 0;
                }
            });
            if (hasCyNippo) {
                total.customer_spend = total.customers > 0 ? total.sales / total.customers : 0;
            }
            total.customer_spend_ly = total.customers_ly > 0 ? total.sales_ly / total.customers_ly : 0;
            total.customer_spend_ly_dow = total.customers_ly_dow > 0 ? total.sales_ly_dow / total.customers_ly_dow : 0;
            data.total = total;
            return { date, ...data };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const grandTotal = {
            total: { sales: 0, customers: 0, sales_ly: 0, customers_ly: 0, sales_ly_dow: 0, customers_ly_dow: 0 },
            storeTotals: {}
        };
        stores.forEach(store => {
            grandTotal.storeTotals[store.name] = { sales: 0, customers: 0, sales_ly: 0, customers_ly: 0, sales_ly_dow: 0, customers_ly_dow: 0 };
        });

        let cyInputDayCount = 0;
        sortedData.forEach(row => {
            if (row.total.sales != null) {
                cyInputDayCount++;
                grandTotal.total.sales += row.total.sales;
                grandTotal.total.customers += row.total.customers;
            }
            grandTotal.total.sales_ly += row.total.sales_ly;
            grandTotal.total.customers_ly += row.total.customers_ly;
            grandTotal.total.sales_ly_dow += row.total.sales_ly_dow;
            grandTotal.total.customers_ly_dow += row.total.customers_ly_dow;

            stores.forEach(store => {
                const report = row.storeData[store.name];
                if (report) {
                    if (hasCyNippoInput(report)) {
                        grandTotal.storeTotals[store.name].sales += report.sales || 0;
                        grandTotal.storeTotals[store.name].customers += report.customers || 0;
                    }
                    grandTotal.storeTotals[store.name].sales_ly += report.sales_ly || 0;
                    grandTotal.storeTotals[store.name].customers_ly += report.customers_ly || 0;
                    grandTotal.storeTotals[store.name].sales_ly_dow += report.sales_ly_dow || 0;
                    grandTotal.storeTotals[store.name].customers_ly_dow += report.customers_ly_dow || 0;
                }
            });
        });
        cyInputDayCount = cyInputDayCount || 1;

        const grandAverage = {
            total: {
                sales: grandTotal.total.sales / cyInputDayCount,
                customers: grandTotal.total.customers / cyInputDayCount,
                sales_ly: grandTotal.total.sales_ly / dayCount,
                customers_ly: grandTotal.total.customers_ly / dayCount,
                sales_ly_dow: grandTotal.total.sales_ly_dow / dayCount,
                customers_ly_dow: grandTotal.total.customers_ly_dow / dayCount,
            },
            storeTotals: {}
        };

        grandTotal.total.customer_spend = grandTotal.total.customers > 0 ? grandTotal.total.sales / grandTotal.total.customers : 0;
        grandTotal.total.customer_spend_ly = grandTotal.total.customers_ly > 0 ? grandTotal.total.sales_ly / grandTotal.total.customers_ly : 0;
        grandTotal.total.customer_spend_ly_dow = grandTotal.total.customers_ly_dow > 0 ? grandTotal.total.sales_ly_dow / grandTotal.total.customers_ly_dow : 0;
        grandAverage.total.customer_spend = grandAverage.total.customers > 0 ? grandAverage.total.sales / grandAverage.total.customers : 0;
        grandAverage.total.customer_spend_ly = grandAverage.total.customers_ly > 0 ? grandAverage.total.sales_ly / grandAverage.total.customers_ly : 0;
        grandAverage.total.customer_spend_ly_dow = grandAverage.total.customers_ly_dow > 0 ? grandAverage.total.sales_ly_dow / grandAverage.total.customers_ly_dow : 0;
        
        stores.forEach(store => {
             grandTotal.storeTotals[store.name].customer_spend = grandTotal.storeTotals[store.name].customers > 0 ? grandTotal.storeTotals[store.name].sales / grandTotal.storeTotals[store.name].customers : 0;
             grandTotal.storeTotals[store.name].customer_spend_ly = grandTotal.storeTotals[store.name].customers_ly > 0 ? grandTotal.storeTotals[store.name].sales_ly / grandTotal.storeTotals[store.name].customers_ly : 0;
             grandTotal.storeTotals[store.name].customer_spend_ly_dow = grandTotal.storeTotals[store.name].customers_ly_dow > 0 ? grandTotal.storeTotals[store.name].sales_ly_dow / grandTotal.storeTotals[store.name].customers_ly_dow : 0;
            
             const storeTotal = grandTotal.storeTotals[store.name];
             const storeCyDays = sortedData.filter(row => hasCyNippoInput(row.storeData[store.name])).length || 1;
             grandAverage.storeTotals[store.name] = {
                 sales: storeTotal.sales / storeCyDays,
                 customers: storeTotal.customers / storeCyDays,
                 sales_ly: storeTotal.sales_ly / dayCount,
                 customers_ly: storeTotal.customers_ly / dayCount,
                 sales_ly_dow: storeTotal.sales_ly_dow / dayCount,
                 customers_ly_dow: storeTotal.customers_ly_dow / dayCount,
             };
             const storeAvg = grandAverage.storeTotals[store.name];
             storeAvg.customer_spend = storeAvg.customers > 0 ? storeAvg.sales / storeAvg.customers : 0;
             storeAvg.customer_spend_ly = storeAvg.customers_ly > 0 ? storeAvg.sales_ly / storeAvg.customers_ly : 0;
             storeAvg.customer_spend_ly_dow = storeAvg.customers_ly_dow > 0 ? storeAvg.sales_ly_dow / storeAvg.customers_ly_dow : 0;
        });

        return { tableData: sortedData, grandTotal, grandAverage };
    }, [reports, stores, dateRange]);

    const nippoMetrics = [
        { id: 'sales', cyKey: 'sales', lyKey: 'sales_ly', cyLabel: '売上', lyLabel: '前年売上', prefix: '¥' },
        { id: 'customers', cyKey: 'customers', lyKey: 'customers_ly', cyLabel: '客数', lyLabel: '前年客数' },
        { id: 'customer_spend', cyKey: 'customer_spend', lyKey: 'customer_spend_ly', cyLabel: '客単価', lyLabel: '前年客単価', prefix: '¥' },
    ];

    const visibleMetrics = nippoMetrics.filter(metric => tableConfig.selectedMetricIds.includes(metric.id));
    const visibleSections = tableConfig.selectedSections.map(sectionId => (
        sectionId === 'total'
            ? { id: 'total', label: '3店合計' }
            : { id: sectionId, label: sectionId, storeName: sectionId }
    ));
    const metricColSpan = visibleMetrics.length * getYoYColSpan(tableConfig.yoyMode, tableConfig.lyCompareMode);

    const getSectionData = (section, rowData, summaryType) => {
        if (section.id === 'total') {
            if (summaryType === 'total') return grandTotal.total;
            if (summaryType === 'average') return grandAverage.total;
            return rowData.total;
        }
        if (summaryType === 'total') return grandTotal.storeTotals[section.storeName];
        if (summaryType === 'average') return grandAverage.storeTotals[section.storeName];
        return rowData.storeData[section.storeName];
    };

    const renderSectionMetrics = (data, isFooter = false) => (
        visibleMetrics.flatMap(metric => renderYoYCellsForMetric({
            data,
            cyKey: metric.cyKey,
            lyKey: metric.lyKey,
            prefix: metric.prefix,
            yoyMode: tableConfig.yoyMode,
            lyCompareMode: tableConfig.lyCompareMode,
            highlighted: tableConfig.mode === 'focus',
            isFooter,
        }))
    );

    const stickyMetaClass = 'sticky z-20 bg-white';
    const metaFooterColSpan = 1 + getTableMetaColumnCount(tableConfig);
    
    return (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto max-h-[72vh]">
            <table className="min-w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-30">
                    <tr className="bg-slate-100">
                        <th rowSpan="3" className={`${stickyMetaClass} left-0 px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider align-bottom border-b border-gray-200`}>日付</th>
                        {renderWeatherMetaHeaders(tableConfig)}
                        {visibleSections.map((section, index) => (
                            <th key={section.id} colSpan={metricColSpan} className={`px-4 py-2 text-center text-sm font-bold tracking-wide border-b border-l-2 ${index === 0 ? 'border-l-blue-300 text-blue-900 bg-blue-50' : 'border-l-gray-300 text-gray-700 bg-gray-50'}`}>
                                {section.label}
                            </th>
                        ))}
                    </tr>
                    <tr className="bg-slate-50">
                        {visibleSections.map((section, sectionIndex) => (
                            <React.Fragment key={`${section.id}-sub`}>
                                {visibleMetrics.map((metric, metricIndex) => (
                                    <React.Fragment key={`${section.id}-${metric.id}`}>
                                        <YoYMetricGroupHeader
                                            label={metric.cyLabel}
                                            colSpan={getYoYColSpan(tableConfig.yoyMode, tableConfig.lyCompareMode)}
                                            highlighted={tableConfig.mode === 'focus'}
                                            isFirst={sectionIndex === 0 && metricIndex === 0}
                                        />
                                    </React.Fragment>
                                ))}
                            </React.Fragment>
                        ))}
                    </tr>
                    <tr className="bg-white border-b-2 border-gray-200">
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-yoy`}>
                                {visibleMetrics.flatMap(metric => renderYoYHeadersForMetric({
                                    cyLabel: metric.cyLabel,
                                    lyLabel: metric.lyLabel,
                                    yoyMode: tableConfig.yoyMode,
                                    lyCompareMode: tableConfig.lyCompareMode,
                                    highlighted: tableConfig.mode === 'focus',
                                    compact: true,
                                }))}
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {tableData.map(({ date, storeData, total }, rowIndex) => {
                        const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';
                        return (
                            <tr key={date} className={`${rowBg} hover:bg-blue-50/30 transition-colors`}>
                                <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold border-b border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>{formatDateWithWeekday(date)}</td>
                                {renderWeatherMetaCells(tableConfig, { storeData, date })}
                                {visibleSections.map(section => (
                                    <React.Fragment key={`${date}-${section.id}`}>
                                        {renderSectionMetrics(getSectionData(section, { storeData, total }))}
                                    </React.Fragment>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-800 border-t-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`} colSpan={metaFooterColSpan}>期間合計</td>
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-sum`}>
                                {renderSectionMetrics(getSectionData(section, {}, 'total'), true)}
                            </React.Fragment>
                        ))}
                    </tr>
                    <tr className="bg-gray-200">
                        <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`} colSpan={metaFooterColSpan}>期間平均</td>
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-avg`}>
                                {renderSectionMetrics(getSectionData(section, {}, 'average'), true)}
                            </React.Fragment>
                        ))}
                    </tr>
                </tfoot>
            </table>
            </div>
            {tableData.length === 0 && <p className="text-center p-8 text-gray-500">選択された期間にデータはありません。</p>}
        </div>
    );
};

const HaikiTable = ({ reports, stores, dateRange, tableConfig }) => {
    const wasteFields = [
        { id: 'waste_product', key: 'waste_product', lyKey: 'waste_product_ly', label: '商品廃棄', lyLabel: '前年商品廃棄' },
        { id: 'waste_owner_8', key: 'waste_owner_8', lyKey: 'waste_owner_8_ly', label: 'オーナー8%', lyLabel: '前年オーナー8%' },
        { id: 'waste_owner_10', key: 'waste_owner_10', lyKey: 'waste_owner_10_ly', label: 'オーナー10%', lyLabel: '前年オーナー10%' },
        { id: 'waste_promo_8', key: 'waste_promo_8', lyKey: 'waste_promo_8_ly', label: '販促8%', lyLabel: '前年販促8%' },
        { id: 'waste_promo_10', key: 'waste_promo_10', lyKey: 'waste_promo_10_ly', label: '販促10%', lyLabel: '前年販促10%' },
        { id: 'total', key: 'total', lyKey: 'totalLy', label: '当日計', lyLabel: '前年計', isTotal: true },
    ];
    const visibleFieldMetrics = wasteFields.filter(field => {
        if (field.isTotal) return tableConfig.selectedMetricIds.includes('total');
        return tableConfig.selectedMetricIds.includes(field.id);
    });
    const visibleSections = tableConfig.selectedSections.map(sectionId => (
        sectionId === 'total'
            ? { id: 'total', label: '3店合計' }
            : { id: sectionId, label: sectionId, storeName: sectionId }
    ));
    const metricColSpan = visibleFieldMetrics.length * getYoYColSpan(tableConfig.yoyMode, tableConfig.lyCompareMode);
    const detailWasteFields = wasteFields.filter(f => !f.isTotal);

    const sumWasteFields = (report, variant = 'cy') => {
        if (!report) return 0;
        return detailWasteFields.reduce((sum, field) => {
            let key = field.key;
            if (variant === 'date') key = field.lyKey;
            if (variant === 'dow') key = `${field.key}_ly_dow`;
            return sum + (report[key] || 0);
        }, 0);
    };

    const enrichRowData = (report) => {
        if (!report) return null;
        return {
            ...report,
            total: sumWasteFields(report, 'cy'),
            totalLy: sumWasteFields(report, 'date'),
            totalLy_dow: sumWasteFields(report, 'dow'),
        };
    };

    const normalizeHaikiData = (raw) => {
        if (!raw) return null;
        return {
            ...raw,
            total: raw.grandTotal != null ? raw.grandTotal : raw.total,
            totalLy: raw.grandTotalLy != null ? raw.grandTotalLy : raw.totalLy,
            totalLy_dow: raw.grandTotalLy_dow != null ? raw.grandTotalLy_dow : raw.totalLy_dow,
        };
    };

    const getSectionRowData = (section, row) => {
        if (section.id === 'total') return normalizeHaikiData(row.total);
        return normalizeHaikiData(enrichRowData(row.storeData[section.storeName]));
    };

    const getSectionSummaryData = (section, kind) => {
        if (section.id === 'total') {
            return normalizeHaikiData(kind === 'average' ? summary.average : summary.total);
        }
        const storeSource = kind === 'average' ? summary.storeAverages[section.storeName] : summary.storeTotals[section.storeName];
        return normalizeHaikiData(storeSource);
    };

    const renderHaikiMetrics = (data, isFooter = false) => (
        visibleFieldMetrics.flatMap(field => {
            if (field.isTotal) {
                return renderYoYCellsForMetric({
                    data,
                    cyKey: 'total',
                    lyKey: 'totalLy',
                    yoyMode: tableConfig.yoyMode,
                    lyCompareMode: tableConfig.lyCompareMode,
                    highlighted: tableConfig.mode === 'focus',
                    isFooter,
                });
            }
            return renderYoYCellsForMetric({
                data,
                cyKey: field.key,
                lyKey: field.lyKey,
                yoyMode: tableConfig.yoyMode,
                lyCompareMode: tableConfig.lyCompareMode,
                highlighted: tableConfig.mode === 'focus',
                isFooter,
            });
        })
    );

    const { tableData, summary } = useMemo(() => {
        const dataByDate = new Map();
        let dayCount = 0;

        let currentDate = new Date(dateRange.startDate);
        if (currentDate <= dateRange.endDate) {
            while (currentDate <= dateRange.endDate) {
                const dateStr = getLocalDateString(currentDate);
                dataByDate.set(dateStr, { storeData: {} });
                currentDate.setDate(currentDate.getDate() + 1);
                dayCount++;
            }
        }
        dayCount = dayCount || 1;

        reports.forEach(report => {
            if (!report.date) return;
            const dateStr = getLocalDateString(report.date.toDate());
            if (dataByDate.has(dateStr)) {
                const existingData = dataByDate.get(dateStr).storeData[report.store] || {};
                dataByDate.get(dateStr).storeData[report.store] = { ...existingData, ...report };
            }
        });

        const sortedData = Array.from(dataByDate.entries()).map(([date, data]) => {
            const total = {
                grandTotal: 0, grandTotalLy: 0, grandTotalLy_dow: 0,
                lyDateCompareDate: getLocalDateString(getSameCalendarDateLastYear(new Date(`${date}T00:00:00`))),
                lyDowCompareDate: getLocalDateString(getSameWeekdayNearLastYearDate(new Date(`${date}T00:00:00`))),
            };
            detailWasteFields.forEach(field => {
                total[field.key] = 0;
                total[field.lyKey] = 0;
                total[`${field.key}_ly_dow`] = 0;
            });
            stores.forEach(store => {
                const report = data.storeData[store.name];
                if (report) {
                    detailWasteFields.forEach(field => {
                        total[field.key] += report[field.key] || 0;
                        total[field.lyKey] += report[field.lyKey] || 0;
                        total[`${field.key}_ly_dow`] += report[`${field.key}_ly_dow`] || 0;
                    });
                    total.grandTotal += sumWasteFields(report, 'cy');
                    total.grandTotalLy += sumWasteFields(report, 'date');
                    total.grandTotalLy_dow += sumWasteFields(report, 'dow');
                }
            });
            total.totalLy = total.grandTotalLy;
            total.totalLy_dow = total.grandTotalLy_dow;
            return { date, ...data, total };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        const summary = {
            total: { grandTotal: 0, grandTotalLy: 0, grandTotalLy_dow: 0, totalLy: 0, totalLy_dow: 0 },
            average: { grandTotal: 0, grandTotalLy: 0, grandTotalLy_dow: 0, totalLy: 0, totalLy_dow: 0 },
            storeTotals: {},
            storeAverages: {}
        };

        detailWasteFields.forEach(field => {
            summary.total[field.key] = 0;
            summary.total[field.lyKey] = 0;
            summary.total[`${field.key}_ly_dow`] = 0;
            summary.average[field.key] = 0;
            summary.average[field.lyKey] = 0;
            summary.average[`${field.key}_ly_dow`] = 0;
        });

        stores.forEach(store => {
            summary.storeTotals[store.name] = { total: 0, totalLy: 0, totalLy_dow: 0 };
            summary.storeAverages[store.name] = { total: 0, totalLy: 0, totalLy_dow: 0 };
            detailWasteFields.forEach(field => {
                summary.storeTotals[store.name][field.key] = 0;
                summary.storeTotals[store.name][field.lyKey] = 0;
                summary.storeTotals[store.name][`${field.key}_ly_dow`] = 0;
                summary.storeAverages[store.name][field.key] = 0;
                summary.storeAverages[store.name][field.lyKey] = 0;
                summary.storeAverages[store.name][`${field.key}_ly_dow`] = 0;
            });
        });

        sortedData.forEach(row => {
            detailWasteFields.forEach(field => {
                summary.total[field.key] += row.total[field.key];
                summary.total[field.lyKey] += row.total[field.lyKey];
                summary.total[`${field.key}_ly_dow`] += row.total[`${field.key}_ly_dow`];
            });
            summary.total.grandTotal += row.total.grandTotal;
            summary.total.grandTotalLy += row.total.grandTotalLy;
            summary.total.grandTotalLy_dow += row.total.grandTotalLy_dow;

            stores.forEach(store => {
                const report = row.storeData[store.name];
                if (report) {
                    detailWasteFields.forEach(field => {
                        summary.storeTotals[store.name][field.key] += report[field.key] || 0;
                        summary.storeTotals[store.name][field.lyKey] += report[field.lyKey] || 0;
                        summary.storeTotals[store.name][`${field.key}_ly_dow`] += report[`${field.key}_ly_dow`] || 0;
                    });
                    summary.storeTotals[store.name].total += sumWasteFields(report, 'cy');
                    summary.storeTotals[store.name].totalLy += sumWasteFields(report, 'date');
                    summary.storeTotals[store.name].totalLy_dow += sumWasteFields(report, 'dow');
                }
            });
        });

        detailWasteFields.forEach(field => {
            summary.average[field.key] = summary.total[field.key] / dayCount;
            summary.average[field.lyKey] = summary.total[field.lyKey] / dayCount;
            summary.average[`${field.key}_ly_dow`] = summary.total[`${field.key}_ly_dow`] / dayCount;
        });
        summary.average.grandTotal = summary.total.grandTotal / dayCount;
        summary.average.grandTotalLy = summary.total.grandTotalLy / dayCount;
        summary.average.grandTotalLy_dow = summary.total.grandTotalLy_dow / dayCount;
        summary.total.totalLy = summary.total.grandTotalLy;
        summary.total.totalLy_dow = summary.total.grandTotalLy_dow;
        summary.average.totalLy = summary.average.grandTotalLy;
        summary.average.totalLy_dow = summary.average.grandTotalLy_dow;

        stores.forEach(store => {
            detailWasteFields.forEach(field => {
                summary.storeAverages[store.name][field.key] = summary.storeTotals[store.name][field.key] / dayCount;
                summary.storeAverages[store.name][field.lyKey] = summary.storeTotals[store.name][field.lyKey] / dayCount;
                summary.storeAverages[store.name][`${field.key}_ly_dow`] = summary.storeTotals[store.name][`${field.key}_ly_dow`] / dayCount;
            });
            summary.storeAverages[store.name].total = summary.storeTotals[store.name].total / dayCount;
            summary.storeAverages[store.name].totalLy = summary.storeTotals[store.name].totalLy / dayCount;
            summary.storeAverages[store.name].totalLy_dow = summary.storeTotals[store.name].totalLy_dow / dayCount;
        });

        return { tableData: sortedData, summary };
    }, [reports, stores, dateRange]);

    const stickyMetaClass = 'sticky z-20 bg-white';
    const metaFooterColSpan = 1 + getTableMetaColumnCount(tableConfig);

    return (
         <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto max-h-[72vh]">
            <table className="min-w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-30">
                    <tr className="bg-slate-100">
                        <th rowSpan="3" className={`${stickyMetaClass} left-0 px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider align-bottom border-b border-gray-200`}>日付</th>
                        {renderWeatherMetaHeaders(tableConfig)}
                        {visibleSections.map((section, index) => (
                            <th key={section.id} colSpan={metricColSpan} className={`px-4 py-2 text-center text-sm font-bold tracking-wide border-b border-l-2 ${index === 0 ? 'border-l-blue-300 text-blue-900 bg-blue-50' : 'border-l-gray-300 text-gray-700 bg-gray-50'}`}>
                                {section.label}
                            </th>
                        ))}
                    </tr>
                    <tr className="bg-slate-50">
                        {visibleSections.map((section, sectionIndex) => (
                            <React.Fragment key={`${section.id}-groups`}>
                                {visibleFieldMetrics.map((field, metricIndex) => (
                                    <YoYMetricGroupHeader
                                        key={`${section.id}-${field.id}`}
                                        label={field.label}
                                        colSpan={getYoYColSpan(tableConfig.yoyMode, tableConfig.lyCompareMode)}
                                        highlighted={tableConfig.mode === 'focus'}
                                        isFirst={sectionIndex === 0 && metricIndex === 0}
                                    />
                                ))}
                            </React.Fragment>
                        ))}
                    </tr>
                    <tr className="bg-white border-b-2 border-gray-200">
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-yoy`}>
                                {visibleFieldMetrics.flatMap(field => renderYoYHeadersForMetric({
                                    cyLabel: field.label,
                                    lyLabel: field.lyLabel,
                                    yoyMode: tableConfig.yoyMode,
                                    lyCompareMode: tableConfig.lyCompareMode,
                                    highlighted: tableConfig.mode === 'focus',
                                    compact: true,
                                }))}
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {tableData.map(({ date, storeData, total }, rowIndex) => {
                        const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';
                        return (
                            <tr key={date} className={`${rowBg} hover:bg-blue-50/30 transition-colors`}>
                                <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-semibold border-b border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}>{formatDateWithWeekday(date)}</td>
                                {renderWeatherMetaCells(tableConfig, { storeData, date })}
                                {visibleSections.map(section => (
                                    <React.Fragment key={`${date}-${section.id}`}>
                                        {renderHaikiMetrics(getSectionRowData(section, { storeData, total }))}
                                    </React.Fragment>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-800 border-t-2 border-gray-300 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`} colSpan={metaFooterColSpan}>期間合計</td>
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-sum`}>
                                {renderHaikiMetrics(getSectionSummaryData(section, 'total'), true)}
                            </React.Fragment>
                        ))}
                    </tr>
                    <tr className="bg-gray-200">
                        <td className={`${stickyMetaClass} left-0 px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.04)]`} colSpan={metaFooterColSpan}>期間平均</td>
                        {visibleSections.map(section => (
                            <React.Fragment key={`${section.id}-avg`}>
                                {renderHaikiMetrics(getSectionSummaryData(section, 'average'), true)}
                            </React.Fragment>
                        ))}
                    </tr>
                </tfoot>
            </table>
            </div>
            {tableData.length === 0 && <p className="text-center p-8 text-gray-500">選択された期間にデータはありません。</p>}
        </div>
    );
};

const CustomAnalysisPage = ({ stores, dateRange, onRefresh }) => {
    const { data: reports, isLoading: isLoadingReports } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const { data: reportsLY, isLoading: isLoadingReportsLY } = useReports(dateRange.startDateLY, dateRange.endDateLY, onRefresh);

    const combinedReports = useMemo(() => {
        const lyData = reportsLY.map(r => {
            if (!r.date) return null;
            const lyDate = r.date.toDate();
            const cyDate = new Date(lyDate.getFullYear() + 1, lyDate.getMonth(), lyDate.getDate());
            return {
                date: Timestamp.fromDate(cyDate),
                store: r.store,
                sales_ly: getLySourceValue(r, 'sales'),
                customers_ly: getLySourceValue(r, 'customers'),
                customer_spend_ly: getLyCustomerSpend(r),
            };
        }).filter(Boolean);

        const reportsById = new Map();
        reports.forEach(r => {
            reportsById.set(r.id, r);
        });
        lyData.forEach(r_ly => {
            const cyDateStr = getLocalDateString(r_ly.date.toDate());
            const docId = `${cyDateStr}_${r_ly.store}`;
            const existingReport = reportsById.get(docId) || { id: docId, date: r_ly.date, store: r_ly.store };
            reportsById.set(docId, { ...existingReport, ...r_ly });
        });
        
        return Array.from(reportsById.values());
    }, [reports, reportsLY]);

    const allStores = [{ id: 'total', name: '3店合計' }, ...stores];
    const [selectedStores, setSelectedStores] = useState([allStores[0].name]);
    
    const metricOptions = [
        { value: 'none', label: 'なし', unit: '' },
        { value: 'sales', label: '売上', unit: '円' },
        { value: 'customers', label: '客数', unit: '人' },
        { value: 'customer_spend', label: '客単価', unit: '円' },
        { value: 'total_waste', label: '廃棄合計', unit: '円'},
        { value: 'waste_product', label: '商品廃棄', unit: '円'},
        { value: 'waste_owner_8', label: 'オーナー値下げ8%', unit: '円'},
        { value: 'sales_ly', label: '前年売上', unit: '円' },
        { value: 'customers_ly', label: '前年客数', unit: '人' },
        { value: 'customer_spend_ly', label: '前年客単価', unit: '円' },
    ];
    
    const [y1Metric, setY1Metric] = useState(metricOptions[1]);
    const [y2Metric, setY2Metric] = useState(metricOptions[4]);

    const handleStoreToggle = (storeName) => {
        setSelectedStores(prev => 
            prev.includes(storeName) 
                ? prev.filter(s => s !== storeName)
                : [...prev, storeName]
        );
    };

    const chartData = useMemo(() => {
        const labels = [];
        let currentDate = new Date(dateRange.startDate);
        if (currentDate <= dateRange.endDate) {
            while (currentDate <= dateRange.endDate) {
                labels.push(getLocalDateString(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        const y1Colors = ['rgba(54, 162, 235, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 99, 132, 1)'];
        const y2Colors = ['rgba(255, 159, 64, 1)', 'rgba(255, 205, 86, 1)', 'rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)'];

        const getMetricValue = (report, metric) => {
            if (!report) return null;
            if (metric.value === 'total_waste') {
                return (report.waste_product || 0) + (report.waste_owner_8 || 0) + (report.waste_owner_10 || 0) + (report.waste_promo_8 || 0) + (report.waste_promo_10 || 0);
            }
            return report[metric.value] || 0;
        }

        const reportsByDate = new Map();
        combinedReports.forEach(r => {
            if (!r.date) return;
            const dateStr = getLocalDateString(r.date.toDate());
            if (!reportsByDate.has(dateStr)) reportsByDate.set(dateStr, []);
            reportsByDate.get(dateStr).push(r);
        });

        const datasets = selectedStores.flatMap((storeName, storeIndex) => {
            const y1Color = y1Colors[storeIndex % y1Colors.length];
            const y2Color = y2Colors[storeIndex % y2Colors.length];
            const datasetsForStore = [];

            if (y1Metric.value !== 'none') {
                const data = labels.map(labelDate => {
                    const dailyReports = reportsByDate.get(labelDate) || [];
                    if (storeName === '3店合計') {
                        return dailyReports.reduce((sum, r) => sum + getMetricValue(r, y1Metric), 0);
                    }
                    const report = dailyReports.find(r => r.store === storeName);
                    return getMetricValue(report, y1Metric);
                });
                datasetsForStore.push({
                    label: `${storeName} - ${y1Metric.label}`, data,
                    borderColor: y1Color, backgroundColor: y1Color.replace('1)', '0.2)'),
                    yAxisID: 'y1', tension: 0.1,
                });
            }

            if (y2Metric.value !== 'none') {
                 const data = labels.map(labelDate => {
                    const dailyReports = reportsByDate.get(labelDate) || [];
                    if (storeName === '3店合計') {
                        return dailyReports.reduce((sum, r) => sum + getMetricValue(r, y2Metric), 0);
                    }
                    const report = dailyReports.find(r => r.store === storeName);
                    return getMetricValue(report, y2Metric);
                });
                datasetsForStore.push({
                    label: `${storeName} - ${y2Metric.label}`, data,
                    borderColor: y2Color, borderDash: [5, 5], backgroundColor: y2Color.replace('1)', '0.2)'),
                    yAxisID: 'y2', tension: 0.1,
                });
            }
            return datasetsForStore;
        });

        return { labels, datasets };
    }, [combinedReports, dateRange, selectedStores, y1Metric, y2Metric]);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' }, title: { display: true, text: 'カスタム分析グラフ' }},
        scales: {
            y1: { type: 'linear', display: y1Metric.value !== 'none', position: 'left', ticks: { callback: value => `${value.toLocaleString()} ${y1Metric.unit || ''}` }},
            y2: { type: 'linear', display: y2Metric.value !== 'none', position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: value => `${value.toLocaleString()} ${y2Metric.unit || ''}` }}
        }
    };

    if (isLoadingReports || isLoadingReportsLY) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">カスタム分析</h1>
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">店舗選択</label>
                        <div className="flex flex-wrap gap-2">
                            {allStores.map(store => (
                                <button key={store.id} onClick={() => handleStoreToggle(store.name)}
                                    className={`px-3 py-1 text-sm rounded-full ${selectedStores.includes(store.name) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                                    {store.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">左の軸 (Y1) - 実線</label>
                        <select value={y1Metric.value} onChange={e => setY1Metric(metricOptions.find(o => o.value === e.target.value))} className="w-full p-2 border rounded-md">
                            {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">右の軸 (Y2) - 点線</label>
                        <select value={y2Metric.value} onChange={e => setY2Metric(metricOptions.find(o => o.value === e.target.value))} className="w-full p-2 border rounded-md">
                           {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>
                <div className="h-96 pt-4 border-t">
                    <Line data={chartData} options={chartOptions} />
                </div>
            </div>
        </div>
    );
};

// ==============================================================================
// AI分析（Gemini）共通処理
// ==============================================================================

// APIキーはビルド時に .env の VITE_GEMINI_API_KEY から読み込む
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
// 文章生成以外の用途のモデルは候補から外す
const GEMINI_EXCLUDE_PATTERN = /(image|tts|audio|live|embedding|lite|robotics|computer|learnlm|gemma|aqa|nano|transcribe|omni|customtools)/i;

// AI設定（経営方針メモ・出来事の記録・使用モデル）の保存先
const aiSettingsPath = `${appBasePath}/ai_settings`;
const AI_SETTINGS_DOC_ID = 'main';
const DEFAULT_AI_SETTINGS = { policy: '', events: [], model: '' };

const useAiSettings = () => {
    const [settings, setSettings] = useState(DEFAULT_AI_SETTINGS);
    useEffect(() => {
        return onSnapshot(doc(db, aiSettingsPath, AI_SETTINGS_DOC_ID), (snap) => {
            setSettings({ ...DEFAULT_AI_SETTINGS, ...(snap.exists() ? snap.data() : {}) });
        }, (error) => {
            console.error("AI設定の取得中にエラーが発生しました: ", error);
        });
    }, []);
    return settings;
};

const saveAiSettings = (patch) =>
    setDoc(doc(db, aiSettingsPath, AI_SETTINGS_DOC_ID), { ...patch, updatedAt: Timestamp.now() }, { merge: true });

const describeGeminiError = (status, message) => {
    if (status === 400 && /API key not valid/i.test(message || '')) return 'APIキーが無効です。キーの値を確認してください。';
    if (status === 403) return `このサイトからの利用が許可されていません。APIキーの制限設定を確認してください。（${message}）`;
    if (status === 429) return `利用上限に達しました。しばらく待ってからお試しください。（${message}）`;
    return message || `HTTP ${status}`;
};

// このAPIキーで使える文章生成モデルの一覧
const fetchGeminiModels = async () => {
    const response = await fetch(`${GEMINI_BASE_URL}/models?pageSize=200`, { headers: { 'x-goog-api-key': GEMINI_API_KEY } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(describeGeminiError(response.status, result.error?.message));
    return (result.models || [])
        .filter(m => m?.name && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(name => name.startsWith('gemini-') && !GEMINI_EXCLUDE_PATTERN.test(name));
};

// モデル未指定（自動）のときに試す候補。一覧が取れればその中の新しい flash 系を優先する
let cachedAutoGeminiModels = null;
const getAutoGeminiModels = async () => {
    if (cachedAutoGeminiModels) return cachedAutoGeminiModels;
    try {
        const listed = await fetchGeminiModels();
        const flash = listed.filter(name => /flash/.test(name));
        const stable = flash
            .filter(name => !/preview|exp|latest/.test(name))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        const candidates = [
            ...(listed.includes('gemini-flash-latest') ? ['gemini-flash-latest'] : []),
            ...stable.slice(0, 2),
            ...flash.slice(0, 1),
        ];
        if (candidates.length > 0) {
            cachedAutoGeminiModels = [...new Set(candidates)];
            return cachedAutoGeminiModels;
        }
    } catch (error) {
        console.warn('モデル一覧の取得に失敗:', error.message || error);
    }
    return ['gemini-flash-latest', 'gemini-2.5-flash'];
};

// Gemini に問い合わせる。contents は [{ role: 'user' | 'model', parts: [{ text }] }] の会話履歴
const callGemini = async ({ systemText, contents, model }) => {
    if (!GEMINI_API_KEY) throw new Error('APIキーが設定されていません。');
    const candidates = model ? [model] : await getAutoGeminiModels();
    let lastError = '利用できるモデルが見つかりませんでした。';
    for (const name of candidates) {
        // コード実行を有効にして、AIが添付の日別データから正確に再計算できるようにする
        const request = (withCodeExecution) => fetch(`${GEMINI_BASE_URL}/models/${name}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemText }] },
                contents,
                ...(withCodeExecution ? { tools: [{ codeExecution: {} }] } : {}),
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
            }),
        });
        let response = await request(true);
        let result = await response.json().catch(() => ({}));
        if (response.status === 400 && /code.?execution|tool/i.test(result.error?.message || '')) {
            // コード実行に対応していないモデルの場合は、コード実行なしで問い合わせ直す
            response = await request(false);
            result = await response.json().catch(() => ({}));
        }
        if (!response.ok) {
            lastError = describeGeminiError(response.status, result.error?.message);
            if (response.status === 404) continue;   // このモデルは使えない → 次の候補へ
            throw new Error(lastError);
        }
        const text = (result.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
        if (text) return { text, model: name };
        lastError = `回答が空でした（${result.promptFeedback?.blockReason || result.candidates?.[0]?.finishReason || '理由不明'}）`;
    }
    throw new Error(lastError);
};

// 音声入力（対応ブラウザのみ。非対応の場合 isSupported が false になる）
const useSpeechInput = (onResult) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const isSupported = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window;

    useEffect(() => {
        if (!isSupported) return;
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => onResult(event.results[0][0].transcript);
        recognition.onerror = (event) => {
            console.error('音声認識エラー', event.error);
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);

        recognitionRef.current = recognition;
        return () => recognition.abort();
    }, []);

    const toggle = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };
    return { isSupported, isListening, toggle };
};

// ------------------------------------------------------------------------------
// AIに渡す集計データの作成（計算はアプリ側で行い、AIには解釈を任せる）
// ------------------------------------------------------------------------------

const aiYen = (value) => (value == null || !isFinite(value)) ? '-' : Math.round(value).toLocaleString();
const aiPct = (value) => (value == null || !isFinite(value)) ? '-' : `${value.toFixed(2)}%`;
const aiDiffPct = (cy, ly) => (cy != null && ly > 0) ? `${cy >= ly ? '+' : ''}${((cy / ly - 1) * 100).toFixed(1)}%` : '-';
const aiSum = (rows, key) => rows.reduce((sum, r) => sum + (r[key] || 0), 0);
const AI_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // 月〜日
const AI_RAIN_MM = 5;                             // この降水量以上を「雨の日」とする

// 日報ドキュメントを集計用の行に変換（売上が入っていない日は対象外）
const toAiRow = (report, isLy = false) => {
    if (!report?.date || !report.store) return null;
    const pick = (key) => isLy ? getLySourceValue(report, key) : report[key];
    const sales = pick('sales');
    if (typeof sales !== 'number' || sales <= 0) return null;
    const d = report.date.toDate();
    const row = {
        date: getLocalDateString(d),
        dow: d.getDay(),
        store: report.store,
        sales,
        customers: Number(pick('customers')) || 0,
        weather: report.weather || null,
        hourlyData: report.hourly_hoursFilled === 24 ? report.hourlyData : null,
        hasWaste: HAIKI_WASTE_FIELDS.some(f => report[f.key] != null),
        waste: 0,
    };
    HAIKI_WASTE_FIELDS.forEach(f => {
        row[f.key] = Number(report[f.key]) || 0;
        row.waste += row[f.key];
    });
    return row;
};

// 店舗別の行を日付ごとに合算して「全店合計」の行にする
const toAiTotalRows = (rows) => {
    const byDate = new Map();
    rows.forEach(r => {
        const total = byDate.get(r.date) || { date: r.date, dow: r.dow, sales: 0, customers: 0, waste: 0, hasWaste: false, weather: r.weather };
        total.sales += r.sales;
        total.customers += r.customers;
        total.waste += r.waste;
        total.hasWaste = total.hasWaste || r.hasWaste;
        HAIKI_WASTE_FIELDS.forEach(f => { total[f.key] = (total[f.key] || 0) + r[f.key]; });
        byDate.set(r.date, total);
    });
    return Array.from(byDate.values());
};

const aggregateAiRows = (rows) => {
    if (rows.length === 0) return null;
    const sales = aiSum(rows, 'sales');
    const customers = aiSum(rows, 'customers');
    const wasteRows = rows.filter(r => r.hasWaste);   // 廃棄の平均・率は廃棄入力のある日だけで計算する
    const wasteSales = aiSum(wasteRows, 'sales');
    const result = {
        n: rows.length,
        wasteDays: wasteRows.length,
        salesAvg: sales / rows.length,
        customersAvg: customers / rows.length,
        spend: customers > 0 ? sales / customers : null,
        wasteAvg: wasteRows.length > 0 ? aiSum(wasteRows, 'waste') / wasteRows.length : null,
        wasteRate: wasteSales > 0 ? aiSum(wasteRows, 'waste') / wasteSales * 100 : null,
        fields: {},
        fieldRates: {},
    };
    HAIKI_WASTE_FIELDS.forEach(f => {
        result.fields[f.key] = wasteRows.length > 0 ? aiSum(wasteRows, f.key) / wasteRows.length : null;
        result.fieldRates[f.key] = wasteSales > 0 ? aiSum(wasteRows, f.key) / wasteSales * 100 : null;
    });
    return result;
};

const describeAiAggregate = (agg) => {
    if (!agg) return 'データなし';
    const base = `売上入力${agg.n}日 日販${aiYen(agg.salesAvg)} 客数${aiYen(agg.customersAvg)} 客単価${aiYen(agg.spend)}`;
    if (agg.wasteDays === 0) return `${base} 廃棄・値下げデータなし`;
    const fields = HAIKI_WASTE_FIELDS.map(f => `${f.label}${aiYen(agg.fields[f.key])}`).join(' ');
    return `${base} 廃棄値下げ計${aiYen(agg.wasteAvg)}(${aiPct(agg.wasteRate)}) 商品廃棄率${aiPct(agg.fieldRates.waste_product)} 内訳[${fields}]`;
};

const describeAiAggregateShort = (agg) => {
    if (!agg) return 'データなし';
    return `${agg.n}日 日販${aiYen(agg.salesAvg)} 客数${aiYen(agg.customersAvg)} 商品廃棄率${aiPct(agg.fieldRates.waste_product)} 廃棄値下げ率${aiPct(agg.wasteRate)}`;
};

const describeAiEvent = (event) => `${event.date || '日付なし'} ${event.store || '全店'}: ${event.note}${event.exclude ? '［集計から除外］' : ''}`;

// 出来事の記録のうち「集計から除外」に指定された「日付_店舗」の集合を作る
const buildAiExcludedKeys = (events, storeNames) => {
    const keys = new Set();
    (events || []).forEach(e => {
        if (!e?.exclude || !e.date) return;
        (e.store ? [e.store] : storeNames).forEach(name => keys.add(`${e.date}_${name}`));
    });
    return keys;
};
const isAiExcludedRow = (row, excludedKeys) => excludedKeys.has(`${row.date}_${row.store}`);

// AIがコード実行で再計算するための日別データ（CSV）。groups は [{ label, rows }]
const buildAiDailyCsv = (groups, storeNames, excludedKeys) => {
    const lines = [['区分', '日付', '曜日', '店舗', '日販', '客数', ...HAIKI_WASTE_FIELDS.map(f => f.label), '最高気温', '降水mm', '除外指定'].join(',')];
    groups.forEach(({ label, rows }) => {
        [...rows]
            .sort((a, b) => a.date === b.date ? storeNames.indexOf(a.store) - storeNames.indexOf(b.store) : a.date.localeCompare(b.date))
            .forEach(r => {
                lines.push([
                    label, r.date, WEEKDAY_LABELS[r.dow], r.store, r.sales, r.customers,
                    ...HAIKI_WASTE_FIELDS.map(f => r.hasWaste ? r[f.key] : ''),
                    r.weather?.maxTemp ?? '', r.weather?.precipitation ?? '',
                    isAiExcludedRow(r, excludedKeys) ? 1 : '',
                ].join(','));
            });
    });
    return lines.join('\n');
};
const AI_DAILY_CSV_NOTE = `添付のCSVファイルに日別データが入っている。列は 区分,日付,曜日,店舗,日販,客数,${HAIKI_WASTE_FIELDS.map(f => f.label).join(',')},最高気温,降水mm,除外指定。廃棄・値下げの列が空の日は廃棄未入力。除外指定が1の日は「集計から除外」に指定された日。`;

const toBase64Utf8 = (text) => {
    const bytes = new TextEncoder().encode(text);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
};

// 会話履歴を Gemini の contents に変換する。日別データのCSVは最初の発言に添付する
const buildAiContents = (messages, csv) => {
    const contents = messages
        .filter(m => !m.isError && !m.isLocal)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    if (csv && contents.length > 0) {
        contents[0].parts.unshift({ inlineData: { mimeType: 'text/csv', data: toBase64Utf8(csv) } });
    }
    return contents;
};

// 集計データ（文章）と日別データ（CSV）を作る
const buildAiDataSummary = ({ reports, reportsLY, stores, dateRange, events }) => {
    const startStr = getLocalDateString(dateRange.startDate);
    const endStr = getLocalDateString(dateRange.endDate);
    const lyStartStr = getLocalDateString(dateRange.startDateLY);
    const lyEndStr = getLocalDateString(dateRange.endDateLY);
    const storeNames = stores.map(s => s.name);
    const totalLabel = `${storeNames.length}店合計`;
    const dayCount = Math.round((parseLocalDate(endStr) - parseLocalDate(startStr)) / (1000 * 60 * 60 * 24)) + 1;

    const cyRows = reports.map(r => toAiRow(r)).filter(r => r && storeNames.includes(r.store) && r.date >= startStr && r.date <= endStr);
    const lyRows = reportsLY.map(r => toAiRow(r, true)).filter(r => r && storeNames.includes(r.store) && r.date >= lyStartStr && r.date <= lyEndStr);
    const excludedKeys = buildAiExcludedKeys(events, storeNames);
    const rowsFor = (rows, name) => name === totalLabel ? toAiTotalRows(rows) : rows.filter(r => r.store === name);
    const dayLabel = (r) => `${r.date}(${WEEKDAY_LABELS[r.dow]})`;

    const lines = [];
    lines.push(`【対象期間】${startStr}〜${endStr}（${dayCount}日間）／前年同期 ${lyStartStr}〜${lyEndStr}`);
    lines.push('【単位と定義】金額は円、1日あたりの平均。廃棄値下げ計＝商品廃棄＋オーナー値下げ8%＋同10%＋販促値下げ8%＋同10%。率は対売上比。前年同期は同じ日付の前年。');
    if (cyRows.length === 0) {
        lines.push('この期間には売上データがありません。');
        return { text: lines.join('\n'), csv: '' };
    }

    const pushStoreSummary = (cySource, lySource) => {
        [...storeNames, totalLabel].forEach(name => {
            const cy = aggregateAiRows(rowsFor(cySource, name));
            const ly = aggregateAiRows(rowsFor(lySource, name));
            lines.push(`■${name}`);
            lines.push(`  本年: ${describeAiAggregate(cy)}`);
            lines.push(`  前年同期: ${describeAiAggregate(ly)}`);
            if (cy && ly) {
                const wasteDiff = ly.wasteDays > 0 && cy.wasteDays > 0
                    ? ` 廃棄値下げ計${aiDiffPct(cy.wasteAvg, ly.wasteAvg)} 商品廃棄${aiDiffPct(cy.fields.waste_product, ly.fields.waste_product)} オーナー値下げ8%${aiDiffPct(cy.fields.waste_owner_8, ly.fields.waste_owner_8)}`
                    : '';
                lines.push(`  前年比: 日販${aiDiffPct(cy.salesAvg, ly.salesAvg)} 客数${aiDiffPct(cy.customersAvg, ly.customersAvg)} 客単価${aiDiffPct(cy.spend, ly.spend)}${wasteDiff}`);
            }
        });
    };

    const pushWeekday = (cySource) => {
        storeNames.forEach(name => {
            lines.push(`■${name}`);
            AI_WEEKDAY_ORDER.forEach(dow => {
                const agg = aggregateAiRows(rowsFor(cySource, name).filter(r => r.dow === dow));
                if (agg) lines.push(`  ${WEEKDAY_LABELS[dow]}: ${describeAiAggregateShort(agg)}`);
            });
        });
    };

    const tempBands = [[-50, 10], [10, 20], [20, 25], [25, 30], [30, 35], [35, 99]];
    const pushWeather = (cySource) => {
        storeNames.forEach(name => {
            const withWeather = rowsFor(cySource, name).filter(r => r.weather);
            if (withWeather.length === 0) return;
            lines.push(`■${name}`);
            lines.push(`  雨の日: ${describeAiAggregateShort(aggregateAiRows(withWeather.filter(r => (r.weather.precipitation || 0) >= AI_RAIN_MM)))}`);
            lines.push(`  それ以外: ${describeAiAggregateShort(aggregateAiRows(withWeather.filter(r => (r.weather.precipitation || 0) < AI_RAIN_MM)))}`);
            tempBands.forEach(([low, high]) => {
                const agg = aggregateAiRows(withWeather.filter(r => r.weather.maxTemp >= low && r.weather.maxTemp < high));
                if (agg) lines.push(`  最高気温${low <= -50 ? '' : low}〜${high >= 99 ? '' : high}℃: ${describeAiAggregateShort(agg)}`);
            });
        });
    };

    lines.push('', '【1. 店舗別サマリー】');
    pushStoreSummary(cyRows, lyRows);

    const months = [...new Set(cyRows.map(r => r.date.slice(0, 7)))].sort();
    if (months.length > 1) {
        lines.push('', '【2. 月別推移】');
        [...storeNames, totalLabel].forEach(name => {
            lines.push(`■${name}`);
            months.forEach(ym => {
                const lyYm = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;
                const cy = aggregateAiRows(rowsFor(cyRows, name).filter(r => r.date.startsWith(ym)));
                const ly = aggregateAiRows(rowsFor(lyRows, name).filter(r => r.date.startsWith(lyYm)));
                lines.push(`  ${ym}: ${describeAiAggregate(cy)}｜前年同月: ${describeAiAggregateShort(ly)}`);
            });
        });
    }

    lines.push('', '【3. 曜日別（本年）】');
    pushWeekday(cyRows);

    lines.push('', `【4. 天気別（本年。雨の日＝降水${AI_RAIN_MM}mm以上）】`);
    pushWeather(cyRows);

    lines.push('', '【5. 注意が必要な日（本年）】');
    const wasteRows = cyRows.filter(r => r.hasWaste);
    lines.push('・廃棄値下げ率が高い日（上位5日）');
    [...wasteRows].sort((a, b) => b.waste / b.sales - a.waste / a.sales).slice(0, 5).forEach(r => {
        const fields = HAIKI_WASTE_FIELDS.filter(f => r[f.key] !== 0).map(f => `${f.label}${aiYen(r[f.key])}`).join(' ');
        lines.push(`  ${dayLabel(r)} ${r.store}: 日販${aiYen(r.sales)} 廃棄値下げ計${aiYen(r.waste)}(${aiPct(r.waste / r.sales * 100)}) [${fields}]`);
    });
    const negativeRows = wasteRows.filter(r => HAIKI_WASTE_FIELDS.some(f => r[f.key] < 0));
    lines.push(`・マイナスの値が入っている日: ${negativeRows.length}日`);
    negativeRows.slice(0, 10).forEach(r => {
        const fields = HAIKI_WASTE_FIELDS.filter(f => r[f.key] < 0).map(f => `${f.label}${aiYen(r[f.key])}`).join(' ');
        lines.push(`  ${dayLabel(r)} ${r.store}: ${fields}`);
    });
    const outliers = [];
    storeNames.forEach(name => {
        const rows = rowsFor(cyRows, name);
        const agg = aggregateAiRows(rows);
        if (!agg) return;
        rows.forEach(r => {
            const ratio = r.sales / agg.salesAvg;
            if (ratio >= 1.4 || ratio <= 0.6) outliers.push(`  ${dayLabel(r)} ${r.store}: 日販${aiYen(r.sales)} 客数${aiYen(r.customers)}（店舗平均の${Math.round(ratio * 100)}%）`);
        });
    });
    lines.push(`・日販が店舗平均から40%以上離れている日: ${outliers.length}日`);
    outliers.slice(0, 10).forEach(line => lines.push(line));
    storeNames.forEach(name => {
        const rows = rowsFor(cyRows, name);
        const noWaste = rows.filter(r => !r.hasWaste).length;
        if (rows.length < dayCount || noWaste > 0) {
            lines.push(`・${name}: 売上未入力${dayCount - rows.length}日、売上入力ありで廃棄未入力${noWaste}日`);
        }
    });

    lines.push('', '【6. 時間帯別（本年。24時間分そろっている日のみ）】');
    let hasHourly = false;
    storeNames.forEach(name => {
        const rows = rowsFor(cyRows, name).filter(r => r.hourlyData);
        if (rows.length === 0) return;
        hasHourly = true;
        const customersByHour = Array(24).fill(0);
        const salesByHour = Array(24).fill(0);
        rows.forEach(r => {
            for (let h = 0; h < 24; h++) {
                customersByHour[h] += r.hourlyData[String(h)]?.customers || 0;
                salesByHour[h] += r.hourlyData[String(h)]?.sales || 0;
            }
        });
        const salesTotal = salesByHour.reduce((a, b) => a + b, 0) || 1;
        const dates = rows.map(r => r.date).sort();
        lines.push(`■${name}（${rows.length}日分、${dates[0]}〜${dates[dates.length - 1]}）`);
        lines.push(`  平均客数: ${customersByHour.map((v, h) => `${h}時${Math.round(v / rows.length)}`).join(' ')}`);
        lines.push(`  売上構成比%: ${salesByHour.map((v, h) => `${h}時${(v / salesTotal * 100).toFixed(1)}`).join(' ')}`);
    });
    if (!hasHourly) lines.push('この期間には取り込み済みの時間帯データがありません。');

    const relatedEvents = (events || [])
        .filter(e => e?.note && (!e.date || (e.date >= startStr && e.date <= endStr) || (e.date >= lyStartStr && e.date <= lyEndStr)))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    lines.push('', '【7. 出来事の記録（対象期間と前年同期に該当するもの）】');
    if (relatedEvents.length === 0) lines.push('登録なし');
    relatedEvents.forEach(e => lines.push(`  ${describeAiEvent(e)}`));

    // 「集計から除外」に指定された日がある場合は、その日を除いた集計も渡す
    const cyExcluded = cyRows.filter(r => isAiExcludedRow(r, excludedKeys));
    const lyExcluded = lyRows.filter(r => isAiExcludedRow(r, excludedKeys));
    lines.push('', '【8. 除外指定日を除いた集計】');
    if (cyExcluded.length === 0 && lyExcluded.length === 0) {
        lines.push('対象期間と前年同期に、除外指定された日はありません。');
    } else {
        const cyKept = cyRows.filter(r => !isAiExcludedRow(r, excludedKeys));
        const lyKept = lyRows.filter(r => !isAiExcludedRow(r, excludedKeys));
        lines.push(`除いた日（本年）: ${cyExcluded.map(r => `${r.date} ${r.store}`).join('、') || 'なし'}`);
        lines.push(`除いた日（前年同期）: ${lyExcluded.map(r => `${r.date} ${r.store}`).join('、') || 'なし'}`);
        lines.push('▼店舗別サマリー（除外後）');
        pushStoreSummary(cyKept, lyKept);
        lines.push('▼曜日別（本年・除外後）');
        pushWeekday(cyKept);
        lines.push('▼天気別（本年・除外後）');
        pushWeather(cyKept);
    }

    lines.push('', '【9. 日別データ】');
    lines.push(`${AI_DAILY_CSV_NOTE}区分は「本年」と「前年同期」。`);

    const csv = buildAiDailyCsv([{ label: '本年', rows: cyRows }, { label: '前年同期', rows: lyRows }], storeNames, excludedKeys);
    return { text: lines.join('\n'), csv };
};

const AI_COMMON_RULES = `回答のルール:
1. 数字は下の「集計データ」と添付の日別データ（CSV）に基づく。集計済みの値がそのまま使える場合はそれを使う。
2. 特定の日を除く、条件を絞る、別の切り口で比べるなど、集計済みの値に無い計算を求められた場合は、添付のCSVをコード実行で読み込んで計算して答える。暗算や概算で済ませない。その場合は「日別データから再計算」と書き、除いた日や条件、対象日数を明記する。
3. 「除外指定日を除いた集計」がある場合、傾向や平均を述べるときは除外後の数字を優先し、除外していることを一言添える。
4. データに無いことは推測で埋めず、「このデータからは分かりません」と答える。商品別のデータは無いので、商品ごとの数量には触れない。
5. 結論を先に書き、根拠となる数字を添える。原因は断定せず、「〜と重なっています」「〜の可能性があります」のように書く。
6. 「注意が必要な日」と「出来事の記録」に当てはまる日は、それを踏まえて解釈する。入力ミスの可能性がある値は、その旨を伝える。
7. 日本語で、画面にそのまま表示される文章として書く。記号による装飾（*や#）、表、数式の記法は使わず、見出しは【】、箇条書きは「・」を使う。プログラムのコードは回答に書かない。特に指定がなければ簡潔にまとめる。
8. 「経営方針メモ」がある場合は、そこに書かれた考え方・基準・答え方を最優先する。`;

const buildAiSystemText = ({ role, policy, dataText }) => [
    role,
    AI_COMMON_RULES,
    `【経営方針メモ】\n${(policy || '').trim() || '（未登録）'}`,
    `【集計データ】\n${dataText}`,
].join('\n\n');

const AI_ANALYSIS_ROLE = 'あなたは、コンビニエンスストア3店舗を運営する会社の経営分析担当です。経営者や店舗責任者からの質問に、アプリが実データから計算した集計データをもとに答えます。';

const AI_QUICK_QUESTIONS = [
    { label: '期間のまとめ', text: 'この期間の売上と廃棄・値下げの状況を、店舗別にまとめてください。' },
    { label: '前年比較', text: '前年同期と比べて、良くなった点と悪くなった点を教えてください。' },
    { label: '曜日別の傾向', text: '曜日別に見て、廃棄が多い曜日と少ない曜日、その理由として考えられることを教えてください。' },
    { label: '天気の影響', text: '天気や気温によって、売上と廃棄はどう変わっていますか。' },
    { label: '気になる日', text: '数字が不自然な日や、確認したほうがよい日を挙げてください。' },
    { label: '改善の提案', text: '廃棄・値下げを減らすために、まず取り組むべきことを3つ提案してください。' },
];

// AIの回答表示（AI分析・AI売上予測で共通）
const AiChatMessages = ({ messages, isAiLoading, emptyState, onAddPolicyNote }) => {
    const endRef = useRef(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, isAiLoading]);

    return (
        <div className="flex-grow bg-white rounded-lg shadow p-6 overflow-y-auto mb-4">
            {messages.length === 0 && emptyState}
            {messages.map((msg, index) => (
                <div key={index} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block max-w-full p-3 rounded-lg text-left ${msg.role === 'user' ? 'bg-blue-500 text-white' : msg.isError ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-800'}`}>
                       <p style={{whiteSpace: 'pre-wrap'}}>{msg.text}</p>
                    </div>
                    {msg.role === 'ai' && !msg.isError && (
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                            {msg.model && <span>{msg.model}</span>}
                            {onAddPolicyNote && (
                                <button type="button" onClick={onAddPolicyNote} className="text-blue-600 hover:underline">この回答への指摘を方針メモに追記</button>
                            )}
                        </div>
                    )}
                </div>
            ))}
            {isAiLoading && (
                  <div className="text-left">
                    <div className="inline-block p-3 rounded-lg bg-gray-200 text-gray-800">
                       <div className="flex items-center">
                           <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                           <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2 delay-75"></div>
                           <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                       </div>
                    </div>
                </div>
            )}
            <div ref={endRef}></div>
        </div>
    );
};

const AiChatInput = ({ userInput, setUserInput, onSend, disabled, isAiLoading, speech }) => (
    <div className="flex">
        <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && !disabled && onSend(userInput)}
            className="flex-grow min-w-0 p-3 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="AIへの質問を入力..."
            disabled={disabled}
        />
        {speech.isSupported && (
            <button
                type="button"
                onClick={speech.toggle}
                className={`p-3 border-t border-b ${speech.isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
                <MicIcon />
            </button>
        )}
        <button
            type="button"
            onClick={() => onSend(userInput)}
            disabled={disabled}
            className="bg-blue-600 text-white font-bold py-3 px-6 rounded-r-lg hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
        >
            {isAiLoading ? '分析中...' : '送信'}
        </button>
    </div>
);

// 回答への指摘を「経営方針メモ」の末尾に追記する
const appendAiPolicyNote = async (currentPolicy) => {
    const note = window.prompt('今後のAI分析に反映したい考え方や指摘を入力してください。\n（AI設定の「経営方針メモ」の末尾に追記されます）');
    if (!note || !note.trim()) return false;
    const base = (currentPolicy || '').trimEnd();
    await saveAiSettings({ policy: `${base}${base ? '\n' : ''}・${note.trim()}` });
    return true;
};

// ローカルデータ分析関数（APIキー未設定時の簡易分析）
const analyzeDataLocally = (question, data) => {
    const questionLower = question.toLowerCase();
    
    // データの基本統計を計算
    const validReports = data.filter(r => r.sales && r.sales > 0);
    if (validReports.length === 0) {
        return "分析可能なデータがありません。期間を選択してデータを確認してください。";
    }

    const totalSales = validReports.reduce((sum, r) => sum + (r.sales || 0), 0);
    const avgSales = totalSales / validReports.length;
    const totalCustomers = validReports.reduce((sum, r) => sum + (r.customers || 0), 0);
    const avgCustomers = totalCustomers / validReports.length;
    const totalWaste = validReports.reduce((sum, r) => sum + (r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0), 0);
    const avgWaste = totalWaste / validReports.length;
    const avgCustomerSpend = avgSales / avgCustomers || 0;

    // 売上に関する質問
    if (questionLower.includes('売上') || questionLower.includes('売り上げ')) {
        const maxSales = Math.max(...validReports.map(r => r.sales || 0));
        const minSales = Math.min(...validReports.map(r => r.sales || 0));
        const maxSalesReport = validReports.find(r => r.sales === maxSales);
        const minSalesReport = validReports.find(r => r.sales === minSales);
        
        if (questionLower.includes('高い') || questionLower.includes('最大') || questionLower.includes('最高')) {
            return `最高売上は ${getLocalDateString(maxSalesReport.date.toDate())} の ${maxSalesReport.store} で ¥${maxSalesReport.sales.toLocaleString()} でした。\n客数: ${maxSalesReport.customers}人、客単価: ¥${Math.round((maxSalesReport.sales / maxSalesReport.customers) || 0).toLocaleString()}\n天気: ${maxSalesReport.weather ? `${maxSalesReport.weather.maxTemp}°C` : '情報なし'}`;
        }
        if (questionLower.includes('低い') || questionLower.includes('最小') || questionLower.includes('最低')) {
            return `最低売上は ${getLocalDateString(minSalesReport.date.toDate())} の ${minSalesReport.store} で ¥${minSalesReport.sales.toLocaleString()} でした。\n客数: ${minSalesReport.customers}人、客単価: ¥${Math.round((minSalesReport.sales / minSalesReport.customers) || 0).toLocaleString()}\n天気: ${minSalesReport.weather ? `${minSalesReport.weather.maxTemp}°C` : '情報なし'}`;
        }
        if (questionLower.includes('平均')) {
            return `選択期間の平均売上は ¥${Math.round(avgSales).toLocaleString()} です。\n最高: ¥${maxSales.toLocaleString()}、最低: ¥${minSales.toLocaleString()}`;
        }
        return `売上統計:\n平均: ¥${Math.round(avgSales).toLocaleString()}\n最高: ¥${maxSales.toLocaleString()} (${getLocalDateString(maxSalesReport.date.toDate())}, ${maxSalesReport.store})\n最低: ¥${minSales.toLocaleString()} (${getLocalDateString(minSalesReport.date.toDate())}, ${minSalesReport.store})`;
    }

    // 客数に関する質問
    if (questionLower.includes('客数') || questionLower.includes('来店')) {
        const maxCustomers = Math.max(...validReports.map(r => r.customers || 0));
        const minCustomers = Math.min(...validReports.map(r => r.customers || 0));
        const maxCustomersReport = validReports.find(r => r.customers === maxCustomers);
        const minCustomersReport = validReports.find(r => r.customers === minCustomers);
        
        return `客数統計:\n平均: ${Math.round(avgCustomers)}人\n最高: ${maxCustomers}人 (${getLocalDateString(maxCustomersReport.date.toDate())}, ${maxCustomersReport.store})\n最低: ${minCustomers}人 (${getLocalDateString(minCustomersReport.date.toDate())}, ${minCustomersReport.store})`;
    }

    // 客単価に関する質問
    if (questionLower.includes('客単価') || questionLower.includes('単価')) {
        const customerSpends = validReports.map(r => (r.sales || 0) / (r.customers || 1));
        const maxSpend = Math.max(...customerSpends);
        const minSpend = Math.min(...customerSpends);
        const maxSpendReport = validReports[customerSpends.indexOf(maxSpend)];
        const minSpendReport = validReports[customerSpends.indexOf(minSpend)];
        
        return `客単価統計:\n平均: ¥${Math.round(avgCustomerSpend).toLocaleString()}\n最高: ¥${Math.round(maxSpend).toLocaleString()} (${getLocalDateString(maxSpendReport.date.toDate())}, ${maxSpendReport.store})\n最低: ¥${Math.round(minSpend).toLocaleString()} (${getLocalDateString(minSpendReport.date.toDate())}, ${minSpendReport.store})`;
    }

    // 廃棄に関する質問
    if (questionLower.includes('廃棄') || questionLower.includes('ロス') || questionLower.includes('値下げ')) {
        const wasteByType = {
            product: validReports.reduce((sum, r) => sum + (r.waste_product || 0), 0),
            owner8: validReports.reduce((sum, r) => sum + (r.waste_owner_8 || 0), 0),
            owner10: validReports.reduce((sum, r) => sum + (r.waste_owner_10 || 0), 0),
            promo8: validReports.reduce((sum, r) => sum + (r.waste_promo_8 || 0), 0),
            promo10: validReports.reduce((sum, r) => sum + (r.waste_promo_10 || 0), 0)
        };
        
        const maxWaste = Math.max(...validReports.map(r => (r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0)));
        const maxWasteReport = validReports.find(r => ((r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0)) === maxWaste);
        
        return `廃棄・値下げ統計:\n合計: ¥${Math.round(totalWaste).toLocaleString()}\n平均: ¥${Math.round(avgWaste).toLocaleString()}\n内訳:\n- 商品廃棄: ¥${Math.round(wasteByType.product).toLocaleString()}\n- オーナー値下げ8%: ¥${Math.round(wasteByType.owner8).toLocaleString()}\n- オーナー値下げ10%: ¥${Math.round(wasteByType.owner10).toLocaleString()}\n- 販促値下げ8%: ¥${Math.round(wasteByType.promo8).toLocaleString()}\n- 販促値下げ10%: ¥${Math.round(wasteByType.promo10).toLocaleString()}\n\n最高廃棄日: ${getLocalDateString(maxWasteReport.date.toDate())} (${maxWasteReport.store}) - ¥${maxWaste.toLocaleString()}`;
    }

    // 店舗に関する質問
    if (questionLower.includes('店舗') || questionLower.includes('店')) {
        const storeStats = {};
        validReports.forEach(r => {
            if (!storeStats[r.store]) {
                storeStats[r.store] = { sales: 0, customers: 0, waste: 0, count: 0 };
            }
            storeStats[r.store].sales += r.sales || 0;
            storeStats[r.store].customers += r.customers || 0;
            storeStats[r.store].waste += (r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0);
            storeStats[r.store].count += 1;
        });
        
        const storeList = Object.entries(storeStats).map(([store, stats]) => ({
            store,
            avgSales: stats.sales / stats.count,
            avgCustomers: stats.customers / stats.count,
            avgWaste: stats.waste / stats.count
        })).sort((a, b) => b.avgSales - a.avgSales);
        
        return `店舗別統計:\n${storeList.map(s => `${s.store}: 平均売上 ¥${Math.round(s.avgSales).toLocaleString()}, 平均客数 ${Math.round(s.avgCustomers)}人, 平均廃棄 ¥${Math.round(s.avgWaste).toLocaleString()}`).join('\n')}`;
    }

    // 天気に関する質問
    if (questionLower.includes('天気') || questionLower.includes('気温') || questionLower.includes('雨')) {
        const weatherReports = validReports.filter(r => r.weather);
        if (weatherReports.length === 0) {
            return "天気データがありません。";
        }
        const avgTemp = weatherReports.reduce((sum, r) => sum + (r.weather.maxTemp || 0), 0) / weatherReports.length;
        const maxTemp = Math.max(...weatherReports.map(r => r.weather.maxTemp || 0));
        const minTemp = Math.min(...weatherReports.map(r => r.weather.maxTemp || 0));
        
        return `天気統計:\n平均気温: ${Math.round(avgTemp)}°C\n最高気温: ${maxTemp}°C\n最低気温: ${minTemp}°C`;
    }

    // デフォルト: 基本統計を返す
    return `選択期間の基本統計:\n\n📊 売上\n平均: ¥${Math.round(avgSales).toLocaleString()}\n合計: ¥${Math.round(totalSales).toLocaleString()}\n\n👥 客数\n平均: ${Math.round(avgCustomers)}人\n合計: ${Math.round(totalCustomers)}人\n\n💰 客単価\n平均: ¥${Math.round(avgCustomerSpend).toLocaleString()}\n\n🗑️ 廃棄・値下げ\n合計: ¥${Math.round(totalWaste).toLocaleString()}\n平均: ¥${Math.round(avgWaste).toLocaleString()}\n\nデータ件数: ${validReports.length}件\n\nより詳しい情報を知りたい場合は、「売上が高い日は？」「廃棄が多い店舗は？」など具体的に質問してください。`;
};

const AiAnalysisPage = ({ stores, dateRange, onRefresh, aiSettings }) => {
    const { data: reports, isLoading: isLoadingReports } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const { data: reportsLY, isLoading: isLoadingReportsLY } = useReports(dateRange.startDateLY, dateRange.endDateLY, onRefresh);
    const isLoading = isLoadingReports || isLoadingReportsLY;
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [notice, setNotice] = useState('');
    const speech = useSpeechInput(setUserInput);

    const dataSummary = useMemo(
        () => buildAiDataSummary({ reports, reportsLY, stores, dateRange, events: aiSettings.events }),
        [reports, reportsLY, stores, dateRange.startDate, dateRange.endDate, dateRange.startDateLY, dateRange.endDateLY, aiSettings.events]
    );

    const handleSendMessage = async (question) => {
        const text = (question || '').trim();
        if (!text || isAiLoading || isLoading) return;

        const newMessages = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setUserInput('');
        setIsAiLoading(true);

        if (!GEMINI_API_KEY) {
            // APIキーがない場合はローカルの簡易分析を使用
            try {
                const analysisResult = analyzeDataLocally(text, reports);
                setMessages([...newMessages, { role: 'ai', text: `[簡易分析モード]\n\n${analysisResult}\n\n※AIによる分析にはGemini APIキーの設定が必要です。`, isLocal: true }]);
            } catch (error) {
                console.error("データ分析に失敗しました:", error);
                setMessages([...newMessages, { role: 'ai', text: "分析中にエラーが発生しました。もう一度お試しください。", isError: true }]);
            } finally {
                setIsAiLoading(false);
            }
            return;
        }

        try {
            const result = await callGemini({
                systemText: buildAiSystemText({ role: AI_ANALYSIS_ROLE, policy: aiSettings.policy, dataText: dataSummary.text }),
                contents: buildAiContents(newMessages, dataSummary.csv),
                model: aiSettings.model,
            });
            setMessages([...newMessages, { role: 'ai', text: result.text, model: result.model }]);
        } catch (error) {
            console.error("AI分析に失敗しました:", error);
            setMessages([...newMessages, { role: 'ai', text: `AIの呼び出しに失敗しました。\n${error.message}`, isError: true }]);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleAddPolicyNote = async () => {
        try {
            if (await appendAiPolicyNote(aiSettings.policy)) {
                setNotice('方針メモに追記しました。次の質問から反映されます。');
                setTimeout(() => setNotice(''), 4000);
            }
        } catch (error) {
            setNotice(`方針メモの保存に失敗しました: ${error.message}`);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">AI経営分析</h1>
            <p className="text-sm text-gray-600 mb-3">
                対象期間: {getLocalDateString(dateRange.startDate)} 〜 {getLocalDateString(dateRange.endDate)}（前年同期と比較）
                <span className="ml-3">方針メモ: {(aiSettings.policy || '').trim() ? '登録あり' : '未登録'}</span>
                {!GEMINI_API_KEY && <span className="ml-3 text-yellow-700">APIキー未設定のため簡易分析モード</span>}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
                {AI_QUICK_QUESTIONS.map(q => (
                    <button key={q.label} type="button" onClick={() => handleSendMessage(q.text)} disabled={isAiLoading || isLoading} className="px-3 py-1.5 text-sm rounded-full border bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50">{q.label}</button>
                ))}
            </div>
            {notice && <p className="mb-3 text-sm p-2 rounded bg-green-100 text-green-700">{notice}</p>}
            <AiChatMessages
                messages={messages}
                isAiLoading={isAiLoading}
                onAddPolicyNote={GEMINI_API_KEY ? handleAddPolicyNote : null}
                emptyState={(
                    <div className="text-center text-gray-500">
                        <p className="mt-2">{isLoading ? 'データを読み込んでいます...' : '選択された期間のデータについて、AIに質問してみましょう。'}</p>
                        <p className="text-sm mt-1">上のボタンか、自由な文章で質問できます。例: 「北谷店の廃棄が多い曜日は？」</p>
                    </div>
                )}
            />
            <details className="mb-3 text-xs text-gray-500">
                <summary className="cursor-pointer select-none">AIに渡している集計データを表示</summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded max-h-64 overflow-auto whitespace-pre-wrap">{dataSummary.text}</pre>
            </details>
            <AiChatInput userInput={userInput} setUserInput={setUserInput} onSend={handleSendMessage} disabled={isAiLoading || isLoading} isAiLoading={isAiLoading} speech={speech} />
        </div>
    );
};

const CsvPage = ({ dateRange }) => {
    const [message, setMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const isScriptReady = usePapaParse();

    const handleExport = async () => {
        setIsProcessing(true);
        setMessage({ text: 'データをエクスポートしています...', type: 'info' });
        try {
            const reportsRef = collection(db, dailyReportsPath);
            const q = query(reportsRef, where("date", ">=", getTimestampFromDateString(getLocalDateString(dateRange.startDate))), where("date", "<=", getTimestampFromDateString(getLocalDateString(dateRange.endDate))));
            const querySnapshot = await getDocs(q);
            const dataToExport = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    date: getLocalDateString(data.date.toDate()),
                    store: data.store,
                    // 未入力の項目は空欄で出力する（再インポート時に0で上書きしないため）
                    sales: data.sales ?? '',
                    customers: data.customers ?? '',
                    customer_spend: data.customer_spend ?? '',
                    waste_product: data.waste_product ?? '',
                    waste_owner_8: data.waste_owner_8 ?? '',
                    waste_owner_10: data.waste_owner_10 ?? '',
                    waste_promo_8: data.waste_promo_8 ?? '',
                    waste_promo_10: data.waste_promo_10 ?? '',
                    weather_code: data.weather?.weatherCode ?? '',
                    max_temp: data.weather?.maxTemp ?? '',
                    precipitation: data.weather?.precipitation ?? '',
                };
            });

            if (dataToExport.length === 0) {
                setMessage({ text: 'エクスポートするデータがありません。', type: 'info' });
                setIsProcessing(false);
                return;
            }

            if (!window.Papa) {
                setMessage({ text: 'CSV処理ライブラリが読み込まれていません。', type: 'error' });
                setIsProcessing(false);
                return;
            }

            const csv = window.Papa.unparse(dataToExport);
            const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); 
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `reports_${getLocalDateString(dateRange.startDate)}-${getLocalDateString(dateRange.endDate)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setMessage({ text: 'エクスポートが完了しました。', type: 'success' });

        } catch (error) {
            console.error("データのエクスポートエラー: ", error);
            setMessage({ text: `エクスポート中にエラーが発生しました: ${error.message}`, type: 'error' });
        } finally {
            setIsProcessing(false);
            setTimeout(() => setMessage(''), 5000);
        }
    };

    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!window.Papa) {
            setMessage({ text: 'CSV処理ライブラリが読み込まれていません。', type: 'error' });
            return;
        }

        setIsProcessing(true);
        setMessage({ text: 'CSVファイルをインポートしています...', type: 'info' });

        window.Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const numericKeys = ['sales', 'customers', 'customer_spend', 'waste_product', 'waste_owner_8', 'waste_owner_10', 'waste_promo_8', 'waste_promo_10'];
                const hasNumber = (value) => value != null && String(value).trim() !== '' && !isNaN(Number(value));
                const writes = [];
                let skipped = 0;
                results.data.forEach(row => {
                    const date = (row.date || '').trim();
                    const store = (row.store || '').trim();
                    // 日付は YYYY-MM-DD 形式のみ受け付ける（Excelで 2025/1/5 等に変わった行は取り込まない）
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !store) {
                        skipped++;
                        return;
                    }
                    const payload = {
                        date: getTimestampFromDateString(date),
                        store: store,
                    };
                    // CSVに無い列・空欄のセルは書き込まない（既存の値を0で上書きしないため）
                    numericKeys.forEach(key => {
                        if (hasNumber(row[key])) payload[key] = Number(row[key]);
                    });
                    if(row.weather_code || row.max_temp || row.precipitation) {
                        payload.weather = {
                            weatherCode: Number(row.weather_code) || 0,
                            maxTemp: Number(row.max_temp) || 0,
                            precipitation: Number(row.precipitation) || 0,
                        }
                    }
                    writes.push({ docRef: doc(db, dailyReportsPath, `${date}_${store}`), payload });
                });

                let success = 0, failed = 0, lastError = null;
                const BATCH_SIZE = 400;   // writeBatch の上限500件に対する安全マージン
                try {
                    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
                        const chunk = writes.slice(i, i + BATCH_SIZE);
                        const batch = writeBatch(db);
                        chunk.forEach(w => batch.set(w.docRef, w.payload, { merge: true }));
                        try {
                            await batch.commit();
                            success += chunk.length;
                        } catch (error) {
                            console.error("データのインポートエラー: ", error);
                            failed += chunk.length;
                            lastError = error;
                        }
                    }
                    const skippedText = skipped > 0 ? `（日付の形式が不正、または店舗が空のためスキップ: ${skipped}行）` : '';
                    if (failed > 0) {
                        setMessage({ text: `インポート中にエラーが発生しました。成功: ${success}件 / 失敗: ${failed}件${skippedText} ${lastError?.message || ''}`, type: 'error' });
                    } else {
                        setMessage({ text: `${success}件のデータをインポートしました。${skippedText}`, type: skipped > 0 && success === 0 ? 'error' : 'success' });
                    }
                } finally {
                    setIsProcessing(false);
                    setTimeout(() => setMessage(''), 8000);
                }
            },
            error: (error) => {
                console.error("CSVの解析エラー:", error);
                setMessage({ text: `CSVの解析中にエラーが発生しました: ${error.message}`, type: 'error' });
                setIsProcessing(false);
            }
        });
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">CSV入出力</h1>
            <div className="bg-white p-8 rounded-lg shadow space-y-8">
                <div>
                    <h2 className="text-xl font-semibold mb-4">データのエクスポート</h2>
                    <p className="mb-4 text-gray-600">現在選択されている分析期間のデータをCSVファイルとしてダウンロードします。</p>
                    <button onClick={handleExport} disabled={isProcessing || !isScriptReady} className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">
                        {isProcessing ? '処理中...' : (isScriptReady ? 'CSVエクスポート' : 'ライブラリ読込中...')}
                    </button>
                </div>
                <div className="border-t pt-8">
                    <h2 className="text-xl font-semibold mb-4">データのインポート</h2>
                    <p className="mb-4 text-gray-600">CSVファイルを選択してデータを一括で登録・更新します。フォーマットはエクスポートされたファイルと同じ形式にしてください。CSVに無い列や空欄のセルは変更されません。</p>
                    <input type="file" accept=".csv" onChange={handleImport} disabled={isProcessing || !isScriptReady} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"/>
                </div>
                {message && <p className={`mt-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : message.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}
            </div>
        </div>
    );
};

const HourlySyncPage = ({ stores }) => {
    const yesterdayStr = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return getLocalDateString(d);
    }, []);

    const [fromDate, setFromDate] = useState(yesterdayStr);
    const [toDate, setToDate] = useState(yesterdayStr);
    const [storeFilter, setStoreFilter] = useState('all');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [preview, setPreview] = useState(null);   // { rows, skipped }
    const [progress, setProgress] = useState(null); // { done, total }
    const [result, setResult] = useState(null);     // { success, skipped, errors }
    const [message, setMessage] = useState(null);

    // ロールバック（削除）用 state
    const [rollbackTargets, setRollbackTargets] = useState(null);
    const [rollbackLoading, setRollbackLoading] = useState(false);
    const [rollbackExecuting, setRollbackExecuting] = useState(false);
    const [rollbackProgress, setRollbackProgress] = useState(null);
    const [rollbackResult, setRollbackResult] = useState(null);

    // 条件が変わったらプレビューを無効化（プレビュー確認後にのみ実行できるようにする）
    const resetPreview = () => { setPreview(null); setResult(null); setProgress(null); setMessage(null); };

    const handlePreview = async () => {
        if (!fromDate || !toDate || fromDate > toDate) {
            setMessage({ text: '期間の指定が不正です。開始日 ≦ 終了日 で指定してください。', type: 'error' });
            return;
        }
        setIsPreviewing(true);
        setPreview(null);
        setResult(null);
        setProgress(null);
        setMessage(null);
        try {
            // 作業割当側の店舗マスタを取得し、日販側マスタに存在する店舗名のみ対象にする
            // （「総務」「本部」「フリー」等の非店舗を除外）
            const sagyouMap = await fetchSagyouStoreMap();
            const nippanNames = new Set(stores.map(s => s.name));
            const targets = Object.entries(sagyouMap)
                .filter(([, name]) => nippanNames.has(name))
                .filter(([, name]) => storeFilter === 'all' || name === storeFilter);

            if (targets.length === 0) {
                setMessage({ text: '対象店舗が見つかりません。店舗マスタを確認してください。', type: 'error' });
                return;
            }

            let rows = [];
            let skipped = 0;
            for (const [sagyouId, storeName] of targets) {
                const docs = await fetchSagyouHourly(sagyouId, fromDate, toDate);
                for (const d of docs) {
                    const date = d.id.slice(sagyouId.length + 1);
                    if (!d.hourlyData || Object.keys(d.hourlyData).length === 0) {
                        skipped++;   // hourlyData が空のドキュメントはスキップ
                        continue;
                    }
                    const { hoursFilled, custSum, salesSum } = summarizeHourly(d.hourlyData);
                    rows.push({
                        sourceId: d.id,
                        targetDocId: `${date}_${storeName}`,
                        date,
                        storeName,
                        hourlyData: d.hourlyData,
                        hoursFilled,
                        custSum,
                        salesSum,
                    });
                }
            }

            // 取り込み先の既存ドキュメントを読み、突合用の売上・客数と存在有無を取得（書き込みはしない）
            const existingById = {};
            const CHUNK = 50;
            for (let i = 0; i < rows.length; i += CHUNK) {
                const chunk = rows.slice(i, i + CHUNK);
                const snaps = await Promise.all(chunk.map(r => getDoc(doc(db, dailyReportsPath, r.targetDocId))));
                snaps.forEach((s, idx) => {
                    existingById[chunk[idx].targetDocId] = s.exists() ? s.data() : null;
                });
            }

            rows = rows.map(r => {
                const ex = existingById[r.targetDocId];
                const sales = typeof ex?.sales === 'number' ? ex.sales : null;
                const customers = typeof ex?.customers === 'number' ? ex.customers : null;
                const { level, labels } = judgeHourlyRow({
                    hoursFilled: r.hoursFilled, custSum: r.custSum, salesSum: r.salesSum, sales, customers,
                });
                return { ...r, exists: !!ex, sales, customers, level, labels };
            });
            rows.sort((a, b) => (a.date === b.date ? a.storeName.localeCompare(b.storeName, 'ja') : a.date.localeCompare(b.date)));

            setPreview({ rows, skipped });
            if (rows.length === 0 && skipped === 0) {
                setMessage({ text: '指定期間に取り込み対象のデータがありません。', type: 'info' });
            }
        } catch (error) {
            console.error('時間帯データのプレビュー取得エラー: ', error);
            setMessage({ text: `プレビューの取得中にエラーが発生しました: ${error.message}`, type: 'error' });
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleExecute = async () => {
        if (!preview || preview.rows.length === 0) return;
        const rows = preview.rows;
        setIsExecuting(true);
        setResult(null);
        setMessage(null);
        setProgress({ done: 0, total: rows.length });

        let success = 0, errors = 0;
        const BATCH_SIZE = 400;   // writeBatch の上限500件に対する安全マージン
        try {
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const chunk = rows.slice(i, i + BATCH_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(r => {
                    const payload = {
                        hourlyData: r.hourlyData,
                        hourly_hoursFilled: r.hoursFilled,
                        hourly_customers_sum: r.custSum,
                        hourly_sales_sum: r.salesSum,
                        hourly_syncedAt: Timestamp.now(),
                        hourly_sourceId: r.sourceId,
                    };
                    // 取り込み先が存在しない場合のみ store / date を補完（既存フィールドは触らない）
                    if (!r.exists) {
                        payload.store = r.storeName;
                        payload.date = getTimestampFromDateString(r.date);
                    }
                    batch.set(doc(db, dailyReportsPath, r.targetDocId), payload, { merge: true });
                });
                try {
                    await batch.commit();
                    success += chunk.length;
                } catch (error) {
                    console.error('時間帯データの書き込みエラー: ', error);
                    errors += chunk.length;
                }
                setProgress({ done: Math.min(i + BATCH_SIZE, rows.length), total: rows.length });
            }
            setResult({ success, skipped: preview.skipped, errors });
            setMessage(errors === 0
                ? { text: '取り込みが完了しました。', type: 'success' }
                : { text: '一部の書き込みでエラーが発生しました。コンソールを確認してください。', type: 'error' });
        } finally {
            setIsExecuting(false);
        }
    };

    const formatNum = (v) => (typeof v === 'number' ? v.toLocaleString() : '—');
    const rowClass = (level) => level === 'danger' ? 'bg-red-50' : level === 'warn' ? 'bg-yellow-50' : '';

    const loadRollbackTargets = async () => {
        setRollbackLoading(true);
        try {
            const snap = await getDocs(collection(db, dailyReportsPath));
            const ids = snap.docs.filter(d => d.data().hourly_syncedAt).map(d => d.id);
            setRollbackTargets(ids);
        } catch (error) {
            console.error('削除対象の取得エラー: ', error);
            setRollbackTargets([]);
        } finally {
            setRollbackLoading(false);
        }
    };

    const handleRollbackSectionToggle = (e) => {
        if (e.target.open && rollbackTargets === null) {
            loadRollbackTargets();
        }
    };

    const handleRollback = async () => {
        if (!rollbackTargets || rollbackTargets.length === 0) return;
        const confirmed = window.confirm(
            `${rollbackTargets.length}件のドキュメントから時間帯データを削除します。\n\n` +
            'sales / customers / waste_* / weather など既存データは変更されません。\n\nよろしいですか？'
        );
        if (!confirmed) return;

        setRollbackExecuting(true);
        setRollbackResult(null);
        setRollbackProgress({ done: 0, total: rollbackTargets.length });
        try {
            const { success, failed } = await rollbackHourly(rollbackTargets, setRollbackProgress);
            setRollbackResult({ success, failed });
            setRollbackTargets([]);
        } finally {
            setRollbackExecuting(false);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">時間帯取込</h1>
            <p className="text-gray-600 mb-6">作業割当アプリの1時間ごとの客数・売上データを日報に取り込みます。プレビューで内容を確認してから実行してください。</p>

            <div className="bg-white p-6 rounded-lg shadow mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); resetPreview(); }} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
                        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); resetPreview(); }} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">店舗</label>
                        <select value={storeFilter} onChange={(e) => { setStoreFilter(e.target.value); resetPreview(); }} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            <option value="all">全店</option>
                            {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handlePreview} disabled={isPreviewing || isExecuting} className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">
                            {isPreviewing ? '取得中...' : 'プレビュー'}
                        </button>
                        {/* result がセット済み = 実行完了。再プレビューするまで押せないようにして二重実行を防ぐ */}
                        <button onClick={handleExecute} disabled={!preview || preview.rows.length === 0 || isExecuting || isPreviewing || !!result} className="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-400">
                            {isExecuting ? '実行中...' : result ? '実行済み' : '取り込み実行'}
                        </button>
                    </div>
                </div>

                {progress && (
                    <p className="mt-4 text-center text-sm font-semibold text-gray-700">
                        {progress.done}件 / 全{progress.total}件
                    </p>
                )}
                {result && (
                    <div className="mt-4 flex justify-center gap-6 text-sm font-semibold">
                        <span className="text-green-700">成功: {result.success}件</span>
                        <span className="text-gray-600">スキップ: {result.skipped}件</span>
                        <span className="text-red-700">エラー: {result.errors}件</span>
                    </div>
                )}
                {message && (
                    <p className={`mt-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : message.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>
                )}
            </div>

            {preview && (
                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold">プレビュー（{preview.rows.length}件）</h2>
                        {preview.skipped > 0 && <span className="text-sm text-gray-500">時間帯データが空のためスキップ: {preview.skipped}件</span>}
                    </div>
                    <p className="text-sm text-gray-500 mb-4">⚠️ や 🔴 が付いた行も取り込みは実行されます（警告は表示のみ）。データの修正は現場の判断で行ってください。</p>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-gray-700">
                                    <th className="px-3 py-2 text-left whitespace-nowrap">日付</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">店舗</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">時間数</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">日販売上</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">時間帯合計</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">差</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">日販客数</th>
                                    <th className="px-3 py-2 text-right whitespace-nowrap">時間帯客数</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">判定</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.rows.map(r => (
                                    <tr key={r.targetDocId} className={`border-b ${rowClass(r.level)}`}>
                                        <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{r.storeName}</td>
                                        <td className="px-3 py-2 text-right">{r.hoursFilled}</td>
                                        <td className="px-3 py-2 text-right">{formatNum(r.sales)}</td>
                                        <td className="px-3 py-2 text-right">{formatNum(r.salesSum)}</td>
                                        <td className="px-3 py-2 text-right">{typeof r.sales === 'number' ? (r.sales - r.salesSum).toLocaleString() : '—'}</td>
                                        <td className="px-3 py-2 text-right">{formatNum(r.customers)}</td>
                                        <td className="px-3 py-2 text-right">{formatNum(r.custSum)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{r.labels.join(' ')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <details className="mt-6 bg-white p-6 rounded-lg shadow border border-red-200" onToggle={handleRollbackSectionToggle}>
                <summary className="cursor-pointer text-lg font-semibold text-red-700 select-none">取り込んだデータを削除</summary>
                <div className="mt-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        daily_reports から時間帯データ（hourlyData と hourly_* 6フィールド）のみを削除します。
                        売上・客数・廃棄・天気など既存データには触れません。
                    </p>
                    {rollbackLoading && <p className="text-sm text-gray-500">対象件数を取得中...</p>}
                    {rollbackTargets !== null && !rollbackLoading && (
                        <p className="text-sm font-semibold text-gray-800">
                            削除対象：<span className="text-red-700">{rollbackTargets.length}件</span>のドキュメント
                        </p>
                    )}
                    {rollbackProgress && (
                        <p className="text-center text-sm font-semibold text-gray-700">
                            {rollbackProgress.done}件 / 全{rollbackProgress.total}件
                        </p>
                    )}
                    {rollbackResult && (
                        <div className="flex justify-center gap-6 text-sm font-semibold">
                            <span className="text-green-700">成功: {rollbackResult.success}件</span>
                            <span className="text-red-700">失敗: {rollbackResult.failed}件</span>
                        </div>
                    )}
                    <button
                        onClick={handleRollback}
                        disabled={rollbackLoading || rollbackExecuting || !rollbackTargets || rollbackTargets.length === 0}
                        className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-red-700 disabled:bg-gray-400"
                    >
                        {rollbackExecuting ? '削除中...' : '時間帯データを削除する'}
                    </button>
                </div>
            </details>
        </div>
    );
};

const AI_FORECAST_ROLE = `あなたは、コンビニエンスストア3店舗を運営する会社の売上予測担当です。アプリが実データから計算した集計データと天気予報をもとに、今後7日間の店舗別・日別の日販と客数の目安を答えます。
予測の作り方:
・基準は「直近4週の同曜日平均」とする。
・天気予報、前年同曜日の動き、出来事の記録を見て補正する場合は、補正の理由と幅を書く。補正は原則±10%以内とする。
・予測値は「10/6(火) 日販65.0万円 客数770人」のように、店舗ごとに1日1行で書く。
・発注については、商品別のデータが無いため数量は出さず、多め・少なめの方向性だけを述べる。
・最後に、予測は目安であることを一言添える。`;

const AI_FORECAST_QUICK_QUESTIONS = [
    { label: '今後7日間の売上予測', text: '今後7日間の売上と客数を、店舗別・日別に予測してください。' },
    { label: '天気を踏まえた注意点', text: '今後7日間の天気予報を踏まえて、発注で気をつける日を教えてください。' },
];

// 売上予測用の集計データを作る（直近8週の実績・前年同曜日・7日間の天気予報）
const buildAiForecastData = async (stores, events) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const addDays = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
    const forecastDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const startStr = getLocalDateString(forecastDays[0]);
    const endStr = getLocalDateString(forecastDays[6]);
    const storeNames = stores.map(s => s.name);

    const weatherByDate = {};
    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=34.77&longitude=136.13&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${startStr}&end_date=${endStr}`;
        const weatherData = await (await fetch(weatherUrl)).json();
        (weatherData.daily?.time || []).forEach((t, i) => {
            weatherByDate[t] = {
                icon: getWeatherIcon(weatherData.daily.weathercode[i]),
                maxTemp: weatherData.daily.temperature_2m_max[i],
                precipitation: weatherData.daily.precipitation_sum[i],
            };
        });
    } catch (error) {
        console.error("天気予報の取得に失敗しました:", error);
    }

    const fetchRows = async (from, to, isLy) => {
        const q = query(collection(db, dailyReportsPath), where("date", ">=", Timestamp.fromDate(from)), where("date", "<=", Timestamp.fromDate(to)));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => toAiRow({ id: d.id, ...d.data() }, isLy)).filter(r => r && storeNames.includes(r.store));
    };
    const todayLy = getSameCalendarDateLastYear(today);
    const [allRecentRows, allLyRows] = await Promise.all([
        fetchRows(addDays(today, -56), addDays(today, -1), false),
        fetchRows(addDays(todayLy, -35), addDays(todayLy, 13), true),
    ]);
    // 「集計から除外」に指定された日は、予測の基準にする平均から外す
    const excludedKeys = buildAiExcludedKeys(events, storeNames);
    const recentRows = allRecentRows.filter(r => !isAiExcludedRow(r, excludedKeys));
    const lyRows = allLyRows.filter(r => !isAiExcludedRow(r, excludedKeys));
    const excludedRows = [...allRecentRows, ...allLyRows].filter(r => isAiExcludedRow(r, excludedKeys));

    const last28Str = getLocalDateString(addDays(today, -28));
    const ly28StartStr = getLocalDateString(addDays(todayLy, -28));
    const lyTodayStr = getLocalDateString(todayLy);
    const dayLabel = (d) => `${getLocalDateString(d)}(${getWeekdayLabel(d)})`;

    const lines = [];
    lines.push(`【予測対象】${startStr}〜${endStr}（今日を含む7日間）`);
    lines.push('【単位】金額は円、1日あたり。');
    lines.push('', '【天気予報（伊賀市）】');
    forecastDays.forEach(d => {
        const w = weatherByDate[getLocalDateString(d)];
        lines.push(`  ${dayLabel(d)}: ${w ? `${w.icon} 最高${w.maxTemp}℃ 降水${w.precipitation}mm` : '予報なし'}`);
    });

    lines.push('', '【店舗別データ】');
    lines.push(`除外指定のため下の平均から外した日: ${excludedRows.map(r => `${r.date} ${r.store}`).join('、') || 'なし'}`);
    storeNames.forEach(name => {
        const rows = recentRows.filter(r => r.store === name);
        const last28 = rows.filter(r => r.date >= last28Str);
        const ly28 = lyRows.filter(r => r.store === name && r.date >= ly28StartStr && r.date < lyTodayStr);
        const cyAgg = aggregateAiRows(last28);
        const lyAgg = aggregateAiRows(ly28);
        lines.push(`■${name}`);
        lines.push(`  直近4週: ${cyAgg ? `売上入力${cyAgg.n}日 日販${aiYen(cyAgg.salesAvg)} 客数${aiYen(cyAgg.customersAvg)}` : 'データなし'}｜前年同時期: ${lyAgg ? `日販${aiYen(lyAgg.salesAvg)} 客数${aiYen(lyAgg.customersAvg)}` : 'データなし'}｜前年比: 日販${aiDiffPct(cyAgg?.salesAvg, lyAgg?.salesAvg)} 客数${aiDiffPct(cyAgg?.customersAvg, lyAgg?.customersAvg)}`);
        const rainy = aggregateAiRows(rows.filter(r => r.weather && (r.weather.precipitation || 0) >= AI_RAIN_MM));
        const dry = aggregateAiRows(rows.filter(r => r.weather && (r.weather.precipitation || 0) < AI_RAIN_MM));
        lines.push(`  直近8週の天気別: 雨の日(降水${AI_RAIN_MM}mm以上) ${rainy ? `${rainy.n}日 日販${aiYen(rainy.salesAvg)}` : 'なし'}／それ以外 ${dry ? `${dry.n}日 日販${aiYen(dry.salesAvg)}` : 'なし'}`);
        forecastDays.forEach(d => {
            const dow4 = aggregateAiRows(last28.filter(r => r.dow === d.getDay()));
            const dow8 = aggregateAiRows(rows.filter(r => r.dow === d.getDay()));
            const lyDowStr = getLocalDateString(getSameWeekdayNearLastYearDate(d));
            const lyRow = lyRows.find(r => r.store === name && r.date === lyDowStr);
            const lyText = lyRow
                ? `日販${aiYen(lyRow.sales)} 客数${aiYen(lyRow.customers)}${lyRow.weather ? ` 最高${lyRow.weather.maxTemp}℃ 降水${lyRow.weather.precipitation}mm` : ''}`
                : 'データなし';
            lines.push(`  ${dayLabel(d)}: 直近4週の同曜日平均 ${dow4 ? `日販${aiYen(dow4.salesAvg)} 客数${aiYen(dow4.customersAvg)}（${dow4.n}日）` : 'データなし'}／直近8週の同曜日平均 ${dow8 ? `日販${aiYen(dow8.salesAvg)}（${dow8.n}日）` : 'データなし'}／前年同曜日(${lyDowStr}) ${lyText}`);
        });
    });

    const recentStartStr = getLocalDateString(addDays(today, -56));
    const lyFromStr = getLocalDateString(addDays(todayLy, -7));
    const lyToStr = getLocalDateString(addDays(todayLy, 13));
    const relatedEvents = (events || [])
        .filter(e => e?.note && (!e.date || (e.date >= recentStartStr && e.date <= endStr) || (e.date >= lyFromStr && e.date <= lyToStr)))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    lines.push('', '【出来事の記録（直近8週〜予測期間と、前年の同時期に該当するもの）】');
    if (relatedEvents.length === 0) lines.push('登録なし');
    relatedEvents.forEach(e => lines.push(`  ${describeAiEvent(e)}`));

    lines.push('', '【日別データ】');
    lines.push(`${AI_DAILY_CSV_NOTE}区分は「直近8週」と「前年同時期」。`);

    const csv = buildAiDailyCsv([{ label: '直近8週', rows: allRecentRows }, { label: '前年同時期', rows: allLyRows }], storeNames, excludedKeys);
    return { text: lines.join('\n'), csv };
};

const AiForecastPage = ({ stores, aiSettings }) => {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [forecastData, setForecastData] = useState('');
    const speech = useSpeechInput(setUserInput);

    const handleSendMessage = async (question) => {
        const text = (question || '').trim();
        if (!text || isAiLoading) return;

        const newMessages = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setUserInput('');
        setIsAiLoading(true);

        try {
            const data = await buildAiForecastData(stores, aiSettings.events);
            setForecastData(data.text);
            const result = await callGemini({
                systemText: buildAiSystemText({ role: AI_FORECAST_ROLE, policy: aiSettings.policy, dataText: data.text }),
                contents: buildAiContents(newMessages, data.csv),
                model: aiSettings.model,
            });
            setMessages([...newMessages, { role: 'ai', text: result.text, model: result.model }]);
        } catch (error) {
            console.error("AI売上予測に失敗しました:", error);
            setMessages([...newMessages, { role: 'ai', text: `予測の生成に失敗しました。\n${error.message}`, isError: true }]);
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">AI売上予測</h1>
            <p className="text-sm text-gray-600 mb-3">
                直近8週の実績・前年同曜日・7日間の天気予報をもとに、今後7日間の売上の目安を出します。
                {!GEMINI_API_KEY && <span className="ml-3 text-yellow-700">APIキー未設定のため利用できません</span>}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
                {AI_FORECAST_QUICK_QUESTIONS.map(q => (
                    <button key={q.label} type="button" onClick={() => handleSendMessage(q.text)} disabled={isAiLoading || !GEMINI_API_KEY} className="px-3 py-1.5 text-sm rounded-full border bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50">{q.label}</button>
                ))}
            </div>
            <AiChatMessages
                messages={messages}
                isAiLoading={isAiLoading}
                emptyState={(
                    <div className="text-center text-gray-500">
                        <p className="mt-2">AIに売上予測や発注に関する質問をしてみましょう。</p>
                        <p className="text-sm mt-1">例: 「今週末の売上はどのくらいになりそう？」</p>
                    </div>
                )}
            />
            {forecastData && (
                <details className="mb-3 text-xs text-gray-500">
                    <summary className="cursor-pointer select-none">AIに渡している集計データを表示</summary>
                    <pre className="mt-2 p-3 bg-gray-100 rounded max-h-64 overflow-auto whitespace-pre-wrap">{forecastData}</pre>
                </details>
            )}
            <AiChatInput userInput={userInput} setUserInput={setUserInput} onSend={handleSendMessage} disabled={isAiLoading || !GEMINI_API_KEY} isAiLoading={isAiLoading} speech={speech} />
        </div>
    );
};

const AI_POLICY_GUIDE_LENGTH = 3000;   // 方針メモの長さの目安（文字数）

const AiSettingsPage = ({ stores, aiSettings }) => {
    const [policy, setPolicy] = useState(aiSettings.policy || '');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [newEvent, setNewEvent] = useState({ date: '', store: '', note: '', exclude: false });
    const [models, setModels] = useState([]);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    // 他の端末で保存された内容は、編集中でなければ取り込む
    useEffect(() => {
        if (!isDirty) setPolicy(aiSettings.policy || '');
    }, [aiSettings.policy, isDirty]);

    useEffect(() => {
        if (!GEMINI_API_KEY) return;
        fetchGeminiModels().then(setModels).catch(error => console.warn('モデル一覧の取得に失敗:', error.message || error));
    }, []);

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const events = useMemo(
        () => [...(aiSettings.events || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
        [aiSettings.events]
    );

    const handleSavePolicy = async () => {
        setIsSaving(true);
        try {
            await saveAiSettings({ policy });
            setIsDirty(false);
            showMessage('success', '経営方針メモを保存しました。次の質問から反映されます。');
        } catch (error) {
            showMessage('error', `保存エラー: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddEvent = async () => {
        if (!newEvent.note.trim()) {
            showMessage('error', '出来事の内容を入力してください。');
            return;
        }
        if (newEvent.exclude && !newEvent.date) {
            showMessage('error', '集計から除外するには日付を指定してください。');
            return;
        }
        try {
            const event = { id: String(Date.now()), date: newEvent.date, store: newEvent.store, note: newEvent.note.trim(), exclude: newEvent.exclude };
            await saveAiSettings({ events: [...(aiSettings.events || []), event] });
            setNewEvent({ date: '', store: '', note: '', exclude: false });
            showMessage('success', '出来事を追加しました。');
        } catch (error) {
            showMessage('error', `保存エラー: ${error.message}`);
        }
    };

    const handleDeleteEvent = async (event) => {
        if (!window.confirm(`次の記録を削除します。よろしいですか？\n\n${describeAiEvent(event)}`)) return;
        try {
            await saveAiSettings({ events: (aiSettings.events || []).filter(e => e.id !== event.id) });
        } catch (error) {
            showMessage('error', `削除エラー: ${error.message}`);
        }
    };

    const handleModelChange = async (model) => {
        try {
            await saveAiSettings({ model });
            setTestResult(null);
        } catch (error) {
            showMessage('error', `保存エラー: ${error.message}`);
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await callGemini({
                systemText: '接続テストです。',
                contents: [{ role: 'user', parts: [{ text: '「接続できました」とだけ返事してください。' }] }],
                model: aiSettings.model,
            });
            setTestResult({ type: 'success', text: `接続できました（使用モデル: ${result.model}）` });
        } catch (error) {
            setTestResult({ type: 'error', text: `接続できませんでした: ${error.message}` });
        } finally {
            setIsTesting(false);
        }
    };

    const modelOptions = aiSettings.model && !models.includes(aiSettings.model) ? [aiSettings.model, ...models] : models;

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">AI設定</h1>
            <p className="text-gray-600 mb-6">ここに書いた内容は、AI分析とAI売上予測の質問のたびにAIへ渡されます。保存するとすべての端末に反映されます。</p>
            {message && <p className={`mb-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}

            <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h2 className="text-xl font-semibold mb-2">経営方針メモ</h2>
                <p className="text-sm text-gray-600 mb-3">経営の考え方、目標や基準、店舗ごとの事情、答え方の好みなどを自由に書いてください。AIはこの内容を最優先して答えます。</p>
                <textarea
                    value={policy}
                    onChange={(e) => { setPolicy(e.target.value); setIsDirty(true); }}
                    rows={12}
                    className="block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder={'例:\n・廃棄・値下げの合計は売上の2.5%以内を目標にしている。\n・廃棄を減らすために欠品させるのは本末転倒。機会損失を重く見る。\n・駅南店は駅前で昼の来店が中心。催事の日は別扱いで考える。\n・回答は結論を先に、数字は千円単位で、提案は3つまで。'}
                />
                <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button type="button" onClick={handleSavePolicy} disabled={isSaving || !isDirty} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">{isSaving ? '保存中...' : '方針メモを保存'}</button>
                    <span className={`text-sm ${policy.length > AI_POLICY_GUIDE_LENGTH ? 'text-yellow-700' : 'text-gray-500'}`}>
                        {policy.length.toLocaleString()}文字（目安 {AI_POLICY_GUIDE_LENGTH.toLocaleString()}文字まで。長すぎると効きが悪くなります）
                    </span>
                    {isDirty && <span className="text-sm text-yellow-700">未保存の変更があります</span>}
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h2 className="text-xl font-semibold mb-2">出来事の記録</h2>
                <p className="text-sm text-gray-600 mb-3">催事、改装、休業、近隣の工事など、数字に影響した出来事を記録します。分析期間に当てはまるものがAIに渡され、異常値ではなく既知の出来事として扱われます。</p>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 border rounded-lg bg-gray-50">
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
                        <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">店舗</label>
                        <select value={newEvent.store} onChange={(e) => setNewEvent({ ...newEvent, store: e.target.value })} className="block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            <option value="">全店</option>
                            {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                        <input type="text" value={newEvent.note} onChange={(e) => setNewEvent({ ...newEvent, note: e.target.value })} placeholder="例: 改装のため在庫処分" className="block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                    </div>
                    <div className="md:col-span-2">
                        <button type="button" onClick={handleAddEvent} className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700">追加</button>
                    </div>
                </div>
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={newEvent.exclude} onChange={(e) => setNewEvent({ ...newEvent, exclude: e.target.checked })} />
                    この日を集計から除外する（催事など、通常の営業と比べられない日）
                </label>
                <p className="mt-2 text-xs text-gray-500">除外にチェックした日は、AIに渡す集計に「その日を除いた数字」が追加され、売上予測の基準からも外れます。日付を空にすると、期間に関係なく毎回AIに渡されます。数日続く出来事は、初日の日付で「〜◯日まで」と内容に書いてください。</p>
                {events.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500">まだ記録がありません。</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-gray-100 text-gray-700">
                                    <th className="px-3 py-2 text-left whitespace-nowrap">日付</th>
                                    <th className="px-3 py-2 text-left whitespace-nowrap">店舗</th>
                                    <th className="px-3 py-2 text-left">内容</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map(event => (
                                    <tr key={event.id} className="border-b">
                                        <td className="px-3 py-2 whitespace-nowrap">{event.date ? formatDateWithWeekday(event.date) : '日付なし'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{event.store || '全店'}</td>
                                        <td className="px-3 py-2">{event.note}{event.exclude && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">集計から除外</span>}</td>
                                        <td className="px-3 py-2 text-right"><button type="button" onClick={() => handleDeleteEvent(event)} className="text-red-600 hover:underline whitespace-nowrap">削除</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-2">AIとの接続</h2>
                <p className="text-sm text-gray-600 mb-3">
                    APIキー: {GEMINI_API_KEY ? <span className="font-semibold text-green-700">設定済み</span> : <span className="font-semibold text-yellow-700">未設定（AI分析は簡易分析モード、AI売上予測は利用不可）</span>}
                </p>
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">使用モデル</label>
                        <select value={aiSettings.model || ''} onChange={(e) => handleModelChange(e.target.value)} disabled={!GEMINI_API_KEY} className="block p-2 border border-gray-300 rounded-md shadow-sm disabled:bg-gray-100">
                            <option value="">自動（推奨）</option>
                            {modelOptions.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </div>
                    <button type="button" onClick={handleTest} disabled={!GEMINI_API_KEY || isTesting} className="bg-gray-700 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400">{isTesting ? '確認中...' : '接続テスト'}</button>
                </div>
                {testResult && <p className={`mt-3 text-sm p-3 rounded-lg ${testResult.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{testResult.text}</p>}
            </div>
        </div>
    );
};

function AppContent() {
  const [currentPage, setCurrentPage] = useState('home');
  
  // Seed Data Logic - Removed to prevent overwriting correct data with test data if paths match
  // With the correct paths, the app should just read the existing data.
  
  // Use real-time listeners for master data
  const { data: allStores, isLoading: isLoadingStores } = useMasterData(storesPath);
  const { data: employees, isLoading: isLoadingEmployees } = useMasterData(employeesPath);
  const aiSettings = useAiSettings();
  
  const stores = useMemo(() => {
      if (!allStores) return [];
      const allowedStoreNames = ["伊賀平野東町店", "伊賀平野北谷店", "伊賀忍者市駅南店"];
      // If we find stores with these names, filter them. Otherwise return all.
      const filtered = allStores.filter(store => allowedStoreNames.includes(store.name));
      return filtered.length > 0 ? filtered : allStores;
  }, [allStores]);

  // 時刻を0:00に正規化しないと、初日の0:00保存データが date >= クエリから漏れる
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneMonthAgo = new Date(new Date(today).setMonth(today.getMonth() - 1));
  const [startDate, setStartDate] = useState(oneMonthAgo);
  const [endDate, setEndDate] = useState(today);
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const startDateLY = useMemo(() => new Date(new Date(startDate).setFullYear(startDate.getFullYear() - 1)), [startDate]);
  const endDateLY = useMemo(() => new Date(new Date(endDate).setFullYear(endDate.getFullYear() - 1)), [endDate]);
  
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const renderPage = () => {
    const pageProps = { stores, employees, dateRange: {startDate, endDate, startDateLY, endDateLY}, onRefresh: refreshTrigger };
    switch (currentPage) {
      case 'home': return <HomeDashboard dateRange={{startDate: new Date(new Date(today).setDate(today.getDate() - 1)), endDate: today}} onRefresh={refreshTrigger} />;
      case 'nippo': return <NippoDashboard {...pageProps} />;
      case 'haiki': return <HaikiDashboard {...pageProps} />;
      case 'table': return <DataTablePage {...pageProps} />;
      case 'custom': return <CustomAnalysisPage {...pageProps} />;
      case 'nippoInput': return <NippoInputPage stores={stores} employees={employees} />;
      case 'haikiInput': return <HaikiInputPage stores={stores} employees={employees} />;
      case 'bulkInput': return <BulkInputPage stores={stores} />;
      case 'csv': return <CsvPage dateRange={{startDate, endDate}} />;
      case 'hourlySync': return <HourlySyncPage stores={stores} />;
      case 'ai': return <AiAnalysisPage {...pageProps} aiSettings={aiSettings} />;
      case 'ai_forecast': return <AiForecastPage stores={stores} aiSettings={aiSettings} />;
      case 'ai_settings': return <AiSettingsPage stores={stores} aiSettings={aiSettings} />;
      default: return <div>ページが見つかりません</div>;
    }
  };

  if (isLoadingStores || isLoadingEmployees) {
      return (
          <div className="flex justify-center items-center h-screen bg-gray-100">
              <div className="text-center">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-gray-600">データを読み込んでいます...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans">
      <aside className="w-80 bg-white shadow-xl flex flex-col flex-shrink-0 border-r border-gray-200">
        <div className="h-20 flex items-center justify-center border-b bg-gradient-to-r from-blue-500 to-blue-600">
          <h1 className="text-2xl font-bold text-white">経営ダッシュボード</h1>
        </div>
        <nav className="flex-grow p-6 overflow-y-auto bg-gray-50">
            <div className="mb-6">
              <p className="px-2 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">分析</p>
              <div className="grid grid-cols-2 gap-3">
                <NavItem icon={<HomeIcon />} label="ホーム" isActive={currentPage === 'home'} onClick={() => setCurrentPage('home')} />
                <NavItem icon={<ChartIcon />} label="日販分析" isActive={currentPage === 'nippo'} onClick={() => setCurrentPage('nippo')} />
                <NavItem icon={<TrashIcon />} label="廃棄分析" isActive={currentPage === 'haiki'} onClick={() => setCurrentPage('haiki')} />
                <NavItem icon={<ListIcon />} label="データ一覧" isActive={currentPage === 'table'} onClick={() => setCurrentPage('table')} />
                <NavItem icon={<SlidersIcon />} label="カスタム分析" isActive={currentPage === 'custom'} onClick={() => setCurrentPage('custom')} />
                <NavItem icon={<SparklesIcon />} label="AI分析" isActive={currentPage === 'ai'} onClick={() => setCurrentPage('ai')} />
                <NavItem icon={<BrainIcon />} label="AI売上予測" isActive={currentPage === 'ai_forecast'} onClick={() => setCurrentPage('ai_forecast')} />
                <NavItem icon={<NoteIcon />} label="AI設定" isActive={currentPage === 'ai_settings'} onClick={() => setCurrentPage('ai_settings')} />
              </div>
            </div>
            
            <div className="mt-6">
              <p className="px-2 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">入力</p>
              <div className="grid grid-cols-2 gap-3">
                <NavItem icon={<SalesIcon />} label="日販入力" isActive={currentPage === 'nippoInput'} onClick={() => setCurrentPage('nippoInput')} />
                <NavItem icon={<TrashIcon />} label="廃棄入力" isActive={currentPage === 'haikiInput'} onClick={() => setCurrentPage('haikiInput')} />
                <NavItem icon={<UploadCloudIcon />} label="前年一括入力" isActive={currentPage === 'bulkInput'} onClick={() => setCurrentPage('bulkInput')} />
                <NavItem icon={<CsvIcon />} label="CSV入出力" isActive={currentPage === 'csv'} onClick={() => setCurrentPage('csv')} />
                <NavItem icon={<ClockIcon />} label="時間帯取込" isActive={currentPage === 'hourlySync'} onClick={() => setCurrentPage('hourlySync')} />
              </div>
            </div>
        </nav>
        <div className="p-6 border-t bg-white shadow-inner">
             <h3 className="text-sm font-semibold text-gray-700 mb-4">分析期間</h3>
            <div className="space-y-3 mb-4">
                <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">開始日</label>
                    <input type="date" value={getLocalDateString(startDate)} onChange={(e) => setStartDate(new Date(`${e.target.value}T00:00:00`))} className="w-full p-2 border-2 border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"/>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">終了日</label>
                    <input type="date" value={getLocalDateString(endDate)} onChange={(e) => setEndDate(new Date(`${e.target.value}T00:00:00`))} className="w-full p-2 border-2 border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"/>
                </div>
                 <button onClick={handleRefresh} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 flex items-center justify-center text-sm font-semibold shadow-md hover:shadow-lg transition-all transform hover:scale-105">
                    <RefreshCwIcon />
                    <span className="ml-2">データ更新</span>
                </button>
            </div>
             
            <div className="pt-4 border-t border-gray-200 space-y-2">
                <div className="flex items-center text-xs text-gray-600 bg-green-50 p-3 rounded-lg border border-green-200">
                    <DatabaseIcon />
                    <span className="ml-2 truncate font-medium" title={firebaseConfig.projectId}>Connected: {firebaseConfig.projectId}</span>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <p className="font-semibold text-gray-700">v{APP_VERSION}</p>
                    <p className="mt-1 text-gray-500">デプロイ: {formatBuildTime(BUILD_TIME)}</p>
                </div>
            </div>
        </div>
      </aside>
      <main className="flex-1 p-6 lg:p-10 overflow-auto">{renderPage()}</main>
    </div>
  );
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
        setAuthError(null);
      } else {
        signInAnonymously(auth)
          .then(() => {
            setIsAuthReady(true);
            setAuthError(null);
          })
          .catch((error) => {
            console.error("匿名サインインエラー:", error);
            setAuthError(error.message);
            // エラーが発生してもアプリを続行できるようにする
            setIsAuthReady(true);
          });
      }
    });
    return () => unsubscribe();
  }, []);

  if (!isAuthReady) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600">Firebaseに接続中...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      {authError && (
        <div className="fixed top-4 right-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded shadow-lg z-50 max-w-md">
          <p className="font-bold">認証警告</p>
          <p className="text-sm">{authError}</p>
        </div>
      )}
      <AppContent />
    </>
  );
}
