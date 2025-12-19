import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, writeBatch, onSnapshot, query, where, Timestamp, limit } from 'firebase/firestore';
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

// PapaParse Loader
const usePapaParse = () => {
    const [ready, setReady] = useState(!!window.Papa);
    useEffect(() => {
        if (window.Papa) {
            setReady(true);
            return;
        }
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/papaparse/5.3.2/papaparse.min.js";
        script.async = true;
        script.onload = () => setReady(true);
        document.body.appendChild(script);
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

const getTimestampFromDateString = (dateString) => {
    const localDate = new Date(`${dateString}T00:00:00`);
    return Timestamp.fromDate(localDate);
};

const getWeatherIcon = (weatherCode) => {
    const icons = {
        0: '☀️', 1: '🌤️', 2: '⛅️', 3: '☁️', 45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
        80: '⛈️', 81: '⛈️', 82: '⛈️',
    };
    return icons[weatherCode] || '❓';
};

const useReports = (startDate, endDate, trigger) => {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        return onAuthStateChanged(auth, setUser);
    }, []);

    const fetchReports = async () => {
        if (!user || !startDate || !endDate || startDate > endDate) {
            setData([]);
            return;
        }
        setIsLoading(true);
        try {
            const startTimestamp = Timestamp.fromDate(startDate);
            const endTimestamp = Timestamp.fromDate(endDate);
            const q = query(collection(db, dailyReportsPath), where("date", ">=", startTimestamp), where("date", "<=", endTimestamp));
            
            // Use onSnapshot for daily reports to reflect changes immediately without manual refresh
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setData(fetchedData);
                setIsLoading(false);
            }, (error) => {
                console.error("レポートの取得中にエラーが発生しました: ", error);
                setIsLoading(false);
            });
            
            return unsubscribe;
        } catch (error) {
            console.error("レポートの取得設定中にエラーが発生しました: ", error);
            setData([]);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        let unsubscribe;
        fetchReports().then(unsub => unsubscribe = unsub);
        return () => { if(unsubscribe) unsubscribe(); };
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

const NavItem = ({ icon, label, isActive, onClick }) => (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick(); }} className={`flex items-center px-4 py-3 my-1 rounded-lg transition-colors duration-200 ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>
        {icon}
        <span className="ml-4 font-medium">{label}</span>
    </a>
);

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
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const processDateChange = async () => {
            if (!date) return;
            
            setIsWeatherLoading(true);
            setWeatherData(null);
            
            let existingWeather = null;
            const weatherQuery = query(
                collection(db, dailyReportsPath), 
                where("date", "==", getTimestampFromDateString(date)),
                limit(10)
            );
            const weatherSnapshot = await getDocs(weatherQuery);
            const reportWithWeather = weatherSnapshot.docs.find(doc => doc.data().weather);

            if (reportWithWeather) {
                existingWeather = reportWithWeather.data().weather;
            }
            
            if (existingWeather) {
                setWeatherData(existingWeather);
            } else {
                try {
                    const lat = 34.77;
                    const lon = 136.13;
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.daily) {
                        const newWeatherData = {
                            weatherCode: data.daily.weathercode[0],
                            maxTemp: data.daily.temperature_2m_max[0],
                            precipitation: data.daily.precipitation_sum[0],
                        };
                        setWeatherData(newWeatherData);
                    }
                } catch (error) {
                    console.error("天気データの取得に失敗しました:", error);
                }
            }
            setIsWeatherLoading(false);
            
            if (storeName) {
                const docId = `${date}_${storeName}`;
                const docRef = doc(db, dailyReportsPath, docId);
                const docSnap = await getDoc(docRef);
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
    }, [date, storeName]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true); setMessage('');
        if (!date || !storeName || !inputBy) {
            setMessage({ type: 'error', text: '日付、店舗、入力者を選択してください。' });
            setIsLoading(false);
            return;
        }
        const docId = `${date}_${storeName}`;
        try {
            const salesInYen = Number(formData.sales) * 1000 || 0;
            const customersCount = Number(formData.customers) || 0;
            const payload = {
                store: storeName,
                date: getTimestampFromDateString(date),
                inputBy_sales: inputBy,
                updatedAt_sales: Timestamp.now(),
                sales: salesInYen,
                customers: customersCount,
                customer_spend: (salesInYen > 0 && customersCount > 0) ? (salesInYen / customersCount) : 0,
            };
            if (weatherData) {
                payload.weather = weatherData;
            }

            await setDoc(doc(db, dailyReportsPath, docId), payload, { merge: true });
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
        const processDateChange = async () => {
            if (!date) return;
            
            setIsWeatherLoading(true);
            setWeatherData(null);
            
            let existingWeather = null;
            const weatherQuery = query(
                collection(db, dailyReportsPath), 
                where("date", "==", getTimestampFromDateString(date)),
                limit(10)
            );
            const weatherSnapshot = await getDocs(weatherQuery);
            const reportWithWeather = weatherSnapshot.docs.find(doc => doc.data().weather);

            if (reportWithWeather) {
                existingWeather = reportWithWeather.data().weather;
            }
            
            if (existingWeather) {
                setWeatherData(existingWeather);
            } else {
                try {
                    const lat = 34.77;
                    const lon = 136.13;
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.daily) {
                        const newWeatherData = {
                            weatherCode: data.daily.weathercode[0],
                            maxTemp: data.daily.temperature_2m_max[0],
                            precipitation: data.daily.precipitation_sum[0],
                        };
                        setWeatherData(newWeatherData);
                    }
                } catch (error) {
                    console.error("天気データの取得に失敗しました:", error);
                }
            }
            setIsWeatherLoading(false);
            
            if (storeName) {
                const docId = `${date}_${storeName}`;
                const docRef = doc(db, dailyReportsPath, docId);
                const docSnap = await getDoc(docRef);
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
    }, [date, storeName]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true); setMessage('');
        if (!date || !storeName || !inputBy) {
            setMessage({ type: 'error', text: '日付、店舗、入力者を選択してください。' });
            setIsLoading(false);
            return;
        }
        const docId = `${date}_${storeName}`;
        try {
            const payload = {
                store: storeName,
                date: getTimestampFromDateString(date),
                inputBy_waste: inputBy,
                updatedAt_waste: Timestamp.now(),
                waste_product: Number(formData.waste_product) || 0,
                waste_owner_8: Number(formData.waste_owner_8) || 0,
                waste_owner_10: Number(formData.waste_owner_10) || 0,
                waste_promo_8: Number(formData.waste_promo_8) || 0,
                waste_promo_10: Number(formData.waste_promo_10) || 0,
            };
             if (weatherData) {
                payload.weather = weatherData;
            }

            await setDoc(doc(db, dailyReportsPath, docId), payload, { merge: true });
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">ホーム</h1>
            <h2 className="text-xl text-gray-600 mb-6">サマリー ({summaryDateStr})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow"><h2 className="text-lg font-semibold text-gray-500">合計売上</h2><p className="text-4xl font-bold text-blue-600 mt-2">¥{summary.totalSales.toLocaleString()}</p></div>
                <div className="bg-white p-6 rounded-lg shadow"><h2 className="text-lg font-semibold text-gray-500">合計 廃棄・値下げ</h2><p className="text-4xl font-bold text-red-600 mt-2">¥{summary.totalWaste.toLocaleString()}</p></div>
            </div>
            <div className="mt-10 bg-white p-6 rounded-lg shadow"><h2 className="text-xl font-bold mb-4">ようこそ！</h2><p>左のメニューから各機能をご利用ください。<br/>分析画面では、左下のカレンダーで対象期間を変更できます。</p></div>
        </div>
    );
};

const ChartCard = ({ title, children }) => ( 
    <div className="bg-white p-6 rounded-lg shadow"> 
        <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2> 
        <div className="h-80">{children}</div> 
    </div> 
);

const NippoDashboard = ({ stores, dateRange, onRefresh }) => {
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
                sales_ly: r.sales,
                customers_ly: r.customers,
                customer_spend_ly: r.customer_spend,
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

    const lineChartData = useMemo(() => {
        const labels = [];
        let currentDate = new Date(dateRange.startDate);
        if (currentDate > dateRange.endDate) {
            return { sales: { labels: [], datasets: [] }, customers: { labels: [], datasets: [] }, customer_spend: { labels: [], datasets: [] } };
        }
        while (currentDate <= dateRange.endDate) {
            labels.push(getLocalDateString(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        const metrics = [
            { key: 'sales', ly_key: 'sales_ly', name: '売上' }, 
            { key: 'customers', ly_key: 'customers_ly', name: '客数' },
            { key: 'customer_spend', ly_key: 'customer_spend_ly', name: '客単価' },
        ];
        const colors = {};
        const baseColors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)'];
        stores.forEach((store, index) => {
            colors[store.name] = baseColors[index % baseColors.length];
        });

        const chartDataSets = {};
        metrics.forEach(metric => {
            chartDataSets[metric.key] = {
                labels,
                datasets: stores.flatMap(store => {
                    const storeData = new Array(labels.length).fill(null);
                    const storeDataLy = new Array(labels.length).fill(null);
                    
                    combinedReports.filter(r => r.store === store.name).forEach(r => {
                        if (!r.date) return;
                        const reportDateStr = getLocalDateString(r.date.toDate());
                        const index = labels.indexOf(reportDateStr);
                        if (index !== -1) { 
                            storeData[index] = r[metric.key] || 0; 
                            storeDataLy[index] = r[metric.ly_key] || 0;
                        }
                    });

                    return [
                        { label: `${store.name} (本年)`, data: storeData, borderColor: colors[store.name], backgroundColor: (colors[store.name]).replace('1)', '0.1)'), fill: true, tension: 0.1 },
                        { label: `${store.name} (前年)`, data: storeDataLy, borderColor: colors[store.name], borderDash: [5, 5], fill: false, tension: 0.1 }
                    ];
                })
            };
        });
        return chartDataSets;
    }, [combinedReports, stores, dateRange]);
    
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">日販分析（前年比較）</h1>
            <div className="grid grid-cols-1 gap-8">
                <ChartCard title="売上（日販）推移"><Line data={lineChartData.sales} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}/></ChartCard>
                <ChartCard title="客数 推移"><Line data={lineChartData.customers} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}/></ChartCard>
                <ChartCard title="客単価 推移"><Line data={lineChartData.customer_spend} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}/></ChartCard>
            </div>
        </div>
    );
};

const HaikiDashboard = ({ stores, dateRange, onRefresh }) => {
    const { data: reports, isLoading } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const [filterStore, setFilterStore] = useState('');
    
    useEffect(() => {
        if (stores.length > 0 && !filterStore) {
            setFilterStore(stores[0].name);
        }
    }, [stores, filterStore]);

    const { doughnutData, summaryData, lineChartData } = useMemo(() => {
        const filteredReports = filterStore ? reports.filter(r => r.store === filterStore) : reports;
        
        const results = { total: 0, breakdown: [0, 0, 0, 0, 0] };
        const wasteFields = ['waste_product', 'waste_owner_8', 'waste_owner_10', 'waste_promo_8', 'waste_promo_10'];
        
        filteredReports.forEach(report => {
            wasteFields.forEach((field, index) => {
                const value = report[field] || 0;
                results.breakdown[index] += value;
                results.total += value;
            });
        });
        
        const dayCount = (dateRange.endDate > dateRange.startDate) ? Math.max(1, Math.round((dateRange.endDate - dateRange.startDate) / (1000 * 60 * 60 * 24)) + 1) : 1;
        
        const labels = [];
        let currentDate = new Date(dateRange.startDate);
        if (currentDate <= dateRange.endDate) {
            while (currentDate <= dateRange.endDate) {
                labels.push(getLocalDateString(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        const wasteItems = [
            { key: 'waste_product', label: '商品廃棄', color: 'rgba(255, 99, 132, 1)' },
            { key: 'waste_owner_8', label: 'オーナー値下げ8%', color: 'rgba(54, 162, 235, 1)' },
            { key: 'waste_owner_10', label: 'オーナー値下げ10%', color: 'rgba(255, 206, 86, 1)' },
            { key: 'waste_promo_8', label: '販促値下げ8%', color: 'rgba(75, 192, 192, 1)' },
            { key: 'waste_promo_10', label: '販促値下げ10%', color: 'rgba(153, 102, 255, 1)' }
        ];

        const datasets = wasteItems.map(item => {
            const data = labels.map(labelDate => {
                const reportsForDay = filteredReports.filter(r => r.date && getLocalDateString(r.date.toDate()) === labelDate);
                return reportsForDay.reduce((sum, r) => sum + (r[item.key] || 0), 0);
            });
            return {
                label: item.label,
                data,
                borderColor: item.color,
                backgroundColor: item.color.replace('1)', '0.2)'),
                fill: false,
                tension: 0.1,
            };
        });
        
        return {
            doughnutData: {
                labels: ['商品廃棄', 'オーナー値下げ8%', 'オーナー値下げ10%', '販促値下げ8%', '販促値下げ10%'],
                datasets: [{ label: '廃棄・値下げ内訳', data: results.breakdown, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'] }],
            },
            summaryData: { 
                total: results.total, 
                average: results.total / dayCount,
                productWasteAverage: results.breakdown[0] / dayCount
            },
            lineChartData: { labels, datasets }
        };
    }, [reports, filterStore, dateRange]);

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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">廃棄・値下げ分析</h1>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
                {stores.map(s => (<button key={s.id} onClick={() => setFilterStore(s.name)} className={`px-3 py-2 text-sm rounded-lg ${filterStore === s.name ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{s.name}</button>))}
            </div>
            <div className="grid grid-cols-1 gap-8">
                <ChartCard title={`${filterStore || '全店舗'} 廃棄・値下げ項目別推移`}>
                    <Line data={lineChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}/>
                </ChartCard>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 bg-white p-6 rounded-lg shadow"><h2 className="text-xl font-bold text-gray-800 mb-4">{filterStore || '全店舗'} の内訳</h2><div className="h-80"><Doughnut data={doughnutData} options={doughnutOptions}/></div></div>
                    <div className="bg-white p-6 rounded-lg shadow flex flex-col justify-center text-center space-y-2">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-500">選択期間の累計</h3>
                            <p className="text-4xl font-bold text-red-600 my-1">¥{summaryData.total.toLocaleString()}</p>
                        </div>
                        <hr/>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-500">1日あたりの廃棄・値下げ平均</h3>
                            <p className="text-3xl font-bold text-red-500 mt-1">¥{summaryData.average.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                        </div>
                        <hr/>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-500">1日あたりの商品廃棄平均</h3>
                            <p className="text-3xl font-bold text-orange-500 mt-1">¥{summaryData.productWasteAverage.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DataTablePage = ({ stores, dateRange, onRefresh }) => {
    const [view, setView] = useState('nippo');
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
                sales_ly: r.sales,
                customers_ly: r.customers,
                customer_spend_ly: r.customer_spend,
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
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">データ一覧</h1>
                <div className="flex space-x-2 p-1 bg-gray-200 rounded-lg">
                    <button onClick={() => setView('nippo')} className={`px-4 py-2 text-sm font-semibold rounded-md ${view === 'nippo' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>日販データ</button>
                    <button onClick={() => setView('haiki')} className={`px-4 py-2 text-sm font-semibold rounded-md ${view === 'haiki' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>廃棄データ</button>
                </div>
            </div>
            {view === 'nippo' ? <NippoTable reports={combinedReports} stores={stores} /> : <HaikiTable reports={reports} stores={stores} dateRange={dateRange} />}
        </div>
    );
}

const NippoTable = ({ reports, stores }) => {
    const { tableData, grandTotal, grandAverage } = useMemo(() => {
        const dataByDate = new Map();
        
        reports.forEach(report => {
            if (!report.date) return;
            const dateStr = getLocalDateString(report.date.toDate());
            if (!dataByDate.has(dateStr)) dataByDate.set(dateStr, { storeData: {}, total: {} });
            
            const existingData = dataByDate.get(dateStr).storeData[report.store] || {};
            dataByDate.get(dateStr).storeData[report.store] = { ...existingData, ...report };
        });

        const sortedData = Array.from(dataByDate.entries()).map(([date, data]) => {
            const total = { sales: 0, customers: 0, sales_ly: 0, customers_ly: 0 };
            stores.forEach(store => {
                const report = data.storeData[store.name];
                if (report) {
                    total.sales += report.sales || 0;
                    total.customers += report.customers || 0;
                    total.sales_ly += report.sales_ly || 0;
                    total.customers_ly += report.customers_ly || 0;
                }
            });
            total.customer_spend = total.customers > 0 ? total.sales / total.customers : 0;
            total.customer_spend_ly = total.customers_ly > 0 ? total.sales_ly / total.customers_ly : 0;
            data.total = total;
            return { date, ...data };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const grandTotal = {
            total: { sales: 0, customers: 0, sales_ly: 0, customers_ly: 0 },
            storeTotals: {}
        };
        stores.forEach(store => {
            grandTotal.storeTotals[store.name] = { sales: 0, customers: 0, sales_ly: 0, customers_ly: 0 };
        });

        sortedData.forEach(row => {
            grandTotal.total.sales += row.total.sales;
            grandTotal.total.customers += row.total.customers;
            grandTotal.total.sales_ly += row.total.sales_ly;
            grandTotal.total.customers_ly += row.total.customers_ly;

            stores.forEach(store => {
                const report = row.storeData[store.name];
                if (report) {
                    grandTotal.storeTotals[store.name].sales += report.sales || 0;
                    grandTotal.storeTotals[store.name].customers += report.customers || 0;
                    grandTotal.storeTotals[store.name].sales_ly += report.sales_ly || 0;
                    grandTotal.storeTotals[store.name].customers_ly += report.customers_ly || 0;
                }
            });
        });
        
        const dayCount = sortedData.length > 0 ? sortedData.length : 1;
        
        const grandAverage = {
            total: {
                sales: grandTotal.total.sales / dayCount,
                customers: grandTotal.total.customers / dayCount,
                sales_ly: grandTotal.total.sales_ly / dayCount,
                customers_ly: grandTotal.total.customers_ly / dayCount,
            },
            storeTotals: {}
        };

        grandTotal.total.customer_spend = grandTotal.total.customers > 0 ? grandTotal.total.sales / grandTotal.total.customers : 0;
        grandTotal.total.customer_spend_ly = grandTotal.total.customers_ly > 0 ? grandTotal.total.sales_ly / grandTotal.total.customers_ly : 0;
        grandAverage.total.customer_spend = grandAverage.total.customers > 0 ? grandAverage.total.sales / grandAverage.total.customers : 0;
        grandAverage.total.customer_spend_ly = grandAverage.total.customers_ly > 0 ? grandAverage.total.sales_ly / grandAverage.total.customers_ly : 0;
        
        stores.forEach(store => {
             grandTotal.storeTotals[store.name].customer_spend = grandTotal.storeTotals[store.name].customers > 0 ? grandTotal.storeTotals[store.name].sales / grandTotal.storeTotals[store.name].customers : 0;
             grandTotal.storeTotals[store.name].customer_spend_ly = grandTotal.storeTotals[store.name].customers_ly > 0 ? grandTotal.storeTotals[store.name].sales_ly / grandTotal.storeTotals[store.name].customers_ly : 0;
            
             const storeTotal = grandTotal.storeTotals[store.name];
             grandAverage.storeTotals[store.name] = {
                 sales: storeTotal.sales / dayCount,
                 customers: storeTotal.customers / dayCount,
                 sales_ly: storeTotal.sales_ly / dayCount,
                 customers_ly: storeTotal.customers_ly / dayCount,
             };
             const storeAvg = grandAverage.storeTotals[store.name];
             storeAvg.customer_spend = storeAvg.customers > 0 ? storeAvg.sales / storeAvg.customers : 0;
             storeAvg.customer_spend_ly = storeAvg.customers_ly > 0 ? storeAvg.sales_ly / storeAvg.customers_ly : 0;
        });

        return { tableData: sortedData, grandTotal, grandAverage };
    }, [reports, stores]);
    
    const renderCell = (value, prefix = '') => (<td className="px-2 py-4 whitespace-nowrap text-sm text-gray-600 text-right">{value != null && isFinite(value) ? `${prefix}${Math.round(value).toLocaleString()}` : '-'}</td>);
    
    return (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto max-h-[75vh]">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th rowSpan="2" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom z-10 bg-gray-100">日付</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">天気</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">気温</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">降水</th>
                        <th colSpan="6" className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-l border-b-2 border-gray-300">3店合計</th>
                        {stores.map(store => <th key={store.id} colSpan="6" className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-l border-b-2 border-gray-300">{store.name}</th>)}
                    </tr>
                    <tr>
                        {['', ...stores].map((_, index) => (
                             <React.Fragment key={index}>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-l">売上</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">前年売上</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">客数</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">前年客数</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">客単価</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">前年客単価</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.map(({ date, storeData, total }) => {
                        const dailyWeather = Object.values(storeData).find(report => report && report.weather)?.weather;
                        return (
                            <tr key={date} className="hover:bg-gray-50">
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{date}</td>
                                <td className="px-2 py-4 text-center">{dailyWeather ? getWeatherIcon(dailyWeather.weatherCode) : '-'}</td>
                                <td className="px-2 py-4 text-right">{dailyWeather ? `${dailyWeather.maxTemp}°C` : '-'}</td>
                                <td className="px-2 py-4 text-right">{dailyWeather ? `${dailyWeather.precipitation}mm` : '-'}</td>
                                {renderCell(total.sales, '¥')}
                                {renderCell(total.sales_ly, '¥')}
                                {renderCell(total.customers)}
                                {renderCell(total.customers_ly)}
                                {renderCell(total.customer_spend, '¥')}
                                {renderCell(total.customer_spend_ly, '¥')}
                                {stores.map(store => {
                                    const report = storeData[store.name];
                                    return (
                                        <React.Fragment key={store.id}>
                                            {renderCell(report?.sales, '¥')}
                                            {renderCell(report?.sales_ly, '¥')}
                                            {renderCell(report?.customers)}
                                            {renderCell(report?.customers_ly)}
                                            {renderCell(report?.customer_spend, '¥')}
                                            {renderCell(report?.customer_spend_ly, '¥')}
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="bg-gray-200 font-bold">
                    <tr>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-left" colSpan="4">期間合計</td>
                        {renderCell(grandTotal.total.sales, '¥')}
                        {renderCell(grandTotal.total.sales_ly, '¥')}
                        {renderCell(grandTotal.total.customers)}
                        {renderCell(grandTotal.total.customers_ly)}
                        {renderCell(grandTotal.total.customer_spend, '¥')}
                        {renderCell(grandTotal.total.customer_spend_ly, '¥')}
                        {stores.map(store => {
                            const total = grandTotal.storeTotals[store.name];
                            return (
                                <React.Fragment key={store.id}>
                                    {renderCell(total.sales, '¥')}
                                    {renderCell(total.sales_ly, '¥')}
                                    {renderCell(total.customers)}
                                    {renderCell(total.customers_ly)}
                                    {renderCell(total.customer_spend, '¥')}
                                    {renderCell(total.customer_spend_ly, '¥')}
                                </React.Fragment>
                            );
                        })}
                    </tr>
                    <tr>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-left" colSpan="4">期間平均</td>
                        {renderCell(grandAverage.total.sales, '¥')}
                        {renderCell(grandAverage.total.sales_ly, '¥')}
                        {renderCell(grandAverage.total.customers)}
                        {renderCell(grandAverage.total.customers_ly)}
                        {renderCell(grandAverage.total.customer_spend, '¥')}
                        {renderCell(grandAverage.total.customer_spend_ly, '¥')}
                        {stores.map(store => {
                            const avg = grandAverage.storeTotals[store.name];
                            return (
                                <React.Fragment key={store.id}>
                                    {renderCell(avg.sales, '¥')}
                                    {renderCell(avg.sales_ly, '¥')}
                                    {renderCell(avg.customers)}
                                    {renderCell(avg.customers_ly)}
                                    {renderCell(avg.customer_spend, '¥')}
                                    {renderCell(avg.customer_spend_ly, '¥')}
                                </React.Fragment>
                            );
                        })}
                    </tr>
                </tfoot>
            </table>
            {tableData.length === 0 && <p className="text-center p-8 text-gray-500">選択された期間にデータはありません。</p>}
        </div>
    );
};

const HaikiTable = ({ reports, stores, dateRange }) => {
    const wasteFields = [
        { key: 'waste_product', label: '商品廃棄' },
        { key: 'waste_owner_8', label: 'オナ8%' },
        { key: 'waste_owner_10', label: 'オナ10%' },
        { key: 'waste_promo_8', label: '販促8%' },
        { key: 'waste_promo_10', label: '販促10%' },
    ];

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
                dataByDate.get(dateStr).storeData[report.store] = report;
            }
        });

        const sortedData = Array.from(dataByDate.entries()).map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const summary = {
            total: { grandTotal: 0 }, average: { grandTotal: 0 },
            storeTotals: {}, storeAverages: {}
        };
        
        wasteFields.forEach(field => {
            summary.total[field.key] = 0;
            summary.average[field.key] = 0;
        });

        stores.forEach(store => {
            summary.storeTotals[store.name] = { total: 0 };
            summary.storeAverages[store.name] = { total: 0 };
            wasteFields.forEach(field => {
                summary.storeTotals[store.name][field.key] = 0;
                summary.storeAverages[store.name][field.key] = 0;
            });
        });

        sortedData.forEach(row => {
            stores.forEach(store => {
                const report = row.storeData[store.name];
                if (report) {
                    let dailyStoreTotal = 0;
                    wasteFields.forEach(field => {
                        const value = report[field.key] || 0;
                        summary.storeTotals[store.name][field.key] += value;
                        dailyStoreTotal += value;
                    });
                    summary.storeTotals[store.name].total += dailyStoreTotal;
                }
            });
        });

        stores.forEach(store => {
            wasteFields.forEach(field => {
                summary.storeAverages[store.name][field.key] = summary.storeTotals[store.name][field.key] / dayCount;
                summary.total[field.key] += summary.storeTotals[store.name][field.key];
            });
            summary.storeAverages[store.name].total = summary.storeTotals[store.name].total / dayCount;
            summary.total.grandTotal += summary.storeTotals[store.name].total;
        });

        wasteFields.forEach(field => {
            summary.average[field.key] = summary.total[field.key] / dayCount;
        });
        summary.average.grandTotal = summary.total.grandTotal / dayCount;

        return { tableData: sortedData, summary };

    }, [reports, stores, dateRange]);

    const renderCell = (value, prefix = '') => (<td key={Math.random()} className="px-2 py-2 whitespace-nowrap text-sm text-gray-600 text-right">{value != null && isFinite(value) ? `${prefix}${Math.round(value).toLocaleString()}` : '-'}</td>);

    return (
         <div className="bg-white shadow-md rounded-lg overflow-x-auto max-h-[75vh]">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                        <th rowSpan="2" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom z-10 bg-gray-100">日付</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">天気</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">気温</th>
                        <th rowSpan="2" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">降水</th>
                        <th colSpan={wasteFields.length + 1} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-l border-b-2 border-gray-300">3店合計</th>
                        {stores.map(store => <th key={store.id} colSpan={wasteFields.length + 1} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-l border-b-2 border-gray-300">{store.name}</th>)}
                    </tr>
                    <tr>
                         {['', ...stores].map((store, index) => (
                             <React.Fragment key={store.id || index}>
                                {wasteFields.map(field => <th key={field.key} className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-l">{field.label}</th>)}
                                <th className="px-2 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider border-l">当日計</th>
                            </React.Fragment>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.map(({ date, storeData }) => {
                        const dailyWeather = Object.values(storeData).find(report => report && report.weather)?.weather;
                        let grandDailyTotal = 0;
                        return (
                            <tr key={date} className="hover:bg-gray-50">
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">{date}</td>
                                <td className="px-2 py-4 text-center">{dailyWeather ? getWeatherIcon(dailyWeather.weatherCode) : '-'}</td>
                                <td className="px-2 py-4 text-right">{dailyWeather ? `${dailyWeather.maxTemp}°C` : '-'}</td>
                                <td className="px-2 py-4 text-right">{dailyWeather ? `${dailyWeather.precipitation}mm` : '-'}</td>
                                {(() => {
                                    let totalRow = {};
                                    wasteFields.forEach(field => totalRow[field.key] = 0);
                                    
                                    stores.forEach(store => {
                                        const report = storeData[store.name];
                                        if (report) {
                                            wasteFields.forEach(field => {
                                                totalRow[field.key] += report[field.key] || 0;
                                            });
                                        }
                                    });
                                    wasteFields.forEach(field => grandDailyTotal += totalRow[field.key]);
                                    
                                    return (
                                        <>
                                            {wasteFields.map(field => renderCell(totalRow[field.key]))}
                                            <td key={`${date}-total-grand`} className="px-2 py-2 whitespace-nowrap text-sm text-gray-600 text-right font-bold">{Math.round(grandDailyTotal).toLocaleString()}</td>
                                        </>
                                    );
                                })()}
                                {stores.map(store => {
                                    const report = storeData[store.name];
                                    let dailyStoreTotal = 0;
                                    wasteFields.forEach(field => dailyStoreTotal += report?.[field.key] || 0)
                                    return (
                                        <React.Fragment key={`${date}-${store.id}`}>
                                            {wasteFields.map(field => renderCell(report?.[field.key]))}
                                            <td key={`${date}-${store.id}-total`} className="px-2 py-2 whitespace-nowrap text-sm text-gray-600 text-right font-bold">{Math.round(dailyStoreTotal).toLocaleString()}</td>
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        )
                    })}
                </tbody>
                <tfoot className="bg-gray-200 font-bold">
                    <tr>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-left" colSpan="4">期間合計</td>
                        {wasteFields.map(field => renderCell(summary.total[field.key]))}
                        {renderCell(summary.total.grandTotal)}
                        {stores.map(store => (
                            <React.Fragment key={`${store.id}-total-footer`}>
                                {wasteFields.map(field => renderCell(summary.storeTotals[store.name][field.key]))}
                                {renderCell(summary.storeTotals[store.name].total)}
                            </React.Fragment>
                        ))}
                    </tr>
                      <tr>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-left" colSpan="4">期間平均</td>
                        {wasteFields.map(field => renderCell(summary.average[field.key]))}
                        {renderCell(summary.average.grandTotal)}
                        {stores.map(store => (
                            <React.Fragment key={`${store.id}-avg-footer`}>
                                {wasteFields.map(field => renderCell(summary.storeAverages[store.name][field.key]))}
                                {renderCell(summary.storeAverages[store.name].total)}
                            </React.Fragment>
                        ))}
                    </tr>
                </tfoot>
            </table>
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
                sales_ly: r.sales,
                customers_ly: r.customers,
                customer_spend_ly: r.customer_spend,
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

const AiAnalysisPage = ({ dateRange, onRefresh }) => {
    const { data: reports, isLoading } = useReports(dateRange.startDate, dateRange.endDate, onRefresh);
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            console.error("音声認識はサポートされていません");
            return;
        }
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => setUserInput(event.results[0][0].transcript);
        recognition.onerror = (event) => {
            console.error('音声認識エラー', event.error);
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);
        
        recognitionRef.current = recognition;
    }, []);

    const handleMicClick = () => {
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;

        const newMessages = [...messages, { role: 'user', text: userInput }];
        setMessages(newMessages);
        setUserInput('');
        setIsAiLoading(true);

        const dataSummary = reports.map(r => {
            const reportDate = r.date ? getLocalDateString(r.date.toDate()) : '日付不明';
            return `日付: ${reportDate}, 店舗: ${r.store}, 売上: ${r.sales}円, 客数: ${r.customers}人, 廃棄合計: ${(r.waste_product || 0) + (r.waste_owner_8 || 0) + (r.waste_owner_10 || 0) + (r.waste_promo_8 || 0) + (r.waste_promo_10 || 0)}円, 天気: ${r.weather ? `${getWeatherIcon(r.weather.weatherCode)} ${r.weather.maxTemp}°C` : '情報なし'}`;
        }).join('\n');

        const prompt = `あなたは優秀なコンビニ経営コンサルタントです。以下のデータを基に、ユーザーの質問に対して具体的で実行可能なアドバイスをしてください。\n\nデータ:\n${dataSummary}\n\nユーザーの質問:\n${userInput}`;
        
        try {
            const apiKey = ""; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            let aiResponse = "申し訳ありません、分析結果を取得できませんでした。";
            if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
                aiResponse = result.candidates[0].content.parts[0].text;
            }
            setMessages([...newMessages, { role: 'ai', text: aiResponse }]);
        } catch (error) {
            console.error("AI分析に失敗しました:", error);
            setMessages([...newMessages, { role: 'ai', text: "分析中にエラーが発生しました。" }]);
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">AI経営分析</h1>
            <div className="flex-grow bg-white rounded-lg shadow p-6 overflow-y-auto mb-4">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500">
                        <SparklesIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2">選択された期間のデータについて、AIに質問してみましょう。</p>
                        <p className="text-sm mt-1">例: 「売上が高い日と低い日の特徴は？」</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        <div className={`inline-block p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                           <p style={{whiteSpace: 'pre-wrap'}}>{msg.text}</p>
                        </div>
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
            </div>
            <div className="flex">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isAiLoading && handleSendMessage()}
                    className="flex-grow p-3 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="AIへの質問を入力..."
                    disabled={isAiLoading || isLoading}
                />
                 <button
                    onClick={handleMicClick}
                    className={`p-3 border-t border-b ${isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                    <MicIcon />
                </button>
                <button
                    onClick={handleSendMessage}
                    disabled={isAiLoading || isLoading}
                    className="bg-blue-600 text-white font-bold py-3 px-6 rounded-r-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isAiLoading ? '分析中...' : '送信'}
                </button>
            </div>
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
                    sales: data.sales || 0,
                    customers: data.customers || 0,
                    customer_spend: data.customer_spend || 0,
                    waste_product: data.waste_product || 0,
                    waste_owner_8: data.waste_owner_8 || 0,
                    waste_owner_10: data.waste_owner_10 || 0,
                    waste_promo_8: data.waste_promo_8 || 0,
                    waste_promo_10: data.waste_promo_10 || 0,
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
                const batch = writeBatch(db);
                let count = 0;
                results.data.forEach(row => {
                    const date = row.date;
                    const store = row.store;
                    if (date && store) {
                        const docId = `${date}_${store}`;
                        const docRef = doc(db, dailyReportsPath, docId);
                        const payload = {
                            date: getTimestampFromDateString(date),
                            store: store,
                            sales: Number(row.sales) || 0,
                            customers: Number(row.customers) || 0,
                            customer_spend: Number(row.customer_spend) || 0,
                            waste_product: Number(row.waste_product) || 0,
                            waste_owner_8: Number(row.waste_owner_8) || 0,
                            waste_owner_10: Number(row.waste_owner_10) || 0,
                            waste_promo_8: Number(row.waste_promo_8) || 0,
                            waste_promo_10: Number(row.waste_promo_10) || 0,
                        };
                        if(row.weather_code || row.max_temp || row.precipitation) {
                            payload.weather = {
                                weatherCode: Number(row.weather_code) || 0,
                                maxTemp: Number(row.max_temp) || 0,
                                precipitation: Number(row.precipitation) || 0,
                            }
                        }
                        batch.set(docRef, payload, { merge: true });
                        count++;
                    }
                });

                try {
                    await batch.commit();
                    setMessage({ text: `${count}件のデータをインポートしました。`, type: 'success' });
                } catch (error) {
                    console.error("データのインポートエラー: ", error);
                    setMessage({ text: `インポート中にエラーが発生しました: ${error.message}`, type: 'error' });
                } finally {
                    setIsProcessing(false);
                    setTimeout(() => setMessage(''), 5000);
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
                    <p className="mb-4 text-gray-600">CSVファイルを選択してデータを一括で登録・更新します。フォーマットはエクスポートされたファイルと同じ形式にしてください。</p>
                    <input type="file" accept=".csv" onChange={handleImport} disabled={isProcessing || !isScriptReady} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"/>
                </div>
                {message && <p className={`mt-4 text-center p-3 rounded-lg ${message.type === 'error' ? 'bg-red-100 text-red-700' : message.type === 'info' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{message.text}</p>}
            </div>
        </div>
    );
};

const AiForecastPage = () => {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            console.error("音声認識はサポートされていません");
            return;
        }
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => setUserInput(event.results[0][0].transcript);
        recognition.onerror = (event) => {
            console.error('音声認識エラー', event.error);
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);
        
        recognitionRef.current = recognition;
    }, []);

    const handleMicClick = () => {
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;

        const newMessages = [...messages, { role: 'user', text: userInput }];
        setMessages(newMessages);
        setUserInput('');
        setIsAiLoading(true);
        setError(null);

        try {
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + 6);
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=34.77&longitude=136.13&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo&start_date=${getLocalDateString(today)}&end_date=${getLocalDateString(endDate)}`;
            const weatherResponse = await fetch(weatherUrl);
            const weatherData = await weatherResponse.json();
            
            const forecastWeather = weatherData.daily.time.map((t, i) => ({
                date: t,
                weather: getWeatherIcon(weatherData.daily.weathercode[i]),
                temp: weatherData.daily.temperature_2m_max[i]
            }));

            const lastYearStartDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
            const lastYearEndDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
            
            const reportsRef = collection(db, dailyReportsPath);
            const q = query(reportsRef, where("date", ">=", Timestamp.fromDate(lastYearStartDate)), where("date", "<=", Timestamp.fromDate(lastYearEndDate)));
            const querySnapshot = await getDocs(q);
            const historicalData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return `日付: ${getLocalDateString(data.date.toDate())}, 売上: ${data.sales}円, 客数: ${data.customers}人, 天気: ${data.weather ? `${getWeatherIcon(data.weather.weatherCode)} ${data.weather.maxTemp}°C` : '情報なし'}`;
            }).join('\n');
            
            const prompt = `あなたは優秀なコンビニ経営コンサルタントです。以下の過去のデータと未来の天気予報を基に、ユーザーの質問「${userInput}」に答えてください。特に売上予測や発注に関する質問の場合は、具体的な数値や商品名を挙げて、表形式も活用しながら分かりやすくアドバイスしてください。

過去データ（昨年同週）:
${historicalData || 'なし'}

来週の天気予報:
${forecastWeather.map(f => `日付: ${f.date}, 天気: ${f.weather}, 最高気温: ${f.temp}°C`).join('\n')}

ユーザーの質問:
${userInput}
`;

            const apiKey = ""; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            let aiResponse = "申し訳ありません、分析結果を取得できませんでした。";
            if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
                aiResponse = result.candidates[0].content.parts[0].text;
            }
            setMessages([...newMessages, { role: 'ai', text: aiResponse }]);

        } catch (e) {
            console.error(e);
            setError("予測の生成中にエラーが発生しました。");
             setMessages([...newMessages, { role: 'ai', text: "予測の生成中にエラーが発生しました。" }]);
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">AI売上予測</h1>
            <p className="text-gray-600 mb-6">過去のデータと未来の天気予報を基に、AIが来週の売上予測と発注アドバイスを生成します。</p>
            <div className="flex-grow bg-white rounded-lg shadow p-6 overflow-y-auto mb-4">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500">
                        <BrainIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2">AIに売上予測や発注に関する質問をしてみましょう。</p>
                        <p className="text-sm mt-1">例: 「来週の売上を予測して」</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        <div className={`inline-block p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                           <p style={{whiteSpace: 'pre-wrap'}}>{msg.text}</p>
                        </div>
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
                 {error && <p className="mt-4 text-center p-3 rounded-lg bg-red-100 text-red-700">{error}</p>}
            </div>
            <div className="flex">
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isAiLoading && handleSendMessage()}
                    className="flex-grow p-3 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="AIへの質問を入力..."
                    disabled={isAiLoading}
                />
                 <button
                    onClick={handleMicClick}
                    className={`p-3 border-t border-b ${isListening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                    <MicIcon />
                </button>
                <button
                    onClick={handleSendMessage}
                    disabled={isAiLoading}
                    className="bg-blue-600 text-white font-bold py-3 px-6 rounded-r-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isAiLoading ? '分析中...' : '送信'}
                </button>
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
  
  const stores = useMemo(() => {
      if (!allStores) return [];
      const allowedStoreNames = ["伊賀平野東町店", "伊賀平野北谷店", "伊賀忍者市駅南店"];
      // If we find stores with these names, filter them. Otherwise return all.
      const filtered = allStores.filter(store => allowedStoreNames.includes(store.name));
      return filtered.length > 0 ? filtered : allStores;
  }, [allStores]);

  const today = new Date();
  const oneMonthAgo = new Date(new Date().setMonth(today.getMonth() - 1));
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
      case 'home': return <HomeDashboard dateRange={{startDate: new Date(new Date().setDate(today.getDate() - 1)), endDate: today}} onRefresh={refreshTrigger} />;
      case 'nippo': return <NippoDashboard {...pageProps} />;
      case 'haiki': return <HaikiDashboard {...pageProps} />;
      case 'table': return <DataTablePage {...pageProps} />;
      case 'custom': return <CustomAnalysisPage {...pageProps} />;
      case 'nippoInput': return <NippoInputPage stores={stores} employees={employees} />;
      case 'haikiInput': return <HaikiInputPage stores={stores} employees={employees} />;
      case 'bulkInput': return <BulkInputPage stores={stores} />;
      case 'csv': return <CsvPage dateRange={{startDate, endDate}} />;
      case 'ai': return <AiAnalysisPage {...pageProps} />;
      case 'ai_forecast': return <AiForecastPage />;
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
    <div className="flex h-screen bg-gray-100 font-sans">
      <aside className="w-64 bg-white shadow-md flex flex-col flex-shrink-0">
        <div className="h-16 flex items-center justify-center border-b"><h1 className="text-xl font-bold text-gray-800">経営ダッシュボード</h1></div>
        <nav className="flex-grow p-4 overflow-y-auto">
            <p className="px-4 py-2 text-xs text-gray-400 uppercase">分析</p>
            <NavItem icon={<HomeIcon />} label="ホーム" isActive={currentPage === 'home'} onClick={() => setCurrentPage('home')} />
            <NavItem icon={<ChartIcon />} label="日販分析" isActive={currentPage === 'nippo'} onClick={() => setCurrentPage('nippo')} />
            <NavItem icon={<TrashIcon />} label="廃棄分析" isActive={currentPage === 'haiki'} onClick={() => setCurrentPage('haiki')} />
            <NavItem icon={<ListIcon />} label="データ一覧" isActive={currentPage === 'table'} onClick={() => setCurrentPage('table')} />
            <NavItem icon={<SlidersIcon />} label="カスタム分析" isActive={currentPage === 'custom'} onClick={() => setCurrentPage('custom')} />
            <NavItem icon={<SparklesIcon />} label="AI分析" isActive={currentPage === 'ai'} onClick={() => setCurrentPage('ai')} />
            <NavItem icon={<BrainIcon />} label="AI売上予測" isActive={currentPage === 'ai_forecast'} onClick={() => setCurrentPage('ai_forecast')} />
            
            <p className="px-4 py-2 mt-4 text-xs text-gray-400 uppercase">入力</p>
            <NavItem icon={<SalesIcon />} label="日販入力" isActive={currentPage === 'nippoInput'} onClick={() => setCurrentPage('nippoInput')} />
            <NavItem icon={<TrashIcon />} label="廃棄入力" isActive={currentPage === 'haikiInput'} onClick={() => setCurrentPage('haikiInput')} />
            <NavItem icon={<UploadCloudIcon />} label="前年一括入力" isActive={currentPage === 'bulkInput'} onClick={() => setCurrentPage('bulkInput')} />
            <NavItem icon={<CsvIcon />} label="CSV入出力" isActive={currentPage === 'csv'} onClick={() => setCurrentPage('csv')} />
        </nav>
        <div className="p-4 border-t bg-gray-50">
             <h3 className="text-sm font-semibold text-gray-600 mb-2">分析期間</h3>
            <div className="space-y-2 mb-4">
                <div>
                    <label className="text-xs text-gray-500">開始日</label>
                    <input type="date" value={getLocalDateString(startDate)} onChange={(e) => setStartDate(new Date(`${e.target.value}T00:00:00`))} className="w-full p-1 border rounded-md text-sm"/>
                </div>
                <div>
                    <label className="text-xs text-gray-500">終了日</label>
                    <input type="date" value={getLocalDateString(endDate)} onChange={(e) => setEndDate(new Date(`${e.target.value}T00:00:00`))} className="w-full p-1 border rounded-md text-sm"/>
                </div>
                 <button onClick={handleRefresh} className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 flex items-center justify-center text-sm">
                    <RefreshCwIcon />
                    <span className="ml-2">データ更新</span>
                </button>
            </div>
             
            <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center text-xs text-gray-500">
                    <DatabaseIcon />
                    <span className="ml-2 truncate" title={firebaseConfig.projectId}>Connected to: {firebaseConfig.projectId}</span>
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
      } else {
        signInAnonymously(auth).catch((error) => {
            console.error("匿名サインインエラー:", error);
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
  
  return <AppContent />;
}
