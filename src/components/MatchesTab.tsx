import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MatchStage, Match } from '../types';
import { CONTROLS, SURFACES, TEXT, getPlayerTheme, getResultBadgeClass } from '../utils/theme';

const STAGES: { stage: MatchStage; title: string }[] = [
  { stage: 'R32', title: 'Round of 32' },
  { stage: 'R16', title: 'Round of 16' },
  { stage: 'QF', title: 'Quarter-Finals' },
  { stage: 'SF', title: 'Semi-Finals' },
  { stage: '3RD', title: 'Third Place Play-off' },
  { stage: 'FINAL', title: 'Final' },
];

export const MatchesTab: React.FC = () => {
  const { matches, setMatches, updateMatch, teams, tournamentId, players, settings, scoreSyncStatus, isReadOnly } = useAppContext();
  const [activeStage, setActiveStage] = useState<MatchStage>(tournamentId === 'WC26' ? 'R32' : 'R16');

  const stageMatches = matches.filter(m => m.stage === activeStage);

  const simulateStageMatches = () => {
    setMatches(prev => prev.map(match => {
      if (match.stage === activeStage && match.homeTeamId && match.awayTeamId && match.homeScore === null) {
        let hScore = Math.floor(Math.random() * 4);
        let aScore = Math.floor(Math.random() * 4);
        
        // Ensure no draws in knockout stages
        if (hScore === aScore) {
           hScore += 1;
        }

        return {
          ...match,
          homeScore: hScore,
          awayScore: aScore,
          status: 'FINISHED'
        };
      }
      return match;
    }));
  };

  const formatLastChecked = (timestamp: number | null): string => {
    if (!timestamp) return 'not checked yet';
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getScoreSyncLabel = (): string => {
    if (isReadOnly) {
      return 'Auto-sync is handled by the host. Viewer updates arrive in real time.';
    }

    if (scoreSyncStatus.state === 'syncing') {
      return 'Auto-sync is checking official scores...';
    }

    if (scoreSyncStatus.state === 'disabled') {
      return scoreSyncStatus.lastError || 'Auto-sync is disabled.';
    }

    if (scoreSyncStatus.state === 'error') {
      return `Auto-sync error: ${scoreSyncStatus.lastError || 'unknown error'}`;
    }

    const sourceText = scoreSyncStatus.source ? ` via ${scoreSyncStatus.source}` : '';
    const appliedText = scoreSyncStatus.lastAppliedCount > 0
      ? ` Applied ${scoreSyncStatus.lastAppliedCount} update${scoreSyncStatus.lastAppliedCount === 1 ? '' : 's'}.`
      : '';

    return `Auto-sync checked at ${formatLastChecked(scoreSyncStatus.lastSyncedAt)}${sourceText}.${appliedText}`;
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
      {/* Stage Selector */}
      <div className="w-full lg:w-56 shrink-0">
        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 px-2">Tournament Stage</h3>
        <div className="flex overflow-x-auto hide-scrollbar lg:flex-col gap-2 pb-2">
          {STAGES.map(s => {
            if (s.stage === 'R32' && tournamentId !== 'WC26') return null;
            return (
            <button
              key={s.stage}
              onClick={() => setActiveStage(s.stage)}
              className={`px-4 py-3 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex-1 lg:flex-none text-left shadow-sm
                ${activeStage === s.stage 
                  ? 'bg-slate-900 dark:bg-slate-700 text-white' 
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'}`}
            >
              {s.title}
            </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1">
        <div className={`${SURFACES.card} rounded-xl shadow-sm overflow-hidden flex flex-col`}>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className={`text-xl font-black ${TEXT.primary}`}>{STAGES.find(s => s.stage === activeStage)?.title}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{getScoreSyncLabel()}</p>
            </div>
              {settings.allowSimulate && !isReadOnly && (
              <button
                 onClick={simulateStageMatches}
                 className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
               >
                 Simulate Round
               </button>
            )}
          </div>
          
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 px-6 py-2">
            {stageMatches.map((match) => {
              const bstDate = match.date 
                ? new Date(match.date).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' BST' 
                : null;
              const homeTeam = match.homeTeamId ? teams.find(t => t.id === match.homeTeamId) : null;
              const awayTeam = match.awayTeamId ? teams.find(t => t.id === match.awayTeamId) : null;
              const homeAssigneeIndex = homeTeam ? players.findIndex(p => p.teamIds.includes(homeTeam.id)) : -1;
              const awayAssigneeIndex = awayTeam ? players.findIndex(p => p.teamIds.includes(awayTeam.id)) : -1;
              const homeTheme = getPlayerTheme(homeAssigneeIndex);
              const awayTheme = getPlayerTheme(awayAssigneeIndex);
              const homeAssigneeName = homeAssigneeIndex !== -1 ? players[homeAssigneeIndex].name : '';
              const awayAssigneeName = awayAssigneeIndex !== -1 ? players[awayAssigneeIndex].name : '';
              return (
              <div key={match.id} className="py-6 first:pt-4 last:pb-6 dark:bg-slate-800">
                <div className="flex flex-col items-center mb-3">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest text-center">
                    Match {match.id.replace('M', '')} {match.group ? `• Grp ${match.group}` : ''}
                  </div>
                  {(bstDate || match.location) && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 text-center">
                      {bstDate} {bstDate && match.location ? ' • ' : ''} {match.location}
                    </div>
                  )}
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-center gap-4">
                  
                  {/* Home Team Selector */}
                  <div className="flex-1 flex items-start justify-center md:justify-end gap-3">
                    {homeTeam && (
                       <img src={`https://flagcdn.com/w40/${homeTeam.iso2}.png`} className="w-8 h-5.5 object-cover rounded shadow-sm hidden md:block dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" alt={homeTeam.name} />
                    )}
                    <div className="w-full md:w-56 flex flex-col items-start md:items-end">
                      <select
                        value={match.homeTeamId || ''}
                        onChange={(e) => updateMatch(match.id, match.homeScore, match.awayScore, e.target.value || null, match.awayTeamId)}
                        disabled={isReadOnly}
                        className={`w-full p-2.5 rounded-lg text-sm font-bold ${CONTROLS.input}`}
                      >
                        <option value="">{match.placeholderHome ? `----- ${match.placeholderHome} -----` : '-- Select Team --'}</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {homeAssigneeIndex !== -1 && (
                        <span className={`inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 ${homeTheme.lightBg} ${homeTheme.text} ${homeTheme.border} border rounded text-[10px] font-bold w-fit`}>
                          <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${homeTheme.bg} ${homeTheme.textContrast}`}>
                            {homeAssigneeName.substring(0, 1).toUpperCase()}
                          </div>
                          {homeAssigneeName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score Inputs */}
                  <div className={`flex items-center justify-center gap-2.5 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm ${SURFACES.inset}`}>
                    {match.homeScore !== null && match.awayScore !== null && (
                      <span className={`flex items-center justify-center w-7 h-7 rounded text-[10px] font-black tracking-widest ${getResultBadgeClass(match.homeScore > match.awayScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L')}`}>
                        {match.homeScore > match.awayScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L'}
                      </span>
                    )}
                    <input 
                      type="number" 
                      min="0"
                      value={match.homeScore ?? ''} 
                      onChange={(e) => updateMatch(match.id, e.target.value === '' ? null : parseInt(e.target.value), match.awayScore)}
                        disabled={!match.homeTeamId || !match.awayTeamId || isReadOnly}
                      className={`w-12 h-10 text-center font-black text-lg rounded ${CONTROLS.input} disabled:bg-slate-200 disabled:dark:bg-slate-900 disabled:text-slate-500 disabled:dark:text-slate-500`}
                    />
                    <div className="flex flex-col items-center justify-center px-1">
                      <span className="text-slate-500 dark:text-slate-400 font-bold text-sm leading-none">VS</span>
                      {match.status === 'LIVE' && (
                        <span className="animate-pulse text-red-500 font-black text-[10px] tracking-wider mt-1 leading-none">LIVE</span>
                      )}
                    </div>
                    <input 
                      type="number" 
                      min="0"
                      value={match.awayScore ?? ''} 
                      onChange={(e) => updateMatch(match.id, match.homeScore, e.target.value === '' ? null : parseInt(e.target.value))}
                        disabled={!match.homeTeamId || !match.awayTeamId || isReadOnly}
                      className={`w-12 h-10 text-center font-black text-lg rounded ${CONTROLS.input} disabled:bg-slate-200 disabled:dark:bg-slate-900 disabled:text-slate-500 disabled:dark:text-slate-500`}
                    />
                    {match.homeScore !== null && match.awayScore !== null && (
                      <span className={`flex items-center justify-center w-7 h-7 rounded text-[10px] font-black tracking-widest ${getResultBadgeClass(match.awayScore > match.homeScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L')}`}>
                        {match.awayScore > match.homeScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L'}
                      </span>
                    )}
                  </div>

                  {/* Away Team Selector */}
                  <div className="flex-1 flex items-start justify-center md:justify-start gap-3">
                    <div className="w-full md:w-56 flex flex-col items-start">
                      <select
                        value={match.awayTeamId || ''}
                        onChange={(e) => updateMatch(match.id, match.homeScore, match.awayScore, match.homeTeamId, e.target.value || null)}
                        disabled={isReadOnly}
                        className={`w-full p-2.5 rounded-lg text-sm font-bold ${CONTROLS.input}`}
                      >
                        <option value="">{match.placeholderAway ? `----- ${match.placeholderAway} -----` : '-- Select Team --'}</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {awayAssigneeIndex !== -1 && (
                        <span className={`inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 ${awayTheme.lightBg} ${awayTheme.text} ${awayTheme.border} border rounded text-[10px] font-bold w-fit`}>
                          <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${awayTheme.bg} ${awayTheme.textContrast}`}>
                            {awayAssigneeName.substring(0, 1).toUpperCase()}
                          </div>
                          {awayAssigneeName}
                        </span>
                      )}
                    </div>
                    {awayTeam && (
                       <img src={`https://flagcdn.com/w40/${awayTeam.iso2}.png`} className="w-8 h-5.5 object-cover rounded shadow-sm hidden md:block dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" alt={awayTeam.name} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        
        <div className="mt-6 bg-slate-100 dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-300 dark:border-slate-700">
            <h2 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Pro Tip</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-tight">
              {isReadOnly
                ? 'This live game link is read-only for viewers. Score updates appear automatically when the host edits matches.'
                : 'Select the teams playing in each match. Any team that appears in a match automatically scores progression points for their assigned player. Auto-sync now checks official results and fills unfinished matches, while finished matches stay locked.'}
            </p>
        </div>
      </div>
    </div>
  );
};
