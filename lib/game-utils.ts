import { Player, Photo, RoundMixPlan } from './types'

export function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getCombinations(arr: string[], k: number): string[][] {
  const result: string[][] = []
  function helper(start: number, combo: string[]) {
    if (combo.length === k) {
      result.push([...combo])
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      helper(i + 1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return result
}

export function generateRoundMixes(
  players: Player[],
  photos: Photo[],
  rounds: number
): RoundMixPlan[] {
  const playerIds = players.map((p) => p.id)
  const photosByPlayer: Record<string, Photo[]> = {}
  for (const photo of photos) {
    if (!photosByPlayer[photo.player_id]) photosByPlayer[photo.player_id] = []
    photosByPlayer[photo.player_id].push(photo)
  }

  const mixes: RoundMixPlan[] = []
  const usedCombinations = new Set<string>()

  for (let round = 1; round <= rounds; round++) {
    const comboSize = round <= 2 ? 2 : 3
    const validCombinations = getCombinations(playerIds, comboSize)

    // Shuffle for randomness
    const shuffled = shuffle(validCombinations)

    let added = 0
    for (const combo of shuffled) {
      if (added >= 5) break

      const key = [...combo].sort().join('|')
      if (usedCombinations.has(key)) continue

      // Make sure all players have photos
      const allHavePhotos = combo.every(
        (pid) => photosByPlayer[pid] && photosByPlayer[pid].length > 0
      )
      if (!allHavePhotos) continue

      usedCombinations.add(key)

      // Pick a random photo from each player in the combo
      const photoIds = combo.map((pid) => {
        const playerPhotos = photosByPlayer[pid]
        return playerPhotos[Math.floor(Math.random() * playerPhotos.length)].id
      })

      mixes.push({
        round_number: round,
        pic_index: added,
        player_ids: combo,
        photo_ids: photoIds,
      })
      added++
    }

    // If we couldn't fill 5 slots with unique combos, reuse combos
    if (added < 5) {
      const reshuffled = shuffle(validCombinations)
      for (const combo of reshuffled) {
        if (added >= 5) break

        const allHavePhotos = combo.every(
          (pid) => photosByPlayer[pid] && photosByPlayer[pid].length > 0
        )
        if (!allHavePhotos) continue

        const photoIds = combo.map((pid) => {
          const playerPhotos = photosByPlayer[pid]
          return playerPhotos[Math.floor(Math.random() * playerPhotos.length)].id
        })

        mixes.push({
          round_number: round,
          pic_index: added,
          player_ids: combo,
          photo_ids: photoIds,
        })
        added++
      }
    }
  }

  return mixes
}

export function calculateScore(
  actualPlayerIds: string[],
  guessedPlayerIds: string[]
): number {
  let score = 0
  for (const id of guessedPlayerIds) {
    if (actualPlayerIds.includes(id)) {
      score++
    }
  }
  return score
}
