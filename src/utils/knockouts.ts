import { Match, Team } from '../types';
import { getGroupStandings } from './scoring';

export function autoPopulateKnockouts(matches: Match[], teams: Team[]): Match[] {
  // get all groups
  const groups = Array.from(new Set(teams.map(t => t.group))).sort();

  const isGroupFinished = (groupId: string) => {
    const groupMatches = matches.filter(m => m.stage === 'GROUP' && m.group === groupId);
    return groupMatches.length > 0 && groupMatches.every(m => m.status === 'FINISHED');
  };

  const allGroupsFinished = groups.every(g => isGroupFinished(g));

  const firsts: Record<string, string> = {};
  const seconds: Record<string, string> = {};
  const thirdsList: any[] = [];

  groups.forEach((groupId) => {
    const standing = getGroupStandings(groupId, matches, teams);
    const finished = isGroupFinished(groupId);

    if (finished) {
      if (standing.length >= 1) firsts[groupId] = standing[0].id;
      if (standing.length >= 2) seconds[groupId] = standing[1].id;
      if (standing.length >= 3) {
        thirdsList.push({
           groupId,
           teamId: standing[2].id,
           points: standing[2].points,
           gd: standing[2].gd,
           gf: standing[2].gf
        });
      }
    }
  });

  // rank thirds: points, gd, gf
  thirdsList.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });

  // Decide how many advance based on placeholders
  let thirdPlaceNeededCount = 0;
  for (const m of matches) {
      if (m.placeholderHome?.startsWith('3')) thirdPlaceNeededCount++;
      if (m.placeholderAway?.startsWith('3')) thirdPlaceNeededCount++;
  }

  let finalThirdsAdvance: any[] = [];
  // Only allocate 3rd-place slots if all groups are fully finished 
  if (allGroupsFinished && thirdPlaceNeededCount > 0) {
      finalThirdsAdvance = thirdsList.slice(0, thirdPlaceNeededCount);
  }

  const advancingThirdsGroups = finalThirdsAdvance.map(t => t.groupId);
  const nextMatches = matches.map(m => ({ ...m })); // deep-ish clone

  // Map 1st and 2nd placeholders automatically
  function assignThirds(matchIndicesWithThirds: {mIdx: number, isHome: boolean, validGroups: string[]}[], currentIdx: number, usedTeamsMap: Map<string, string>): boolean {
     if (currentIdx === matchIndicesWithThirds.length) return true;
     
     const {mIdx, isHome, validGroups} = matchIndicesWithThirds[currentIdx];
     for (const advanceGroup of advancingThirdsGroups) {
         if (!usedTeamsMap.has(advanceGroup) && validGroups.includes(advanceGroup)) {
             usedTeamsMap.set(advanceGroup, advanceGroup);
             if (assignThirds(matchIndicesWithThirds, currentIdx + 1, usedTeamsMap)) {
                  const m = nextMatches[mIdx];
                  const teamId = finalThirdsAdvance.find(t => t.groupId === advanceGroup)?.teamId ?? null;
                  if (isHome) m.homeTeamId = teamId;
                  else m.awayTeamId = teamId;
                  return true;
             }
             usedTeamsMap.delete(advanceGroup);
         }
     }
     return false;
  }

  const thirdRequirements: {mIdx: number, isHome: boolean, validGroups: string[]}[] = [];

  for (let i = 0; i < nextMatches.length; i++) {
     const m = nextMatches[i];
     const isApiAlignedFixture = m.stage !== 'GROUP' && Boolean(m.providerMatchId);
     if (isApiAlignedFixture) {
        continue;
     }
     // handle 1st
     if (m.placeholderHome?.match(/^1[A-Z]$/)) {
        nextMatches[i].homeTeamId = firsts[m.placeholderHome[1]] ?? null;
     }
     if (m.placeholderAway?.match(/^1[A-Z]$/)) {
        nextMatches[i].awayTeamId = firsts[m.placeholderAway[1]] ?? null;
     }
     // handle 2nd
     if (m.placeholderHome?.match(/^2[A-Z]$/)) {
        nextMatches[i].homeTeamId = seconds[m.placeholderHome[1]] ?? null;
     }
     if (m.placeholderAway?.match(/^2[A-Z]$/)) {
        nextMatches[i].awayTeamId = seconds[m.placeholderAway[1]] ?? null;
     }

     // handle 3rd
     if (m.placeholderHome?.startsWith('3')) {
        nextMatches[i].homeTeamId = null;
        thirdRequirements.push({
            mIdx: i,
            isHome: true,
            validGroups: m.placeholderHome.substring(1).split('')
        });
     }
     if (m.placeholderAway?.startsWith('3')) {
        nextMatches[i].awayTeamId = null;
        thirdRequirements.push({
            mIdx: i,
            isHome: false,
            validGroups: m.placeholderAway.substring(1).split('')
        });
     }

     // handle W (Winners) and L (Losers)
     const resolveKnockout = (placeholder: string | undefined): string | null | undefined => {
         if (!placeholder) return undefined;
         if (placeholder.startsWith('W') || placeholder.startsWith('L')) {
             const isWinner = placeholder.startsWith('W');
             const parentMatchId = 'M' + placeholder.substring(1);
             const parentMatch = nextMatches.find(x => x.id === parentMatchId);
             
             if (parentMatch && parentMatch.status === 'FINISHED' && parentMatch.homeScore !== null && parentMatch.awayScore !== null) {
                 if (parentMatch.homeScore > parentMatch.awayScore) {
                     return isWinner ? parentMatch.homeTeamId : parentMatch.awayTeamId;
                 } else if (parentMatch.awayScore > parentMatch.homeScore) {
                     return isWinner ? parentMatch.awayTeamId : parentMatch.homeTeamId;
                 }
                 // Handle draws gracefully (let user manually select the winner in the dropdown)
                 return undefined; 
             }
             return null; // Return null if matches aren't fully resolved
         }
         return undefined; // Indicates it wasn't a W/L placeholder
     };

     const resolvedHome = resolveKnockout(m.placeholderHome);
     if (resolvedHome !== undefined) nextMatches[i].homeTeamId = resolvedHome;
     
     const resolvedAway = resolveKnockout(m.placeholderAway);
     if (resolvedAway !== undefined) nextMatches[i].awayTeamId = resolvedAway;
  }

  if (thirdRequirements.length > 0) {
      assignThirds(thirdRequirements, 0, new Map());
  }

  return nextMatches;
}
