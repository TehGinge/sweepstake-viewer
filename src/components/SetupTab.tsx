import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Trash2, Plus, Shuffle, RotateCcw, X, Copy, Save, Download, Link2, List, ExternalLink } from 'lucide-react';
import { CONTROLS, SURFACES, TEXT, getPlayerTheme } from '../utils/theme';
import { getUserCloudGames, CloudGameRecord, getCloudGameSecret } from '../firebase/gameStore';
import { ensureAnonymousAuth } from '../firebase/client';

const BULK_PLAYERS_INPUT_KEY = 'worldCupBulkPlayersInput';
const BULK_PLAYERS_OPEN_KEY = 'worldCupBulkPlayersOpen';

export const SetupTab: React.FC = () => {
  const {
    players,
    setPlayers,
    assignTeamsRandomly,
    clearAllAssignments,
    resetTournament,
    teams,
    settings,
    cloudGameId,
    cloudStatus,
    cloudError,
    isCloudOwner,
    createLiveGame,
    deleteLiveGame,
    getLiveGameUrl,
  } = useAppContext();
  const [isManualMode, setIsManualMode] = useState(false);
  const [showSpinModal, setShowSpinModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRandomize, setConfirmRandomize] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isDeletingLiveGame, setIsDeletingLiveGame] = useState(false);
  const [savedStates, setSavedStates] = useState<Record<string, any>>({});
  const [userGames, setUserGames] = useState<{ id: string; meta: CloudGameRecord['meta'] }[]>([]);
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [saveSlotName, setSaveSlotName] = useState("");
  const [liveMessage, setLiveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkPlayersInput, setBulkPlayersInput] = useState(() => {
    try {
      return localStorage.getItem(BULK_PLAYERS_INPUT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [bulkPlayersError, setBulkPlayersError] = useState<string | null>(null);
  const [isBulkPlayersOpen, setIsBulkPlayersOpen] = useState(() => {
    try {
      return localStorage.getItem(BULK_PLAYERS_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setSavedStates(JSON.parse(localStorage.getItem('worldCupSaves') || '{}'));
    } catch {
      setSavedStates({});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BULK_PLAYERS_INPUT_KEY, bulkPlayersInput);
  }, [bulkPlayersInput]);

  useEffect(() => {
    localStorage.setItem(BULK_PLAYERS_OPEN_KEY, String(isBulkPlayersOpen));
  }, [isBulkPlayersOpen]);

  useEffect(() => {
    fetchUserGames();
  }, [cloudGameId]); // Refresh when a game is created or deleted

  useEffect(() => {
    if (cloudGameId && isCloudOwner) {
      getCloudGameSecret(cloudGameId).then((secret) => {
        setHostSecret(secret);
      });
    } else {
      setHostSecret(null);
    }
  }, [cloudGameId, isCloudOwner]);

  const fetchUserGames = async () => {
    try {
      const auth = await ensureAnonymousAuth();
      if (!auth) {
        setUserGames([]);
        return;
      }
      const games = await getUserCloudGames(auth.uid);
      setUserGames(games);
    } catch (err) {
      console.error("Could not fetch user games", err);
    }
  };

  const saveState = () => {
    const name = saveSlotName.trim() || `Save ${new Date().toLocaleString()}`;
    const newSaves = {
      ...savedStates,
      [name]: {
        players,
        bulkPlayersInput,
      },
    };
    setSavedStates(newSaves);
    localStorage.setItem('worldCupSaves', JSON.stringify(newSaves));
    setSaveSlotName("");
  };

  const loadState = (name: string) => {
    const savedState = savedStates[name];
    if (!savedState) return;

    // Backward compatibility: older saves were raw Player[] arrays.
    if (Array.isArray(savedState)) {
      setPlayers(savedState);
      return;
    }

    if (Array.isArray(savedState.players)) {
      setPlayers(savedState.players);
    }

    if (typeof savedState.bulkPlayersInput === 'string') {
      setBulkPlayersInput(savedState.bulkPlayersInput);
    }
  };

  const deleteState = (name: string) => {
    const newSaves = { ...savedStates };
    delete newSaves[name];
    setSavedStates(newSaves);
    localStorage.setItem('worldCupSaves', JSON.stringify(newSaves));
  };

  const addPlayer = () => {
    const newId = `P${Date.now()}`;
    setPlayers([...players, { id: newId, name: `Player ${players.length + 1}`, teamIds: [] }]);
  };

  const removePlayer = (id: string) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  const updatePlayerName = (id: string, name: string) => {
    setPlayers(players.map(p => p.id === id ? { ...p, name } : p));
  };

  const parseBulkPlayerNames = (rawInput: string): string[] => {
    return rawInput
      .split(/\r?\n|,|;|\t/)
      .map(name => name.trim())
      .filter(Boolean);
  };

  const applyBulkPlayers = () => {
    const parsedNames = parseBulkPlayerNames(bulkPlayersInput);

    if (parsedNames.length === 0) {
      setBulkPlayersError('Enter at least one player name.');
      return;
    }

    const hasExistingAssignments = players.some(player => player.teamIds.length > 0);
    if (hasExistingAssignments) {
      const shouldReplace = window.confirm('Replace all players? This will clear current team assignments.');
      if (!shouldReplace) {
        return;
      }
    }

    const nextPlayers = parsedNames.map((name, index) => ({
      id: `P${Date.now()}-${index}`,
      name,
      teamIds: [],
    }));

    setPlayers(nextPlayers);
    setBulkPlayersError(null);
    setBulkPlayersInput(parsedNames.join('\n'));
  };
  
  const handleReset = () => {
      if(confirmReset) {
          resetTournament();
          setConfirmReset(false);
      } else {
          setConfirmReset(true);
          setTimeout(() => setConfirmReset(false), 3000);
      }
  }

  const handleRandomize = () => {
      if(confirmRandomize) {
          assignTeamsRandomly();
          setConfirmRandomize(false);
      } else {
          setConfirmRandomize(true);
          setTimeout(() => setConfirmRandomize(false), 3000);
      }
  }

  const handleClearAssignments = () => {
      if(confirmClear) {
          clearAllAssignments();
          setConfirmClear(false);
      } else {
          setConfirmClear(true);
          setTimeout(() => setConfirmClear(false), 3000);
      }
  }

  const addTeamToPlayer = (playerId: string, teamId: string) => {
    if (!teamId) return;
    setPlayers(players.map(p => {
      if (p.id === playerId) {
        if (!p.teamIds.includes(teamId)) {
          return { ...p, teamIds: [...p.teamIds, teamId] };
        }
      }
      return p;
    }));
  };

  const removeTeamFromPlayer = (playerId: string, teamId: string) => {
    setPlayers(players.map(p => {
      if (p.id === playerId) {
        return { ...p, teamIds: p.teamIds.filter(id => id !== teamId) };
      }
      return p;
    }));
  };

  const assignedTeamIds = new Set(players.flatMap(p => p.teamIds));
  const unassignedTeams = teams.filter(t => !assignedTeamIds.has(t.id));
  
  const pot1Teams = [...teams].sort((a,b) => a.fifaRanking - b.fifaRanking).slice(0, 8);
  const pot2Teams = [...teams].sort((a,b) => a.fifaRanking - b.fifaRanking).slice(8, 16);
  const pot3Teams = [...teams].sort((a,b) => a.fifaRanking - b.fifaRanking).slice(16);

  const pot1TeamsText = pot1Teams.map(t => t.name).join('\n');
  const pot2TeamsText = pot2Teams.map(t => t.name).join('\n');
  const pot3TeamsText = pot3Teams.map(t => t.name).join('\n');

  const playersCount = players.length || 1;
  const pot1Entries = Math.ceil(8 / playersCount);
  const pot2Entries = Math.ceil(8 / playersCount);
  const pot3Entries = Math.ceil((teams.length - 16) / playersCount);

  const pot1PlayersText = players.flatMap(p => Array(pot1Entries).fill(p.name)).join('\n');
  const pot2PlayersText = players.flatMap(p => Array(pot2Entries).fill(p.name)).join('\n');
  const pot3PlayersText = players.flatMap(p => Array(pot3Entries).fill(p.name)).join('\n');
  const parsedBulkPlayerCount = parseBulkPlayerNames(bulkPlayersInput).length;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyHostUrl = () => {
    if (!cloudGameId || !hostSecret) return;
    const url = getLiveGameUrl();
    if (!url) return;
    
    // Add the secret to the hash part of the URL (after #game=xyz)
    const hostUrl = `${url}&hostSecret=${hostSecret}`;
    navigator.clipboard.writeText(hostUrl);
    setLiveMessage({ type: 'success', text: 'Host URL copied! Open this on your other device to transfer edit rights.' });
    setTimeout(() => setLiveMessage(null), 8000);
  };

  const handleCreateLiveGame = async () => {
    const result = await createLiveGame();

    if (!result.url) {
      setLiveMessage({ type: 'error', text: result.error || 'Could not create a live game link.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(result.url);
      setLiveMessage({ type: 'success', text: 'Live game started and link copied. Share it with viewers for real-time updates.' });
    } catch {
      setLiveMessage({ type: 'success', text: 'Live game started. Copy the current URL from your browser to share.' });
    }
  };

  const handleCopyLiveLink = async () => {
    const liveUrl = getLiveGameUrl();

    if (!liveUrl) {
      setLiveMessage({ type: 'error', text: 'No live game URL is available yet.' });
      return;
    }

    try {
      await navigator.clipboard.writeText(liveUrl);
      setLiveMessage({ type: 'success', text: 'Live viewer URL copied.' });
    } catch {
      setLiveMessage({ type: 'error', text: 'Clipboard permission was blocked. Please copy the URL from the address bar.' });
    }
  };

  const handleDeleteLiveGame = async () => {
    if (!cloudGameId || !isCloudOwner || isDeletingLiveGame) {
      return;
    }

    const shouldDelete = window.confirm('Delete this live game? This cannot be undone. Viewers will lose access to this link.');
    if (!shouldDelete) {
      return;
    }

    setIsDeletingLiveGame(true);
    const result = await deleteLiveGame();
    setIsDeletingLiveGame(false);

    if (result.success) {
      setLiveMessage({ type: 'success', text: 'Live game deleted. You are now back in local mode.' });
      return;
    }

    setLiveMessage({ type: 'error', text: result.error || 'Could not delete the live game.' });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 min-w-0 w-full overflow-hidden">
      <div className={`${SURFACES.cardElevated} p-6 rounded-xl shadow-sm min-w-0`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 border-b border-slate-200 dark:border-slate-700 pb-6">
            <div>
                <h2 className={`text-xl font-black ${TEXT.primary}`}>Players ({players.length})</h2>
                <p className={`text-sm mt-1 ${TEXT.muted}`}>Add players and assign the {teams.length} teams.</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
                <button
                onClick={addPlayer}
                className="flex items-center px-4 py-2 bg-slate-200 dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-800 transition-colors shadow-sm"
                >
                <Plus size={16} className="mr-1.5" /> Add Player
                </button>
                <button
                onClick={() => setIsManualMode(!isManualMode)}
                className={`flex items-center px-4 py-2 rounded font-bold text-sm transition-colors shadow-sm border ${isManualMode ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  Manual Assign
                </button>
                <button
                  onClick={() => setShowSpinModal(true)}
                  className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded font-bold text-sm hover:bg-emerald-500 transition-colors shadow-sm"
                >
                  🎡 Spin The Wheel
                </button>
            </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={() => setIsBulkPlayersOpen(prev => !prev)}
              aria-expanded={isBulkPlayersOpen}
              className="w-full flex items-center justify-between gap-3"
            >
              <span className={`text-sm font-black ${TEXT.primary}`}>Bulk Enter Players</span>
              <span className={`text-xs font-bold px-2 py-1 rounded border border-slate-300 dark:border-slate-600 ${TEXT.muted}`}>
                {isBulkPlayersOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {isBulkPlayersOpen && (
              <>
                <p className={`text-xs mt-3 mb-3 ${TEXT.muted}`}>
                  Paste player names from free text (one per line, or separated by commas/semicolons). Applying this replaces the full player list.
                </p>
                <textarea
                  value={bulkPlayersInput}
                  onChange={(e) => {
                    setBulkPlayersInput(e.target.value);
                    if (bulkPlayersError) {
                      setBulkPlayersError(null);
                    }
                  }}
                  placeholder={'Alice\nBob\nCharlie\n...'}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium min-h-28 ${CONTROLS.input}`}
                />
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className={`text-xs font-semibold ${TEXT.muted}`}>
                    {parsedBulkPlayerCount} player{parsedBulkPlayerCount === 1 ? '' : 's'} detected
                  </span>
                  <button
                    onClick={applyBulkPlayers}
                    disabled={parsedBulkPlayerCount === 0}
                    className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold text-sm hover:bg-slate-700 dark:hover:bg-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Replace Player List
                  </button>
                </div>
                {bulkPlayersError && (
                  <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{bulkPlayersError}</p>
                )}
              </>
            )}
          </div>

          {players.map((player, index) => {
            const theme = getPlayerTheme(index);
            return (
            <div key={player.id} className={`p-4 border rounded-lg shadow-sm flex flex-col min-w-0 ${theme.lightBg} ${theme.border}`}>
              <div className={`flex items-center gap-2 mb-3 border-b pb-2 ${theme.border}`}>
                <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${theme.bg} ${theme.textContrast}`}>
                   {player.name.substring(0, 2).toUpperCase()}
                </div>
                <input
                  type="text"
                  value={player.name}
                  onChange={(e) => updatePlayerName(player.id, e.target.value)}
                  className={`flex-1 font-black bg-transparent focus:outline-none transition-colors px-1 min-w-0 ${theme.text}`}
                  placeholder={`Player ${index + 1}`}
                />
                <button
                  onClick={() => removePlayer(player.id)}
                  className={`${theme.text} hover:opacity-70 p-1 transition-opacity`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2 flex-1">
                {player.teamIds.length === 0 ? (
                  <span className={`${theme.text} opacity-60 text-sm italic py-2`}>No teams assigned</span>
                ) : (
                  player.teamIds.map(tid => {
                    const t = teams.find(x => x.id === tid);
                    return t ? (
                      <span key={tid} className={`inline-flex items-center px-2 py-1 bg-white dark:bg-slate-950 border text-xs font-bold rounded shadow-sm ${theme.border} ${theme.text}`} title={t.name}>
                        <img src={`https://flagcdn.com/w40/${t.iso2}.png`} alt={t.name} className="w-4 h-3 object-cover rounded-sm inline-block mr-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" />
                        {t.id} <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ml-1 bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700`}>Grp {t.group}</span>
                        {isManualMode && (
                          <button onClick={() => removeTeamFromPlayer(player.id, tid)} className="ml-1.5 opacity-50 hover:opacity-100 transition-opacity">
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ) : null;
                  })
                )}
              </div>
              
              {isManualMode && (
                 <div className="mt-3">
                   <select 
                     onChange={(e) => { addTeamToPlayer(player.id, e.target.value); e.target.value = ""; }}
                     className={`w-full text-xs p-1.5 rounded ${CONTROLS.input}`}
                     defaultValue=""
                   >
                     <option value="" disabled>+ Add team...</option>
                     {unassignedTeams.map(t => (
                       <option key={t.id} value={t.id}>{t.name} (Grp {t.group})</option>
                     ))}
                   </select>
                 </div>
              )}
              
              <div className={`mt-4 text-[10px] font-bold uppercase tracking-widest ${theme.text} opacity-80`}>
                  {player.teamIds.length} Teams Assigned
              </div>
            </div>
          )})}
        </div>
      </div>

      <div className="bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Save size={20} className="text-emerald-600 dark:text-emerald-400" />
          <h3 className={`text-lg font-black ${TEXT.primary}`}>Save / Load Team Assignments</h3>
        </div>
        <p className={`text-sm ${TEXT.muted} mb-6`}>
          Save your current player names and team assignments to your browser's local storage so you can recall them later. This does NOT save match scores.
        </p>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 flex gap-2">
            <input 
              type="text" 
              placeholder="Save slot name..." 
              value={saveSlotName}
              onChange={(e) => setSaveSlotName(e.target.value)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${CONTROLS.input}`}
            />
            <button 
              onClick={saveState}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-500 transition-colors shadow-sm flex items-center"
            >
              <Save size={16} className="mr-2" /> Save Current
            </button>
          </div>
        </div>

        {Object.keys(savedStates).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(savedStates).map(([name, data]) => {
              const savedPlayers = Array.isArray(data)
                ? data
                : Array.isArray((data as any).players)
                  ? (data as any).players
                  : [];
              return (
              <div key={name} className="bg-white/80 dark:bg-slate-900 border border-emerald-200 dark:border-slate-800 rounded-lg p-4 flex flex-col shadow-sm">
                <div className="font-bold text-slate-900 dark:text-slate-200 mb-1 truncate" title={name}>{name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mb-4">{(savedPlayers || []).length} players • {(savedPlayers || []).reduce((acc: number, p: any) => acc + (p.teamIds?.length || 0), 0)} teams</div>
                <div className="flex justify-between items-center mt-auto pt-2 border-t border-emerald-200 dark:border-slate-800">
                  <button 
                    onClick={() => loadState(name)}
                    className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 text-sm font-bold flex items-center"
                  >
                    <Download size={14} className="mr-1" /> Load
                  </button>
                  <button 
                    onClick={() => deleteState(name)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete save"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className="text-center py-6 bg-white/80 dark:bg-slate-950/80 rounded-lg border border-dashed border-emerald-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
            No saved assignments yet.
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-white to-sky-50/50 dark:from-slate-900 dark:to-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={20} className="text-sky-600 dark:text-sky-400" />
          <h3 className={`text-lg font-black ${TEXT.primary}`}>Live Game</h3>
        </div>
        <p className={`text-sm ${TEXT.muted} mb-5`}>
          Start a live game URL to sync scores and standings in real time. Viewers can watch updates immediately while only the host can edit.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {!cloudGameId ? (
            <button
              onClick={handleCreateLiveGame}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg font-bold text-sm hover:bg-sky-500 transition-colors shadow-sm inline-flex items-center justify-center disabled:opacity-70"
              disabled={cloudStatus === 'connecting' || isDeletingLiveGame}
            >
              <Link2 size={16} className="mr-2" /> {cloudStatus === 'connecting' ? 'Starting Live Game...' : 'Start Live Game & Copy Link'}
            </button>
          ) : (
            <>
              <button
                onClick={handleCopyLiveLink}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg font-bold text-sm hover:bg-sky-500 transition-colors shadow-sm inline-flex items-center justify-center disabled:opacity-70"
                disabled={isDeletingLiveGame}
              >
                <Link2 size={16} className="mr-2" /> Copy Live Viewer URL
              </button>
              {isCloudOwner && hostSecret && (
                <button
                  onClick={copyHostUrl}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-500 transition-colors shadow-sm inline-flex items-center justify-center disabled:opacity-70"
                  disabled={isDeletingLiveGame}
                  title="Use this link on another device to take over host capabilities"
                >
                  <Copy size={16} className="mr-2" /> Copy Host Transfer Link
                </button>
              )}
            </>
          )}

          {cloudGameId && isCloudOwner && (
            <button
              onClick={handleDeleteLiveGame}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-500 transition-colors shadow-sm inline-flex items-center justify-center disabled:opacity-70"
              disabled={isDeletingLiveGame || cloudStatus === 'connecting'}
            >
              <Trash2 size={16} className="mr-2" /> {isDeletingLiveGame ? 'Deleting Live Game...' : 'Delete Live Game'}
            </button>
          )}

          <span className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold">
            {cloudGameId ? `Game ${cloudGameId} • ${isCloudOwner ? 'Host' : 'Viewer'}` : 'No live game yet'}
          </span>
        </div>

        {(liveMessage || cloudError) && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold border ${
              liveMessage?.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
            }`}
          >
            {liveMessage?.text || cloudError}
          </div>
        )}

        {userGames.length > 0 && (
          <div className="mt-6 border-t border-sky-100 dark:border-slate-800 pt-5">
            <h4 className={`text-sm font-black uppercase tracking-widest ${TEXT.muted} mb-3 flex items-center`}>
              <List size={14} className="mr-2" /> Your Hosted Games
            </h4>
            <div className="space-y-2">
              {userGames.map(game => {
                const isCurrent = cloudGameId === game.id;
                return (
                  <div key={game.id} className={`flex items-center justify-between p-3 rounded-lg text-sm border ${isCurrent ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {game.id} {isCurrent && <span className="ml-2 text-[10px] bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-full uppercase">Current</span>}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Created: {new Date(game.meta.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {!isCurrent && (
                      <a 
                        href={`#game=${game.id}`}
                        className="p-2 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                        title="Open Game"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-red-100/70 dark:bg-red-900/15 p-6 border border-red-200 dark:border-red-900/40 rounded-xl shadow-sm">
          <h3 className="text-sm font-black text-red-800 dark:text-red-400 uppercase tracking-widest mb-2">Danger Zone</h3>
          <p className="text-sm text-red-700 dark:text-red-400 mb-4">Resetting the tournament will clear all match results (group and knockouts) but will keep your players and their assignments.</p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={handleReset}
              className={`flex items-center px-4 py-2 ${confirmReset ? 'bg-red-700 dark:bg-red-600' : 'bg-red-600 dark:bg-red-700/80'} text-white rounded font-bold text-sm hover:bg-red-500 transition-colors shadow-sm`}
            >
                <RotateCcw size={16} className="mr-2"/> {confirmReset ? "Click again to confirm" : "Reset All Matches"}
            </button>
            {settings.allowRandomize && (
              <button 
                onClick={handleRandomize}
                className={`flex items-center px-4 py-2 ${confirmRandomize ? 'bg-red-200 dark:bg-red-800' : 'bg-red-100 dark:bg-red-900/30'} text-red-800 dark:text-red-400 rounded font-bold text-sm hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors shadow-sm border border-red-200 dark:border-red-800`}
              >
                  <Shuffle size={16} className="mr-2"/> {confirmRandomize ? "Click again to confirm" : "Randomize All Teams"}
              </button>
            )}
            <button 
              onClick={handleClearAssignments}
              className={`flex items-center px-4 py-2 ${confirmClear ? 'bg-red-200 dark:bg-red-800' : 'bg-red-100 dark:bg-red-900/30'} text-red-800 dark:text-red-400 rounded font-bold text-sm hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors shadow-sm border border-red-200 dark:border-red-800`}
            >
                <Trash2 size={16} className="mr-2"/> {confirmClear ? "Click again to confirm" : "Clear Assignments"}
            </button>
          </div>
      </div>

      {showSpinModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 lg:p-6">
          <div className={`${SURFACES.card} rounded-xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col max-h-[94vh]`}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className={`text-xl font-black ${TEXT.primary}`}>Spin The Wheel</h2>
              <button onClick={() => setShowSpinModal(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>
            <div className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
              <p className={`${TEXT.muted} mb-6 text-sm`}>
                Copy the lists below and paste them into any "Spin The Wheel" website. We've split this into distinct draws to ensure fairness.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 xl:gap-8">
                {/* Pot 1 */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-black uppercase text-slate-800 dark:text-slate-200 tracking-wider">Draw 1: Top 8 Teams</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Each player gets {pot1Entries} team(s).</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Pot 1 Teams</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot1TeamsText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot1TeamsText, 'pot1Teams')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot1Teams' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Players</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot1PlayersText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot1PlayersText, 'pot1Players')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot1Players' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pot 2 */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-black uppercase text-slate-800 dark:text-slate-200 tracking-wider">Draw 2: Next 8 Teams</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Each player gets {pot2Entries} team(s).</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Pot 2 Teams</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot2TeamsText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot2TeamsText, 'pot2Teams')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot2Teams' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Players</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot2PlayersText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot2PlayersText, 'pot2Players')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot2Players' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pot 3 */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-black uppercase text-slate-800 dark:text-slate-200 tracking-wider">Draw 3: Remaining Teams</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Each player gets {pot3Entries} team(s).</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Pot 3 Teams</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot3TeamsText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot3TeamsText, 'pot3Teams')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot3Teams' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 tracking-wider">Players</h3>
                    <div className="relative">
                      <textarea 
                        className="w-full h-40 lg:h-44 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                        value={pot3PlayersText}
                        readOnly
                      />
                      <button 
                        onClick={() => handleCopy(pot3PlayersText, 'pot3Players')}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center"
                      >
                        {copiedId === 'pot3Players' ? <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Copied!</span> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <a 
                  href="https://spinthewheel.io/sweepstake-generator-template" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-3 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-500 transition-colors shadow-sm"
                >
                  Open spinthewheel.io ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
