import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rnejrzbqomwbtispoasy.supabase.co'
const supabaseAnonKey = 'sb_publishable_ga8BrhRqOLIbLeqC1GdcJA_4kMhMNf1'

let client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

export const supabase = getSupabaseClient()
