import type { CSSProperties } from 'react'
import { Face } from '../components/Face'
import { FaceCloud, FaceCrew, MatchPoster } from '../tournament/TournamentShowtime'
import type { Team } from '../types'
import { currentMatch, isComplete, phaseOf, pot, standings } from './engine'
import { LANE_EMOJI, LANE_LABEL } from './LeagueSetup'
import type { League, LeagueMatch, PointsMode, Standing } from './types'
import { WallpaperPicker } from './WallpaperPicker'

export const money = (league: League, amount: number) =>
  `${amount.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} ${league.rules.currency}`

export function stakeLabel(match: LeagueMatch) {
  if (!match.stake) return match.points === 'WHEEL' ? '🎡 Wheel' : '📈 Win prediction'
  return match.stake.BLUE === match.stake.RED ? `${match.points === 'WHEEL' ? '🎡' : '📈'} ${match.stake.BLUE} pts to the winners`
    : `📈 Blue +${match.stake.BLUE} · Red +${match.stake.RED}`
}

const MEDAL = ['🥇', '🥈', '🥉']
export const SIDE_COLOR: Record<Team, string> = { BLUE: '#2e8bff', RED: '#ff3b3b' }

/** A drawn match as two poster "teams", in lane order once lanes are set. */
export function matchTeams(league: League, match: LeagueMatch) {
  const side = (s: Team) => {
    const ids = match.result ? match.result.matchups.map((m) => (s === 'BLUE' ? m.blue : m.red).id) : (s === 'BLUE' ? match.blue : match.red)!
    return { id: s, name: `${s === 'BLUE' ? 'Blue' : 'Red'} +${match.stake![s]}`, color: SIDE_COLOR[s],
      players: ids.map((id) => league.players.find((p) => p.id === id)!) }
  }
  return [side('BLUE'), side('RED')]
}

const POSTER_LABELS = ['TEN FRIENDS ENTER. FIVE FRIENDS COPE.', 'TEMPORARY ALLIES. PERMANENT GRUDGES.', 'TRUST NOBODY. ESPECIALLY YOUR JUNGLER.', 'YESTERDAY’S TEAMMATE, TODAY’S PROBLEM.', 'LAST ONE. MAKE IT COUNT.']

/** Consecutive wins (positive) or losses (negative) up to the latest result. */
function streak(league: League, playerId: string): number {
  let run = 0
  for (const m of [...league.matches].reverse()) {
    if (!m.winner || !m.blue || !m.red) continue
    const won = (m.winner === 'BLUE' ? m.blue : m.red).includes(playerId)
    if (run === 0) run = won ? 1 : -1
    else if (won === run > 0) run += won ? 1 : -1
    else break
  }
  return run
}

export function Leaderboard({ league, rows = standings(league) }: { league: League; rows?: Standing[] }) {
  // Before any result everyone is "tied for 1st" — true, but not worth showing.
  const started = league.matches.some((m) => m.winner)
  const lastPlace = rows[rows.length - 1]?.place
  return <ol className="lg-board">{rows.map((r, i) => {
    const s = started ? streak(league, r.player.id) : 0
    const last = started && r.place === lastPlace && r.place > 1
    return <li key={r.player.id} className={`${started && r.payout > 0 ? 'in-the-money' : ''} ${last ? 'wooden-spoon' : ''}`}
      style={{ '--row-delay': `${i * 0.05}s` } as CSSProperties}>
      <span className="lg-board-place">{!started ? '·' : last ? '💀' : MEDAL[r.place - 1] ?? r.place}{started && r.tied && <small>tied</small>}</span>
      <span className="lg-board-head"><Face src={r.player.img} alt="" className="tn-cutout" /></span>
      <span className="lg-board-name"><strong>{r.player.name}</strong>
        <small>{r.wins}W · {r.played - r.wins}L{s >= 2 ? ` · 🔥 ${s} in a row` : s <= -2 ? ` · 🧊 ${-s} L streak` : ''}</small></span>
      <span className="lg-board-points"><b>{r.points}</b><small>PTS</small></span>
      <span className="lg-board-prize">{started && r.payout > 0 ? <>💰 {money(league, r.payout)}{r.tied && <small>split</small>}</> : last ? <small>wooden spoon</small> : ''}</span>
    </li>
  })}</ol>
}

function Side({ league, match, side }: { league: League; match: LeagueMatch; side: Team }) {
  const ids = side === 'BLUE' ? match.blue : match.red
  if (!ids) return null
  return <div className={`lg-side ${side.toLowerCase()} ${match.winner === side ? 'won' : match.winner ? 'lost' : ''}`}>
    {ids.map((id, i) => {
      const p = league.players.find((x) => x.id === id)!
      return <span key={id} className="lg-side-head" style={{ '--tilt': `${i % 2 ? 6 : -6}deg` } as CSSProperties}>
        <Face src={p.img} alt={p.name} className="tn-cutout" /></span>
    })}
    <b>{match.winner === side ? `+${match.stake![side]} 🏆` : match.winner ? '😭' : ''}</b>
  </div>
}

export function LeagueDashboard({ league, onBack, onChoose, onSpin, onDraw, onLanes, onCard, onReveal, onFinal, onUndo, onWallpaper, onDelete }: {
  league: League
  onWallpaper: (dataUrl: string | null) => void
  onDelete: () => void
  onBack: () => void
  onChoose: (points: PointsMode) => void
  onSpin: () => void
  onDraw: () => void
  onLanes: () => void
  onCard: () => void
  onReveal: () => void
  onFinal: () => void
  onUndo: () => void
}) {
  const match = currentMatch(league)
  const complete = isComplete(league)
  const phase = match ? phaseOf(match) : 'DONE'
  const nextIndex = phase === 'DONE' ? league.matches.length : match!.index
  const policy = league.rules.schedule[nextIndex]
  const total = league.rules.schedule.length

  const rows = standings(league)
  const champions = rows.filter((r) => r.place === 1).map((r) => r.player)
  const drawn = match?.blue && !match.winner

  let next
  if (complete) next = <><div><span className="tn-sticker">INSUFFERABLE UNTIL NEXT TIME</span>
    <h2>{champions.map((p) => p.name).join(' & ')}</h2><p>Somebody owes somebody money 💸</p>
    <div className="tn-actions"><button className="tn-button gold tn-big-button" onClick={onFinal}>🏆 Crown the champion →</button></div></div>
    <FaceCrew players={champions} crowned interactive /></>
  else if (phase === 'DONE') next = <><span className="tn-sticker">MATCH {nextIndex + 1} OF {total} · {LANE_EMOJI[policy]} {LANE_LABEL[policy].toUpperCase()}</span>
    <h2>How much is this one worth?</h2>
    <p>Decide before the teams are drawn. No take-backs. (Well, there’s an undo button.)</p>
    <div className="lg-choice">
      <button className="lg-choice-card wheel" onClick={() => onChoose('WHEEL')}>
        <span className="lg-choice-emoji">🎡</span><strong>Spin the wheel</strong>
        <small>Every winner gets {Math.min(...league.rules.wheel)}–{Math.max(...league.rules.wheel)} pts. Pure chaos.</small>
        <i className="lg-choice-tag">GAMBLING*</i></button>
      <button className="lg-choice-card rank" onClick={() => onChoose('RANK')}>
        <span className="lg-choice-emoji">📈</span><strong>Win prediction</strong>
        <small>Average rank sets the odds. Underdogs get up to 9, favourites as little as 1.</small>
        <i className="lg-choice-tag">UPSET BONUS</i></button>
    </div>
    <p className="lg-fineprint">*not gambling, it’s 150 kr between friends</p></>
  else {
    next = <><span className="tn-sticker">MATCH {match!.index + 1} OF {total} · {LANE_EMOJI[match!.lanes]} {LANE_LABEL[match!.lanes].toUpperCase()} · {stakeLabel(match!).toUpperCase()}</span>
      {phase === 'SPIN' && <><h2>The wheel hungers 🎡</h2><div className="tn-actions"><button className="tn-button gold tn-big-button" onClick={onSpin}>To the wheel →</button></div></>}
      {phase === 'DRAW' && <><h2>Time to ruin some friendships 🎲</h2><div className="tn-actions"><button className="tn-button gold tn-big-button" onClick={onDraw}>Draw teams</button></div></>}
      {phase === 'LANES' && <><h2>Teams are arguing about lanes… 🗣️</h2><p>Nobody wants support. Someone has to.</p>
        <div className="tn-actions"><button className="tn-button gold tn-big-button" onClick={onLanes}>Set lanes →</button></div></>}
      {phase === 'PLAY' && <><h2>Go win. Or don’t. ⚔️</h2><p>Come back and hit the winner on the fight card when the Nexus pops.</p>
        <div className="tn-actions"><button className="tn-button gold tn-big-button" onClick={onCard}>Fight card →</button>
          <button className="tn-button" onClick={onReveal}>🔁 Replay reveal</button>
          {match!.lanes === 'CHOSEN' && <button className="tn-button" onClick={onLanes}>✏️ Edit lanes</button>}</div></>}
    </>
  }

  return <div className="tn-page">
    <section className="tn-home-hero lg-hero">
      <FaceCloud players={league.players} />
      <div className="tn-party-copy"><span className="tn-eyebrow">IN HOUSE / POINTS LEAGUE</span>
        <h2>{league.name}</h2>
        <div className="lg-money">
          <span className="lg-money-chip pot">💰 {money(league, pot(league))} POT</span>
          {league.rules.payouts.map((amount, i) => <span key={i} className="lg-money-chip">{MEDAL[i] ?? `#${i + 1}`} {money(league, amount)}</span>)}
          <span className="lg-money-chip">⚔️ {league.matches.filter((m) => m.winner).length}/{total} played</span>
        </div>
        <div className="tn-actions"><button className="tn-button" onClick={onBack}>← Leagues</button>
          {match && <button className="tn-button danger" onClick={onUndo}>↶ Undo</button>}
          <WallpaperPicker value={league.wallpaper} onChange={onWallpaper} compact />
          <button className="tn-button danger" onClick={onDelete}>🗑️ Delete league</button></div>
      </div>
    </section>

    {drawn && <section className="tn-next tn-next-poster lg-poster">
      <MatchPoster teams={matchTeams(league, match!)} label={`MATCH ${match!.index + 1} · ${POSTER_LABELS[match!.index % POSTER_LABELS.length]}`} />
    </section>}
    <section className={`tn-panel tn-next lg-next ${complete ? 'champion tn-winner-banner' : ''}`}>{next}</section>

    <div className="lg-columns">
      <section className="tn-panel"><div className="tn-section-title"><h2>🏆 Leaderboard</h2><span className="tn-chip">LIVE</span></div>
        <Leaderboard league={league} rows={rows} /></section>
      <section className="tn-panel"><div className="tn-section-title"><h2>📅 Matches</h2></div>
        <ol className="lg-matches">{league.rules.schedule.map((policy, i) => {
          const m = league.matches[i]
          return <li key={i} className={m ? (m.winner ? 'done' : 'live') : 'upcoming'}>
            <div className="lg-match-head"><span className="lg-match-num">{i + 1}</span>
              <span>{LANE_EMOJI[policy]} {LANE_LABEL[policy]}</span>
              <span className="lg-match-stake">{m ? stakeLabel(m) : '❓ up next'}</span></div>
            {m?.blue && <div className="lg-match-sides"><Side league={league} match={m} side="BLUE" /><Side league={league} match={m} side="RED" /></div>}
          </li>
        })}</ol></section>
    </div>
    <p className="tn-note">Saved automatically in this browser. Undo steps back one result or abandons the open match. Replaying it draws the same teams, so no rerolling your way out of a bad one.</p>
  </div>
}
