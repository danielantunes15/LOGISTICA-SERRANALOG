// js/supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cole aqui a URL e a Chave do seu NOVO banco de dados Supabase
const SUPABASE_URL = 'https://wmcrlxltlusagroelfzy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtY3JseGx0bHVzYWdyb2VsZnp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjQyMDksImV4cCI6MjA4OTA0MDIwOX0.GO0_GaOgGHq-VsUhguPuqARtIKWwt9N0il_lOK3__C8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);