/* Copy Trader table-only frontend client.
   - No Supabase Auth calls.
   - Uses custom RPC functions from backup.sql when configured.
   - Falls back to local preview mode when backend-config.js still contains placeholders.
*/
const CT = {
  sessionKey: "ct_table_session_token",
  rememberedLoginKey: "ct_table_remember_login",
  localUsersKey: "ct_table_users",
  localLedgerKey: "ct_table_ledger",
  localWithdrawalsKey: "ct_table_withdrawals",
  localDepositsKey: "ct_table_deposits",
  localTradesKey: "ct_table_trades",
  localWalletsKey: "ct_table_wallets",
  seedInviteCode: "REX100",
  feeRate: 0.10,
  referralRate: 0.13,
  copyProfitRate: 0.06
};

let currentAccountCache = null;
let supabaseClient = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const t = (key, fallback) => window.CopyTraderI18n?.translate(key, fallback) || fallback || key;
const applyI18n = (root = document) => window.CopyTraderI18n?.applyTranslations(root);

function cfg() { return window.CopyTraderConfig || {}; }
function backendReady() {
  const conf = cfg();
  return Boolean(window.supabase && conf.supabaseUrl && conf.supabaseAnonKey && !/YOUR_|example|localhost/i.test(conf.supabaseUrl + conf.supabaseAnonKey));
}
function sb() {
  if (!backendReady()) return null;
  if (!supabaseClient) supabaseClient = window.supabase.createClient(cfg().supabaseUrl, cfg().supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabaseClient;
}
async function rpc(name, args = {}) {
  const client = sb();
  if (!client) throw new Error("Backend is not configured; local preview mode is active.");
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || "Database request failed");
  return data;
}

function getSessionToken() { return localStorage.getItem(CT.sessionKey) || ""; }
function setSessionToken(token) { if (token) localStorage.setItem(CT.sessionKey, token); }
function clearSessionToken() { localStorage.removeItem(CT.sessionKey); currentAccountCache = null; }
function isSignedIn() { return Boolean(getSessionToken()); }
function publicSiteUrl() { return (cfg().publicSiteUrl || window.location.origin || "https://copytrader.com").replace(/\/$/, ""); }

function setStatus(node, message, success = false) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("success", Boolean(success));
}
function showToast(message) {
  let toast = $(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function formatMoney(value) { return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatUsdt(value) { return `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`; }
function normalizeDigits(value) {
  const map = { "٠":"0", "١":"1", "٢":"2", "٣":"3", "٤":"4", "٥":"5", "٦":"6", "٧":"7", "٨":"8", "٩":"9", "۰":"0", "۱":"1", "۲":"2", "۳":"3", "۴":"4", "۵":"5", "۶":"6", "۷":"7", "۸":"8", "۹":"9" };
  return String(value || "").replace(/[٠-٩۰-۹]/g, d => map[d] || d);
}
function validatePassword(password) { return typeof password === "string" && password.length >= 8; }
function isValidBep20Address(address) { return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim()); }
function simpleHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < String(input).length; i++) {
    hash ^= String(input).charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}
function getLebanonTradingDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  if (Number(parts.hour) < 4) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function makePublicId(seed) {
  return String(10000000 + (simpleHash(seed) % 90000000));
}
function makeInviteCode(seed) {
  return "CT-" + simpleHash(seed).toString(36).slice(0, 7).toUpperCase().padEnd(7, "X");
}
function makeBep20(seed) {
  const hex = "0123456789abcdef";
  let h = simpleHash(seed), out = "0x";
  for (let i = 0; i < 40; i++) { h = (h * 1664525 + 1013904223) >>> 0; out += hex[h % 16]; }
  return out;
}
function makeTrc20(seed) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let h = simpleHash(seed), out = "T";
  for (let i = 0; i < 33; i++) { h = (h * 1103515245 + 12345) >>> 0; out += alphabet[h % alphabet.length]; }
  return out;
}

function localRead(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function localWrite(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function localUsers() { return localRead(CT.localUsersKey, []); }
function saveLocalUsers(users) { localWrite(CT.localUsersKey, users); }
function localLedger() { return localRead(CT.localLedgerKey, []); }
function saveLocalLedger(rows) { localWrite(CT.localLedgerKey, rows); }
function localWithdrawals() { return localRead(CT.localWithdrawalsKey, []); }
function saveLocalWithdrawals(rows) { localWrite(CT.localWithdrawalsKey, rows); }
function localDeposits() { return localRead(CT.localDepositsKey, []); }
function saveLocalDeposits(rows) { localWrite(CT.localDepositsKey, rows); }
function localTrades() { return localRead(CT.localTradesKey, []); }
function saveLocalTrades(rows) { localWrite(CT.localTradesKey, rows); }
function localWallets() { return localRead(CT.localWalletsKey, {}); }
function saveLocalWallets(wallets) { localWrite(CT.localWalletsKey, wallets); }
function localContact(method, contact) { return String(contact || "").trim(); }
function localPasswordHash(password) { return `h_${simpleHash(password + ":copytrader")}`; }
function findUserBySession() {
  const token = getSessionToken();
  const match = /^local_(.+)$/.exec(token);
  if (!match) return null;
  return localUsers().find(user => user.user_id === match[1]) || null;
}
function localAddLedger(userId, entry) {
  const rows = localLedger();
  rows.push({
    id: `L${Date.now()}${Math.floor(Math.random() * 999)}`,
    user_id: userId,
    created_at: new Date().toISOString(),
    lebanon_day: getLebanonTradingDay(),
    status: "posted",
    amount: Math.abs(Number(entry.amount || 0)),
    capital_delta: Number(entry.capital_delta || 0),
    profit_delta: Number(entry.profit_delta || 0),
    bonus_delta: Number(entry.bonus_delta || 0),
    entry_type: entry.entry_type || "ledger",
    description: entry.description || "Ledger entry",
    direction: entry.direction || (Number(entry.capital_delta || 0) + Number(entry.profit_delta || 0) + Number(entry.bonus_delta || 0) < 0 ? "-" : "+")
  });
  saveLocalLedger(rows);
}
function localBalances(userId) {
  const rows = localLedger().filter(row => row.user_id === userId && row.status !== "void");
  const capital = rows.reduce((sum, row) => sum + Number(row.capital_delta || 0), 0);
  const profit = rows.reduce((sum, row) => sum + Number(row.profit_delta || 0), 0);
  const bonus = rows.reduce((sum, row) => sum + Number(row.bonus_delta || 0), 0);
  const total = Math.max(0, capital + profit + bonus);
  const dailyProfit = rows.filter(row => row.lebanon_day === getLebanonTradingDay() && row.entry_type === "copy_profit").reduce((sum, row) => sum + Number(row.profit_delta || 0), 0);
  const required = capital > 0 ? capital * 2 : 0;
  const volume = total;
  const freeUsed = localWithdrawals().some(row => row.user_id === userId && row.fee_rate === 0);
  const freeEligible = required > 0 && volume >= required && !freeUsed;
  return {
    capital_balance: Math.max(0, capital),
    profit_balance: Math.max(0, profit),
    bonus_balance: Math.max(0, bonus),
    total_balance: total,
    daily_profit: Math.max(0, dailyProfit),
    trading_volume: volume,
    volume_required: required,
    volume_remaining: Math.max(0, required - volume),
    withdrawable_balance: Math.max(0, profit + bonus),
    free_withdrawal_eligible: freeEligible,
    fee_rate: freeEligible ? 0 : CT.feeRate,
    funded: capital >= 10
  };
}
function localUserPayload(user) {
  const balances = localBalances(user.user_id);
  const wallets = localWallets()[user.user_id] || {};
  return {
    user: {
      user_id: user.user_id,
      public_id: user.public_id,
      login_method: user.login_method,
      contact: user.contact,
      invite_code: user.invite_code,
      created_at: user.created_at,
      funded: balances.funded
    },
    balances,
    wallets: {
      bep20_address: makeBep20(`${user.user_id}:bep20`),
      trc20_address: makeTrc20(`${user.user_id}:trc20`),
      withdraw_wallet: wallets.withdraw_wallet || ""
    },
    trade: localTradeInfo(user.user_id, balances)
  };
}
function localTradeInfo(userId, balances = localBalances(userId)) {
  const day = getLebanonTradingDay();
  const code = `CPY-${simpleHash(`${userId}:${day}:code`).toString(36).toUpperCase().slice(0, 4).padEnd(4, "0")}-${simpleHash(`${day}:${userId}:copy`).toString(36).toUpperCase().slice(0, 4).padEnd(4, "0")}`;
  const duration = 5 + (simpleHash(`${userId}:${day}:duration`) % 29);
  const used = localTrades().some(row => row.user_id === userId && row.lebanon_day === day && row.status === "executed");
  return { lebanon_day: day, code, duration_minutes: duration, used, locked: used || !balances.funded };
}

const LocalApi = {
  async register({ method, contact, password, inviteCode }) {
    const users = localUsers();
    const cleanContact = localContact(method, contact);
    const cleanInvite = String(inviteCode || "").trim().toUpperCase();
    if (!cleanInvite) throw new Error("Invitation code is required.");
    const referrer = users.find(user => user.invite_code.toUpperCase() === cleanInvite);
    if (!referrer && cleanInvite !== CT.seedInviteCode) throw new Error("Invitation code is not valid.");
    if (users.some(user => user.login_method === method && user.contact === cleanContact)) throw new Error("This login is already registered.");
    const user = {
      user_id: `u_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      public_id: makePublicId(`${method}:${cleanContact}:${Date.now()}`),
      login_method: method,
      contact: cleanContact,
      phone: method === "phone" ? cleanContact : null,
      email: method === "email" ? cleanContact : null,
      password_hash: localPasswordHash(password),
      invite_code: makeInviteCode(`${cleanContact}:${Date.now()}`),
      referred_by: referrer?.user_id || null,
      created_at: new Date().toISOString()
    };
    users.push(user);
    saveLocalUsers(users);
    setSessionToken(`local_${user.user_id}`);
    return { session_token: getSessionToken(), ...localUserPayload(user) };
  },
  async login({ method, contact, password }) {
    const clean = localContact(method, contact);
    const user = localUsers().find(item => item.login_method === method && item.contact === clean && item.password_hash === localPasswordHash(password));
    if (!user) throw new Error("Login details do not match.");
    setSessionToken(`local_${user.user_id}`);
    return { session_token: getSessionToken(), ...localUserPayload(user) };
  },
  async me() {
    const user = findUserBySession();
    if (!user) throw new Error("Session expired. Please login again.");
    return localUserPayload(user);
  },
  async createDepositRequest({ network, amount, txHash }) {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 10) throw new Error("Minimum deposit is 10 USDT.");
    const deposits = localDeposits();
    const deposit = { id: `D${Date.now()}`, user_id: user.user_id, network, amount: value, tx_hash: txHash || "", status: "approved-local-preview", created_at: new Date().toISOString() };
    deposits.push(deposit);
    saveLocalDeposits(deposits);
    localAddLedger(user.user_id, { entry_type: "capital_deposit", amount: value, capital_delta: value, description: `Deposit approved (${network})`, direction: "+" });
    if (user.referred_by) {
      const bonus = value * CT.referralRate;
      localAddLedger(user.referred_by, { entry_type: "referral_bonus", amount: bonus, bonus_delta: bonus, description: `13% referral bonus from ${user.public_id}`, direction: "+" });
    }
    return { deposit, ...localUserPayload(user) };
  },
  async getTrade() { return (await this.me()).trade; },
  async executeCopyTrade(code) {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    const balances = localBalances(user.user_id);
    if (!balances.funded) throw new Error("Copy trading needs a real capital deposit of 10 USDT or more. Bonus balance alone does not activate copying.");
    const info = localTradeInfo(user.user_id, balances);
    if (info.used) throw new Error("Daily copy signal already executed.");
    if (String(code || "").trim().toUpperCase() !== info.code) throw new Error("Paste the exact signal code before executing.");
    const profit = Number((balances.total_balance * CT.copyProfitRate).toFixed(2));
    const trades = localTrades();
    trades.push({ id: `T${Date.now()}`, user_id: user.user_id, lebanon_day: info.lebanon_day, code: info.code, duration_minutes: info.duration_minutes, status: "executed", profit_amount: profit, created_at: new Date().toISOString() });
    saveLocalTrades(trades);
    localAddLedger(user.user_id, { entry_type: "copy_profit", amount: profit, profit_delta: profit, description: `Copy trade result (${info.duration_minutes} minutes)`, direction: "+" });
    return { profit_amount: profit, ...localUserPayload(user) };
  },
  async saveWithdrawWallet(wallet) {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    const wallets = localWallets();
    wallets[user.user_id] = { ...(wallets[user.user_id] || {}), withdraw_wallet: wallet };
    saveLocalWallets(wallets);
    return localUserPayload(user);
  },
  async requestWithdrawal({ amount, wallet }) {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    const value = Number(amount);
    const day = getLebanonTradingDay();
    const withdrawals = localWithdrawals();
    if (withdrawals.some(row => row.user_id === user.user_id && row.status === "pending")) throw new Error("You already have a pending withdrawal request.");
    if (withdrawals.some(row => row.user_id === user.user_id && row.lebanon_day === day)) throw new Error("Only one withdrawal request is allowed per Lebanon trading day.");
    if (!isValidBep20Address(wallet)) throw new Error("Add and save a valid USDT BEP20 wallet address first.");
    const balances = localBalances(user.user_id);
    if (!Number.isFinite(value) || value < 1) throw new Error("Minimum withdrawal amount is 1 USDT.");
    if (value > balances.withdrawable_balance) throw new Error(`Available withdrawal balance is ${formatUsdt(balances.withdrawable_balance)}.`);
    const feeRate = balances.free_withdrawal_eligible ? 0 : CT.feeRate;
    const fee = Number((value * feeRate).toFixed(2));
    const net = Number((value - fee).toFixed(2));
    const profitUse = Math.min(value, balances.profit_balance);
    const bonusUse = value - profitUse;
    const withdrawal = { id: `W${Date.now()}`, user_id: user.user_id, lebanon_day: day, wallet, network: "BEP20", amount: value, fee, net_amount: net, fee_rate: feeRate, status: "pending", created_at: new Date().toISOString() };
    withdrawals.push(withdrawal);
    saveLocalWithdrawals(withdrawals);
    localAddLedger(user.user_id, { entry_type: "withdrawal_request", amount: value, profit_delta: -profitUse, bonus_delta: -bonusUse, description: `Withdrawal request to ${wallet.slice(0, 8)}...${wallet.slice(-6)}`, direction: "-" });
    return { withdrawal, ...localUserPayload(user) };
  },
  async getRecords() {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    return localLedger().filter(row => row.user_id === user.user_id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(row => ({
      id: row.id,
      date: row.created_at,
      type: row.entry_type,
      title: row.description,
      amount: row.amount,
      direction: row.direction,
      status: row.status,
      icon: row.entry_type === "withdrawal_request" ? "fa-money-bill-transfer" : row.entry_type === "referral_bonus" ? "fa-gift" : row.entry_type === "copy_profit" ? "fa-arrow-trend-up" : "fa-coins"
    }));
  },
  async getWithdrawals() {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    return localWithdrawals().filter(row => row.user_id === user.user_id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },
  async getTeam() {
    const user = findUserBySession();
    if (!user) throw new Error("Login required.");
    const users = localUsers().filter(item => item.referred_by === user.user_id);
    return users.map(member => {
      const bal = localBalances(member.user_id);
      const depositAmount = bal.capital_balance;
      return { public_id: member.public_id, joined_at: member.created_at, funded: bal.funded, deposit_amount: depositAmount, bonus_amount: depositAmount * CT.referralRate };
    });
  }
};

const RemoteApi = {
  async register({ method, contact, password, inviteCode }) {
    const data = await rpc("ct_register_user", { p_method: method, p_contact: contact, p_password: password, p_invite_code: inviteCode });
    if (data?.session_token) setSessionToken(data.session_token);
    return data;
  },
  async login({ method, contact, password }) {
    const data = await rpc("ct_login_user", { p_method: method, p_contact: contact, p_password: password });
    if (data?.session_token) setSessionToken(data.session_token);
    return data;
  },
  async me() { return rpc("ct_get_me", { p_session_token: getSessionToken() }); },
  async createDepositRequest({ network, amount, txHash }) { return rpc("ct_create_deposit_request", { p_session_token: getSessionToken(), p_network: network, p_amount: Number(amount), p_tx_hash: txHash || null }); },
  async getTrade() { return rpc("ct_get_or_create_today_code", { p_session_token: getSessionToken() }); },
  async executeCopyTrade(code) { return rpc("ct_execute_copy_trade", { p_session_token: getSessionToken(), p_code: code }); },
  async saveWithdrawWallet(wallet) { return rpc("ct_save_withdraw_wallet", { p_session_token: getSessionToken(), p_wallet: wallet }); },
  async requestWithdrawal({ amount, wallet }) { return rpc("ct_request_withdrawal", { p_session_token: getSessionToken(), p_amount: Number(amount), p_wallet: wallet }); },
  async getRecords() { return rpc("ct_get_records", { p_session_token: getSessionToken() }); },
  async getWithdrawals() { return rpc("ct_get_withdrawals", { p_session_token: getSessionToken() }); },
  async getTeam() { return rpc("ct_get_team", { p_session_token: getSessionToken() }); }
};
function Api() { return backendReady() ? RemoteApi : LocalApi; }

async function loadAccount(force = false) {
  if (currentAccountCache && !force) return currentAccountCache;
  const data = await Api().me();
  currentAccountCache = data;
  return data;
}
function getAccount() { return currentAccountCache?.user || null; }
function saveAccount() { /* table-only mode: balances are stored in the ledger, never directly in JS. */ }
function ensureDemoAccount() { return currentAccountCache?.user || null; }

function setTab(groupName, value) {
  const group = document.querySelector(`[data-tabs="${groupName}"]`);
  if (!group) return;
  const button = group.querySelector(`[data-tab="${value}"]`);
  if (button) button.click();
}
function initTabs() {
  $$('[data-tabs]').forEach(group => {
    const target = group.dataset.tabs;
    const buttons = $$('[data-tab]', group);
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.tab;
        buttons.forEach(btn => btn.classList.toggle("active", btn === button));
        $$(`[data-tab-panel-group="${target}"]`).forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === value));
      });
    });
  });
}
function getFormContact(form) {
  return normalizeDigits(form.querySelector('[name="contact"]')?.value || "").trim();
}
function prefillInviteFromUrl() {
  const ref = new URLSearchParams(location.search).get("ref");
  if (!ref) return;
  $$('input[name="inviteCode"]').forEach(input => input.value = ref.trim());
}
function initRememberedLogin() {
  if (document.body.dataset.page !== "login") return;
  let remembered = null;
  try { remembered = JSON.parse(localStorage.getItem(CT.rememberedLoginKey) || "null"); } catch { remembered = null; }
  if (!remembered) return;
  if (remembered.method) setTab("login-method", remembered.method);
  $$('[data-login-form]').forEach(form => {
    if (form.dataset.loginForm !== remembered.method) return;
    const contact = form.querySelector('[name="contact"]');
    const password = form.querySelector('[name="password"]');
    const checkbox = form.querySelector('[data-remember-login]');
    if (contact) contact.value = remembered.contact || "";
    if (password) password.value = remembered.password || "";
    if (checkbox) checkbox.checked = true;
  });
}
function saveRememberedLogin(data) { localStorage.setItem(CT.rememberedLoginKey, JSON.stringify(data)); }
function clearRememberedLogin() { localStorage.removeItem(CT.rememberedLoginKey); }

function handleRegister() {
  $$('[data-register-form]').forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const method = form.dataset.registerForm;
      const contact = getFormContact(form);
      const password = form.querySelector('[name="password"]')?.value || "";
      const confirm = form.querySelector('[name="confirm"]')?.value || "";
      const inviteCode = form.querySelector('[name="inviteCode"]')?.value.trim() || "";
      const status = form.querySelector(".status-message");
      status?.classList.remove("success");
      if (!contact) return setStatus(status, method === "phone" ? "ضع رقم الهاتف." : "ضع الإيميل.");
      if (!validatePassword(password)) return setStatus(status, "كلمة السر لازم تكون 8 أحرف أو أرقام على الأقل.");
      if (password !== confirm) return setStatus(status, "تأكيد كلمة السر غير مطابق.");
      if (!inviteCode) return setStatus(status, "كود الدعوة مطلوب ويجب أن يكون صحيحاً.");
      try {
        await Api().register({ method, contact, password, inviteCode });
        setStatus(status, "تم التسجيل بنجاح. سيتم تحويلك للوحة التحكم...", true);
        setTimeout(() => location.href = "dashboard.html", 500);
      } catch (error) {
        setStatus(status, error.message || "فشل التسجيل.");
      }
    });
  });
}
function handleLogin() {
  $$('[data-login-form]').forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const method = form.dataset.loginForm;
      const contact = getFormContact(form);
      const password = form.querySelector('[name="password"]')?.value || "";
      const remember = form.querySelector('[data-remember-login]')?.checked;
      const status = form.querySelector(".status-message");
      status?.classList.remove("success");
      if (!contact || !password) return setStatus(status, "ضع بيانات الدخول.");
      if (!validatePassword(password)) return setStatus(status, "كلمة السر لازم تكون 8 أحرف أو أرقام على الأقل.");
      try {
        await Api().login({ method, contact, password });
        if (remember) saveRememberedLogin({ method, contact, password }); else clearRememberedLogin();
        setStatus(status, "تم تسجيل الدخول. سيتم تحويلك للوحة التحكم...", true);
        setTimeout(() => location.href = "dashboard.html", 400);
      } catch (error) {
        setStatus(status, error.message || "بيانات الدخول غير صحيحة.");
      }
    });
  });
}
function initForgotPassword() {
  $$('[data-send-code]').forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest('[data-forgot-form]');
      setStatus(form?.querySelector(".status-message"), "تم إنشاء كود محلي للمعاينة فقط. إعادة ضبط كلمة السر الحقيقية تحتاج دالة إدارية.", true);
    });
  });
}
function handleForgotPassword() {
  $$('[data-forgot-form]').forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      setStatus(form.querySelector(".status-message"), "إعادة ضبط كلمة السر غير مفعلة بدون مراجعة إدارية في وضع الجداول فقط.");
    });
  });
}

async function hydrateCommon() {
  if (!isSignedIn()) return;
  let data;
  try { data = await loadAccount(true); } catch { return; }
  const user = data.user || {};
  const balances = data.balances || {};
  const wallets = data.wallets || {};
  const volumeRequired = Number(balances.volume_required || 0);
  const volume = Number(balances.trading_volume || 0);
  const volumePercent = volumeRequired > 0 ? Math.min(100, Math.round(volume / volumeRequired * 100)) : 0;

  $$('[data-account-id]').forEach(node => node.textContent = user.public_id || "--------");
  $$('[data-account-contact]').forEach(node => node.textContent = user.contact || "");
  $$('[data-balance]').forEach(node => { const value = formatMoney(balances.total_balance); node.dataset.realValue = value; node.textContent = value; });
  $$('[data-profit]').forEach(node => { const value = formatMoney(balances.daily_profit); node.dataset.realValue = value; node.textContent = value; });
  $$('[data-referral-bonus]').forEach(node => node.textContent = formatMoney(balances.bonus_balance));
  $$('[data-volume]').forEach(node => { const value = formatMoney(volume); node.dataset.realValue = value; node.textContent = value; });
  $$('[data-volume-required]').forEach(node => node.textContent = formatMoney(volumeRequired));
  $$('[data-volume-remaining]').forEach(node => node.textContent = formatMoney(balances.volume_remaining));
  $$('[data-volume-percent]').forEach(node => { node.dataset.realValue = `${volumePercent}%`; node.textContent = `${volumePercent}%`; });
  $$('[data-volume-progress]').forEach(node => node.style.setProperty("--progress", `${volumePercent}%`));
  $$('[data-withdrawable-balance]').forEach(node => node.textContent = formatUsdt(balances.withdrawable_balance));
  $$('[data-wallet]').forEach(node => node.textContent = wallets.bep20_address || "");
  $$('[data-trc-wallet]').forEach(node => node.textContent = wallets.trc20_address || "");
  $$('[data-wallet-input]').forEach(node => node.value = wallets.bep20_address || "");
  $$('[data-invite-code]').forEach(node => node.textContent = user.invite_code || "");
  $$('[data-invite-input]').forEach(node => node.value = `${publicSiteUrl()}/register.html?ref=${encodeURIComponent(user.invite_code || "")}`);
}

function initBalancePrivacyToggle() {
  $$('[data-privacy-toggle]').forEach(card => {
    card.addEventListener("click", () => {
      card.classList.toggle("is-balance-hidden");
      card.querySelectorAll('[data-private-value]').forEach(node => {
        node.textContent = card.classList.contains("is-balance-hidden") ? (node.dataset.realValue?.endsWith("%") ? "**" : "******") : (node.dataset.realValue || node.textContent);
      });
    });
  });
}
function setActiveNav() {
  const page = document.body.dataset.page;
  $$('.nav-link').forEach(link => link.classList.toggle("active", link.dataset.nav === page));
}
function initCopyButtons() {
  document.addEventListener("click", async event => {
    const button = event.target.closest('[data-copy-target]');
    if (!button) return;
    event.preventDefault();
    const target = $(button.dataset.copyTarget);
    const text = target?.value || target?.textContent || "";
    try { await navigator.clipboard.writeText(text.trim()); showToast("تم النسخ"); } catch { showToast("النسخ غير متاح في هذا المتصفح"); }
  });
}

async function initDepositPage() {
  if (!$("#depositQr")) return;
  await hydrateCommon();
  const networkButtons = $$('[data-deposit-network]');
  const networkSelect = $("#depositNetworkSelect");
  const walletAddress = $("#walletAddress");
  const qr = $("#depositQr");
  const note = $("#depositQrNote");
  const data = currentAccountCache || await loadAccount();
  const wallets = data.wallets || {};
  function render(network) {
    const useTrc = network === "trc20";
    const address = useTrc ? wallets.trc20_address : wallets.bep20_address;
    if (walletAddress) walletAddress.value = address || "";
    if (note) note.textContent = useTrc ? "USDT TRC20 - انسخ العنوان وأرسل على نفس الشبكة فقط." : "USDT BEP20 - انسخ العنوان وأرسل على نفس الشبكة فقط.";
    if (qr) qr.innerHTML = `<div class="qr-placeholder"><i class="fa-solid fa-qrcode"></i><span>${escapeHtml(address || "No wallet")}</span></div>`;
    networkButtons.forEach(button => button.classList.toggle("active", button.dataset.depositNetwork === network));
    if (networkSelect) networkSelect.value = network;
  }
  networkButtons.forEach(button => button.addEventListener("click", () => render(button.dataset.depositNetwork)));
  networkSelect?.addEventListener("change", () => render(networkSelect.value));
  render(networkSelect?.value || "bep20");

  const form = $("#depositRequestForm");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const status = $("#depositStatus");
    const amount = Number($("#depositAmount")?.value || 0);
    const txHash = $("#depositTxHash")?.value.trim() || "";
    const network = ($("#depositRequestNetwork")?.value || networkSelect?.value || "bep20").toUpperCase();
    try {
      await Api().createDepositRequest({ network, amount, txHash });
      await hydrateCommon();
      setStatus(status, backendReady() ? "تم إرسال طلب الإيداع للمراجعة. بعد الموافقة يضاف للدفتر." : "تمت إضافة الإيداع محلياً للمعاينة فقط.", true);
      form.reset();
    } catch (error) { setStatus(status, error.message || "فشل طلب الإيداع."); }
  });
}

async function initCopyTrading() {
  const terminal = $('[data-copy-terminal]');
  if (!terminal) return;
  await hydrateCommon();
  let trade = currentAccountCache?.trade;
  try { trade = await Api().getTrade(); } catch { /* keep cached */ }
  const codeNode = $('[data-trade-code]');
  const durationNode = $('[data-trade-duration]');
  const pasteInput = $("#tradePasteInput");
  const status = $("#copyTradeStatus");
  const executeButton = $("#executeTradeButton");
  const copyButton = $("#copyTradeCodeButton");
  function render(info) {
    if (!info) return;
    if (codeNode) codeNode.textContent = info.used ? "LOCKED UNTIL NEXT DAY" : info.code;
    if (durationNode) durationNode.textContent = `${info.duration_minutes || "--"} minutes`;
    if (executeButton) executeButton.disabled = Boolean(info.used || info.locked);
    if (status && info.locked && !info.used) setStatus(status, "لا يمكن تفعيل النسخ إلا بعد إيداع رأس مال 10 USDT أو أكثر. البونص وحده لا يفعّل الصفحة.");
  }
  render(trade);
  copyButton?.addEventListener("click", async () => {
    if (!trade || trade.used) return showToast("الكود مقفل لليوم التالي");
    try { await navigator.clipboard.writeText(trade.code); showToast("تم نسخ كود الصفقة"); } catch { showToast("النسخ غير متاح"); }
  });
  executeButton?.addEventListener("click", async () => {
    try {
      const typed = pasteInput?.value.trim().toUpperCase() || "";
      const result = await Api().executeCopyTrade(typed);
      currentAccountCache = result;
      await hydrateCommon();
      trade = result.trade || { ...trade, used: true };
      render(trade);
      setStatus(status, `تم تنفيذ الكود. الربح المسجل في الدفتر: ${formatUsdt(result.profit_amount || result?.trade?.profit_amount || 0)}.`, true);
    } catch (error) { setStatus(status, error.message || "فشل تنفيذ كود النسخ."); }
  });
}

async function initWithdrawalPage() {
  const form = $("#withdrawForm");
  if (!form) return;
  await hydrateCommon();
  const walletInput = $("#walletAddressInput");
  const walletDisplay = $("#withdrawAddressDisplay");
  const walletStatus = $("#withdrawWalletStatus");
  const walletText = $("#withdrawWalletText");
  const modal = $("#walletModal");
  const amountInput = $("#withdrawAmount");
  const status = $("#withdrawStatus");
  function currentWallet() { return currentAccountCache?.wallets?.withdraw_wallet || ""; }
  function currentBalances() { return currentAccountCache?.balances || {}; }
  function openModal() { if (modal) { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); } if (walletInput) walletInput.value = currentWallet(); }
  function closeModal() { if (modal) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); } }
  function updateWallet() {
    const wallet = currentWallet();
    if (walletDisplay) walletDisplay.value = wallet || "";
    if (walletText) walletText.textContent = wallet || "No BEP20 wallet saved";
    if (walletStatus) walletStatus.textContent = wallet ? "تم حفظ عنوان BEP20." : "أضف عنوان BEP20 قبل طلب السحب.";
  }
  function updatePreview() {
    const balances = currentBalances();
    const amount = Number(amountInput?.value || 0);
    const feeRate = Number(balances.fee_rate ?? CT.feeRate);
    const fee = Number.isFinite(amount) ? amount * feeRate : 0;
    $$('[data-preview-available]').forEach(node => node.textContent = formatUsdt(balances.withdrawable_balance));
    $('[data-preview-fee-rate]') && ($('[data-preview-fee-rate]').textContent = `${Math.round(feeRate * 100)}%`);
    $('[data-preview-fee]') && ($('[data-preview-fee]').textContent = formatUsdt(fee));
    $('[data-preview-net]') && ($('[data-preview-net]').textContent = formatUsdt(Math.max(0, amount - fee)));
    const note = $("#withdrawFeeNote");
    if (note) note.innerHTML = balances.free_withdrawal_eligible ? '<i class="fa-solid fa-circle-check"></i> يحق لك طلب سحب ربح واحد بدون رسوم بعد اكتمال الحجم.' : '<i class="fa-solid fa-circle-info"></i> رسوم السحب القياسية 10%. رأس المال المودع غير قابل للسحب من هذا المسار.';
  }
  updateWallet(); updatePreview();
  $("#openWalletModal")?.addEventListener("click", openModal);
  $$('[data-wallet-modal-close]').forEach(btn => btn.addEventListener("click", closeModal));
  $("#saveWalletAddress")?.addEventListener("click", async () => {
    const wallet = walletInput?.value.trim() || "";
    const validation = $("#walletValidation");
    if (!isValidBep20Address(wallet)) return setStatus(validation, "العنوان غير صحيح. يجب أن يبدأ بـ 0x ويتكون من 42 خانة.");
    try {
      const data = await Api().saveWithdrawWallet(wallet);
      currentAccountCache = data;
      updateWallet(); updatePreview(); closeModal();
      setStatus(validation, "تم حفظ العنوان.", true);
    } catch (error) { setStatus(validation, error.message || "فشل حفظ العنوان."); }
  });
  $("#withdrawMaxButton")?.addEventListener("click", event => { event.preventDefault(); if (amountInput) amountInput.value = Number(currentBalances().withdrawable_balance || 0).toFixed(2); updatePreview(); });
  amountInput?.addEventListener("input", updatePreview);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const amount = Number(amountInput?.value || 0);
      const wallet = currentWallet();
      const data = await Api().requestWithdrawal({ amount, wallet });
      currentAccountCache = data;
      await hydrateCommon(); updatePreview();
      setStatus(status, `تم إرسال طلب السحب. صافي الاستلام: ${formatUsdt(data.withdrawal?.net_amount || data.withdrawal?.net || 0)}.`, true);
    } catch (error) { setStatus(status, error.message || "فشل طلب السحب."); }
  });
}

async function initWithdrawalHistoryPage() {
  const list = $("#withdrawHistoryList");
  if (!list) return;
  let rows = [];
  try { rows = await Api().getWithdrawals(); } catch { rows = []; }
  const head = `<div class="transfer-history-row head"><span>Date</span><span>Amount</span><span>Fee</span><span>Net Receive</span><span>Status</span></div>`;
  if (!rows.length) {
    list.innerHTML = `${head}<div class="transfer-empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>No withdrawal requests yet.</p></div>`;
    return;
  }
  list.innerHTML = head + rows.map(row => {
    const date = new Date(row.created_at || row.date).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `<div class="transfer-history-row"><span data-label="Date">${date}</span><strong data-label="Amount">${formatUsdt(row.amount)}</strong><span data-label="Fee">${formatUsdt(row.fee)}</span><strong data-label="Net Receive">${formatUsdt(row.net_amount || row.net)}</strong><span data-label="Status" class="transfer-status-pill">${escapeHtml(row.status || "pending")}</span></div>`;
  }).join("");
}

async function initRecordsPage() {
  const list = $("#recordsList");
  if (!list) return;
  let records = [];
  try { records = await Api().getRecords(); } catch { records = []; }
  const fromInput = $("#recordFromDate");
  const toInput = $("#recordToDate");
  const clearButton = $("#clearRecordFilter");
  function inRange(record) {
    const day = String(record.date || record.created_at || "").slice(0, 10);
    if (fromInput?.value && day < fromInput.value) return false;
    if (toInput?.value && day > toInput.value) return false;
    return true;
  }
  function render() {
    const rows = records.filter(inRange);
    if (!rows.length) {
      list.innerHTML = `<div class="record-empty"><i class="fa-solid fa-filter-circle-xmark"></i><p>لا يوجد سجلات مطابقة.</p></div>`;
      return;
    }
    list.innerHTML = rows.map(record => {
      const date = new Date(record.date || record.created_at).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      const direction = record.direction === "-" ? "-" : "+";
      return `<article class="record-item ${direction === "-" ? "out" : "in"}" data-record-type="${escapeHtml(record.type)}"><div class="record-icon"><i class="fa-solid ${record.icon || "fa-clock-rotate-left"}"></i></div><div class="record-main"><strong>${escapeHtml(record.title || record.description || record.type)}</strong><span>${escapeHtml(record.type)} • ${date}</span></div><div class="record-amount"><b>${direction}${formatUsdt(record.amount)}</b><span>${escapeHtml(record.status || "posted")}</span></div></article>`;
    }).join("");
  }
  fromInput?.addEventListener("input", render);
  toInput?.addEventListener("input", render);
  fromInput?.addEventListener("change", render);
  toInput?.addEventListener("change", render);
  clearButton?.addEventListener("click", () => { if (fromInput) fromInput.value = ""; if (toInput) toInput.value = ""; render(); });
  render();
}

async function hydrateTeamPage() {
  if (document.body.dataset.page !== "team") return;
  await hydrateCommon();
  let members = [];
  try { members = await Api().getTeam(); } catch { members = []; }
  const funded = members.filter(member => member.funded);
  $$('[data-team-count]').forEach(node => node.textContent = String(members.length));
  $$('[data-funded-count]').forEach(node => node.textContent = String(funded.length));
  const tbody = $('[data-team-members]');
  if (!tbody) return;
  if (!members.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted">لا يوجد أعضاء مسجلين بعد.</td></tr>`; return; }
  tbody.innerHTML = members.map(member => `<tr><td>${escapeHtml(member.public_id || member.member_id || "-")}</td><td>${String(member.joined_at || "").slice(0, 10)}</td><td><span class="badge ${member.funded ? "success" : "warn"}"><i class="fa-solid ${member.funded ? "fa-circle-check" : "fa-clock"}"></i> ${member.funded ? "Funded" : "Not funded"}</span></td><td>${formatUsdt(member.deposit_amount || 0)}</td><td>${formatUsdt(member.bonus_amount || 0)}</td></tr>`).join("");
}

function initLogout() {
  $$('[data-logout]').forEach(node => node.addEventListener("click", event => { event.preventDefault(); clearSessionToken(); location.href = "login.html"; }));
}
function createMinePanel() {
  if ($(".mine-panel")) return;
  const user = currentAccountCache?.user || {};
  const overlay = document.createElement("div");
  overlay.className = "mine-overlay";
  overlay.setAttribute("data-mine-close", "");
  const panel = document.createElement("aside");
  panel.className = "mine-panel";
  panel.id = "mine-menu";
  panel.innerHTML = `<div class="mine-head"><div><h2 class="small-title">Mine</h2><button class="mine-id-box mine-id-copy" type="button" data-copy-account-id="${escapeHtml(user.public_id || "")}" title="Copy ID"><i class="fa-solid fa-id-card"></i> ID <span data-account-id>${escapeHtml(user.public_id || "--------")}</span><i class="fa-regular fa-copy copy-id-icon"></i></button></div><button class="mine-close" type="button" data-mine-close><i class="fa-solid fa-xmark"></i></button></div><nav class="drawer-links"><a class="drawer-link" href="deposit.html"><i class="fa-solid fa-wallet"></i> <span>Deposit</span></a><a class="drawer-link" href="transfer.html"><i class="fa-solid fa-money-bill-transfer"></i> <span>Withdraw</span></a><a class="drawer-link" href="records.html"><i class="fa-solid fa-clock-rotate-left"></i> <span>History</span></a><a class="drawer-link" href="language.html"><i class="fa-solid fa-language"></i> <span>Language</span></a><a class="drawer-link" href="partners.html"><i class="fa-solid fa-handshake"></i> <span>Our Partners</span></a><a class="drawer-link" href="how-we-work.html"><i class="fa-solid fa-diagram-project"></i> <span>How We Work</span></a><a class="drawer-link" href="app.html"><i class="fa-solid fa-download"></i> <span>Download App</span></a><a class="drawer-link danger" href="login.html" data-logout><i class="fa-solid fa-right-from-bracket"></i> <span>Logout</span></a></nav>`;
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  initLogout();
}
function initMinePanel() {
  document.querySelectorAll('[data-nav="mine"]').forEach(link => link.addEventListener("click", event => { event.preventDefault(); createMinePanel(); $(".mine-overlay")?.classList.add("open"); $(".mine-panel")?.classList.add("open"); }));
  document.addEventListener("click", async event => {
    const idCopy = event.target.closest('[data-copy-account-id]');
    if (idCopy) {
      event.preventDefault();
      try { await navigator.clipboard.writeText(idCopy.getAttribute("data-copy-account-id") || ""); showToast("تم نسخ ID"); } catch { showToast("النسخ غير متاح"); }
      return;
    }
    if (event.target.closest('[data-mine-close]')) { $(".mine-overlay")?.classList.remove("open"); $(".mine-panel")?.classList.remove("open"); }
  });
}
function initLanguagePage() {
  $$('[data-set-language]').forEach(button => button.addEventListener("click", () => window.CopyTraderI18n?.setLanguage(button.dataset.setLanguage)));
}
function initHomeRedirect() {
  if (document.body.dataset.page === "index") location.replace(isSignedIn() ? "dashboard.html" : "home.html");
}
function protectPrivatePages() {
  const page = document.body.dataset.page || "";
  const privatePages = new Set(["dashboard", "team", "copy", "mine", "records", "language"]);
  const path = location.pathname.split("/").pop();
  if (["deposit.html", "transfer.html", "transfer3.html", "mine.html", "app.html"].includes(path)) privatePages.add(page || "mine");
  if ((privatePages.has(page) || ["deposit.html", "transfer.html", "transfer3.html", "records.html", "team.html", "copy.html", "dashboard.html", "mine.html"].includes(path)) && !isSignedIn()) {
    location.replace("login.html");
    return true;
  }
  return false;
}

async function initApp() {
  initHomeRedirect();
  if (protectPrivatePages()) return;
  initTabs();
  prefillInviteFromUrl();
  initRememberedLogin();
  handleRegister();
  handleLogin();
  initForgotPassword();
  handleForgotPassword();
  initCopyButtons();
  setActiveNav();
  initLogout();
  initBalancePrivacyToggle();
  if (isSignedIn()) await hydrateCommon();
  await initDepositPage();
  await initCopyTrading();
  await initWithdrawalPage();
  await initWithdrawalHistoryPage();
  await initRecordsPage();
  await hydrateTeamPage();
  initMinePanel();
  initLanguagePage();
  applyI18n(document);
}

document.addEventListener("DOMContentLoaded", initApp);
