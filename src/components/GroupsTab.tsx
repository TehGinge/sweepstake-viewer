import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { getGroupStandings } from '../utils/scoring';
import { CONTROLS, SURFACES, TEXT, getPlayerTheme, getResultBadgeClass } from '../utils/theme';

export const GroupsTab: React.FC<{ initialGroup?: string | null; onGroupHandled?: () => void; onTeamClick: (teamId: string) => void }> = ({ initialGroup, onGroupHandled, onTeamClick }) => {
  const { matches, setMatches, updateMatch, players, teams, groups, tournamentId, settings, isReadOnly } = useAppContext();
  const [activeGroup, setActiveGroup] = useState<string>(initialGroup || 'A');

  useEffect(() => {
    if (initialGroup) {
      setActiveGroup(initialGroup);
      if (onGroupHandled) onGroupHandled();
    }
  }, [initialGroup, onGroupHandled]);

  const standings = getGroupStandings(activeGroup, matches, teams);

  const simulateActiveGroup = () => {
    setMatches(prev => prev.map(match => {
      if (match.stage === 'GROUP' && match.group === activeGroup && match.homeTeamId && match.awayTeamId && match.homeScore === null) {
        return {
          ...match,
          homeScore: Math.floor(Math.random() * 4),
          awayScore: Math.floor(Math.random() * 4),
          status: 'FINISHED'
        };
      }
      return match;
    }));
  };

  const simulateGroupMatches = () => {
    setMatches(prev => prev.map(match => {
      if (match.stage === 'GROUP' && match.homeTeamId && match.awayTeamId && match.homeScore === null) {
        return {
          ...match,
          homeScore: Math.floor(Math.random() * 4),
          awayScore: Math.floor(Math.random() * 4),
          status: 'FINISHED'
        };
      }
      return match;
    }));
  };

  
  const groupMatches = matches.filter(m => m.stage === 'GROUP' && m.group === activeGroup);

  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
      {/* Group Selector & Left Nav */}
      <div className="w-full lg:w-48 shrink-0">
        <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 px-2">Select Group</h3>
        <div className="flex overflow-x-auto hide-scrollbar lg:flex-col gap-2 pb-2">
          {groups.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex-1 lg:flex-none text-left shadow-sm
                ${activeGroup === g 
                  ? 'bg-slate-900 dark:bg-slate-700 text-white' 
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'}`}
            >
               <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border mr-1.5 bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600`}>Grp {g}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-6">
        {/* Standings Table */}
        <div className={`${SURFACES.card} rounded-xl shadow-sm overflow-hidden`}>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className={`text-xl font-black ${TEXT.primary}`}>Group {activeGroup} Standings</h2>
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-semibold border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600`}>Group {activeGroup}</span>
            </div>
            {settings.allowSimulate && !isReadOnly && (
              <div className="flex items-center gap-2">
                <button
                  onClick={simulateActiveGroup}
                  className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
                >
                  Simulate Group {activeGroup}
                </button>
                <button
                  onClick={simulateGroupMatches}
                  className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
                >
                  Simulate All Groups
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto hide-scrollbar px-6 pb-6 pt-4">
            <table className="w-full text-left mt-2 text-sm">
              <thead className="text-xs uppercase text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr className="h-10">
                  <th className="w-8">#</th>
                  <th>Team</th>
                  <th className="hidden lg:table-cell">Assignee</th>
                  <th className="text-center w-8">P</th>
                  <th className="text-center w-8">W</th>
                  <th className="text-center w-8">D</th>
                  <th className="text-center w-8">L</th>
                  <th className="text-center w-8 hidden sm:table-cell">GF</th>
                  <th className="text-center w-8 hidden sm:table-cell">GA</th>
                  <th className="text-center w-8">GD</th>
                  <th className="text-right w-12 text-slate-800 dark:text-slate-300">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {standings.map((team, idx) => {
                  const assigneeIndex = players.findIndex(p => p.teamIds.includes(team.id));
                  const assigneeName = assigneeIndex !== -1 ? players[assigneeIndex].name : 'Unassigned';
                  const theme = getPlayerTheme(assigneeIndex);
                  
                  return (
                  <tr
                    key={team.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onTeamClick(team.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTeamClick(team.id);
                      }
                    }}
                    className={`h-12 border-b border-slate-50 dark:border-slate-700/50 last:border-none cursor-pointer ${idx < 2 ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : ''}`}
                  >
                    <td className="font-bold text-slate-600 dark:text-slate-400">{idx + 1}</td>
                    <td className="font-bold">
                      <div className="flex items-center gap-2 h-12">
                        <img src={`https://flagcdn.com/w40/${team.iso2}.png`} alt={team.name} className="w-6 h-4 object-cover rounded shrink-0 shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" title={team.name} />
                        <span className="hidden sm:block text-slate-700 dark:text-slate-200 truncate">{team.name}</span>
                        <span className="block sm:hidden text-slate-700 dark:text-slate-200">{team.id}</span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell">
                      {assigneeIndex === -1 ? (
                        <span className="text-slate-500 dark:text-slate-400 italic text-xs">Unassigned</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 ${theme.lightBg} ${theme.text} ${theme.border} border rounded text-xs font-bold`}>
                          <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${theme.bg} ${theme.textContrast}`}>
                             {assigneeName.substring(0,1).toUpperCase()}
                          </div>
                          {assigneeName}
                        </span>
                      )}
                    </td>
                    <td className="text-center text-slate-700 dark:text-slate-300">{team.played}</td>
                    <td className="text-center text-slate-700 dark:text-slate-300">{team.won}</td>
                    <td className="text-center text-slate-700 dark:text-slate-300">{team.draw}</td>
                    <td className="text-center text-slate-700 dark:text-slate-300">{team.lost}</td>
                    <td className="text-center text-slate-600 dark:text-slate-400 hidden sm:table-cell">{team.gf}</td>
                    <td className="text-center text-slate-600 dark:text-slate-400 hidden sm:table-cell">{team.ga}</td>
                    <td className="text-center font-bold text-slate-700 dark:text-slate-300">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                    <td className="text-right font-black text-slate-900 dark:text-white text-base">{team.points}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>

        {/* Group Matches */}
          <div className={`${SURFACES.card} rounded-xl shadow-sm overflow-hidden`}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <h2 className={`text-xl font-black ${TEXT.primary}`}>Matches</h2>
            <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-semibold border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600`}>Group {activeGroup}</span>
              {isReadOnly && (
                <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest border bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">Read only</span>
              )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {groupMatches.map(match => {
              const homeTeam = teams.find(t => t.id === match.homeTeamId);
              const awayTeam = teams.find(t => t.id === match.awayTeamId);
              
              if(!homeTeam || !awayTeam) return null;

              const bstDate = match.date 
                ? new Date(match.date).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' BST' 
                : null;

              const homeAssigneeIndex = players.findIndex(p => p.teamIds.includes(homeTeam.id));
              const homeAssigneeName = homeAssigneeIndex !== -1 ? players[homeAssigneeIndex].name : 'Unassigned';
              const homeTheme = getPlayerTheme(homeAssigneeIndex);
              
              const awayAssigneeIndex = players.findIndex(p => p.teamIds.includes(awayTeam.id));
              const awayAssigneeName = awayAssigneeIndex !== -1 ? players[awayAssigneeIndex].name : 'Unassigned';
              const awayTheme = getPlayerTheme(awayAssigneeIndex);

              return (
                <div key={match.id} className="p-6 flex flex-col items-center justify-between gap-4 dark:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-700/50">
                  <div className="flex flex-col items-center gap-1 w-full relative">
                    <div className="absolute left-0 top-0 text-[10px] uppercase font-black text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded tracking-widest hidden sm:block">
                       Match {match.id.replace(tournamentId + '-G-' + activeGroup + '-', '').replace('M', '')}
                    </div>
                    {(bstDate || match.location) && (
                      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest text-center mt-1 sm:mt-0">
                        <span className="sm:hidden block text-center font-black mb-1">MATCH {match.id.replace(tournamentId + '-G-' + activeGroup + '-', '').replace('M', '')}</span>
                        {bstDate} {bstDate && match.location ? ' • ' : ''} {match.location}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
                    <div className="flex items-center justify-center sm:justify-end w-full sm:w-1/3 gap-3">
                      <div className="flex-col items-end hidden sm:flex">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{homeTeam.name}</span>
                        {homeAssigneeIndex !== -1 && (
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 ${homeTheme.lightBg} ${homeTheme.text} ${homeTheme.border} border rounded text-[10px] font-bold`}>
                            <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${homeTheme.bg} ${homeTheme.textContrast}`}>
                               {homeAssigneeName.substring(0,1).toUpperCase()}
                            </div>
                            {homeAssigneeName}
                          </span>
                        )}
                      </div>
                      <img src={`https://flagcdn.com/w40/${homeTeam.iso2}.png`} alt={homeTeam.name} className="w-8 h-5.5 object-cover rounded shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] shrink-0" />
                      <div className="flex flex-col items-start sm:hidden">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{homeTeam.name}</span>
                        {homeAssigneeIndex !== -1 && (
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 ${homeTheme.lightBg} ${homeTheme.text} ${homeTheme.border} border rounded text-[10px] font-bold`}>
                            <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${homeTheme.bg} ${homeTheme.textContrast}`}>
                               {homeAssigneeName.substring(0,1).toUpperCase()}
                            </div>
                            {homeAssigneeName}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className={`flex items-center justify-center gap-2.5 px-3 py-2 rounded-lg shadow-sm w-full sm:w-auto mt-2 sm:mt-0 ${SURFACES.inset}`}>
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                        className={`w-12 h-10 text-center font-black text-lg rounded ${CONTROLS.input} disabled:bg-slate-200 disabled:dark:bg-slate-900 disabled:text-slate-500 disabled:dark:text-slate-500`}
                      />
                      {match.homeScore !== null && match.awayScore !== null && (
                        <span className={`flex items-center justify-center w-7 h-7 rounded text-[10px] font-black tracking-widest ${getResultBadgeClass(match.awayScore > match.homeScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L')}`}>
                          {match.awayScore > match.homeScore ? 'W' : match.homeScore === match.awayScore ? 'D' : 'L'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-center sm:justify-start w-full sm:w-1/3 gap-3">
                      <img src={`https://flagcdn.com/w40/${awayTeam.iso2}.png`} alt={awayTeam.name} className="w-8 h-5.5 object-cover rounded shadow-sm dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{awayTeam.name}</span>
                        {awayAssigneeIndex !== -1 && (
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 ${awayTheme.lightBg} ${awayTheme.text} ${awayTheme.border} border rounded text-[10px] font-bold`}>
                            <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[7px] leading-none ${awayTheme.bg} ${awayTheme.textContrast}`}>
                               {awayAssigneeName.substring(0,1).toUpperCase()}
                            </div>
                            {awayAssigneeName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
