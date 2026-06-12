export type GameStatus = 'lobby' | 'uploading' | 'playing' | 'round_results' | 'finished'
export type RoundMixStatus = 'pending' | 'generating' | 'ready' | 'failed'

export interface Game {
  id: string
  code: string
  host_session_id: string
  status: GameStatus
  rounds: number
  current_round: number
  current_pic_index: number
  created_at: string
}

export interface Player {
  id: string
  game_id: string
  name: string
  session_id: string
  is_host: boolean
  upload_done: boolean
  created_at: string
}

export interface Photo {
  id: string
  game_id: string
  player_id: string
  photo_url: string
  photo_index: number
  prompt: string
  created_at: string
}

export interface RoundMix {
  id: string
  game_id: string
  round_number: number
  pic_index: number
  player_ids: string[]
  photo_ids: string[]
  mixed_photo_url: string | null
  status: RoundMixStatus
  created_at: string
}

export interface Guess {
  id: string
  round_mix_id: string
  player_id: string
  guessed_player_ids: string[]
  score: number
  created_at: string
}

export interface RoundMixPlan {
  round_number: number
  pic_index: number
  player_ids: string[]
  photo_ids: string[]
}
