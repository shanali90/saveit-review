require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: items, error: itemsError } = await supabase.from('saved_items').select('*');
  if (itemsError) console.error('items error:', itemsError);
  console.log('Items in DB:', items ? items.length : 0);

  const { data: settings, error: settingsError } = await supabase.from('user_settings').select('*');
  if (settingsError) console.error('settings error:', settingsError);
  console.log('Settings in DB:', settings ? settings.length : 0);
}

check();
