import { Match, Player, ScoreConfig, Team, LeaderboardEntry } from '../types';

export function calculateTeamPoints(teamId: string, matches: Match[], config: ScoreConfig): number {
  let points = 0;

  // Calculate points from all matches (group and knockouts)
  const teamMatches = matches.filter(m => (m.status === 'FINISHED' || m.status === 'LIVE') && (m.homeTeamId === teamId || m.awayTeamId === teamId));
  
  teamMatches.forEach(m => {
    if (m.homeScore === null || m.awayScore === null) return;
    const isHome = m.homeTeamId === teamId;
    const teamScore = isHome ? m.homeScore : m.awayScore;
    const oppScore = isHome ? m.awayScore : m.homeScore;

    if (teamScore > oppScore) points += config.matchWin;
    else if (teamScore === oppScore) points += config.matchDraw;
  });

  return points;
}

export function generateLeaderboard(players: Player[], matches: Match[], config: ScoreConfig, teams: Team[]): LeaderboardEntry[] {
  const leaderboard = players.map(player => {
    let totalPoints = 0;
    const playerTeams: Team[] = [];

    player.teamIds.forEach(teamId => {
      const team = teams.find(t => t.id === teamId);
      if (team) {
        playerTeams.push(team);
        totalPoints += calculateTeamPoints(teamId, matches, config);
      }
    });

    // Optionally sort teams within player by points?
    
    return {
      playerId: player.id,
      playerName: player.name,
      points: totalPoints,
      teams: playerTeams,
    };
  });

  return leaderboard.sort((a, b) => b.points - a.points);
}

export function getGroupStandings(groupId: string, matches: Match[], teams: Team[]) {
    const groupTeams = teams.filter(t => t.group === groupId);
    const groupMatches = matches.filter(m => m.stage === 'GROUP' && m.group === groupId && (m.status === 'FINISHED' || m.status === 'LIVE'));
    
    const standings = groupTeams.map(team => {
        let p = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0, pts = 0;
        
        groupMatches.forEach(m => {
            if (m.homeTeamId === team.id || m.awayTeamId === team.id) {
                p++;
                const isHome = m.homeTeamId === team.id;
                const ts = isHome ? m.homeScore! : m.awayScore!;
                const os = isHome ? m.awayScore! : m.homeScore!;
                
                gf += ts;
                ga += os;
                
                if (ts > os) {
                    w++;
                    pts += 3;
                } else if (ts === os) {
                    d++;
                    pts += 1;
                } else {
                    l++;
                }
            }
        });
        
        return {
            ...team,
            played: p, won: w, draw: d, lost: l, gf, ga, gd: gf - ga, points: pts
        };
    });
    
    // Sort by points, then gd, then gf
    return standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });
}
