import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rnejrzbqomwbtispoasy.supabase.co'
const supabaseAnonKey = 'sb_publishable_ga8BrhRqOLIbLeqC1GdcJA_4kMhMNf1'

export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
