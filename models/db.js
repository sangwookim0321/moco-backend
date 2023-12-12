const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

module.exports = supabase
