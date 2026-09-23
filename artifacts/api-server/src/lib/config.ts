export const publicConfig = {
  supabaseUrl:
    process.env.SUPABASE_URL ?? "https://wedirqhdwhbgvxbfoogl.supabase.co",
  publishableKey:
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_wTFGDzMB3bS1n4H7wC-9TQ_BNhL-0F9",
  get aiEnabled() {
    return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  },
};