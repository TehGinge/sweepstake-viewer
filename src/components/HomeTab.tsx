import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { generateLeaderboard, calculateTeamPoints, getGroupStandings } from '../utils/scoring';
import { CONTROLS, SURFACES, TEXT, getPlayerTheme } from '../utils/theme';

type SortConfig = { key: 'name' | 'group' | 'fifaRanking' | 'assignee' | 'points' | 'stage' | 'played'; direction: 'asc' | 'desc' };

export const HomeTab: React.FC<{ setActiveTab: (tab: any) => void; onNavigateToGroup: (group: string) => void }> = ({ setActiveTab, onNavigateToGroup }) => {
  const { players, matches, config, teams, isReadOnly } = useAppContext();
  const [viewMode, setViewMode] = useState<'PLAYERS' | 'TEAMS'>('PLAYERS');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fifaRanking', direction: 'asc' });

  const { groupStandingsMap, teamProgressionMap, eliminatedMap } = useMemo(() => {
    const gMap = new Map<string, number>();
    const pMap = new Map<string, string>();
    const eMap = new Map<string, boolean>();
    const uniqueGroups = Array.from(new Set(teams.map(t => t.group).filter(Boolean))) as string[];
    
    uniqueGroups.forEach(g => {
      if (g) {
        const standings = getGroupStandings(g, matches, teams);
        const hasStarted = standings.some(t => t.played > 0);
        if (hasStarted) {
          standings.forEach((team, index) => {
            gMap.set(team.id, index + 1);
          });
        }
      }
    });

    teams.forEach(team => {
      const appearsInRound = (stage: any) => {
        return matches.some(m => m.stage === stage && (m.homeTeamId === team.id || m.awayTeamId === team.id));
      };
      let prog = '';
      if (appearsInRound('R32')) prog = 'R32';
      if (appearsInRound('R16')) prog = 'R16';
      if (appearsInRound('QF')) prog = 'QF';
      if (appearsInRound('SF')) prog = 'SF';
      if (appearsInRound('FINAL')) prog = 'Final';
      
      const wonFinal = matches.find(m => m.stage === 'FINAL' && m.status === 'FINISHED' && (m.homeTeamId === team.id || m.awayTeamId === team.id) && ((m.homeTeamId === team.id && m.homeScore! > m.awayScore!) || (m.awayTeamId === team.id && m.awayScore! > m.homeScore!)));
      if (wonFinal) prog = 'Winner';

      if (prog) pMap.set(team.id, prog);

      let eliminated = false;

      // Group stage elimination
      const groupMatches = matches.filter(m => m.stage === 'GROUP' && m.group === team.group);
      const groupFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'FINISHED');
      const reachedKnockouts = appearsInRound('R32') || appearsInRound('R16') || appearsInRound('QF') || appearsInRound('SF') || appearsInRound('FINAL');
      
      const allGroupsFinished = matches.filter(m => m.stage === 'GROUP').every(m => m.status === 'FINISHED');
      const thirdPlaceNeededCount = matches.filter(m => m.placeholderHome?.startsWith('3') || m.placeholderAway?.startsWith('3')).length;

      if (groupFinished && !reachedKnockouts) {
        const pos = gMap.get(team.id);
        if (pos && pos > 3) {
            eliminated = true; // 4th place or lower is always out
        } else if (pos === 3) {
            if (thirdPlaceNeededCount === 0 || allGroupsFinished) {
                 eliminated = true; 
            }
        } else if (allGroupsFinished) {
            eliminated = true; // Fallback, e.g. 1st/2nd place but didn't reach (shouldn't happen)
        }
      }
      
      // Knockout stage elimination
      const lostKOMatch = matches.some(m => {
          if (m.stage === 'GROUP' || m.status !== 'FINISHED') return false;
          if (m.stage === 'SF') return false; // SF losers play 3RD place match
          if (m.homeTeamId === team.id && m.homeScore! < m.awayScore!) return true;
          if (m.awayTeamId === team.id && m.awayScore! < m.homeScore!) return true;
          return false;
      });
      const played3rd = matches.some(m => m.stage === '3RD' && m.status === 'FINISHED' && (m.homeTeamId === team.id || m.awayTeamId === team.id));
      
      if (lostKOMatch || played3rd) {
        if (!wonFinal) {
           eliminated = true;
        }
      }
      
      eMap.set(team.id, eliminated);
    });

    return { groupStandingsMap: gMap, teamProgressionMap: pMap, eliminatedMap: eMap };
  }, [matches, teams]);

  // We sort players by points normally to rank them, so we still generate a leaderboard internally.
  const leaderboard = useMemo(() => {
    return generateLeaderboard(players, matches, config, teams);
  }, [players, matches, config, teams]);

  const teamData = useMemo(() => {
    return teams.map(team => {
      const assigneeIndex = players.findIndex(p => p.teamIds.includes(team.id));
      const assignee = assigneeIndex !== -1 ? players[assigneeIndex] : null;
      const points = calculateTeamPoints(team.id, matches, config);
      const played = matches.filter(m => (m.homeTeamId === team.id || m.awayTeamId === team.id) && m.status === 'FINISHED').length;
      return {
        ...team,
        assigneeName: assignee ? assignee.name : 'Unassigned',
        assigneeIndex,
        points,
        played,
        stage: played > 0 ? (teamProgressionMap.get(team.id) || (eliminatedMap.get(team.id) ? 'Eliminated' : '-')) : '-'
      };
    });
  }, [players, matches, config, teams, teamProgressionMap, eliminatedMap]);

  const sortedTeams = useMemo(() => {
    return [...teamData].sort((a, b) => {
      let aValue: any = a[sortConfig.key === 'assignee' ? 'assigneeName' : sortConfig.key];
      let bValue: any = b[sortConfig.key === 'assignee' ? 'assigneeName' : sortConfig.key];
      
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      
      // Fallback to fifaRanking for stable sort
      return a.fifaRanking - b.fifaRanking;
    });
  }, [teamData, sortConfig]);

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortConfig['key'] }) => {
    if (sortConfig.key !== columnKey) return <span className="opacity-0 group-hover:opacity-30 ml-1">⇅</span>;
    return <span className="ml-1 text-emerald-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-6xl mb-4">🏆</div>
        <h2 className={`text-2xl font-bold ${TEXT.secondary}`}>{isReadOnly ? 'No published players' : 'No players yet'}</h2>
        <p className={`${TEXT.muted} mt-2`}>
          {isReadOnly ? 'The host has not assigned players yet, or no assignments are available yet in this live game.' : 'Go to the Setup tab to add players and assign teams.'}
        </p>
      </div>
    );
  }

  const recentMatches = matches
    .filter(m => m.status === 'FINISHED' && m.date)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())
    .slice(0, 2)
    .reverse();

  const upMatches = matches
    .filter(m => m.status === 'SCHEDULED' && m.date)
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
    .slice(0, 4);

  const displayMatches = [...recentMatches, ...upMatches];

  const getMatchNumber = (matchId: string, fallback: number) => {
    const trailingDigits = matchId.match(/(\d+)(?!.*\d)/);
    return trailingDigits ? parseInt(trailingDigits[1], 10) : fallback;
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 lg:space-y-8 flex flex-col xl:flex-row gap-6">
      
      {/* Main Content Area */}
      <div className="flex-1 space-y-6 min-w-0">
        <div className="flex justify-end items-center gap-4">
           <div className={`flex p-1 rounded-lg shrink-0 shadow-sm ${CONTROLS.segmented}`}>
             <button 
               onClick={() => setViewMode('PLAYERS')}
               className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'PLAYERS' ? CONTROLS.segmentedActive : CONTROLS.segmentedIdle}`}
             >
               Players View
             </button>
             <button 
               onClick={() => setViewMode('TEAMS')}
               className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${viewMode === 'TEAMS' ? CONTROLS.segmentedActive : CONTROLS.segmentedIdle}`}
             >
               Teams View
             </button>
           </div>
        </div>

        {viewMode === 'PLAYERS' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {leaderboard.map((entry, index) => {
            const playerIndex = players.findIndex(p => p.id === entry.playerId);
            const theme = getPlayerTheme(playerIndex);
            const isWinner = index === 0 && entry.points > 0;
            return (
            <div key={entry.playerId} className={`${SURFACES.cardElevated} text-left rounded-xl flex flex-col overflow-hidden shadow-sm transition-colors ${isWinner ? 'ring-2 ring-emerald-400 border-emerald-400 dark:ring-emerald-500 dark:border-emerald-500' : ''}`}>
              <div className={`p-3 border-b flex items-center justify-between ${theme.lightBg} ${theme.border}`}>
                <div className="flex items-center gap-2">
                   <div className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${theme.bg} ${theme.textContrast}`}>
                     {entry.playerName.substring(0, 2).toUpperCase()}
                   </div>
                   <h2 className={`font-black text-base ${theme.text} truncate`}>{entry.playerName}</h2>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className={`text-[9px] font-bold uppercase tracking-widest block text-slate-500 dark:text-slate-400`}>Total</span>
                  <span className={`text-xl font-black leading-none text-slate-900 dark:text-white`}>
                    {entry.teams.some(t => matches.some(m => (m.homeTeamId === t.id || m.awayTeamId === t.id) && m.status === 'FINISHED')) ? entry.points : '-'}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-3 grid gap-1.5 bg-slate-50/70 dark:bg-slate-900">
                {[...entry.teams].sort((a, b) => a.fifaRanking - b.fifaRanking).map(team => {
                   const pts = calculateTeamPoints(team.id, matches, config);
                   const hasPlayed = matches.some(m => (m.homeTeamId === team.id || m.awayTeamId === team.id) && m.status === 'FINISHED');
                   let cardBorderClass = 'border-slate-100 dark:border-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600 shadow-sm';
                   const pos = groupStandingsMap.get(team.id);
                   const eliminated = eliminatedMap.get(team.id);
                   const progression = teamProgressionMap.get(team.id);
                   
                   if (progression === 'Winner') {
                      cardBorderClass = 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-400 dark:ring-emerald-500 shadow-md';
                   } else if (pos === 1) {
                      cardBorderClass = 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400 dark:ring-amber-500 shadow-sm';
                   } else if (pos === 2) {
                      cardBorderClass = 'border-slate-300 dark:border-slate-500 ring-1 ring-slate-300 dark:ring-slate-500 shadow-sm';
                   } else if (pos === 3) {
                      cardBorderClass = 'border-orange-400 dark:border-orange-500 ring-1 ring-orange-400 dark:ring-orange-500 shadow-sm';
                   }
                   if (eliminated) {
                      cardBorderClass += ' opacity-40 grayscale';
                   }

                   return (
                     <div key={team.id} className={`flex items-center justify-between p-2 border rounded-lg transition-colors bg-white dark:bg-slate-950 ${cardBorderClass}`}>
                       <div className="flex items-center gap-2 flex-1 min-w-0">
                         <img src={`https://flagcdn.com/w40/${team.iso2}.png`} alt={team.name} className="w-6 h-4 object-cover rounded shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] shrink-0" title={team.name} />
                         <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
                           <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block truncate" title={team.name}>{team.name}</span>
                           <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Grp {team.group}{progression && progression !== 'Winner' ? ` • ${progression}` : ''}{progression === 'Winner' ? ' • Winner' : ''}</span>
                         </div>
                       </div>
                       <div className={`px-2 py-1 flex-col justify-center items-center rounded text-center shrink-0 min-w-[2.5rem] ml-2 border flex ${theme.lightBg} ${theme.border}`}>
                         <span className={`font-black text-sm leading-none text-slate-900 dark:text-white`}>{hasPlayed ? pts : '-'}</span>
                       </div>
                     </div>
                   );
                })}
                {entry.teams.length === 0 && (
                  <div className="text-xs text-slate-600 dark:text-slate-500 italic text-center py-3">No teams.</div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className={`${SURFACES.card} rounded-xl shadow-sm overflow-hidden`}>
          <div className="overflow-x-auto hide-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className={SURFACES.tableHead}>
                <tr>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    Team <SortIcon columnKey="name" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('group')}
                  >
                    Group <SortIcon columnKey="group" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('fifaRanking')}
                  >
                    FIFA Rank <SortIcon columnKey="fifaRanking" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('stage')}
                  >
                    Stage <SortIcon columnKey="stage" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('assignee')}
                  >
                    Assignee <SortIcon columnKey="assignee" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('played')}
                  >
                    Played <SortIcon columnKey="played" />
                  </th>
                  <th 
                    className="p-4 font-bold text-slate-700 dark:text-slate-300 text-right cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group select-none whitespace-nowrap transition-colors"
                    onClick={() => handleSort('points')}
                  >
                    Points <SortIcon columnKey="points" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {sortedTeams.map((team) => {
                  const theme = getPlayerTheme(team.assigneeIndex);
                  return (
                  <tr key={team.id} className={`hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${eliminatedMap.get(team.id) ? 'opacity-40 grayscale' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img src={`https://flagcdn.com/w40/${team.iso2}.png`} alt={team.name} className="w-6 h-4 object-cover rounded shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" title={team.name} />
                        <span className={`font-bold ${theme.text}`}>{team.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold ml-1">{team.id}</span>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-300">
                      <span className="text-slate-700 dark:text-slate-300">Grp {team.group}</span>
                      {groupStandingsMap.get(team.id) && (
                         <span className="text-slate-600 dark:text-slate-400 font-medium ml-1.5" title="Group Position">
                           • {groupStandingsMap.get(team.id)}{[1].includes(groupStandingsMap.get(team.id)!) ? 'st' : [2].includes(groupStandingsMap.get(team.id)!) ? 'nd' : [3].includes(groupStandingsMap.get(team.id)!) ? 'rd' : 'th'}
                         </span>
                      )}
                    </td>
                    <td className={`p-4 font-medium text-slate-700 dark:text-slate-300`}>
                      {team.fifaRanking}
                    </td>
                    <td className="p-4 font-medium text-slate-700 dark:text-slate-300">
                      {team.stage}
                    </td>
                    <td className="p-4">
                      {team.assigneeName === 'Unassigned' ? (
                        <span className="text-slate-500 dark:text-slate-400 italic text-xs">Unassigned</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 ${theme.lightBg} ${theme.text} ${theme.border} border rounded text-xs font-bold`}>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] leading-none ${theme.bg} ${theme.textContrast}`}>
                             {team.assigneeName.substring(0,1).toUpperCase()}
                          </div>
                          {team.assigneeName}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-slate-600 dark:text-slate-400 font-bold text-sm">{team.played}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-black text-slate-900 dark:text-white text-base">
                        {team.played > 0 ? team.points : '-'}
                      </span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Upcoming Matches Sidebar */}
      <div className="w-full xl:w-96 flex-shrink-0 space-y-4">
        <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg px-1 flex items-center gap-2">
          📅 Recent & Upcoming Matches
        </h3>
        {displayMatches.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400 text-sm italic px-1">No matches.</p>
        ) : (
          <div className="space-y-3">
             {displayMatches.map((match, index) => {
                const homeTeam = teams.find(t => t.id === match.homeTeamId);
                const awayTeam = teams.find(t => t.id === match.awayTeamId);
               const matchNumber = getMatchNumber(match.id, index + 1);

                return (
                  <button 
                    key={match.id} 
                    onClick={() => {
                       if (match.stage === 'GROUP' && match.group) {
                         onNavigateToGroup(match.group);
                       } else {
                         setActiveTab('MATCHES');
                       }
                    }}
                    className="w-full text-left bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className={`text-[10px] uppercase font-bold mb-3 flex justify-between items-center px-2 py-1.5 rounded-md border ${match.status === 'FINISHED' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      <span className="truncate pr-2">{`Match ${matchNumber} • ${match.stage === 'GROUP' ? `Group ${match.group}` : match.stage}`}</span>
                      <span className="shrink-0 font-medium">
                        {match.date ? new Date(match.date).toLocaleString('en-GB', { timeZone: 'Europe/London', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' BST' : 'TBD'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {homeTeam ? (
                             <>
                               <img src={`https://flagcdn.com/w40/${homeTeam.iso2}.png`} alt={homeTeam.name} className="w-6 h-6 rounded-full object-cover shadow-sm shrink-0 border border-slate-100 dark:border-slate-700" />
                               <div className="flex flex-col">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-base leading-tight mt-0.5">{homeTeam.name}</span>
                                 {(() => {
                                    const assigneeIndex = players.findIndex(p => p.teamIds.includes(homeTeam.id));
                                    if (assigneeIndex === -1) return null;
                                    const assigneeName = players[assigneeIndex].name;
                                    const theme = getPlayerTheme(assigneeIndex);
                                    return (
                                      <span className={`inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 ${theme.lightBg} ${theme.text} ${theme.border} border rounded text-[10px] font-bold w-fit`}>
                                        <div className={`w-3 h-3 rounded-[2px] flex items-center justify-center text-[7px] leading-none ${theme.bg} ${theme.textContrast}`}>
                                          {assigneeName.substring(0,1).toUpperCase()}
                                        </div>
                                        {assigneeName}
                                      </span>
                                    );
                                 })()}
                               </div>
                             </>
                          ) : (
                             <span className="font-bold text-slate-500 dark:text-slate-400 text-base italic">{match.placeholderHome || 'TBD'}</span>
                          )}
                        </div>
                        {match.homeScore !== null && (
                          <div className={`text-lg font-black px-2 ${match.homeScore > (match.awayScore ?? 0) ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                            {match.homeScore}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {awayTeam ? (
                             <>
                               <img src={`https://flagcdn.com/w40/${awayTeam.iso2}.png`} alt={awayTeam.name} className="w-6 h-6 rounded-full object-cover shadow-sm shrink-0 border border-slate-100 dark:border-slate-700" />
                               <div className="flex flex-col">
                                 <span className="font-bold text-slate-800 dark:text-slate-200 text-base leading-tight mt-0.5">{awayTeam.name}</span>
                                 {(() => {
                                    const assigneeIndex = players.findIndex(p => p.teamIds.includes(awayTeam.id));
                                    if (assigneeIndex === -1) return null;
                                    const assigneeName = players[assigneeIndex].name;
                                    const theme = getPlayerTheme(assigneeIndex);
                                    return (
                                      <span className={`inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 ${theme.lightBg} ${theme.text} ${theme.border} border rounded text-[10px] font-bold w-fit`}>
                                        <div className={`w-3 h-3 rounded-[2px] flex items-center justify-center text-[7px] leading-none ${theme.bg} ${theme.textContrast}`}>
                                          {assigneeName.substring(0,1).toUpperCase()}
                                        </div>
                                        {assigneeName}
                                      </span>
                                    );
                                 })()}
                               </div>
                             </>
                          ) : (
                             <span className="font-bold text-slate-500 dark:text-slate-400 text-base italic">{match.placeholderAway || 'TBD'}</span>
                          )}
                        </div>
                        {match.awayScore !== null && (
                          <div className={`text-lg font-black px-2 ${match.awayScore > (match.homeScore ?? 0) ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                            {match.awayScore}
                          </div>
                        )}
                      </div>
                    </div>
                    {match.location && (
                      <div className="mt-3.5 pt-3 border-t border-slate-200 dark:border-slate-700/50 text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-end" title={match.location}>
                        <span className="truncate">📍 {match.location}</span>
                      </div>
                    )}
                  </button>
                )
             })}
          </div>
        )}
      </div>
    </div>
  );
};
