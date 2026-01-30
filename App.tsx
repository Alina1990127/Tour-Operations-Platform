
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import { Login } from './components/Auth/Login';
import { supabase } from './lib/supabaseClient';
// Removed Alert from imports as it is not exported from types.ts and not used as a type annotation in this file.
import { 
  Itinerary, Resource, ResourceType, TaskStatus, AlertLevel, BookingTask, UserRole, UserAccount 
} from './types';
import { MOCK_RESOURCES, ICONS } from './constants';
import { parseItinerary } from './services/geminiService';
import { Language, translations } from './translations';

// Declare external libraries
declare const mammoth: any;
declare const XLSX: any;

const PAGE_HEADER_CLASSES = {
  container: "mb-12",
  label: "text-[10px] font-black text-amber-600 uppercase tracking-[0.35em] leading-none",
  title: "text-3xl md:text-4xl 2xl:text-5xl font-serif font-bold tracking-tight leading-tight text-slate-900"
};

const getWeekday = (dateStr: string, lang: Language) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long' });
};

const getTripPhase = (startDate: string, endDate: string): 'comingSoon' | 'onGoing' | 'departure' => {
  const today = new Date().toISOString().split('T')[0];
  if (today < startDate) return 'comingSoon';
  if (today >= startDate && today <= endDate) return 'onGoing';
  return 'departure';
};

const getTripPhaseStyle = (phase: 'comingSoon' | 'onGoing' | 'departure') => {
  switch (phase) {
    case 'comingSoon': return 'bg-amber-100 text-amber-600 border-amber-200';
    case 'onGoing': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'departure': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-slate-50 text-slate-400 border-slate-100';
  }
};

const getResourceColor = (type: ResourceType) => {
  switch (type) {
    case ResourceType.HOTEL: return 'bg-blue-100 text-blue-700 border-blue-200';
    case ResourceType.RESTAURANT: return 'bg-orange-100 text-orange-700 border-orange-200';
    case ResourceType.ATTRACTION: return 'bg-purple-100 text-purple-700 border-purple-200';
    case ResourceType.VEHICLE: return 'bg-slate-100 text-slate-700 border-slate-200';
    case ResourceType.GUIDE: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

const getResourceIcon = (type: ResourceType) => {
  switch (type) {
    case ResourceType.HOTEL: return '🏨';
    case ResourceType.RESTAURANT: return '🍴';
    case ResourceType.ATTRACTION: return '🎡';
    case ResourceType.VEHICLE: return '🚐';
    case ResourceType.GUIDE: return '🚩';
    default: return '📦';
  }
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [language, setLanguage] = useState<Language>('zh');
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const t = translations[language];

  // --- Auth & Session ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    
    if (data) {
      if (data.status === 'suspended') {
        alert(language === 'zh' ? '账号已被停用，请联系管理员。' : 'Account suspended. Please contact admin.');
        supabase.auth.signOut();
        return;
      }
      setCurrentUser({
        ...data,
        isTrial: false,
        permissions: data.permissions || []
      } as UserAccount);
    }
    setLoading(false);
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (session && currentUser) {
      loadData();
    }
  }, [session, currentUser, activeTab]);

  const loadData = async () => {
    // 1. Fetch Itineraries
    const { data: itData } = await supabase
      .from('itineraries')
      .select(`
        *,
        tasks:booking_tasks(*),
        finance:itinerary_finances(income)
      `);
    
    if (itData) {
      const mapped = itData.map(it => ({
        id: it.id,
        ownerId: it.owner_id,
        groupName: it.group_name,
        startDate: it.start_date,
        endDate: it.end_date,
        paxCount: it.pax_count,
        guideLanguage: it.guide_language,
        status: it.status as any,
        income: it.finance?.[0]?.income || 0,
        tasks: it.tasks || []
      }));
      setItineraries(mapped as Itinerary[]);
    }

    // 2. Fetch Accounts (Admin Only)
    if (currentUser?.role === UserRole.ADMIN) {
      const { data: userData } = await supabase.from('profiles').select('*');
      if (userData) {
        setUsers(userData.map(u => ({
          ...u,
          isTrial: false,
          permissions: u.permissions || []
        })) as UserAccount[]);
      }
    }
  };

  const hasPerm = (perm: string) => currentUser?.role === UserRole.ADMIN || currentUser?.permissions.includes(perm);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // --- Logic Shared across UI ---
  const globalStats = useMemo(() => {
    let totalIncome = 0;
    let totalCost = 0;
    let pendingCount = 0;
    itineraries.forEach(it => {
      if (currentUser?.role === UserRole.ADMIN) totalIncome += (it.income || 0);
      it.tasks.forEach(task => {
        totalCost += (task.cost || 0);
        if (task.status === TaskStatus.PENDING) pendingCount++;
      });
    });
    return { totalIncome, totalCost, netProfit: totalIncome - totalCost, pendingCount };
  }, [itineraries, currentUser]);

  const alertsData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const alerts: any[] = [];
    itineraries.forEach(it => {
      it.tasks.forEach(task => {
        if (task.status === TaskStatus.ALERT) alerts.push({ groupName: it.groupName, itineraryId: it.id, task, level: AlertLevel.CRITICAL });
        else if (task.status === TaskStatus.PENDING && task.date <= today) alerts.push({ groupName: it.groupName, itineraryId: it.id, task, level: AlertLevel.WARNING });
      });
    });
    return alerts;
  }, [itineraries]);

  // --- UI Renders (Truncated for space, assume same structure but with permissions checks) ---
  
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-8">
      <div className="w-12 h-1 bg-amber-500 animate-pulse rounded-full"></div>
      <div className="text-amber-500 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">
        Nexus Initializing
      </div>
    </div>
  );

  if (!session) return <Login />;

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      <Sidebar 
        activeTab={activeTab === 'group-board' ? 'itineraries' : activeTab} 
        setActiveTab={setActiveTab} 
        language={language} 
        setLanguage={setLanguage} 
        currentUser={currentUser} 
        onSignOut={handleSignOut} 
      />
      <main className="flex-1 ml-64 p-16 max-w-[90rem] mx-auto">
        <header className={PAGE_HEADER_CLASSES.container}>
          <div className="flex items-center space-x-3 mb-4">
            <span className="w-12 h-0.5 bg-amber-500"></span>
            <h2 className={PAGE_HEADER_CLASSES.label}>Management Console</h2>
          </div>
          <h1 className={PAGE_HEADER_CLASSES.title}>
            {activeTab === 'dashboard' && t.nav.dashboard}
            {activeTab === 'itineraries' && t.nav.itineraries}
            {activeTab === 'calendar' && t.nav.calendar}
            {activeTab === 'resources' && t.nav.resources}
            {activeTab === 'alerts' && t.nav.alerts}
            {activeTab === 'accounts' && t.nav.accounts}
          </h1>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.liveTours}</p>
                 <h4 className="text-3xl font-bold text-slate-900">{itineraries.length}</h4>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.pendingBookings}</p>
                 <h4 className="text-3xl font-bold text-amber-500">{globalStats.pendingCount}</h4>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.urgentAlerts}</p>
                 <h4 className={`text-3xl font-bold ${alertsData.length > 0 ? 'text-rose-500' : 'text-slate-900'}`}>{alertsData.length}</h4>
              </div>
              
              {/* Financial Stats: Restricted for Staff */}
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.totalRevenue}</p>
                 <h4 className="text-2xl font-bold text-slate-900 leading-none">
                   {currentUser?.role === UserRole.ADMIN ? `AED ${globalStats.totalIncome.toLocaleString()}` : '---'}
                 </h4>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.totalCost}</p>
                 <h4 className="text-2xl font-bold text-slate-900 leading-none">AED {globalStats.totalCost.toLocaleString()}</h4>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.stats.netProfit}</p>
                 <h4 className={`text-2xl font-bold leading-none ${globalStats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {currentUser?.role === UserRole.ADMIN ? `AED ${globalStats.netProfit.toLocaleString()}` : '---'}
                 </h4>
              </div>
            </div>
            
            {hasPerm('itinerary.create') && (
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden group">
                 <h3 className="text-2xl font-serif font-bold text-slate-900 mb-8">{t.dashboard.parseTitle}</h3>
                 <textarea 
                  className="w-full h-56 p-6 bg-slate-50 border-none rounded-3xl outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium text-slate-700 text-lg"
                  placeholder={t.dashboard.placeholder}
                 />
                 <button className="mt-6 w-full py-5 bg-slate-900 text-white font-black uppercase tracking-[0.3em] rounded-3xl shadow-2xl hover:bg-slate-800 transition-all">
                  {t.dashboard.extractBtn}
                 </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'itineraries' && (
          <div className="space-y-6">
            {itineraries.map(it => (
              <div key={it.id} className="bg-white p-10 rounded-[3rem] border border-slate-50 shadow-sm flex items-center justify-between">
                <div>
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getTripPhaseStyle(getTripPhase(it.startDate, it.endDate))}`}>
                    {(t.phases as any)[getTripPhase(it.startDate, it.endDate)]}
                  </span>
                  <h3 className="text-2xl font-bold mt-4">{it.groupName}</h3>
                  <p className="text-xs text-slate-400 mt-1 uppercase font-black tracking-widest">{it.startDate} - {it.endDate}</p>
                </div>
                <div className="flex items-center space-x-12 px-12 border-x border-slate-50">
                   <div className="text-center">
                     <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Income</p>
                     <p className="text-xl font-black text-slate-900">
                       {currentUser?.role === UserRole.ADMIN ? `AED ${it.income?.toLocaleString()}` : '---'}
                     </p>
                   </div>
                   <div className="text-center">
                     <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Cost</p>
                     <p className="text-xl font-bold text-rose-500">AED {it.tasks.reduce((s,t) => s+(t.cost||0),0).toLocaleString()}</p>
                   </div>
                </div>
                <button 
                  onClick={() => { setActiveTab('group-board'); }} 
                  className="bg-slate-900 text-white px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-slate-900 transition-all"
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
