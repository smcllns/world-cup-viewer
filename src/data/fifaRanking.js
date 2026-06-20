// FIFA/Coca-Cola Men's World Ranking position for each 2026 World Cup team. Used
// as the group tie-breaker once points, goal difference, goals scored, and
// head-to-head are all level — i.e. the last of the official FIFA criteria.
//
// Note: the official order is … 6) team conduct score (cards), 7) FIFA World
// Ranking. We can't reliably compute the conduct score (it needs complete
// disciplinary data we don't have), so we skip straight to FIFA ranking as the
// deterministic decider. Lower number = higher-ranked = placed ahead.
//
// Source: FIFA Men's World Ranking, edition of 2026-06-11 (per-nation list via
// Yahoo Sports). If FIFA publishes a new edition mid-tournament, update here.
export const FIFA_RANK = {
  Argentina: 1,
  Spain: 2,
  France: 3,
  England: 4,
  Portugal: 5,
  Brazil: 6,
  Morocco: 7,
  Netherlands: 8,
  Belgium: 9,
  Germany: 10,
  Croatia: 11,
  Colombia: 13,
  Mexico: 14,
  Senegal: 15,
  Uruguay: 16,
  USA: 17,
  Japan: 18,
  Switzerland: 19,
  Iran: 20,
  Türkiye: 22,
  Ecuador: 23,
  Austria: 24,
  'South Korea': 25,
  Australia: 27,
  Algeria: 28,
  Egypt: 29,
  Canada: 30,
  Norway: 31,
  'Ivory Coast': 33,
  Panama: 34,
  Sweden: 38,
  Czechia: 40,
  Paraguay: 41,
  Scotland: 42,
  Tunisia: 45,
  'DR Congo': 46,
  Uzbekistan: 50,
  Qatar: 56,
  Iraq: 57,
  'South Africa': 60,
  'Saudi Arabia': 61,
  Jordan: 63,
  'Bosnia & Herzegovina': 64,
  'Cape Verde': 67,
  Ghana: 73,
  Curaçao: 82,
  Haiti: 83,
  'New Zealand': 85,
}

// Compare two teams by FIFA ranking (better/lower rank first), falling back to a
// stable alphabetical order if a team somehow isn't listed.
export function byFifaRank(a, b) {
  const ra = FIFA_RANK[a] ?? Infinity
  const rb = FIFA_RANK[b] ?? Infinity
  return ra - rb || a.localeCompare(b)
}
