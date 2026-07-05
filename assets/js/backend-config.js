/*
  Copy Trader table-only backend configuration.
  ضع بيانات مشروع Supabase هنا بعد تشغيل ملف backup.sql داخل SQL Editor.
  لا يتم استخدام Supabase Auth إطلاقاً؛ كل شيء يمر عبر الجداول و RPC functions.
*/
window.CopyTraderConfig = {
  supabaseUrl: "https://ksmmwvwbrofbbxcvztii.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzbW13dndicm9mYmJ4Y3Z6dGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNTY4NjIsImV4cCI6MjA5ODgzMjg2Mn0.pGR-dwbB-T4_FzT950I5uuKGgHb7ixQIDOIaHsalq2w",
  publicSiteUrl: window.location.origin || "https://fadeomalli-cmd.github.io/hayzaher/",
  localPreviewMode: true
};
