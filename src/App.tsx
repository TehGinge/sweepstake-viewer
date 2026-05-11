import React, { useEffect, useMemo, useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { SetupTab } from './components/SetupTab';
import { HomeTab } from './components/HomeTab';
import { GroupsTab } from './components/GroupsTab';
import { MatchesTab } from './components/MatchesTab';
import { Settings, X } from 'lucide-react';
import { CONTROLS, SURFACES, TEXT } from './utils/theme';

type TabType = 'SETUP' | 'HOME' | 'GROUPS' | 'MATCHES';

const getHashParams = (hash: string): URLSearchParams => {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(normalized);
};

const clearGameHashParam = (): void => {
  const params = getHashParams(window.location.hash);
  params.delete('game');
  const nextHash = params.toString();
  window.location.hash = nextHash;
};

function MainApp() {
  const [activeTab, setActiveTab] = useState<TabType>('HOME');
  const [targetGroup, setTargetGroup] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme-dark');
    if (stored !== null) return stored === 'true';
    return true; // Default to true
  });
  
  const {
    tournamentId,
    setTournamentId,
    settings,
    updateSettings,
    matches,
    setMatches,
    isReadOnly,
    cloudGameId,
    cloudStatus,
    cloudError,
    isCloudOwner,
  } = useAppContext();

  useEffect(() => {
    if (isReadOnly && activeTab === 'SETUP') {
      setActiveTab('HOME');
    }
  }, [isReadOnly, activeTab]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme-dark', String(isDarkMode));
  }, [isDarkMode]);

  // Get the display year based on tournamentId
  const getTournamentYear = () => {
    switch (tournamentId) {
      case 'WC26': return '2026';
      case 'EURO28': return '2028';
      default: return '';
    }
  };

  const getTournamentName = () => {
    if (tournamentId.startsWith('WC')) return `WORLD CUP ${getTournamentYear()}`;
    if (tournamentId.startsWith('EURO')) return `EURO ${getTournamentYear()}`;
    return '';
  };

  const handleSimulateSteps = (count: number) => {
    // Sort matches by date to ensure proper timeline
    const sortedMatches = [...matches].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Determine the split point
    const toSimulate = sortedMatches.slice(0, count);
    const toClear = sortedMatches.slice(count);

    // Create a new match array
    setMatches(prevMatches => {
      return prevMatches.map(m => {
        const wouldSimulate = toSimulate.find(s => s.id === m.id);
        const wouldClear = toClear.find(s => s.id === m.id);

        if (wouldSimulate) {
          if (m.homeTeamId && m.awayTeamId && m.homeScore === null) {
            let hScore = Math.floor(Math.random() * 4);
            let aScore = Math.floor(Math.random() * 4);
            // No draws in knockouts
            if (m.stage !== 'GROUP' && hScore === aScore) {
              hScore += 1;
            }
            return {
              ...m,
              homeScore: hScore,
              awayScore: aScore,
              status: 'FINISHED'
            };
          }
        } else if (wouldClear) {
          if (m.homeScore !== null || m.awayScore !== null) {
            return {
              ...m,
              homeScore: null,
              awayScore: null,
              status: 'SCHEDULED'
            };
          }
        }
        return m;
      });
    });
  };

  // calculate current simulated count
  const simCount = matches.filter(m => m.homeScore !== null).length;

  return (
    <div className="min-h-screen font-sans flex flex-col overflow-x-hidden transition-colors bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      <header className="px-4 md:px-8 py-4 flex flex-col md:flex-row items-center justify-between shadow-lg z-10 sticky top-0 gap-4 md:gap-0 border-b transition-colors bg-white/95 dark:bg-slate-950 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm p-1.5 bg-emerald-100 dark:bg-white border border-emerald-200 dark:border-transparent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 w-full h-full">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <circle cx="12" cy="12" r="3" />
              <path d="M2 9h3v6H2" />
              <path d="M22 9h-3v6h3" />
            </svg>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-slate-900 dark:text-white drop-shadow-sm">{getTournamentName()}</span>
            <span className="text-emerald-600 dark:text-emerald-400 drop-shadow-sm">{settings.customTitle !== undefined ? settings.customTitle : 'SWEEPSTAKE'}</span>
            {isReadOnly && (
              <span className="ml-auto md:ml-2 text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Live
              </span>
            )}
            {!isReadOnly && cloudGameId && (
              <span className="ml-auto md:ml-2 text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live
              </span>
            )}
            {!isReadOnly && (
              <select
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value as any)}
                className={`ml-auto md:ml-2 text-xs font-bold rounded px-2 py-1 ${CONTROLS.input}`}
              >
                <option value="WC26">World Cup 2026</option>
                <option value="EURO28">Euro 2028</option>
              </select>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="ml-auto md:ml-2 p-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <Settings size={18} />
            </button>
          </h1>
        </div>
        <div className="w-full md:w-auto">
          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} showSetup={!isReadOnly} />
        </div>
      </header>

      <main className="flex-1 py-8 px-4 md:px-8 h-full space-y-4">
        {cloudError && (
          <div className="max-w-6xl mx-auto rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 px-4 py-3 text-sm font-semibold flex flex-wrap items-center justify-between gap-3">
            <span>{cloudError}</span>
            {cloudGameId && (
              <button
                onClick={clearGameHashParam}
                className="px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-widest bg-white/80 dark:bg-slate-900/70 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-white dark:hover:bg-slate-900"
              >
                Continue in Local Mode
              </button>
            )}
          </div>
        )}

        {cloudGameId && cloudStatus === 'connecting' && (
          <div className="max-w-6xl mx-auto rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 px-4 py-3 text-sm font-semibold">
            Connecting to live game...
          </div>
        )}

        {activeTab === 'SETUP' && !isReadOnly && <SetupTab />}
        {activeTab === 'HOME' && <HomeTab setActiveTab={setActiveTab} onNavigateToGroup={(group) => { setActiveTab('GROUPS'); setTargetGroup(group); }} />}
        {activeTab === 'GROUPS' && <GroupsTab initialGroup={targetGroup} onGroupHandled={() => setTargetGroup(null)} />}
        {activeTab === 'MATCHES' && <MatchesTab />}
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${SURFACES.card} rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col`}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className={`text-xl font-black ${TEXT.primary}`}>Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-bold ${TEXT.secondary}`}>Dark Mode</h3>
                  <p className={`text-xs ${TEXT.muted}`}>Toggle dark theme (local)</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={isDarkMode} onChange={(e) => setIsDarkMode(e.target.checked)} />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {!isReadOnly && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`font-bold ${TEXT.secondary}`}>Randomize All</h3>
                      <p className={`text-xs ${TEXT.muted}`}>Show randomize button in Setup</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={settings.allowRandomize ?? false} onChange={(e) => updateSettings({ allowRandomize: e.target.checked })} />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`font-bold ${TEXT.secondary}`}>Simulate Matches</h3>
                      <p className={`text-xs ${TEXT.muted}`}>Show simulation controls</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={settings.allowSimulate ?? false} onChange={(e) => updateSettings({ allowSimulate: e.target.checked })} />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  <div>
                    <h3 className={`font-bold mb-1 ${TEXT.secondary}`}>Custom Title</h3>
                    <p className={`text-xs mb-2 ${TEXT.muted}`}>Override the default "SWEEPSTAKE" text</p>
                    <input
                      type="text"
                      value={settings.customTitle !== undefined ? settings.customTitle : 'SWEEPSTAKE'}
                      onChange={(e) => updateSettings({ customTitle: e.target.value })}
                      placeholder="e.g. OFFICE LEAGUE"
                      className={`w-full rounded-lg px-3 py-2 text-sm font-bold ${CONTROLS.input}`}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="py-6 mt-auto transition-colors border-t bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <div className="text-center text-sm font-medium">
            {cloudGameId
              ? (isCloudOwner ? 'Live game: your edits are synced to all viewers.' : 'Live game: viewing updates in real time.')
              : 'Assign teams, enter scores, and battle for the sweepstake crown!'}
          </div>

          {!isReadOnly && settings.allowSimulate && (
            <div className="w-full max-w-md rounded-lg p-4 shadow-inner border bg-emerald-100/80 dark:bg-slate-800 border-emerald-300 dark:border-emerald-900/50">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Time Simulator ({simCount}/{matches.length})</label>
                <span className="text-xs text-slate-600 dark:text-slate-500">Test mode</span>
              </div>
              <input
                type="range"
                min="0"
                max={matches.length}
                value={simCount}
                onChange={(e) => handleSimulateSteps(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 h-2 rounded-lg appearance-none cursor-pointer bg-emerald-200 dark:bg-slate-700"
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const hashParams = useMemo(() => getHashParams(hash), [hash]);
  const cloudGameId = hashParams.get('game');

  return (
    <AppProvider cloudGameId={cloudGameId}>
      <MainApp />
    </AppProvider>
  );
}
