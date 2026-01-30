
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import { 
  Itinerary, Resource, ResourceType, TaskStatus, Alert, AlertLevel, BookingTask, UserRole, UserAccount 
} from './types';
import { MOCK_RESOURCES, ICONS } from './constants';
import { parseItinerary } from './services/geminiService';
import { Language, translations } from './translations';

// Declare external libraries for TypeScript
declare const mammoth: any;
declare const XLSX: any;

const ALL_PERMISSIONS = [
  'itinerary.view', 'itinerary.create', 'itinerary.assignOwner',
  'task.view', 'task.editCost', 'task.editStatus', 'task.editDetails',
  'finance.viewRevenue', 'finance.editRevenue', 'finance.viewProfit'
];

const DEFAULT_SUB_PERMISSIONS = ['itinerary.view', 'task.view', 'task.editCost'];

const INITIAL_USERS: UserAccount[] = [
  { id: 'admin-1', name: 'Master Admin', email: 'admin@dmcnexus.com', password: 'password123', role: UserRole.ADMIN, isTrial: false, createdAt: '2023-01-01', status: 'Active', permissions: ALL_PERMISSIONS },
  { id: 'staff-1', name: 'Operations Lead', email: 'ops@dmcnexus.com', password: 'password123', role: UserRole.SUB_ACCOUNT, isTrial: false, createdAt: '2023-06-15', status: 'Active', permissions: DEFAULT_SUB_PERMISSIONS },
];

const INITIAL_ITINERARIES: Itinerary[] = [
  { 
    id: 'it-1', 
    ownerId: 'admin-1', 
    groupName: 'Dubai Luxury Discovery', 
    startDate: '2025-05-01', 
    endDate: '2025-05-07', 
    paxCount: 12, 
    guideLanguage: 'Chinese', 
    status: 'Operational', 
    income: 45000, 
    tasks: [
      { id: 't1', itineraryId: 'it-1', type: ResourceType.HOTEL, description: 'Burj Al Arab Stay', date: '2025-05-01', endDate: '2025-05-03', status: TaskStatus.CONFIRMED, latestBookingDate: '2025-04-24', isResourceMatched: true, cost: 12000, confirmationNo: 'BAA-9981', time: '14:00', notes: 'Ocean view suite requested.' },
      { id: 't2', itineraryId: 'it-1', type: ResourceType.GUIDE, description: 'Mandarin Guide - 7 Days', date: '2025-05-01', endDate: '2025-05-07', status: TaskStatus.PENDING, latestBookingDate: '2025-01-10', isResourceMatched: false, cost: 3500, time: '09:00', endTime: '18:00' }
    ] 
  }
];

// Header styles constant for site-wide consistency
const PAGE_HEADER_CLASSES = {
  container: "mb-12",
  label: "text-[10px] font-black text-amber-600 uppercase tracking-[0.35em] leading-none",
  title: "text-3xl md:text-4xl 2xl:text-5xl font-serif font-bold tracking-tight leading-tight text-slate-900"
};

// --- Helpers ---
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
    case 'onGoing': return 'bg-emerald-100 text-emerald-700 border-emerald-200'; // Matched green in screenshot
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

const fileToBase64 = (file: File): Promise<{ data: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve({ data: base64Data, mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(INITIAL_USERS[0]); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [language, setLanguage] = useState<Language>('zh');
  const [itineraries, setItineraries] = useState<Itinerary[]>(INITIAL_ITINERARIES);
  const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES);
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [newItineraryId, setNewItineraryId] = useState<string | null>(null);
  
  // UI States
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  
  const [editingResource, setEditingResource] = useState<Partial<Resource> | null>(null);
  const [manualItinerary, setManualItinerary] = useState<Partial<Itinerary>>({});
  const [editingTask, setEditingTask] = useState<Partial<BookingTask>>({});
  const [editingUser, setEditingUser] = useState<Partial<UserAccount>>({});
  
  const [isParsing, setIsParsing] = useState(false);
  const [itineraryInput, setItineraryInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[language];

  const hasPerm = (perm: string) => currentUser?.permissions.includes(perm);

  // Access Guard: Prevent sub-accounts from accessing the accounts tab
  useEffect(() => {
    if (activeTab === 'accounts' && currentUser?.role !== UserRole.ADMIN) {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  const globalStats = useMemo(() => {
    let totalIncome = 0;
    let totalCost = 0;
    let pendingCount = 0;
    itineraries.forEach(it => {
      totalIncome += (it.income || 0);
      it.tasks.forEach(task => {
        totalCost += (task.cost || 0);
        if (task.status === TaskStatus.PENDING) pendingCount++;
      });
    });
    return { totalIncome, totalCost, netProfit: totalIncome - totalCost, pendingCount };
  }, [itineraries]);

  const alertsData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const alerts: { groupName: string; itineraryId: string; task: BookingTask; level: AlertLevel }[] = [];
    itineraries.forEach(it => {
      it.tasks.forEach(task => {
        if (task.status === TaskStatus.ALERT) {
          alerts.push({ groupName: it.groupName, itineraryId: it.id, task, level: AlertLevel.CRITICAL });
        } else if (task.status === TaskStatus.PENDING && task.latestBookingDate <= today) {
          alerts.push({ groupName: it.groupName, itineraryId: it.id, task, level: AlertLevel.WARNING });
        }
      });
    });
    return alerts.sort((a, b) => a.task.latestBookingDate.localeCompare(b.task.latestBookingDate));
  }, [itineraries]);

  const calendarData = useMemo(() => {
    const dayMap: Record<string, { groupName: string; task: BookingTask }[]> = {};
    itineraries.forEach(it => {
      it.tasks.forEach(task => {
        if (!dayMap[task.date]) dayMap[task.date] = [];
        dayMap[task.date].push({ groupName: it.groupName, task });
      });
    });
    const monthMap: Record<string, { date: string; tasks: { groupName: string; task: BookingTask }[] }[]> = {};
    Object.keys(dayMap).sort().forEach(date => {
      const monthKey = date.substring(0, 7);
      if (!monthMap[monthKey]) monthMap[monthKey] = [];
      monthMap[monthKey].push({ date, tasks: dayMap[date] });
    });
    return Object.keys(monthMap).sort().map(month => ({ month, days: monthMap[month] }));
  }, [itineraries]);

  const groupedResources = useMemo(() => {
    const map: Record<string, Record<string, Resource[]>> = {};
    resources.forEach(res => {
      if (!map[res.city]) map[res.city] = {};
      const typeKey = res.type as string;
      if (!map[res.city][typeKey]) map[res.city][typeKey] = [];
      map[res.city][typeKey].push(res);
    });
    return map;
  }, [resources]);

  const activeItinerary = useMemo(() => 
    itineraries.find(it => it.id === selectedItineraryId), 
    [itineraries, selectedItineraryId]
  );

  const handleSaveItineraryMeta = (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!manualItinerary.id;
    if (isEdit) {
      setItineraries(prev => prev.map(it => it.id === manualItinerary.id ? { ...it, ...manualItinerary } as Itinerary : it));
    } else {
      const newId = `it-${Date.now()}`;
      const entry: Itinerary = {
        id: newId,
        ownerId: currentUser?.id || 'admin-1',
        groupName: manualItinerary.groupName || '未命名团队',
        startDate: manualItinerary.startDate || '',
        endDate: manualItinerary.endDate || '',
        paxCount: Number(manualItinerary.paxCount) || 1,
        guideLanguage: manualItinerary.guideLanguage || 'Chinese',
        status: 'Draft',
        income: Number(manualItinerary.income) || 0,
        tasks: []
      };
      setItineraries([entry, ...itineraries]);
    }
    setItineraryModalOpen(false);
    setManualItinerary({});
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItineraryId) return;
    setItineraries(prev => prev.map(it => {
      if (it.id !== selectedItineraryId) return it;
      const newTask: BookingTask = {
        id: editingTask.id || `task-${Date.now()}`,
        itineraryId: selectedItineraryId,
        type: editingTask.type || ResourceType.OTHERS,
        description: editingTask.description || '',
        date: editingTask.date || it.startDate,
        endDate: editingTask.endDate || '',
        status: editingTask.status || TaskStatus.PENDING,
        latestBookingDate: editingTask.latestBookingDate || editingTask.date || it.startDate,
        isResourceMatched: false,
        cost: Number(editingTask.cost) || 0,
        time: editingTask.time || '',
        endTime: editingTask.endTime || '',
        notes: editingTask.notes || '',
        ...editingTask
      } as BookingTask;
      const existingTaskIdx = it.tasks.findIndex(t => t.id === newTask.id);
      const newTasks = existingTaskIdx > -1 
        ? it.tasks.map(t => t.id === newTask.id ? newTask : t)
        : [...it.tasks, newTask];
      return { ...it, tasks: newTasks };
    }));
    setTaskModalOpen(false);
    setEditingTask({});
  };

  const handleSaveResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource) return;
    const isEdit = !!editingResource.id;
    if (isEdit) {
      setResources(prev => prev.map(r => r.id === editingResource.id ? editingResource as Resource : r));
    } else {
      const newRes: Resource = {
        id: `res-${Date.now()}`,
        type: editingResource.type || ResourceType.OTHERS,
        name: editingResource.name || '',
        location: editingResource.location || 'UAE',
        city: editingResource.city || '',
        priceRange: editingResource.priceRange || '$$',
        rating: editingResource.rating || 0,
        tags: editingResource.tags || [],
        contact: editingResource.contact || '',
        cancelPolicy: editingResource.cancelPolicy || '',
      };
      setResources([newRes, ...resources]);
    }
    setResourceModalOpen(false);
    setEditingResource(null);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Logic Guard: Only Admins can modify account data or permissions
    if (currentUser?.role !== UserRole.ADMIN) {
      alert(language === 'zh' ? '无权操作：只有管理员可以管理账户' : 'Access Denied: Only Admins can manage accounts.');
      return;
    }

    const isEdit = !!editingUser.id;
    if (isEdit) {
      setUsers(prev => prev.map(u => {
        if (u.id === editingUser.id) {
          const updated = { ...u, ...editingUser };
          // Only update password if a new one was typed
          if (!editingUser.password) delete updated.password;
          return updated as UserAccount;
        }
        return u;
      }));
    } else {
      const newUser: UserAccount = {
        id: `user-${Date.now()}`,
        name: editingUser.name || '',
        email: editingUser.email || '',
        password: editingUser.password || 'password123',
        role: editingUser.role || UserRole.SUB_ACCOUNT,
        status: editingUser.status || 'Active',
        isTrial: false,
        createdAt: new Date().toISOString().split('T')[0],
        permissions: editingUser.role === UserRole.ADMIN ? ALL_PERMISSIONS : (editingUser.permissions || DEFAULT_SUB_PERMISSIONS),
      };
      setUsers([...users, newUser]);
    }
    setUserModalOpen(false);
    setEditingUser({});
  };

  const handleDeleteUser = (userId: string) => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    if (window.confirm(language === 'zh' ? '确定要删除该子账号吗？' : 'Are you sure you want to delete this sub-account?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleAIParse = async () => {
    if (!itineraryInput.trim() && !selectedFile) return;
    setIsParsing(true);
    try {
      let filePayload;
      let textContent = itineraryInput;
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop()?.toLowerCase();
        if (ext === 'docx') {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          textContent += `\n\n[Word Content]:\n${result.value}`;
        } else if (ext === 'xlsx' || ext === 'xls') {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          const sheetName = workbook.SheetNames[0];
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          textContent += `\n\n[Excel Content]:\n${csv}`;
        } else {
          filePayload = await fileToBase64(selectedFile);
        }
      }
      const result = await parseItinerary(textContent, filePayload);
      const newItId = `it-${Date.now()}`;
      const newIt: Itinerary = {
        id: newItId,
        ownerId: currentUser?.id || 'admin-1',
        groupName: result.groupName || '智能解析团队',
        startDate: result.startDate,
        endDate: result.endDate,
        paxCount: result.paxCount || 1,
        guideLanguage: result.guideLanguage || 'Chinese',
        status: 'Draft',
        income: result.estimatedIncome || 0,
        tasks: (result.tasks || []).map((t: any, idx: number) => ({
          id: `task-${Date.now()}-${idx}`,
          itineraryId: newItId,
          type: t.type as ResourceType,
          description: t.description,
          date: t.date,
          status: TaskStatus.PENDING,
          latestBookingDate: t.date,
          isResourceMatched: false,
          cost: t.estimatedCost || 0,
          time: t.time || '',
          endTime: t.endTime || '',
          notes: t.notes || ''
        }))
      };
      setItineraries([newIt, ...itineraries]);
      setNewItineraryId(newItId);
      setActiveTab('itineraries');
      setItineraryInput('');
      setSelectedFile(null);
      setTimeout(() => setNewItineraryId(null), 5000);
    } catch (error) {
      console.error(error);
      alert('AI 解析失败，请检查文件内容或尝试粘贴纯文本。');
    } finally {
      setIsParsing(false);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-8 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.liveTours}</p>
           <h4 className="text-3xl font-bold text-slate-900">{itineraries.length}</h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.pendingBookings}</p>
           <h4 className="text-3xl font-bold text-amber-500">{globalStats.pendingCount}</h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.urgentAlerts}</p>
           <h4 className={`text-3xl font-bold ${alertsData.length > 0 ? 'text-rose-500' : 'text-slate-900'}`}>{alertsData.length}</h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.totalRevenue}</p>
           <h4 className="text-2xl font-bold text-slate-900 leading-none flex items-baseline">
             <span className="text-xs mr-1 opacity-40 font-black">AED</span>
             {hasPerm('finance.viewRevenue') ? globalStats.totalIncome.toLocaleString() : '---'}
           </h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.totalCost}</p>
           <h4 className="text-2xl font-bold text-slate-900 leading-none flex items-baseline">
             <span className="text-xs mr-1 opacity-40 font-black">AED</span>
             {globalStats.totalCost.toLocaleString()}
           </h4>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">{t.stats.netProfit}</p>
           <h4 className={`text-2xl font-bold leading-none flex items-baseline ${globalStats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
             <span className="text-xs mr-1 opacity-40 font-black">AED</span>
             {hasPerm('finance.viewProfit') ? globalStats.netProfit.toLocaleString() : '---'}
           </h4>
        </div>
      </div>
      
      {hasPerm('itinerary.create') && (
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden group">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">{t.dashboard.parseTitle}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">AI 自动同步行程并计算运营利润</p>
            </div>
            <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-4 py-1.5 rounded-full uppercase border border-amber-100">Smart Engine v3.1</span>
          </div>
          <div className="relative">
            <textarea 
              className="w-full h-56 p-6 bg-slate-50 border-none rounded-3xl outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium text-slate-700 scrollbar-hide pb-20 text-lg leading-relaxed"
              placeholder={t.dashboard.placeholder}
              value={itineraryInput}
              onChange={(e) => setItineraryInput(e.target.value)}
            />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}/>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center space-x-3 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg ${selectedFile ? 'bg-amber-100 text-amber-700 shadow-amber-200/50' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-100'}`}
                >
                  <ICONS.Clip />
                  <span>{selectedFile ? selectedFile.name : t.dashboard.attach}</span>
                </button>
              </div>
            </div>
          </div>
          <button 
            onClick={handleAIParse}
            disabled={isParsing}
            className={`mt-6 w-full py-5 text-white font-black uppercase tracking-[0.3em] rounded-3xl shadow-2xl transition-all active:scale-[0.98] ${isParsing ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800'}`}
          >
            {isParsing ? t.dashboard.processing : t.dashboard.extractBtn}
          </button>
        </div>
      )}
    </div>
  );

  const renderItineraries = () => (
    <div className="space-y-10 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-serif font-bold text-slate-900">{t.itineraries.title}</h3>
        {hasPerm('itinerary.create') && (
          <button 
            onClick={() => { setManualItinerary({}); setItineraryModalOpen(true); }}
            className="bg-slate-900 text-white px-8 py-4 rounded-3xl flex items-center space-x-2 text-sm font-black uppercase tracking-widest shadow-xl hover:bg-amber-500 hover:text-slate-900 transition-all"
          >
            <ICONS.Plus /> <span>{t.itineraries.newEntry}</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6">
        {itineraries.map(it => {
          const totalExp = it.tasks.reduce((acc, task) => acc + (task.cost || 0), 0);
          const operator = users.find(u => u.id === it.ownerId);
          const operatorName = operator ? operator.name.toUpperCase() : 'UNKNOWN';
          const profit = (it.income || 0) - totalExp;
          
          const phase = getTripPhase(it.startDate, it.endDate);
          const phaseStyle = getTripPhaseStyle(phase);
          const phaseLabel = (t.phases as any)[phase];

          return (
            <div key={it.id} className={`bg-white p-10 rounded-[3rem] border ${newItineraryId === it.id ? 'border-amber-400 shadow-2xl' : 'border-slate-50'} shadow-sm flex flex-col lg:flex-row items-center justify-between transition-all group relative overflow-hidden`}>
              <div className="flex flex-col space-y-6 flex-1 w-full lg:w-auto">
                <div className="flex items-center space-x-6">
                  <span className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${phaseStyle}`}>
                    {phaseLabel}
                  </span>
                  <div className="flex items-center group/title">
                    <h4 className="text-2xl font-bold text-slate-900 tracking-tight">{it.groupName}</h4>
                    {hasPerm('itinerary.create') && (
                      <button 
                        onClick={() => { setManualItinerary(it); setItineraryModalOpen(true); }}
                        className="ml-3 p-2 text-slate-200 hover:text-amber-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <ICONS.Edit />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                  <div className="flex items-center space-x-3 text-slate-400 font-bold uppercase tracking-widest text-[11px]">
                    <ICONS.Calendar />
                    <span>{it.startDate} - {it.endDate}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-slate-400 font-bold uppercase tracking-widest text-[11px] group/pax">
                    <ICONS.Resource />
                    <span>{it.paxCount} 人数</span>
                    {hasPerm('itinerary.create') && (
                      <button 
                        onClick={() => { setManualItinerary(it); setItineraryModalOpen(true); }}
                        className="p-1 text-slate-200 hover:text-amber-500 transition-all opacity-0 group-hover/pax:opacity-100"
                        title="手动修改人数"
                      >
                        <ICONS.Edit />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-slate-300 font-bold uppercase tracking-widest text-[11px]">
                    <ICONS.Dashboard />
                    <span>所属账号: {operatorName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-12 mt-8 lg:mt-0 px-10 border-l border-slate-50">
                <div className="text-center min-w-[120px] group/income">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">总收入</p>
                  <div className="flex items-center justify-center space-x-2">
                    <p className="text-xl font-black text-slate-900">AED {hasPerm('finance.viewRevenue') ? (it.income || 0).toLocaleString() : '---'}</p>
                    {hasPerm('finance.editRevenue') && (
                      <button 
                        onClick={() => { setManualItinerary(it); setItineraryModalOpen(true); }}
                        className="p-1.5 text-slate-200 hover:text-amber-500 transition-all opacity-0 group-hover/income:opacity-100"
                        title="手动输入总收入"
                      >
                        <ICONS.Edit />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-center min-w-[120px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">总花费</p>
                  <p className="text-xl font-bold text-rose-500">AED {totalExp.toLocaleString()}</p>
                </div>
                <div className="text-center min-w-[140px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">净利润</p>
                  <div className="flex flex-col items-center">
                    <p className={`text-2xl font-black ${profit >= 0 ? 'text-emerald-500' : 'text-rose-600'}`}>
                      AED {hasPerm('finance.viewProfit') ? profit.toLocaleString() : '---'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="ml-8">
                <button 
                  onClick={() => { setSelectedItineraryId(it.id); setActiveTab('group-board'); }}
                  className="bg-[#0F172A] text-white hover:bg-amber-500 hover:text-slate-900 px-10 py-5 rounded-[1.75rem] text-sm font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
                >
                  管理
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAccounts = () => {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'Active').length;
    const totalTeams = itineraries.length;
    const totalPendingTasks = itineraries.reduce((sum, it) => sum + it.tasks.filter(t => t.status === TaskStatus.PENDING).length, 0);

    return (
      <div className="space-y-10 animate-fadeIn">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">子账号总数</p>
            <h4 className="text-3xl font-bold text-slate-900">{totalUsers}</h4>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">活跃账号</p>
            <h4 className="text-3xl font-bold text-emerald-500">{activeUsers}</h4>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">负责团队数</p>
            <h4 className="text-3xl font-bold text-slate-900">{totalTeams}</h4>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-4">待处理任务数</p>
            <h4 className="text-3xl font-bold text-amber-500">{totalPendingTasks}</h4>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-serif font-bold text-slate-900">子账号管理</h3>
            <button 
              onClick={() => { setEditingUser({ role: UserRole.SUB_ACCOUNT, permissions: DEFAULT_SUB_PERMISSIONS }); setUserModalOpen(true); }}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center space-x-2 text-sm font-black uppercase tracking-widest shadow-xl hover:bg-amber-500 hover:text-slate-900 transition-all"
            >
              <ICONS.Plus /> <span>新增子账号</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">姓名</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">邮箱</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">角色</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">状态</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">负责团队</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">待处理任务</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">创建时间</th>
                  <th className="pb-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((user) => {
                  const managedCount = itineraries.filter(it => it.ownerId === user.id).length;
                  const pendingCount = itineraries
                    .filter(it => it.ownerId === user.id)
                    .reduce((sum, it) => sum + it.tasks.filter(t => t.status === TaskStatus.PENDING).length, 0);

                  return (
                    <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-6 font-bold text-slate-900">{user.name}</td>
                      <td className="py-6 text-sm text-slate-500">{user.email}</td>
                      <td className="py-6">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${user.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-6 text-center">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {user.status || 'Active'}
                        </span>
                      </td>
                      <td className="py-6 text-center font-bold text-slate-900">{managedCount}</td>
                      <td className="py-6 text-center font-bold text-amber-500">{pendingCount}</td>
                      <td className="py-6 text-sm text-slate-400">{user.createdAt}</td>
                      <td className="py-6 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => { setEditingUser(user); setUserModalOpen(true); }}
                            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all shadow-sm"
                          >
                            <ICONS.Edit />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-white rounded-lg transition-all shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderUserModal = () => {
    if (!userModalOpen) return null;
    
    // isTargetAdmin: True if the account being edited has Admin role.
    // Permissions are forced for Admin role, but selectable for Sub-Account.
    const isTargetAdmin = editingUser.role === UserRole.ADMIN;
    const currentPermissions = editingUser.permissions || [];

    const togglePermission = (key: string) => {
      // If the target role is Admin, don't allow toggling (they get everything)
      if (isTargetAdmin) return;
      
      const perms = [...currentPermissions];
      if (perms.includes(key)) {
        setEditingUser({ ...editingUser, permissions: perms.filter(p => p !== key) });
      } else {
        setEditingUser({ ...editingUser, permissions: [...perms, key] });
      }
    };

    const renderPermGroup = (title: string, keys: string[]) => (
      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-amber-500 pl-3 ml-1">{title}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-1">
          {keys.map(key => {
            const isChecked = isTargetAdmin || currentPermissions.includes(key);
            return (
              <div 
                key={key} 
                onClick={() => togglePermission(key)}
                className={`flex items-start space-x-3 p-3 bg-slate-50 rounded-2xl border transition-all group cursor-pointer ${isTargetAdmin ? 'opacity-70 grayscale-[0.5]' : 'hover:border-slate-200'}`}
              >
                <input 
                  type="checkbox" 
                  readOnly
                  checked={isChecked}
                  className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-amber-500 focus:ring-amber-500 transition-all pointer-events-none"
                />
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-wide leading-tight ${isChecked ? 'text-slate-900' : 'text-slate-400'}`}>
                    {(t.permissions as any)[key].label}
                  </p>
                  <p className="text-[9px] text-slate-500 font-medium leading-normal mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    {(t.permissions as any)[key].desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-fadeIn">
        <div className="bg-white w-full max-w-3xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp max-h-[90vh] flex flex-col">
          <div className="bg-slate-900 p-12 text-white flex justify-between items-center shrink-0">
            <h3 className="text-3xl font-serif font-bold">{editingUser.id ? '编辑子账号' : '新增子账号'}</h3>
            <button onClick={() => setUserModalOpen(false)} className="p-4 hover:bg-white/10 rounded-full transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
          </div>
          <form onSubmit={handleSaveUser} className="p-12 space-y-10 overflow-y-auto scrollbar-hide">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">姓名</label>
                <input type="text" value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">邮箱地址</label>
                <input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  {editingUser.id ? '修改密码 (留空则不修改)' : '登录密码'}
                </label>
                <input 
                  type="password" 
                  value={editingUser.password || ''} 
                  onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
                  placeholder={editingUser.id ? '••••••••' : '设置初始密码'}
                  className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500" 
                  required={!editingUser.id} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">账号状态</label>
                <select value={editingUser.status || 'Active'} onChange={e => setEditingUser({...editingUser, status: e.target.value as 'Active' | 'Suspended'})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none focus:ring-2 focus:ring-amber-500">
                  <option value="Active">活跃 (Active)</option>
                  <option value="Suspended">已停用 (Suspended)</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">系统角色</label>
                <select value={editingUser.role || UserRole.SUB_ACCOUNT} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole, permissions: e.target.value === UserRole.ADMIN ? ALL_PERMISSIONS : DEFAULT_SUB_PERMISSIONS})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none focus:ring-2 focus:ring-amber-500">
                  <option value={UserRole.ADMIN}>Admin</option>
                  <option value={UserRole.SUB_ACCOUNT}>Sub-Account</option>
                </select>
              </div>
            </div>

            <div className="space-y-8 pt-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-xl font-bold text-slate-900">{t.permissions.sectionTitle}</h3>
                {!isTargetAdmin && (
                  <button 
                    type="button"
                    onClick={() => setEditingUser({...editingUser, permissions: DEFAULT_SUB_PERMISSIONS})}
                    className="text-[10px] font-black text-amber-600 uppercase tracking-widest hover:text-amber-700 transition-colors"
                  >
                    {t.permissions.restoreDefault}
                  </button>
                )}
              </div>
              
              {renderPermGroup(t.permissions.categories.itinerary, ['itinerary.view', 'itinerary.create', 'itinerary.assignOwner'])}
              {renderPermGroup(t.permissions.categories.task, ['task.view', 'task.editCost', 'task.editStatus', 'task.editDetails'])}
              {renderPermGroup(t.permissions.categories.finance, ['finance.viewRevenue', 'finance.editRevenue', 'finance.viewProfit'])}
            </div>

            <button type="submit" className="w-full py-5 bg-slate-900 text-amber-500 font-black rounded-3xl shadow-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] mt-6">
              {editingUser.id ? '保存更改' : '创建子账号'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderCalendar = () => (
    <div className="space-y-12 animate-fadeIn pb-32">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-slate-900 tracking-tight">{t.calendar.title}</h2>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-[0.3em] mt-3">Operational Timeline</p>
        </div>
      </div>
      <div className="space-y-24">
        {calendarData.map(group => (
          <div key={group.month} className="space-y-12">
            <div className="flex items-center space-x-6">
              <h3 className="text-4xl font-serif font-bold text-slate-900 opacity-80">{group.month}</h3>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>
            <div className="space-y-16">
              {group.days.map(day => (
                <div key={day.date} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden animate-slideUp">
                  <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center space-x-6">
                      <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border-4 border-white shadow-lg ring-2 ring-amber-500">
                        <div className="w-4 h-4 bg-amber-500 rounded-full"></div>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none">{day.date}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{getWeekday(day.date, language)}</p>
                      </div>
                    </div>
                    <span className="px-5 py-2 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-full tracking-[0.2em] border border-amber-100">
                      {t.calendar.taskCount.replace('{count}', day.tasks.length.toString())}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {day.tasks.map((item, idx) => (
                      <div key={`${day.date}-${idx}`} onClick={() => { setSelectedItineraryId(item.task.itineraryId); setEditingTask(item.task); setTaskModalOpen(true); }} className="bg-[#F8FAFC] p-8 rounded-[2.5rem] border border-slate-100 transition-all hover:shadow-2xl hover:bg-white hover:-translate-y-1 group cursor-pointer">
                        <div className="relative z-10 h-full flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-6">
                              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest truncate max-w-[60%] leading-none">{item.groupName}</p>
                              <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 uppercase leading-none">
                                <ICONS.Calendar />
                                <span>{item.task.time || 'All Day'}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-5 mb-6">
                              <div className={`w-16 h-16 flex-shrink-0 flex items-center justify-center rounded-[1.75rem] ${getResourceColor(item.task.type)} shadow-inner`}><span className="text-3xl">{getResourceIcon(item.task.type)}</span></div>
                              <div className="min-w-0">
                                <h5 className="text-lg font-bold text-slate-800 leading-tight mb-1 truncate">{item.task.description}</h5>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.task.type}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${item.task.status === TaskStatus.CONFIRMED ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.task.status}</span>
                            <p className="text-xs font-bold text-slate-900">AED {(item.task.cost || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div className="space-y-8 animate-fadeIn">
      {alertsData.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {alertsData.map((alert, idx) => (
            <div key={idx} className={`p-8 rounded-[2.5rem] border flex items-center justify-between ${alert.level === AlertLevel.CRITICAL ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center space-x-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${alert.level === AlertLevel.CRITICAL ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-900'}`}><ICONS.Alert /></div>
                <div>
                  <h4 className="font-bold text-slate-900">{alert.groupName}</h4>
                  <p className="text-sm text-slate-600 mt-1">{alert.task.type}: {alert.task.description}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedItineraryId(alert.itineraryId); setActiveTab('group-board'); }} className="bg-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:shadow-md transition-all">{t.alerts.solve}</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><ICONS.Check /></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest">{t.alerts.noAlerts}</p>
        </div>
      )}
    </div>
  );

  const renderResources = () => (
    <div className="space-y-16 animate-fadeIn pb-32">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-slate-900 tracking-tight">{t.resources.title}</h2>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-[0.3em] mt-3">Verified Local Suppliers</p>
        </div>
        <button onClick={() => { setEditingResource({}); setResourceModalOpen(true); }} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] flex items-center space-x-3 text-sm font-black uppercase tracking-widest shadow-2xl hover:bg-amber-500 hover:text-slate-900 transition-all"><ICONS.Plus /> <span>{t.resources.addNew}</span></button>
      </div>
      <div className="space-y-24">
        {Object.keys(groupedResources).sort().map(city => (
          <div key={city} className="space-y-10">
            <div className="flex items-center space-x-6">
              <div className="px-6 py-2 bg-slate-900 text-amber-500 text-xl font-black rounded-2xl shadow-lg uppercase tracking-widest">{city}</div>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>
            <div className="grid grid-cols-1 gap-12">
              {Object.keys(groupedResources[city]).map(type => (
                <div key={`${city}-${type}`} className="space-y-6">
                  <h4 className="flex items-center space-x-3 text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                    <span>{getResourceIcon(type as ResourceType)}</span>
                    <span>{type}</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedResources[city][type].map(res => (
                      <div key={res.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-2xl transition-all relative">
                        <div>
                          <div className="flex justify-between items-start mb-6">
                            <div className={`w-14 h-14 flex items-center justify-center rounded-[1.25rem] ${getResourceColor(res.type)} shadow-inner`}><span className="text-2xl">{getResourceIcon(res.type)}</span></div>
                            <button onClick={() => { setEditingResource(res); setResourceModalOpen(true); }} className="p-3 text-slate-200 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"><ICONS.Edit /></button>
                          </div>
                          <h5 className="text-xl font-bold text-slate-900 mb-2 leading-tight">{res.name}</h5>
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4">{res.priceRange}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-4">{res.contact}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {res.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-slate-50 text-[9px] font-black text-slate-500 rounded-full border border-slate-100 uppercase">{tag}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderResourceModal = () => {
    if (!resourceModalOpen || !editingResource) return null;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-fadeIn">
        <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp">
          <div className="bg-slate-900 p-12 text-white flex justify-between items-center">
            <h3 className="text-3xl font-serif font-bold">{editingResource.id ? '编辑资源详情' : '录入新资源'}</h3>
            <button onClick={() => setResourceModalOpen(false)} className="p-4 hover:bg-white/10 rounded-full transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
          </div>
          <form onSubmit={handleSaveResource} className="p-12 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-hide">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">资源名称</label>
              <input type="text" value={editingResource.name || ''} onChange={e => setEditingResource({...editingResource, name: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800" required />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">资源类型</label>
                <select value={editingResource.type || ResourceType.OTHERS} onChange={e => setEditingResource({...editingResource, type: e.target.value as ResourceType})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none">{Object.values(ResourceType).map(v => <option key={v} value={v}>{v}</option>)}</select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">城市</label>
                <input type="text" value={editingResource.city || ''} onChange={e => setEditingResource({...editingResource, city: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">联系信息</label>
                <input type="text" value={editingResource.contact || ''} onChange={e => setEditingResource({...editingResource, contact: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">价格档位</label>
                <input type="text" value={editingResource.priceRange || '$$'} onChange={e => setEditingResource({...editingResource, priceRange: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold" />
              </div>
            </div>
            <button type="submit" className="w-full py-5 bg-slate-900 text-amber-500 font-black rounded-3xl shadow-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] mt-8">保存资源信息</button>
          </form>
        </div>
      </div>
    );
  };

  const renderTaskModal = () => {
    if (!taskModalOpen || !selectedItineraryId) return null;
    const itinerary = itineraries.find(it => it.id === selectedItineraryId);
    const canEditDetails = hasPerm('task.editDetails') || !editingTask.id;
    const canEditStatus = hasPerm('task.editStatus');
    const canEditCost = hasPerm('task.editCost');
    
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4 animate-fadeIn">
        <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp">
          <div className="bg-slate-900 p-12 text-white flex justify-between items-center">
            <div>
              <h3 className="text-3xl font-serif font-bold">{editingTask.id ? t.modals.editTaskTitle : t.modals.newTaskTitle}</h3>
              {itinerary && (
                <p className="text-amber-500 text-[11px] font-black uppercase tracking-widest mt-2 flex items-center opacity-80">
                  <span className="mr-2">FOR:</span> {itinerary.groupName}
                </p>
              )}
            </div>
            <button onClick={() => setTaskModalOpen(false)} className="p-4 hover:bg-white/10 rounded-full transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
          </div>
          <form onSubmit={handleSaveTask} className="p-12 space-y-6 max-h-[85vh] overflow-y-auto scrollbar-hide">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.description}</label>
              <input disabled={!canEditDetails} type="text" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:opacity-50" required />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.type}</label>
                <select disabled={!canEditDetails} value={editingTask.type || ResourceType.OTHERS} onChange={e => setEditingTask({...editingTask, type: e.target.value as ResourceType})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50">{Object.values(ResourceType).map(v => <option key={v} value={v}>{v}</option>)}</select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.status}</label>
                <select disabled={!canEditStatus} value={editingTask.status || TaskStatus.PENDING} onChange={e => setEditingTask({...editingTask, status: e.target.value as TaskStatus})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50">{Object.values(TaskStatus).map(v => <option key={v} value={v}>{v}</option>)}</select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.serviceDate}</label>
                <input disabled={!canEditDetails} type="date" value={editingTask.date || ''} onChange={e => setEditingTask({...editingTask, date: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500 disabled:opacity-50" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.serviceEndDate}</label>
                <input disabled={!canEditDetails} type="date" value={editingTask.endDate || ''} onChange={e => setEditingTask({...editingTask, endDate: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500 disabled:opacity-50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.startTime}</label>
                <input disabled={!canEditDetails} type="time" value={editingTask.time || ''} onChange={e => setEditingTask({...editingTask, time: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500 disabled:opacity-50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.cost}</label>
                <div className="relative"><span className="absolute left-7 top-4 text-xs font-black text-slate-300">AED</span><input disabled={!canEditCost} type="number" value={editingTask.cost || ''} onChange={e => setEditingTask({...editingTask, cost: Number(e.target.value)})} className="w-full pl-16 pr-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500 disabled:opacity-50" placeholder="0.00" /></div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.notes}</label>
              <textarea disabled={!canEditDetails} value={editingTask.notes || ''} onChange={e => setEditingTask({...editingTask, notes: e.target.value})} placeholder={t.modals.notesPlaceholder} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-medium text-slate-700 min-h-[120px] focus:ring-2 focus:ring-amber-500 resize-none scrollbar-hide disabled:opacity-50" />
            </div>
            <button type="submit" className="w-full py-5 bg-slate-900 text-amber-500 font-black rounded-3xl shadow-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] mt-6">{t.modals.save}</button>
          </form>
        </div>
      </div>
    );
  };

  const renderGroupBoard = () => {
    if (!activeItinerary) return null;
    return (
      <div className="space-y-12 animate-fadeIn pb-32">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
          <div className="flex items-center space-x-8">
            <button onClick={() => setActiveTab('itineraries')} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></button>
            <div>
              <h2 className="text-3xl font-serif font-bold text-slate-900">{activeItinerary.groupName}</h2>
              <div className="flex items-center space-x-6 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                <span>{activeItinerary.startDate} - {activeItinerary.endDate}</span>
                <span>•</span>
                <span>{activeItinerary.paxCount} {t.itineraries.pax}</span>
              </div>
            </div>
          </div>
          <button onClick={() => { setEditingTask({}); setTaskModalOpen(true); }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center space-x-2 text-xs font-black uppercase tracking-widest shadow-xl hover:bg-amber-500 hover:text-slate-900 transition-all"><ICONS.Plus /> <span>{t.itineraries.addTask}</span></button>
        </div>
        <div className="space-y-6">
          {activeItinerary.tasks.map(task => (
            <div key={task.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center group hover:shadow-xl transition-all">
              <div className="flex items-center space-x-8 flex-1">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${getResourceColor(task.type)}`}>{getResourceIcon(task.type)}</div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{task.type}</span>
                  <h5 className="text-lg font-bold text-slate-900">{task.description}</h5>
                </div>
              </div>
              <div className="flex items-center space-x-12 mt-6 md:mt-0">
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${task.status === TaskStatus.CONFIRMED ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{task.status}</span>
                <p className="font-bold text-slate-900">AED {(task.cost || 0).toLocaleString()}</p>
                <button onClick={() => { setEditingTask(task); setTaskModalOpen(true); }} className="p-4 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-all"><ICONS.Edit /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      <Sidebar activeTab={activeTab === 'group-board' ? 'itineraries' : activeTab} setActiveTab={setActiveTab} language={language} setLanguage={setLanguage} currentUser={currentUser} onSignOut={() => setCurrentUser(null)} />
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
            {activeTab === 'group-board' && (language === 'zh' ? '团队运营看板' : 'Group Operations Board')}
          </h1>
        </header>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'itineraries' && renderItineraries()}
        {activeTab === 'calendar' && renderCalendar()}
        {activeTab === 'resources' && renderResources()}
        {activeTab === 'alerts' && renderAlerts()}
        {activeTab === 'accounts' && renderAccounts()}
        {activeTab === 'group-board' && renderGroupBoard()}
      </main>

      {userModalOpen && renderUserModal()}

      {itineraryModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/70 backdrop-blur-xl p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-slideUp">
            <div className="bg-slate-900 p-12 text-white flex justify-between items-center">
              <h3 className="text-3xl font-serif font-bold">{manualItinerary.id ? (language === 'zh' ? '编辑行程信息' : 'Edit Itinerary') : t.modals.manualTitle}</h3>
              <button onClick={() => setItineraryModalOpen(false)} className="p-4 hover:bg-white/10 rounded-full transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            <form onSubmit={handleSaveItineraryMeta} className="p-12 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.groupName}</label>
                <input type="text" value={manualItinerary.groupName || ''} onChange={e => setManualItinerary({...manualItinerary, groupName: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-500" required />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.paxCount}</label>
                  <input type="number" value={manualItinerary.paxCount || ''} onChange={e => setManualItinerary({...manualItinerary, paxCount: Number(e.target.value)})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.grossIncome}</label>
                  <div className="relative">
                    <span className="absolute left-7 top-4 text-xs font-black text-slate-300">AED</span>
                    <input disabled={!hasPerm('finance.editRevenue')} type="number" value={manualItinerary.income || ''} onChange={e => setManualItinerary({...manualItinerary, income: Number(e.target.value)})} className="w-full pl-16 pr-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500 disabled:opacity-50" placeholder="0.00" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.startDate}</label>
                  <input type="date" value={manualItinerary.startDate || ''} onChange={e => setManualItinerary({...manualItinerary, startDate: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.modals.endDate}</label>
                  <input type="date" value={manualItinerary.endDate || ''} onChange={e => setManualItinerary({...manualItinerary, endDate: e.target.value})} className="w-full px-7 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500" required />
                </div>
              </div>
              <button type="submit" className="w-full py-5 bg-amber-500 text-slate-900 font-black rounded-3xl shadow-2xl hover:bg-amber-400 transition-all uppercase tracking-[0.2em] mt-6">{manualItinerary.id ? (language === 'zh' ? '保存更改' : 'Save Changes') : t.modals.create}</button>
            </form>
          </div>
        </div>
      )}
      {taskModalOpen && renderTaskModal()}
      {resourceModalOpen && renderResourceModal()}
    </div>
  );
};

export default App;
