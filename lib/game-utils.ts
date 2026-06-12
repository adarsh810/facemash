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

export function picsPerRound(playerCount: number): number {
  if (playerCount <= 3) return 3
  if (playerCount <= 5) return 4
  return 5
}

export function generateRoundMixes(
  players: Player[],
  photos: Photo[],
  rounds: number,
  picsCount: number
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
    const comboSize = 2
    const validCombinations = getCombinations(playerIds, comboSize)

    // Shuffle for randomness
    const shuffled = shuffle(validCombinations)

    let added = 0
    for (const combo of shuffled) {
      if (added >= picsCount) break

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

    // Fill remaining slots by cycling through combos (handles small player counts)
    if (added < picsCount) {
      const reshuffled = shuffle(validCombinations)
      for (let attempt = 0; added < picsCount && attempt < picsCount * 10; attempt++) {
        const combo = reshuffled[attempt % reshuffled.length]

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
  if (actualPlayerIds.length !== guessedPlayerIds.length) return 0
  const a = [...actualPlayerIds].sort()
  const b = [...guessedPlayerIds].sort()
  return a.every((id, i) => id === b[i]) ? 1 : 0
}

function deterministicShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr]
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  }
  for (let i = copy.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0
    h ^= h >>> 16
    const j = Math.abs(h) % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function generateChoices(
  mixId: string,
  mixPlayerIds: string[],
  allPlayers: Player[]
): { ids: string[]; label: string }[] {
  const size = mixPlayerIds.length
  const allPlayerIds = allPlayers.map(p => p.id)
  const allCombos = getCombinations(allPlayerIds, size)
  const correctKey = [...mixPlayerIds].sort().join('|')

  const wrongCombos = allCombos.filter(
    combo => [...combo].sort().join('|') !== correctKey
  )

  const shuffledWrong = deterministicShuffle(wrongCombos, mixId + 'w')
  const wrongOptions = shuffledWrong.slice(0, 3)

  const allOptions = deterministicShuffle(
    [mixPlayerIds, ...wrongOptions],
    mixId + 'o'
  )

  return allOptions.map(ids => ({
    ids,
    label: ids.map(id => allPlayers.find(p => p.id === id)?.name ?? '?').join(' + '),
  }))
}
