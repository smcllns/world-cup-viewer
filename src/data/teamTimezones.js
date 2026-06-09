// Home timezone(s) for each qualified team's country, keyed by the exact team
// name used in teams.js. Countries that span more than one zone list each one
// (ordered roughly west→east) so a hover can show every local kickoff time a
// fan back home might read off their own clock. Same-offset zones are collapsed
// at render time (see teamLocalKickoffs in utils/time.js), so listing a
// representative set per offset is enough — we don't enumerate every micro-zone
// or far-flung overseas territory.
export const TEAM_TIMEZONES = {
  // Group A
  Mexico: ['America/Tijuana', 'America/Hermosillo', 'America/Mexico_City', 'America/Cancun'],
  'South Africa': ['Africa/Johannesburg'],
  'South Korea': ['Asia/Seoul'],
  Czechia: ['Europe/Prague'],

  // Group B
  Canada: [
    'America/Vancouver',
    'America/Edmonton',
    'America/Winnipeg',
    'America/Toronto',
    'America/Halifax',
    'America/St_Johns',
  ],
  'Bosnia & Herzegovina': ['Europe/Sarajevo'],
  Qatar: ['Asia/Qatar'],
  Switzerland: ['Europe/Zurich'],

  // Group C
  Brazil: ['America/Rio_Branco', 'America/Manaus', 'America/Sao_Paulo', 'America/Noronha'],
  Morocco: ['Africa/Casablanca'],
  Haiti: ['America/Port-au-Prince'],
  Scotland: ['Europe/London'],

  // Group D
  USA: [
    'Pacific/Honolulu',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
  ],
  Paraguay: ['America/Asuncion'],
  Australia: ['Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney'],
  Türkiye: ['Europe/Istanbul'],

  // Group E
  Germany: ['Europe/Berlin'],
  Curaçao: ['America/Curacao'],
  'Ivory Coast': ['Africa/Abidjan'],
  Ecuador: ['Pacific/Galapagos', 'America/Guayaquil'],

  // Group F
  Netherlands: ['Europe/Amsterdam'],
  Japan: ['Asia/Tokyo'],
  Sweden: ['Europe/Stockholm'],
  Tunisia: ['Africa/Tunis'],

  // Group G
  Belgium: ['Europe/Brussels'],
  Egypt: ['Africa/Cairo'],
  Iran: ['Asia/Tehran'],
  'New Zealand': ['Pacific/Auckland', 'Pacific/Chatham'],

  // Group H
  Spain: ['Atlantic/Canary', 'Europe/Madrid'],
  'Cape Verde': ['Atlantic/Cape_Verde'],
  'Saudi Arabia': ['Asia/Riyadh'],
  Uruguay: ['America/Montevideo'],

  // Group I
  France: ['Europe/Paris'],
  Senegal: ['Africa/Dakar'],
  Iraq: ['Asia/Baghdad'],
  Norway: ['Europe/Oslo'],

  // Group J
  Argentina: ['America/Argentina/Buenos_Aires'],
  Algeria: ['Africa/Algiers'],
  Austria: ['Europe/Vienna'],
  Jordan: ['Asia/Amman'],

  // Group K
  Portugal: ['Atlantic/Azores', 'Europe/Lisbon'],
  'DR Congo': ['Africa/Kinshasa', 'Africa/Lubumbashi'],
  Uzbekistan: ['Asia/Tashkent'],
  Colombia: ['America/Bogota'],

  // Group L
  England: ['Europe/London'],
  Croatia: ['Europe/Zagreb'],
  Ghana: ['Africa/Accra'],
  Panama: ['America/Panama'],
}
