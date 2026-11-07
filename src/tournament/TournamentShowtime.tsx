import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useRef, useState, type CSSProperties } from 'react'
import { Face } from '../components/Face'
import { airhorn, initAudio } from '../lib/audio'
import type { TournamentPlayer, TournamentTeam } from './types'

const TAUNTS = ['TRUST THE PROCESS', 'CALCULATED. PROBABLY.', 'MENTAL: QUESTIONABLE', 'WE SCALE', 'COMMS ARE OPTIONAL']

/** Only the supplied participants take the stage. Motion is bounded even for huge events. */
export function FaceCrew({ players, color = '#ffd23f', crowned = false, interactive = false }: {
  players: TournamentPlayer[]; color?: string; crowned?: boolean; interactive?: boolean
}) {
  const reduced = useReducedMotion()
  const element = useRef<HTMLDivElement>(null)
  const visible = useInView(element)
  const [bonk, setBonk] = useState<{ id: string; count: number } | null>(null)
  return <div ref={element} className={`tn-face-crew ${crowned ? 'crowned' : ''} ${visible ? 'is-visible' : ''}`} style={{ '--crew-color': color } as CSSProperties}>
    {players.slice(0, 5).map((p, i) => {
      const content = <>
        <motion.span className="tn-bobble" key={bonk?.id === p.id ? bonk.count : 0}
          initial={reduced ? false : { y: 110, rotate: i % 2 ? 55 : -55, scale: .3, opacity: 0 }}
          whileInView={{ y: 0, rotate: 0, scale: 1, opacity: 1 }} viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 230, damping: 12, delay: bonk?.id === p.id ? 0 : i * .08 }}>
          <span className="tn-bobble-idle" style={{ '--head-delay': `${i * -.47}s`, '--head-tilt': `${i % 2 ? 7 : -7}deg` } as CSSProperties}>
            {crowned && <span className="tn-head-crown" aria-hidden="true">♛</span>}
            <Face src={p.img} alt="" className="tn-cutout" />
          </span>
        </motion.span>
        <strong className="tn-name-tape">{p.name}</strong>
        {interactive && <span className="tn-head-taunt" aria-hidden="true">{TAUNTS[i]}</span>}
      </>
      return interactive ? <button type="button" className="tn-crew-member" key={p.id} aria-label={`Hype up ${p.name}`}
        onClick={() => { initAudio(); airhorn(); setBonk((v) => ({ id: p.id, count: (v?.count ?? 0) + 1 })) }}>{content}</button>
        : <div className="tn-crew-member" key={p.id}>{content}</div>
    })}
  </div>
}

export function FaceCloud({ players }: { players: TournamentPlayer[] }) {
  return <div className="tn-face-cloud" aria-hidden="true">
    {players.slice(0, 12).map((p, i) => <span className="tn-cloud-head" key={p.id} style={{
      '--head-delay': `${i * -.6}s`, '--cloud-x': `${8 + (i * 29) % 80}%`, '--cloud-y': `${8 + (i * 37) % 70}%`,
      '--cloud-tilt': `${(i % 3 - 1) * 20}deg`, '--cloud-size': `${70 + (i % 3) * 20}px`,
    } as CSSProperties}><Face src={p.img} alt="" className="tn-cutout" /></span>)}
  </div>
}

export function MatchPoster({ teams, label, score }: { teams: TournamentTeam[]; label: string; score?: string }) {
  return <div className="tn-match-poster">
    <span className="tn-poster-label">{label}</span>
    <div className="tn-poster-corners">{teams.slice(0, 2).map((team, i) => <div className={`tn-poster-team side-${i}`} key={team.id} style={{ '--crew-color': team.color } as CSSProperties}>
      <FaceCrew players={team.players} color={team.color} />
      <h2>{team.name}</h2>
    </div>)}</div>
    <span className="tn-versus" aria-label={score ? `Score ${score}` : 'Versus'}>{score ?? 'VS'}</span>
    <span className="tn-poster-sticker" aria-hidden="true">{teams.length < 2 ? 'FREE PASS. ACT NATURAL.' : 'FRIENDSHIP ON COOLDOWN'}</span>
  </div>
}
