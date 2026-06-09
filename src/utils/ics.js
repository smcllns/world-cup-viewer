// Generate and download an .ics (iCalendar) file for a match so viewers can
// drop kickoff into Apple Calendar / Google Calendar / Outlook. Times are
// written in UTC (the trailing "Z"), which every calendar app localizes
// automatically — so the event lands at the right moment in any timezone.

import { VENUES } from '../data/venues.js'
import { STAGE_LABELS } from '../data/matches.js'
import { US_BROADCAST } from '../data/broadcast.js'

const MATCH_MINUTES = 135

function toICSDate(date) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    'T' +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds()) +
    'Z'
  )
}

// Fold/escape text per RFC 5545.
function esc(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildICS(match) {
  const venue = VENUES[match.venue]
  const start = new Date(match.ko)
  const end = new Date(start.getTime() + MATCH_MINUTES * 60 * 1000)
  const stageLabel = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]

  const summary = `World Cup: ${match.t1} vs ${match.t2}`
  const location = `${venue.name}, ${venue.city}, ${venue.country}`
  const description = [
    `${stageLabel} · Match ${match.num}`,
    `English: ${US_BROADCAST.english.tv.join(' / ')} (stream: ${US_BROADCAST.english.streaming.join(', ')})`,
    `Spanish: ${US_BROADCAST.spanish.tv.join(' / ')} (stream: ${US_BROADCAST.spanish.streaming.join(', ')})`,
  ].join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//World Cup 2026 Viewer//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:wc2026-match-${match.num}@worldcupviewer`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

// One VEVENT block (without the calendar wrapper) for a match.
function buildVEvent(match) {
  const venue = VENUES[match.venue]
  const start = new Date(match.ko)
  const end = new Date(start.getTime() + MATCH_MINUTES * 60 * 1000)
  const stageLabel = match.stage === 'Group' ? `Group ${match.group}` : STAGE_LABELS[match.stage]
  const score = Array.isArray(match.score) ? ` (${match.score[0]}–${match.score[1]})` : ''
  const summary = `World Cup: ${match.t1} vs ${match.t2}${score}`
  const location = `${venue.name}, ${venue.city}, ${venue.country}`
  const description = [
    `${stageLabel} · Match ${match.num}`,
    `English: ${US_BROADCAST.english.tv.join(' / ')} · Spanish: ${US_BROADCAST.spanish.tv.join(' / ')}`,
  ].join('\\n')
  return [
    'BEGIN:VEVENT',
    `UID:wc2026-match-${match.num}@worldcupviewer`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
  ].join('\r\n')
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadICS(match) {
  downloadText(buildICS(match), `wc2026-match-${match.num}.ics`)
}

// A whole calendar of matches (used by the "download all / my teams / filtered" buttons).
export function buildICSCollection(matches, calName = 'World Cup 2026') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//World Cup 2026 Viewer//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
    ...matches.map(buildVEvent),
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadICSCollection(matches, filename = 'wc2026.ics', calName = 'World Cup 2026') {
  downloadText(buildICSCollection(matches, calName), filename)
}

// Turn an http(s) feed URL into a webcal:// subscription URL (what a calendar
// app expects to register a live subscription).
export function webcalUrl(httpsUrl) {
  return httpsUrl.replace(/^https?:/, 'webcal:')
}

// A "subscribe in Google Calendar" deep link for an ICS feed. Google's `cid`
// must be a RAW webcal:// URL — passing an https:// URL or a percent-encoded one
// makes Google reject it with "check the URL". Our feed URLs use "," (not "&")
// to separate teams, so the query string survives un-encoded inside `cid`.
export function googleCalendarUrl(httpsUrl) {
  return `https://www.google.com/calendar/render?cid=${webcalUrl(httpsUrl)}`
}
