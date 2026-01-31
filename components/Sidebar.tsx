
import React from 'react';
import { ICONS } from '../constants';
import { Language, translations } from '../translations';
import { UserRole, UserAccount } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentUser: UserAccount | null;
  onSignOut: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, language, setLanguage, currentUser, onSignOut }) => {
  const t = translations[language];
  
  // 核心导航列表
  const menuItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: <ICONS.Dashboard /> },
    { id: 'itineraries', label: t.nav.itineraries, icon: <ICONS.Itinerary /> },
    { id: 'calendar', label: t.nav.calendar, icon: <ICONS.Calendar /> },
    { id: 'alerts', label: t.nav.alerts, icon: <ICONS.Alert /> },
    { id: 'resources', label: t.nav.resources, icon: <ICONS.Map /> },
  ];

  // 角色权限守卫：仅 Admin 显示 Accounts 菜单
  const filteredMenuItems = currentUser?.role === UserRole.ADMIN 
    ? [...menuItems, { id: 'accounts', label: t.nav.accounts, icon: <ICONS.Resource /> }]
    : menuItems;

  if (!currentUser) return null;

  return (
    <aside className="w-64 bg-slate-900 h-screen text-slate-300 flex flex-col fixed left-0 top-0 z-50 shadow-2xl">
      <div className="p-8">
        <h1 className="text-2xl font-serif font-bold text-amber-500 tracking-wider leading-none">{t.appName}</h1>
        <p className="text-[10px] text-slate-600 mt-2 uppercase font-black tracking-tighter">{t.portalSub}</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-6">
        {filteredMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center space-x-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${
              activeTab === item.id 
                ? 'bg-amber-500 text-slate-900 font-bold shadow-xl shadow-amber-500/20 translate-x-1' 
                : 'hover:bg-slate-800 hover:text-white text-slate-500'
            }`}
          >
            <span className={activeTab === item.id ? 'scale-110' : 'group-hover:scale-110 transition-transform'}>
              {item.icon}
            </span>
            <span className="text-sm tracking-wide">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="px-8 py-5 flex items-center justify-between border-t border-slate-800/50">
        <span className="text-[10px] font-black text-slate-600 uppercase">Lang</span>
        <div className="flex bg-slate-800/50 rounded-xl p-0.5">
          <button 
            onClick={() => setLanguage('en')}
            className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all ${language === 'en' ? 'bg-amber-500 text-slate-900' : 'text-slate-500'}`}
          >EN</button>
          <button 
            onClick={() => setLanguage('zh')}
            className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all ${language === 'zh' ? 'bg-amber-500 text-slate-900' : 'text-slate-500'}`}
          >中文</button>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800/50">
        <div className="flex flex-col space-y-4 p-4 bg-slate-800/30 rounded-3xl border border-slate-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-sm font-black text-white shadow-lg">
              {currentUser.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="text-sm overflow-hidden">
              <p className="font-bold text-white truncate leading-none mb-1">{currentUser.name}</p>
              <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest mt-1">
                {currentUser.role}
              </p>
            </div>
          </div>
          <button 
            onClick={onSignOut}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-red-900/40 hover:text-red-400 transition-all text-[10px] font-black uppercase tracking-[0.2em] border border-slate-700/50"
          >
            {t.sidebar.signOut}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
