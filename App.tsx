
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import { AuthGate, useAuth } from './components/Auth/AuthGate';
import { 
  Itinerary, Resource, ResourceType, TaskStatus, AlertLevel, BookingTask, UserRole, Alert, UserAccount
} from './types';
import { translations } from './translations';
import { Language } from './translations';
import { supabase, supabaseReady } from './lib/supabaseClient';
import { MOCK_RESOURCES, ICONS } from './constants';
import { parseItinerary } from './services/geminiService';

// Declare external libraries from index.html
declare const mammoth: any;
declare const XLSX: any;

const PAGE_HEADER_CLASSES = {
  container: "mb-10 flex justify-between items-end",
  stack: "flex flex-col",
  label: "text-[10px] font-black text-amber-600 uppercase tracking-[0.35em] leading-none mb-4 block",
  title: "text-2xl md:text-3xl font-serif font-bold tracking-tight leading-tight text-slate-900"
};

const COLOR_PALETTE = [
  { bg: 'bg-blue-600', text: 'text-white' },
  { bg: 'bg-emerald-600', text: 'text-white' },
  { bg: 'bg-indigo-600', text: 'text-white' },
  { bg: 'bg-rose-600', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-slate-900' },
  { bg: 'bg-violet-600', text: 'text-white' },
  { bg: 'bg-cyan-600', text: 'text-white' },
  { bg: 'bg-fuchsia-600', text: 'text-white' },
  { bg: 'bg-orange-600', text: 'text-white' },
  { bg: 'bg-teal-600', text: 'text-white' },
];

const AppContent: React.FC = () => {
  const { user: currentUser, signOut, isAdmin, isMock } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [language, setLanguage] = useState<Language>('zh');
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [subAccounts, setSubAccounts] = useState<UserAccount[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // AI Parsing State
  const [itineraryText, setItineraryText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; data: string; mimeType: string; isVisual: boolean; extractedText?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Itinerary Phase Filter
  const [activePhase, setActivePhase] = useState<'comingSoon' | 'onGoing' | 'departure'>('onGoing');

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date(2024, 4, 1)); 
  const [showDayDetailModal, setShowDayDetailModal] = useState(false);
  const [dayDetail, setDayDetail] = useState<{ date: string; groups: Itinerary[] } | null>(null);

  // Management State
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [itineraryToEdit, setItineraryToEdit] = useState<Partial<Itinerary> | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Partial<BookingTask> | null>(null);
  
  // Account Management State
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountToCreate, setAccountToCreate] = useState<Partial<UserAccount>>({});
  const [newPassword, setNewPassword] = useState('');

  const t = translations[language];

  const selectedItinerary = useMemo(() => 
    itineraries.find(it => it.id === selectedItineraryId), 
  [itineraries, selectedItineraryId]);

  const filteredItineraries = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    return itineraries.filter(it => {
      const start = new Date(it.startDate);
      const end = new Date(it.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      if (activePhase === 'comingSoon') return start > now;
      if (activePhase === 'onGoing') return start <= now && end >= now;
      if (activePhase === 'departure') return end < now;
      return true;
    });
  }, [itineraries, activePhase]);

  const dynamicAlerts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const fiveDaysFromNow = new Date(now);
    fiveDaysFromNow.setDate(now.getDate() + 5);

    const generated: Alert[] = [];
    itineraries.forEach(it => {
      const start = new Date(it.startDate);
      start.setHours(0, 0, 0, 0);
      
      if (start <= fiveDaysFromNow && it.status !== 'Completed') {
        const daysRemaining = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        generated.push({
          id: `dyn-it-${it.id}`,
          itineraryId: it.id,
          taskId: '',
          message: daysRemaining <= 0 
            ? `[进行中] 团队 "${it.groupName}" 已经在行程中，请确保所有资源对接顺畅。` 
            : `[即将出发] 团队 "${it.groupName}" 将在 ${daysRemaining} 天内抵达，请最后核实所有预订凭证！`,
          level: AlertLevel.WARNING,
          createdAt: new Date().toISOString()
        });

        it.tasks.forEach(task => {
          if (task.status === TaskStatus.PENDING) {
            generated.push({
              id: `dyn-task-${it.id}-${task.id}`,
              itineraryId: it.id,
              taskId: task.id,
              message: `[紧急未订] 距离 "${it.groupName}" 出发仅剩 ${daysRemaining <= 0 ? '0' : daysRemaining} 天，任务 "${task.description}" 仍处于待预订状态！`,
              level: AlertLevel.CRITICAL,
              createdAt: new Date().toISOString()
            });
          }
        });
      }
    });
    return generated;
  }, [itineraries]);

  const combinedAlerts = useMemo(() => [...dynamicAlerts, ...alerts], [dynamicAlerts, alerts]);

  const globalStats = useMemo(() => {
    const totalIncome = itineraries.reduce((sum, it) => sum + (it.income || 0), 0);
    const totalCost = itineraries.reduce((sum, it) => 
      sum + it.tasks.reduce((tSum, task) => tSum + (task.cost || 0), 0), 0
    );
    return {
      totalIncome,
      totalCost,
      netProfit: totalIncome - totalCost
    };
  }, [itineraries]);

  const selectedStats = useMemo(() => {
    if (!selectedItinerary) return { cost: 0, profit: 0 };
    const cost = selectedItinerary.tasks.reduce((sum, task) => sum + (task.cost || 0), 0);
    const profit = (selectedItinerary.income || 0) - cost;
    return { cost, profit };
  }, [selectedItinerary]);

  const getItineraryColor = useCallback((id: string) => {
    const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
  }, []);

  const getActiveItinerariesOnDate = useCallback((dateStr: string) => {
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return itineraries.filter(it => {
      const start = new Date(it.startDate);
      const end = new Date(it.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return target >= start && target <= end;
    });
  }, [itineraries]);

  useEffect(() => {
    if (activeTab === 'accounts' && !isAdmin) {
      setActiveTab('dashboard');
    }
    if (activeTab !== 'itineraries' && activeTab !== 'calendar') {
        setSelectedItineraryId(null);
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    loadOperationalData();
  }, [currentUser]);

  const loadOperationalData = async () => {
    if (!currentUser) return;
    setLoadingData(true);
    
    if (supabaseReady && supabase && !isMock) {
      try {
        let query = supabase.from('itineraries').select(`*, tasks:booking_tasks(*)`);
        if (!isAdmin) {
          query = query.eq('owner_id', currentUser.id);
        }
        
        const { data: itData } = await query;
        let financeMap: Record<string, number> = {};
        
        if (isAdmin) {
          const { data: finData } = await supabase.from('itinerary_finances').select('*');
          finData?.forEach(f => financeMap[f.itinerary_id] = f.income);
        }

        if (itData) {
          const mapped = itData.map(it => ({
            ...it,
            income: isAdmin ? (financeMap[it.id] || 0) : 0,
            tasks: it.tasks || []
          }));
          setItineraries(mapped as any);
        }

        if (isAdmin) {
          const { data: profiles } = await supabase.from('profiles').select('*');
          if (profiles) {
            setSubAccounts(profiles.map(p => ({
              id: p.id,
              name: p.name,
              email: p.email,
              role: p.role as UserRole,
              status: p.status as any,
              permissions: p.permissions || [],
              isTrial: p.is_trial || false,
              createdAt: p.created_at
            })));
          }
        }
        
        const { data: alertData } = await supabase.from('alerts').select('*').limit(10);
        if (alertData) setAlerts(alertData as any);

      } catch (err) {
        console.error("Data Load Error:", err);
      }
    } else {
      setItineraries([
        {
          id: '1', groupName: 'Luxury Dubai 7-Day Experience', startDate: '2024-05-20', endDate: '2024-05-27', paxCount: 15, guideLanguage: 'Chinese', status: 'Operational', income: 45000, ownerId: 'mock-ops-id',
          tasks: [
            { id: 't1', itineraryId: '1', type: ResourceType.HOTEL, description: 'Burj Al Arab Stay', date: '2024-05-20', status: TaskStatus.CONFIRMED, latestBookingDate: '2024-05-15', cost: 12000, paxCount: 15, isResourceMatched: true, notes: 'Sea View Suite requested.' },
            { id: 't2', itineraryId: '1', type: ResourceType.ATTRACTION, description: 'Burj Khalifa Visit', date: '2024-05-21', status: TaskStatus.PENDING, latestBookingDate: '2024-05-18', cost: 1500, paxCount: 15, isResourceMatched: true }
          ]
        },
        { id: '2', groupName: 'Oman Cultural Explorer', startDate: '2024-05-10', endDate: '2024-05-15', paxCount: 8, guideLanguage: 'English', status: 'Operational', income: 28000, ownerId: 'mock-admin-id', tasks: [] }
      ] as any[]);

      if (isAdmin) {
        setSubAccounts([
          { id: 'mock-admin-id', name: 'Master Admin', email: 'admin@dmcnexus.com', role: UserRole.ADMIN, status: 'Active', permissions: ['*'], isTrial: false, createdAt: '2023-01-01' },
          { id: 'mock-ops-id', name: 'Zayed bin Sultan', email: 'zayed.ops@dmcnexus.com', role: UserRole.SUB_ACCOUNT, status: 'Active', permissions: ['itinerary.view', 'task.view', 'task.editCost'], isTrial: false, createdAt: '2023-05-15' },
          { id: 'mock-staff-2', name: 'Fatima Al-Hashimi', email: 'fatima@dmcnexus.com', role: UserRole.SUB_ACCOUNT, status: 'Active', permissions: ['itinerary.view', 'task.view'], isTrial: true, createdAt: '2024-02-10' },
          { id: 'mock-staff-3', name: 'Rashid Khan', email: 'rashid@dmcnexus.com', role: UserRole.SUB_ACCOUNT, status: 'Suspended', permissions: [], isTrial: false, createdAt: '2023-11-05' }
        ]);
      }
    }
    setLoadingData(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const visualTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const isVisual = visualTypes.includes(file.type);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      
      let extractedText = '';

      // If it's a non-visual document (Word/Excel), we extract text locally
      if (!isVisual) {
        try {
          if (file.type.includes('word') || file.name.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            extractedText = result.value;
          } else if (file.type.includes('sheet') || file.type.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            extractedText = XLSX.utils.sheet_to_txt(sheet);
          }
        } catch (err) {
          console.error("Local file extraction error:", err);
        }
      }

      setAttachedFile({
        name: file.name,
        data: base64,
        mimeType: file.type,
        isVisual,
        extractedText
      });
    };
    reader.readAsDataURL(file);
  };

  const handleExtractAI = async () => {
    if (!itineraryText && !attachedFile) {
      alert("Please enter text or attach an itinerary file.");
      return;
    }

    setIsParsing(true);
    try {
      const finalPromptText = attachedFile?.extractedText 
        ? `${itineraryText}\n\n[Extracted from ${attachedFile.name}]:\n${attachedFile.extractedText}`
        : itineraryText;

      const visualAsset = attachedFile?.isVisual ? { data: attachedFile.data, mimeType: attachedFile.mimeType } : undefined;

      const result = await parseItinerary(finalPromptText, visualAsset);
      
      if (!result) throw new Error("Parsing returned null result.");

      const newId = `ai-${Date.now()}`;
      const newItinerary: Itinerary = {
        id: newId,
        groupName: result.groupName || 'AI Extracted Group',
        startDate: result.startDate || new Date().toISOString().split('T')[0],
        endDate: result.endDate || new Date().toISOString().split('T')[0],
        paxCount: result.paxCount || 0,
        guideLanguage: result.guideLanguage || 'English',
        income: result.estimatedIncome || 0,
        ownerId: currentUser?.id || 'mock-admin-id',
        status: 'Operational',
        tasks: (result.tasks || []).map((t: any, idx: number) => ({
          id: `ai-t-${idx}-${Date.now()}`,
          itineraryId: newId,
          type: t.type as ResourceType || ResourceType.OTHERS,
          description: t.description || 'Service Task',
          date: t.date || result.startDate,
          time: t.time,
          endTime: t.endTime,
          cost: t.estimatedCost || 0,
          paxCount: result.paxCount || 0,
          status: TaskStatus.PENDING,
          latestBookingDate: t.date || result.startDate,
          isResourceMatched: false,
          notes: t.notes
        }))
      };

      setItineraries(prev => [newItinerary, ...prev]);
      setActiveTab('itineraries');
      setSelectedItineraryId(newId);
      
      setItineraryText('');
      setAttachedFile(null);
    } catch (err) {
      console.error(err);
      alert("Parsing failed. Please check your network or try pasting text directly.");
    } finally {
      setIsParsing(false);
    }
  };

  const updateAccountStatus = (id: string, newStatus: 'Active' | 'Suspended') => {
    setSubAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, status: newStatus } : acc));
  };

  const handleUpdatePassword = () => {
    if (!selectedAccount || !newPassword) return;
    alert(t.modals.successPassword + ` for ${selectedAccount.name}`);
    setNewPassword('');
    setShowPasswordModal(false);
  };

  const saveNewAccount = (acc: Partial<UserAccount>) => {
    if (!acc.name || !acc.email) return;
    const newAcc: UserAccount = {
      id: `mock-${Date.now()}`,
      name: acc.name,
      email: acc.email,
      role: acc.role || UserRole.SUB_ACCOUNT,
      status: 'Active',
      permissions: acc.permissions || ['itinerary.view', 'task.view'],
      isTrial: false,
      createdAt: new Date().toISOString()
    };
    setSubAccounts(prev => [...prev, newAcc]);
    setShowAccountModal(false);
    setAccountToCreate({});
  };

  const updateItineraryOwner = (itId: string, ownerId: string) => {
    setItineraries(prev => prev.map(it => it.id === itId ? { ...it, ownerId } : it));
  };

  const saveItinerary = (it: Partial<Itinerary>) => {
    if (it.id) {
      setItineraries(prev => prev.map(item => item.id === it.id ? { ...item, ...it } as Itinerary : item));
    } else {
      const newId = Date.now().toString();
      const newItinerary: Itinerary = {
        ...it,
        id: newId,
        tasks: [],
        status: 'Operational',
        ownerId: currentUser?.id || 'mock-admin-id',
        groupName: it.groupName || 'New Tour Group',
        startDate: it.startDate || new Date().toISOString().split('T')[0],
        endDate: it.endDate || new Date().toISOString().split('T')[0],
        paxCount: it.paxCount || 0,
        guideLanguage: it.guideLanguage || 'English',
        income: it.income || 0
      } as Itinerary;
      setItineraries(prev => [...prev, newItinerary]);
    }
    setShowItineraryModal(false);
  };

  const saveTask = (task: Partial<BookingTask>) => {
    if (!selectedItineraryId) return;
    setItineraries(prev => prev.map(it => {
      if (it.id === selectedItineraryId) {
        let newTasks;
        if (task.id) newTasks = it.tasks.map(t => t.id === task.id ? { ...t, ...task } : t);
        else newTasks = [...it.tasks, { ...task, id: Date.now().toString(), itineraryId: it.id, isResourceMatched: false, latestBookingDate: '' } as BookingTask];
        return { ...it, tasks: newTasks };
      }
      return it;
    }));
    setShowTaskModal(false);
  };

  const deleteTask = (taskId: string) => {
    if (!selectedItineraryId) return;
    if (confirm('Delete this task?')) {
      setItineraries(prev => prev.map(it => it.id === selectedItineraryId ? { ...it, tasks: it.tasks.filter(t => t.id !== taskId) } : it));
    }
  };

  const togglePermission = (perm: string) => {
    if (!selectedAccount) return;
    const current = selectedAccount.permissions || [];
    const updated = current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm];
    const newAcc = { ...selectedAccount, permissions: updated };
    setSelectedAccount(newAcc);
    setSubAccounts(prev => prev.map(acc => acc.id === selectedAccount.id ? newAcc : acc));
  };

  const PasswordModal = () => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowPasswordModal(false)}></div>
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative p-10 animate-slideUp">
        <h3 className="text-2xl font-serif font-bold text-slate-900 mb-8">{t.modals.passwordTitle}</h3>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.accounts.name}</label>
            <input readOnly className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-400" value={selectedAccount?.name} />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.newPassword}</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" placeholder="••••••••" />
          </div>
          <div className="flex space-x-4 pt-4">
            <button onClick={() => setShowPasswordModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.cancel}</button>
            <button onClick={handleUpdatePassword} className="flex-1 py-4 bg-slate-900 text-amber-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.save}</button>
          </div>
        </div>
      </div>
    </div>
  );

  const AccountModal = () => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowAccountModal(false)}></div>
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative p-10 animate-slideUp">
        <h3 className="text-2xl font-serif font-bold text-slate-900 mb-8">添加子账号 / New Sub-Account</h3>
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.accounts.name}</label>
            <input className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={accountToCreate.name || ''} onChange={e => setAccountToCreate(p => ({...p, name: e.target.value}))} placeholder="Staff Name" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.accounts.email}</label>
            <input className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={accountToCreate.email || ''} onChange={e => setAccountToCreate(p => ({...p, email: e.target.value}))} placeholder="email@dmcnexus.com" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Initial Security Key</label>
            <input type="password" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" placeholder="••••••••" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Role Type</label>
            <select className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={accountToCreate.role || UserRole.SUB_ACCOUNT} onChange={e => setAccountToCreate(p => ({...p, role: e.target.value as UserRole}))}>
              <option value={UserRole.SUB_ACCOUNT}>{t.accounts.staffBadge}</option>
              <option value={UserRole.ADMIN}>{t.accounts.adminBadge}</option>
            </select>
          </div>
          <div className="flex space-x-4 pt-4">
            <button onClick={() => setShowAccountModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.cancel}</button>
            <button onClick={() => saveNewAccount(accountToCreate)} className="flex-1 py-4 bg-slate-900 text-amber-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.save}</button>
          </div>
        </div>
      </div>
    </div>
  );

  const PermissionModal = () => (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowPermissionModal(false)}></div>
      <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl relative overflow-hidden animate-slideUp flex flex-col max-h-[90vh]">
        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-serif font-bold text-slate-900">Permissions: {selectedAccount?.name}</h3>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">Configure Operational Access</p>
          </div>
          <button onClick={() => setShowPermissionModal(false)} className="p-3 bg-white shadow-sm rounded-full text-slate-400 hover:text-slate-900">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-10 overflow-y-auto space-y-10">
          {Object.entries(translations[language].permissions.categories).map(([catKey, catLabel]) => (
            <section key={catKey}>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 border-l-4 border-amber-500 pl-4">{catLabel}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(translations[language].permissions)
                  .filter(([key]) => key.startsWith(catKey))
                  .map(([permKey, permData]: [string, any]) => (
                    <div key={permKey} onClick={() => togglePermission(permKey)} className={`p-6 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between ${selectedAccount?.permissions.includes(permKey) ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                      <div className="flex justify-between items-start mb-2"><span className={`text-xs font-black uppercase tracking-widest ${selectedAccount?.permissions.includes(permKey) ? 'text-amber-700' : 'text-slate-400'}`}>{permData.label}</span><div className={`w-10 h-6 rounded-full relative transition-all ${selectedAccount?.permissions.includes(permKey) ? 'bg-amber-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${selectedAccount?.permissions.includes(permKey) ? 'left-5' : 'left-1'}`}></div></div></div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{permData.desc}</p>
                    </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="p-10 bg-slate-900 flex justify-end"><button onClick={() => setShowPermissionModal(false)} className="px-10 py-4 bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-[0.3em] rounded-2xl shadow-xl hover:bg-amber-400 transition-all">Save Access Rules</button></div>
      </div>
    </div>
  );

  const DayDetailModal = () => (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setShowDayDetailModal(false)}></div>
      <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl relative overflow-hidden animate-slideUp flex flex-col max-h-[80vh]">
        <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-serif font-bold text-slate-900">{dayDetail?.date} 团队安排</h3>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">{dayDetail?.groups.length} Groups Active</p>
          </div>
          <button onClick={() => setShowDayDetailModal(false)} className="p-3 bg-white shadow-sm rounded-full text-slate-400 hover:text-slate-900">
             <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-10 overflow-y-auto space-y-4">
          {dayDetail?.groups.map(it => {
            const color = getItineraryColor(it.id);
            return (
              <div key={it.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-amber-200 transition-all group">
                <div className="flex items-center space-x-4">
                  <div className={`w-3 h-12 rounded-full ${color.bg}`}></div>
                  <div>
                    <h4 className="font-bold text-slate-900">{it.groupName}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">
                      {it.startDate} TO {it.endDate} • {it.paxCount} PAX
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedItineraryId(it.id); setActiveTab('itineraries'); setShowDayDetailModal(false); }}
                  className="px-6 py-3 bg-slate-900 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-500 hover:text-slate-900 transition-all shadow-md"
                >
                  Manage
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = (firstDayOfMonth + 6) % 7; 

    const prevMonth = () => setCalendarDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCalendarDate(new Date(year, month + 1, 1));

    return (
      <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-100 min-h-[600px] flex flex-col">
        <div className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <h3 className="text-2xl font-serif font-bold text-slate-900">
              {year}年 {month + 1}月
            </h3>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.3em] mt-1">Operational Schedule</p>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={prevMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => setCalendarDate(new Date())} className="px-6 py-3 bg-slate-900 text-amber-500 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800">Today</button>
            <button onClick={nextMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-4 mb-4">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
            <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pb-2 border-b border-slate-50">{day}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-4 flex-1">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`offset-${i}`} className="min-h-[160px] bg-slate-50/30 rounded-3xl opacity-20"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const activeGroups = getActiveItinerariesOnDate(dateKey);
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            return (
              <div key={day} className={`min-h-[160px] border border-slate-50 rounded-3xl p-4 flex flex-col space-y-2 relative transition-all group ${isToday ? 'bg-amber-50/30 border-amber-100' : 'hover:bg-slate-50/50'}`}>
                <div className="flex justify-between items-start">
                  <span className={`text-xs font-black ${isToday ? 'text-amber-600' : 'text-slate-300'}`}>{day}</span>
                  {activeGroups.length > 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDayDetail({ date: dateKey, groups: activeGroups });
                        setShowDayDetailModal(true);
                      }}
                      className="p-1 text-slate-200 hover:text-amber-500 transition-all hover:bg-amber-50 rounded-lg"
                      title="View all teams for this day"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    </button>
                  )}
                </div>
                <div className="flex flex-col space-y-1.5 overflow-y-auto max-h-[110px] scrollbar-hide">
                  {activeGroups.map((it) => {
                    const color = getItineraryColor(it.id);
                    return (
                      <button 
                        key={it.id} 
                        onClick={() => { setSelectedItineraryId(it.id); setActiveTab('itineraries'); }} 
                        className={`text-[8px] font-bold p-2 rounded-xl leading-tight uppercase text-left transition-all hover:scale-[1.02] shadow-sm truncate border-l-4 border-black/10 ${color.bg} ${color.text}`}
                      >
                        {it.groupName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {showItineraryModal && <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"><div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowItineraryModal(false)}></div><div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative p-10 animate-slideUp"><h3 className="text-2xl font-serif font-bold text-slate-900 mb-8">{itineraryToEdit?.id ? t.modals.editItineraryTitle : t.modals.manualTitle}</h3><div className="space-y-6"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.groupName}</label><input className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={itineraryToEdit?.groupName || ''} onChange={e => setItineraryToEdit(p => ({...p, groupName: e.target.value}))}/></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.paxCount}</label><input type="number" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={itineraryToEdit?.paxCount || 0} onChange={e => setItineraryToEdit(p => ({...p, paxCount: parseInt(e.target.value) || 0}))} /></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.grossIncome} (AED)</label><input type="number" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={itineraryToEdit?.income || 0} onChange={e => setItineraryToEdit(p => ({...p, income: parseFloat(e.target.value) || 0}))} /></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.startDate}</label><input type="date" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={itineraryToEdit?.startDate || ''} onChange={e => setItineraryToEdit(p => ({...p, startDate: e.target.value}))} /></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.endDate}</label><input type="date" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={itineraryToEdit?.endDate || ''} onChange={e => setItineraryToEdit(p => ({...p, endDate: e.target.value}))} /></div></div><div className="flex space-x-4 pt-4"><button onClick={() => setShowItineraryModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.cancel}</button><button onClick={() => saveItinerary(itineraryToEdit || {})} className="flex-1 py-4 bg-slate-900 text-amber-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.save}</button></div></div></div></div>}
      {showTaskModal && <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"><div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowTaskModal(false)}></div><div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative p-10 animate-slideUp max-h-[90vh] overflow-y-auto"><h3 className="text-2xl font-serif font-bold text-slate-900 mb-8">{taskToEdit?.id ? t.modals.editTaskTitle : t.modals.newTaskTitle}</h3><div className="space-y-6"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.groupName}</label><input readOnly className="w-full px-6 py-4 bg-slate-100 border-none rounded-2xl outline-none font-bold text-slate-400 cursor-not-allowed" value={selectedItinerary?.groupName || 'Unknown Group'} /></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.description}</label><input className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.description || ''} onChange={e => setTaskToEdit(p => ({...p, description: e.target.value}))} /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.type}</label><select className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.type || ResourceType.OTHERS} onChange={e => setTaskToEdit(p => ({...p, type: e.target.value as ResourceType}))}>{Object.values(ResourceType).map(v => <option key={v} value={v}>{v}</option>)}</select></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.status}</label><select className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.status || TaskStatus.PENDING} onChange={e => setTaskToEdit(p => ({...p, status: e.target.value as TaskStatus}))}>{Object.values(TaskStatus).map(v => <option key={v} value={v}>{v}</option>)}</select></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.cost} (AED)</label><input type="number" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.cost || 0} onChange={e => setTaskToEdit(p => ({...p, cost: parseFloat(e.target.value) || 0}))} /></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.paxCount} (人数)</label><input type="number" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.paxCount || selectedItinerary?.paxCount || 0} onChange={e => setTaskToEdit(p => ({...p, paxCount: parseInt(e.target.value) || 0}))} /></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.serviceDate}</label><input type="date" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.date || ''} onChange={e => setTaskToEdit(p => ({...p, date: e.target.value}))} /></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.serviceEndDate}</label><input type="date" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold" value={taskToEdit?.endDate || ''} onChange={e => setTaskToEdit(p => ({...p, endDate: e.target.value}))} /></div></div><div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t.modals.notes}</label><textarea rows={3} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm" value={taskToEdit?.notes || ''} onChange={e => setTaskToEdit(p => ({...p, notes: e.target.value}))} placeholder={t.modals.notesPlaceholder} /></div><div className="flex space-x-4 pt-4"><button onClick={() => setShowTaskModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.cancel}</button><button onClick={() => saveTask(taskToEdit || {})} className="flex-1 py-4 bg-slate-900 text-amber-500 font-black uppercase tracking-widest rounded-2xl">{t.modals.save}</button></div></div></div></div>}
      {showPermissionModal && <PermissionModal />}
      {showPasswordModal && <PasswordModal />}
      {showAccountModal && <AccountModal />}
      {showDayDetailModal && <DayDetailModal />}
      
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} language={language} setLanguage={setLanguage} currentUser={currentUser} onSignOut={signOut} />
      
      <main className="flex-1 ml-64 p-12 max-w-[90rem] mx-auto animate-fadeIn relative">
        <header className={PAGE_HEADER_CLASSES.container}>
          <div className={PAGE_HEADER_CLASSES.stack}>
            <div className="flex items-center space-x-3 mb-4"><span className="w-12 h-0.5 bg-amber-500"></span><h2 className={PAGE_HEADER_CLASSES.label}>DMC Nexus {isAdmin ? 'Admin' : 'Operations'}</h2></div>
            <div className="flex items-center space-x-4">
               {selectedItineraryId && (<button onClick={() => setSelectedItineraryId(null)} className="p-3 bg-white shadow-sm rounded-2xl text-slate-400 hover:text-slate-900 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>)}
               <div className="group relative flex items-center space-x-2">
                 <h1 className={PAGE_HEADER_CLASSES.title}>{selectedItineraryId ? selectedItinerary?.groupName : (t.nav[activeTab as keyof typeof t.nav] || activeTab)}</h1>
                 {selectedItineraryId && isAdmin && (
                   <button onClick={() => { setItineraryToEdit(selectedItinerary); setShowItineraryModal(true); }} className="p-2 text-slate-300 hover:text-amber-500 transition-all">
                     <ICONS.Edit />
                   </button>
                 )}
               </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {selectedItineraryId && (
              <button 
                onClick={() => { setTaskToEdit({ paxCount: selectedItinerary?.paxCount }); setShowTaskModal(true); }}
                className="bg-slate-900 text-amber-500 px-6 py-3 rounded-2xl hover:bg-slate-800 shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center space-x-2"
              >
                <ICONS.Plus /> <span>{t.itineraries.addTask}</span>
              </button>
            )}
            {activeTab === 'itineraries' && !selectedItineraryId && (
              <button onClick={() => { setItineraryToEdit({}); setShowItineraryModal(true); }} className="bg-slate-900 text-amber-500 px-6 py-3 rounded-2xl hover:bg-slate-800 shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center space-x-2">
                <ICONS.Plus /> <span>{t.itineraries.newEntry}</span>
              </button>
            )}
            {activeTab === 'accounts' && isAdmin && (
              <button onClick={() => { setAccountToCreate({}); setShowAccountModal(true); }} className="bg-slate-900 text-amber-500 px-6 py-3 rounded-2xl hover:bg-slate-800 shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center space-x-2">
                <ICONS.Plus /> <span>添加子账号 / Add Staff</span>
              </button>
            )}
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-6`}>
               <StatCard label={t.stats.liveTours} val={itineraries.length} icon={<ICONS.Itinerary />} />
               {isAdmin && (
                 <>
                   <StatCard label={t.stats.totalRevenue} val={`AED ${globalStats.totalIncome.toLocaleString()}`} icon={<ICONS.Check />} />
                   <StatCard label={t.stats.totalCost} val={`AED ${globalStats.totalCost.toLocaleString()}`} icon={<ICONS.Calendar />} />
                 </>
               )}
               <StatCard label={t.stats.urgentAlerts} val={combinedAlerts.filter(a => a.level === AlertLevel.CRITICAL).length} highlight icon={<ICONS.Alert />} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
                {isParsing && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
                    <div className="w-16 h-1 bg-amber-500 animate-pulse rounded-full"></div>
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{t.dashboard.processing}</p>
                  </div>
                )}
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-serif font-bold text-slate-900">{t.dashboard.parseTitle}</h3>
                  <span className="text-[10px] font-black text-amber-600 tracking-widest uppercase">{t.dashboard.parseSub}</span>
                </div>
                <textarea 
                  className="w-full h-40 p-6 bg-slate-50 border-none rounded-3xl outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-700 text-lg placeholder:text-slate-300 transition-all" 
                  placeholder={t.dashboard.placeholder}
                  value={itineraryText}
                  onChange={(e) => setItineraryText(e.target.value)}
                />
                
                <div className="mt-6 flex flex-col space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" 
                        onChange={handleFileUpload}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-4 rounded-2xl flex items-center space-x-2 transition-all ${attachedFile ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        <ICONS.Clip />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {attachedFile ? attachedFile.name : t.dashboard.attach}
                        </span>
                      </button>
                      {attachedFile && (
                        <button 
                          onClick={() => setAttachedFile(null)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                      Supported: PDF, Word, Excel, Images
                    </p>
                  </div>
                  
                  <button 
                    onClick={handleExtractAI}
                    disabled={isParsing}
                    className="w-full py-5 bg-slate-900 text-amber-500 font-black uppercase tracking-[0.3em] rounded-3xl shadow-xl hover:bg-slate-800 transition-all text-xs flex items-center justify-center space-x-3 active:scale-95 disabled:opacity-50"
                  >
                    <ICONS.File /> 
                    <span>{t.dashboard.extractBtn}</span>
                  </button>
                </div>
              </div>
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col">
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-6 flex items-center space-x-2"><span className="text-rose-500"><ICONS.Alert /></span><span>{t.dashboard.criticalAlerts}</span></h3>
                <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2 scrollbar-hide">
                  {combinedAlerts.filter(a => a.level === AlertLevel.CRITICAL).map(alert => (<div key={alert.id} className="p-5 bg-rose-50 border border-rose-100 rounded-3xl"><p className="text-[11px] font-bold text-rose-700 leading-relaxed">{alert.message}</p></div>))}
                  {combinedAlerts.filter(a => a.level === AlertLevel.CRITICAL).length === 0 && (
                    <div className="py-10 text-center">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t.dashboard.noAlerts}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'itineraries' && !selectedItineraryId && (
          <div className="space-y-10">
            <div className="flex justify-center">
              <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-slate-50 flex items-center space-x-1">
                {[
                  { id: 'comingSoon', label: t.phases.comingSoon },
                  { id: 'onGoing', label: t.phases.onGoing },
                  { id: 'departure', label: t.phases.departure }
                ].map((phase) => (
                  <button
                    key={phase.id}
                    onClick={() => setActivePhase(phase.id as any)}
                    className={`px-8 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                      activePhase === phase.id 
                        ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {phase.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {filteredItineraries.length === 0 ? (
                <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-50">
                  <p className="text-slate-300 font-bold uppercase tracking-[0.2em]">No teams in this phase.</p>
                </div>
              ) : (
                filteredItineraries.map(it => (
                  <div key={it.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm flex items-center justify-between group hover:shadow-lg transition-all animate-slideUp">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className={`text-[8px] font-black px-3 py-1 rounded-full tracking-widest uppercase ${
                          activePhase === 'onGoing' ? 'bg-emerald-100 text-emerald-700' :
                          activePhase === 'comingSoon' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{it.status}</span>
                        {it.ownerId === 'mock-admin-id' && <span className="text-[8px] font-black text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-tighter">System Direct</span>}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors">{it.groupName}</h3>
                      <div className="flex items-center space-x-6 mt-3">
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center space-x-2"><ICONS.Calendar /> <span>{it.startDate} - {it.endDate}</span></p>
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center space-x-2">
                          <ICONS.Resource /> 
                          <span>{subAccounts.find(s => s.id === it.ownerId)?.name || 'Unassigned'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="pl-8"><button onClick={() => setSelectedItineraryId(it.id)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 transition-all">{t.itineraries.manage}</button></div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {selectedItineraryId && (
          <div className="space-y-6 animate-fadeIn">
             <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-2'} gap-4 mb-10`}>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 group relative">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.itineraries.ownerLabel}</p>
                  {isAdmin ? (
                    <select 
                      value={selectedItinerary?.ownerId} 
                      onChange={(e) => updateItineraryOwner(selectedItineraryId, e.target.value)}
                      className="w-full bg-slate-50 border-none rounded-xl text-xs font-bold p-2 outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {subAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.role})</option>)}
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-slate-900">{subAccounts.find(s => s.id === selectedItinerary?.ownerId)?.name}</p>
                  )}
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative group">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.modals.paxCount}</p>
                  <div className="flex items-center space-x-2">
                    <p className="text-lg font-bold text-slate-900">{selectedItinerary?.paxCount} 人</p>
                    {isAdmin && (
                      <button onClick={() => { setItineraryToEdit(selectedItinerary); setShowItineraryModal(true); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-amber-500 transition-all">
                        <ICONS.Edit />
                      </button>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative group">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.itineraries.totalIncome}</p>
                      <div className="flex items-center space-x-2">
                        <p className="text-lg font-black text-amber-600">AED {selectedItinerary?.income?.toLocaleString() || 0}</p>
                        <button onClick={() => { setItineraryToEdit(selectedItinerary); setShowItineraryModal(true); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-amber-500 transition-all">
                          <ICONS.Edit />
                        </button>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.itineraries.totalCost}</p>
                      <p className="text-lg font-black text-rose-500">AED {selectedStats.cost.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{t.itineraries.netProfit}</p>
                      <p className={`text-lg font-black ${selectedStats.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>AED {selectedStats.profit.toLocaleString()}</p>
                    </div>
                  </>
                )}
             </div>
             <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 border-b border-slate-100">
                      <tr><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">描述</th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">日期</th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">人数</th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">花费</th><th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">操作</th></tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {selectedItinerary?.tasks.map(task => (<tr key={task.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="px-8 py-6">
                           <div className="flex flex-col">
                             <span className="font-bold text-slate-900">{task.description}</span>
                             {task.notes && <span className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">{task.notes}</span>}
                           </div>
                        </td>
                        <td className="px-8 py-6 text-xs font-bold text-slate-600">{task.date}</td>
                        <td className="px-8 py-6 text-xs font-bold text-slate-600">{task.paxCount} 人</td>
                        <td className="px-8 py-6 font-bold text-rose-500">AED {task.cost?.toLocaleString()}</td>
                        <td className="px-8 py-6">
                          <div className="flex items-center space-x-4">
                            <button onClick={() => { setTaskToEdit(task); setShowTaskModal(true); }} className="p-2 text-slate-300 hover:text-amber-500"><ICONS.Edit /></button>
                            <button onClick={() => deleteTask(task.id)} className="p-2 text-slate-200 hover:text-rose-500 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>))}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'calendar' && renderCalendar()}

        {activeTab === 'alerts' && (
          <div className="space-y-6">
            {combinedAlerts.length === 0 ? (
               <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-sm animate-fadeIn">
                 <p className="text-slate-300 font-bold uppercase tracking-[0.2em]">{t.alerts.noAlerts}</p>
               </div>
            ) : (
              combinedAlerts.map(alert => (
                <div key={alert.id} className={`p-8 rounded-[2.5rem] border flex items-center justify-between transition-all hover:shadow-lg animate-slideUp ${alert.level === AlertLevel.CRITICAL ? 'bg-rose-50 border-rose-100 shadow-rose-100/20' : 'bg-white border-slate-100 shadow-sm'}`}>
                  <div className="flex items-center space-x-6">
                    <div className={`p-5 rounded-[1.5rem] ${alert.level === AlertLevel.CRITICAL ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      <ICONS.Alert />
                    </div>
                    <div>
                      <p className={`text-base font-bold ${alert.level === AlertLevel.CRITICAL ? 'text-rose-900' : 'text-slate-900'} leading-snug`}>{alert.message}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-tighter">
                          {itineraries.find(it => it.id === alert.itineraryId)?.groupName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium italic">Triggered: {new Date(alert.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSelectedItineraryId(alert.itineraryId); setActiveTab('itineraries'); }} 
                    className="px-8 py-4 bg-slate-900 text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-amber-500 hover:text-slate-900 transition-all shadow-md active:scale-95"
                  >
                    {t.alerts.solve}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'accounts' && isAdmin && (
          <div className="space-y-6">
             <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.accounts.name}</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.accounts.email}</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.accounts.status}</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.accounts.actions}</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {subAccounts.map(acc => (
                        <tr key={acc.id} className="hover:bg-slate-50/50 transition-all">
                           <td className="px-8 py-6">
                              <div className="flex items-center space-x-4">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs uppercase tracking-widest ${acc.role === UserRole.ADMIN ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'bg-slate-900 text-amber-500'}`}>
                                  {acc.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 leading-none mb-1">{acc.name}</p>
                                  {acc.isTrial && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">Trial Period</span>}
                                </div>
                              </div>
                           </td>
                           <td className="px-8 py-6 text-sm text-slate-500 font-medium">{acc.email}</td>
                           <td className="px-8 py-6">
                              <button onClick={() => updateAccountStatus(acc.id, acc.status === 'Active' ? 'Suspended' : 'Active')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${acc.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                {acc.status}
                              </button>
                           </td>
                           <td className="px-8 py-6">
                              <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${acc.role === UserRole.ADMIN ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                {acc.role === UserRole.ADMIN ? 'System Master' : t.accounts.staffBadge}
                              </span>
                           </td>
                           <td className="px-8 py-6">
                              <div className="flex items-center space-x-3">
                                <button onClick={() => { setSelectedAccount(acc); setShowPermissionModal(true); }} className="bg-slate-900 text-amber-500 px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-md">Rights</button>
                                <button onClick={() => { setSelectedAccount(acc); setShowPasswordModal(true); }} className="p-2.5 text-slate-400 hover:text-slate-900 transition-colors" title={t.accounts.changePassword}><ICONS.Edit /></button>
                                {acc.id !== currentUser?.id && (<button className="p-2.5 text-slate-300 hover:text-rose-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>)}
                              </div>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

const StatCard: React.FC<{ label: string, val: string | number, highlight?: boolean, icon: React.ReactNode }> = ({ label, val, highlight, icon }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-start justify-between hover:scale-[1.02] transition-transform duration-300">
    <div className="space-y-4">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      <h4 className={`text-xl font-bold ${highlight ? 'text-rose-600' : 'text-slate-900'} leading-none`}>{val}</h4>
    </div>
    <div className={`p-4 rounded-2xl ${highlight ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>{icon}</div>
  </div>
);

const App: React.FC = () => (<AuthGate><AppContent /></AuthGate>);

export default App;
