const STORAGE_KEY = "ct_copytrader_demo_account";
const SESSION_KEY = "ct_copytrader_demo_session";
const WITHDRAW_KEY = "ct_copytrader_last_withdraw_day";
const FREE_WITHDRAW_KEY = "ct_copytrader_free_withdraw_used";
const WITHDRAW_HISTORY_KEY = "ct_copytrader_withdraw_history";
const TRADE_USE_PREFIX = "ct_copytrader_trade_used_";
const REMEMBER_LOGIN_KEY = "ct_copytrader_remember_login";
let deferredPwaInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPwaInstallPrompt = event;
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const t = (key, fallback) => window.CopyTraderI18n?.translate(key, fallback) || fallback || key;
const applyI18n = (root = document) => window.CopyTraderI18n?.applyTranslations(root);

function getAccount() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveAccount(account) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

function setSession(account) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ signedIn: true, id: account.id, at: Date.now() }));
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function ensureDemoAccount() {
  let account = getAccount();
  if (account) return ensureAccountWallets(account);
  account = createAccount({ method: "email", contact: "demo@copytrader.local", inviteCode: "REX100", password: "DemoPass1!" });
  saveAccount(account);
  return account;
}

function createAccount({ method, contact, password, inviteCode }) {
  const seed = `${method}:${contact}:${inviteCode}`;
  const id = simpleHash(seed).toString().slice(0, 8).padStart(8, "0");
  const invite = "CT-" + simpleHash(contact + inviteCode).toString(36).slice(0, 6).toUpperCase();
  const wallet = makeWallet(contact + id);
  const trcWallet = makeTrcWallet(contact + id + ":trc20");
  return {
    id,
    method,
    contact,
    password,
    inviteCode,
    invite,
    wallet,
    trcWallet,
    createdAt: new Date().toISOString(),
    balance: 0,
    profit: 0,
    referralBonus: 0,
    tradingVolume: 0,
    tradingVolumeRequired: 2500,
    funded: true
  };
}

function simpleHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function makeWallet(seed) {
  const alphabet = "0123456789abcdef";
  let out = "0x";
  let hash = simpleHash(seed);
  for (let i = 0; i < 40; i++) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    out += alphabet[hash % alphabet.length];
  }
  return out;
}

function makeTrcWallet(seed) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "T";
  let hash = simpleHash(seed);
  for (let i = 0; i < 33; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    out += alphabet[hash % alphabet.length];
  }
  return out;
}

function ensureAccountWallets(account) {
  let changed = false;
  if (!account.wallet) {
    account.wallet = makeWallet(`${account.contact || account.id}:bep20`);
    changed = true;
  }
  if (!account.trcWallet) {
    account.trcWallet = makeTrcWallet(`${account.contact || account.id}:trc20`);
    changed = true;
  }
  if (changed) saveAccount(account);
  return account;
}

function setActiveNav() {
  const page = document.body.dataset.page;
  $$(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === page);
  });
}

function initTabs() {
  $$('[data-tabs]').forEach(group => {
    const target = group.dataset.tabs;
    const buttons = $$('[data-tab]', group);
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.tab;
        buttons.forEach(btn => btn.classList.toggle("active", btn === button));
        $$(`[data-tab-panel-group="${target}"]`).forEach(panel => {
          panel.classList.toggle("active", panel.dataset.tabPanel === value);
        });
      });
    });
  });
}


function setTab(groupName, value) {
  const group = document.querySelector(`[data-tabs="${groupName}"]`);
  if (!group) return;
  const button = group.querySelector(`[data-tab="${value}"]`);
  if (button) button.click();
}

function initPreferredLoginMethod() {
  const account = getAccount();
  if (document.body.dataset.page === "login" && account?.method) {
    setTab("login-method", account.method);
  }
}


function getRememberedLogin() {
  const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveRememberedLogin(data) {
  localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify(data));
}

function clearRememberedLogin() {
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

function initRememberedLogin() {
  if (document.body.dataset.page !== "login") return;
  const remembered = getRememberedLogin();
  if (!remembered) return;
  if (remembered.method) setTab("login-method", remembered.method);
  $$('[data-login-form]').forEach(form => {
    const contactInput = form.querySelector('[name="contact"]');
    const passwordInput = form.querySelector('[name="password"]');
    const checkbox = form.querySelector('[data-remember-login]');
    if (checkbox) checkbox.checked = true;
    if (form.dataset.loginForm !== remembered.method) return;
    if (contactInput && remembered.contact) contactInput.value = remembered.contact;
    if (passwordInput && remembered.password) passwordInput.value = remembered.password;
  });
}

function initPhoneInputs() {
  if (!window.intlTelInput) return;
  $$('[data-phone-input]').forEach(input => {
    if (input.dataset.itiReady === "1") return;
    window.intlTelInput(input, {
      initialCountry: "lb",
      preferredCountries: ["lb", "ae", "sa", "kw", "qa", "tr"],
      separateDialCode: true,
      nationalMode: false,
      autoPlaceholder: "polite",
      utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js"
    });
    input.dataset.itiReady = "1";
  });
}

function getFormContact(form, method) {
  const input = form.querySelector('[name="contact"]');
  if (!input) return "";
  if (method === "phone" && window.intlTelInputGlobals) {
    const instance = window.intlTelInputGlobals.getInstance(input);
    if (instance) return (instance.getNumber() || input.value).trim();
  }
  return input.value.trim();
}

function isPhoneInputValid(form, method) {
  if (method !== "phone" || !window.intlTelInputGlobals) return true;
  const input = form.querySelector('[name="contact"]');
  const instance = input ? window.intlTelInputGlobals.getInstance(input) : null;
  if (!instance || !input.value.trim()) return true;
  return instance.isValidNumber();
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function handleRegister() {
  const forms = $$('[data-register-form]');
  forms.forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const method = form.dataset.registerForm;
      const contact = getFormContact(form, method);
      const password = form.querySelector('[name="password"]').value;
      const confirm = form.querySelector('[name="confirm"]').value;
      const inviteCode = form.querySelector('[name="inviteCode"]').value.trim();
      const status = form.querySelector('.status-message');

      status.classList.remove("success");
      if (!contact) return setStatus(status, method === "phone" ? t("register.error.contactPhone", "Enter your phone number.") : t("register.error.contactEmail", "Enter your email address."));
      if (!isPhoneInputValid(form, method)) return setStatus(status, t("register.error.phoneInvalid", "Enter a valid phone number."));
      if (!validatePassword(password)) return setStatus(status, t("register.error.password", "Password must contain at least 8 characters, including numbers, letters, or symbols."));
      if (password !== confirm) return setStatus(status, t("register.error.confirm", "Password confirmation does not match."));
      if (inviteCode.length < 4) return setStatus(status, t("register.error.invite", "Invitation code is required and must contain at least 4 characters."));

      const account = createAccount({ method, contact, password, inviteCode });
      saveAccount(account);
      setSession(account);
      setStatus(status, t("register.success", "Registration completed. Redirecting to dashboard..."), true);
      setTimeout(() => window.location.href = "dashboard.html", 600);
    });
  });
}

function handleLogin() {
  const forms = $$('[data-login-form]');
  forms.forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const method = form.dataset.loginForm;
      const contact = getFormContact(form, method);
      const password = form.querySelector('[name="password"]').value;
      const status = form.querySelector('.status-message');
      const account = getAccount();

      status.classList.remove("success");
      if (!contact || !password) return setStatus(status, t("login.error.details", "Enter your login details."));
      if (!isPhoneInputValid(form, method)) return setStatus(status, t("login.error.phoneInvalid", "Enter a valid phone number."));
      if (!validatePassword(password)) return setStatus(status, t("login.error.password", "Password must be at least 8 characters."));
      if (account && account.method === method && account.contact === contact && account.password === password) {
        const remember = form.querySelector('[data-remember-login]')?.checked;
        if (remember) {
          saveRememberedLogin({ method, contact, password });
        } else {
          clearRememberedLogin();
        }
        setSession(account);
        setStatus(status, t("login.success", "Login successful. Redirecting to dashboard..."), true);
        setTimeout(() => window.location.href = "dashboard.html", 500);
        return;
      }
      if (!account) return setStatus(status, t("login.error.noAccount", "No account found. Create a new account first."));
      setStatus(status, t("login.error.mismatch", "Login details do not match the saved account on this browser."));
    });
  });
}


function makeVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getVerificationStatusNode(form) {
  return form.querySelector('.status-message');
}

function startVerificationCooldown(button) {
  let seconds = 60;
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = t("forgot.button.wait", "Wait {seconds}s").replace("{seconds}", seconds);
  const timer = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(timer);
      button.disabled = false;
      button.innerHTML = originalHtml;
      applyI18n(button);
      return;
    }
    button.innerHTML = t("forgot.button.wait", "Wait {seconds}s").replace("{seconds}", seconds);
  }, 1000);
}

function initForgotVerificationCodes() {
  $$('[data-send-code]').forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest('[data-forgot-form]');
      if (!form) return;
      const method = form.dataset.forgotForm;
      const contact = getFormContact(form, method);
      const status = getVerificationStatusNode(form);
      status?.classList.remove("success");

      if (!contact) return setStatus(status, method === "phone" ? t("forgot.error.contactPhone", "Enter your phone number.") : t("forgot.error.contactEmail", "Enter your email address."));
      if (!isPhoneInputValid(form, method)) return setStatus(status, t("forgot.error.phoneInvalid", "Enter a valid phone number."));

      form.dataset.verificationContact = contact;
      form.dataset.verificationMethod = method;
      form.dataset.verificationSent = "true";
      setStatus(status, t("forgot.success.codeSent", "Verification code sent."), true);
      startVerificationCooldown(button);
    });
  });
}

function isForgotCodeValid(form, method, contact) {
  const inputCode = (form.querySelector('[name="verificationCode"]')?.value || "").trim();
  return Boolean(inputCode && form.dataset.verificationSent === "true" && form.dataset.verificationContact === contact && form.dataset.verificationMethod === method);
}

function handleForgotPassword() {
  const forms = $$('[data-forgot-form]');
  forms.forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const method = form.dataset.forgotForm;
      const contact = getFormContact(form, method);
      const password = form.querySelector('[name="password"]').value;
      const confirm = form.querySelector('[name="confirm"]').value;
      const status = form.querySelector('.status-message');
      const account = getAccount();

      status.classList.remove("success");
      if (!contact) return setStatus(status, method === "phone" ? t("forgot.error.contactPhone", "Enter your phone number.") : t("forgot.error.contactEmail", "Enter your email address."));
      if (!isPhoneInputValid(form, method)) return setStatus(status, t("forgot.error.phoneInvalid", "Enter a valid phone number."));
      if (!isForgotCodeValid(form, method, contact)) return setStatus(status, t("forgot.error.verificationCode", "Enter the correct verification code."));
      if (!validatePassword(password)) return setStatus(status, t("forgot.error.password", "Password must be at least 8 characters."));
      if (password !== confirm) return setStatus(status, t("forgot.error.confirm", "Password confirmation does not match."));
      if (!account) return setStatus(status, t("forgot.error.noAccount", "No saved account was found on this browser."));
      if (account.method !== method || account.contact !== contact) return setStatus(status, t("forgot.error.mismatch", "These details do not match the saved account on this browser."));

      account.password = password;
      saveAccount(account);
      clearRememberedLogin();
      setStatus(status, t("forgot.success", "Password updated. Redirecting to login..."), true);
      setTimeout(() => window.location.href = "login.html", 700);
    });
  });
}

function setStatus(node, message, success = false) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("success", success);
}

function hydrateCommon() {
  const account = ensureDemoAccount();
  $$('[data-account-id]').forEach(node => node.textContent = account.id);
  $$('[data-account-contact]').forEach(node => node.textContent = account.contact);
  const dashboardZeros = document.body?.dataset?.page === "dashboard";
  const displayBalance = dashboardZeros ? 0 : Number(account.balance || 0) + Number(account.profit || 0) + Number(account.referralBonus || 0);
  const displayProfit = dashboardZeros ? 0 : Number(account.profit || 0);
  const displayReferralBonus = dashboardZeros ? 0 : Number(account.referralBonus || 0);
  const displayTradingVolume = dashboardZeros ? 0 : Number(account.tradingVolume || 0);
  const displayTradingVolumeRequired = Number(account.tradingVolumeRequired || 2500);

  $$('[data-balance]').forEach(node => {
    const value = formatMoney(displayBalance);
    node.dataset.realValue = value;
    node.textContent = node.closest('[data-privacy-toggle]')?.classList.contains('is-balance-hidden') ? '******' : value;
  });
  $$('[data-profit]').forEach(node => {
    const value = formatMoney(displayProfit);
    node.dataset.realValue = value;
    node.textContent = node.closest('[data-privacy-toggle]')?.classList.contains('is-balance-hidden') ? '******' : value;
  });
  $$('[data-referral-bonus]').forEach(node => node.textContent = formatMoney(displayReferralBonus));
  $$('[data-volume]').forEach(node => {
    const value = formatMoney(displayTradingVolume);
    node.dataset.realValue = value;
    node.textContent = node.closest('[data-privacy-toggle]')?.classList.contains('is-balance-hidden') ? '******' : value;
  });
  $$('[data-volume-required]').forEach(node => node.textContent = formatMoney(displayTradingVolumeRequired));
  $$('[data-wallet]').forEach(node => node.textContent = account.wallet);
  $$('[data-trc-wallet]').forEach(node => node.textContent = account.trcWallet);
  $$('[data-wallet-input]').forEach(node => node.value = account.wallet);
  $$('[data-invite-code]').forEach(node => node.textContent = account.invite);
  $$('[data-invite-input]').forEach(node => node.value = getInviteLink(account));
  const volumeProgressPercent = displayTradingVolumeRequired > 0 ? Math.min(100, Math.round(displayTradingVolume / displayTradingVolumeRequired * 100)) : 0;
  $$('[data-volume-progress]').forEach(node => node.style.setProperty("--progress", `${volumeProgressPercent}%`));
  $$('[data-volume-percent]').forEach(node => {
    const value = `${volumeProgressPercent}%`;
    node.dataset.realValue = value;
    node.textContent = node.closest('[data-privacy-toggle]')?.classList.contains('is-balance-hidden') ? '**' : value;
  });

  const withdrawalState = getWithdrawalState(account);
  $$('[data-withdrawable-balance]').forEach(node => node.textContent = formatUsdt(withdrawalState.withdrawable));
  $$('[data-volume-remaining]').forEach(node => node.textContent = formatMoney(withdrawalState.volumeRemaining));
}

function hydrateTeamPage() {
  if (document.body?.dataset?.page !== "team") return;

  let members = [];
  try {
    members = JSON.parse(localStorage.getItem("ct_copytrader_team_members") || "[]");
  } catch (error) {
    members = [];
  }
  if (!Array.isArray(members)) members = [];

  const fundedMembers = members.filter(member => Number(member.deposit || 0) > 0 || member.status === "funded");
  $$('[data-team-count]').forEach(node => node.textContent = members.length.toString());
  $$('[data-funded-count]').forEach(node => node.textContent = fundedMembers.length.toString());

  const tbody = $('[data-team-members]');
  if (!tbody) return;

  if (!members.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${t("team.noMembers", "No registered members yet.")}</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(member => {
    const deposit = Number(member.deposit || 0);
    const bonus = Number(member.bonus || deposit * 0.13 || 0);
    const isFunded = deposit > 0 || member.status === "funded";
    const statusClass = isFunded ? "success" : "warn";
    const statusIcon = isFunded ? "fa-circle-check" : "fa-clock";
    const statusText = isFunded ? t("team.status.funded", "Funded") : t("team.status.notFunded", "Not funded");
    return `<tr><td>${escapeHtml(member.id || member.memberId || "-")}</td><td>${escapeHtml(member.joined || "-")}</td><td><span class="badge ${statusClass}"><i class="fa-solid ${statusIcon}"></i> <span>${statusText}</span></span></td><td>${deposit.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT</td><td>${bonus.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDT</td></tr>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function getInviteLink(account) {
  return `https://copytrader.com/register.html?ref=${account.invite}`;
}

function formatMoney(number) {
  return `$${Number(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsdt(number) {
  return `${Number(number || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

function getWithdrawalState(account) {
  const capital = Number(account.balance || 0);
  const profit = Number(account.profit || 0);
  const referralBonus = Number(account.referralBonus || 0);
  const tradingVolume = Number(account.tradingVolume || 0);
  const tradingVolumeRequired = Number(account.tradingVolumeRequired || 0);
  const volumeRemaining = Math.max(0, tradingVolumeRequired - tradingVolume);
  const volumeComplete = tradingVolumeRequired > 0 && tradingVolume >= tradingVolumeRequired;
  const freeUsed = localStorage.getItem(`${FREE_WITHDRAW_KEY}_${account.id}`) === "yes";
  const freeProfitEligible = volumeComplete && !freeUsed;
  return {
    capital,
    profit,
    referralBonus,
    tradingVolume,
    tradingVolumeRequired,
    volumeRemaining,
    volumeComplete,
    freeProfitEligible,
    withdrawable: Math.max(0, profit + referralBonus),
    feeRate: freeProfitEligible ? 0 : 0.10
  };
}

function isValidBep20Address(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim());
}

function maskWallet(address) {
  if (!address) return t("withdraw.noBep20WalletSaved", "No BEP20 wallet saved");
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function initBalancePrivacyToggle() {
  if (document.body?.dataset?.page !== "dashboard") return;
  $$('[data-privacy-toggle]').forEach(card => {
    const toggleBalance = () => {
      const valueNodes = card.querySelectorAll('[data-private-value]');
      if (!valueNodes.length) return;
      const isHidden = card.classList.toggle('is-balance-hidden');
      valueNodes.forEach(valueNode => {
        const hiddenValue = valueNode.matches('small') ? '**' : '******';
        valueNode.textContent = isHidden ? hiddenValue : (valueNode.dataset.realValue || '$0.00');
      });
      card.setAttribute('aria-label', isHidden ? 'Show value' : 'Hide value');
    };
    card.addEventListener('click', toggleBalance);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleBalance();
      }
    });
  });
}

function initCopyButtons() {
  $$('[data-copy-target]').forEach(button => {
    button.addEventListener("click", async () => {
      const target = $(button.dataset.copyTarget);
      if (!target) return;
      const value = "value" in target ? target.value : target.textContent;
      try {
        await navigator.clipboard.writeText(value);
        showToast(t("toast.copied", "Copied to clipboard"));
      } catch (error) {
        showToast(t("toast.copyUnavailable", "Copy is not available in this browser"));
      }
    });
  });
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

function getLebanonTradingDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const hour = Number(parts.hour);
  if (hour < 4) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getTradeCode(account) {
  const day = getLebanonTradingDay();
  const raw = simpleHash(`${account.id}:${day}:copy`).toString(36).toUpperCase();
  return `CPY-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function getTradeDuration(account) {
  const day = getLebanonTradingDay();
  return 10 + (simpleHash(`${account.id}:${day}:duration`) % 28);
}

function initCopyTrading() {
  const terminal = $("[data-copy-terminal]");
  if (!terminal) return;
  const account = ensureDemoAccount();
  const day = getLebanonTradingDay();
  const code = getTradeCode(account);
  const duration = getTradeDuration(account);
  const usedKey = `${TRADE_USE_PREFIX}${account.id}_${day}`;
  const isUsed = localStorage.getItem(usedKey) === code;
  const codeNode = $("[data-trade-code]");
  const durationNode = $("[data-trade-duration]");
  const pasteInput = $("#tradePasteInput");
  const executeButton = $("#executeTradeButton");
  const status = $("#copyTradeStatus");

  if (codeNode) codeNode.textContent = isUsed ? t("copy.lockedUntilNextDay", "LOCKED UNTIL NEXT DAY") : code;
  if (durationNode) durationNode.textContent = `${duration} ${t("copy.minutes", "minutes")}`;
  if (executeButton) executeButton.disabled = isUsed;
  if (pasteInput) pasteInput.disabled = isUsed;

  $("#copyTradeCodeButton")?.addEventListener("click", async () => {
    if (isUsed) return showToast(t("copy.toast.alreadyExecuted", "Daily signal already executed"));
    await navigator.clipboard.writeText(code);
    showToast(t("copy.toast.codeCopied", "Trade code copied"));
  });

  executeButton?.addEventListener("click", () => {
    const value = pasteInput.value.trim().toUpperCase();
    if (localStorage.getItem(usedKey) === code) {
      setStatus(status, t("copy.status.alreadyExecuted", "Daily copy signal already executed."));
      return;
    }
    if (value !== code) {
      setStatus(status, t("copy.status.pasteExact", "Paste the exact signal code before executing."));
      return;
    }
    localStorage.setItem(usedKey, code);
    pasteInput.disabled = true;
    executeButton.disabled = true;
    codeNode.textContent = t("copy.lockedUntilNextDay", "LOCKED UNTIL NEXT DAY");
    setStatus(status, t("copy.status.activated", "Copy trading activated. Estimated duration: {duration} minutes.").replace("{duration}", duration), true);
  });
}

function initMarketSnapshot() {
  const list = $("[data-market-list]");
  if (!list) return;
  const symbols = [
    { symbol: "BTC/USDT", name: "Bitcoin", nameKey: "market.bitcoin", icon: "fa-brands fa-bitcoin", base: 66420 },
    { symbol: "ETH/USDT", name: "Ethereum", nameKey: "market.ethereum", icon: "fa-brands fa-ethereum", base: 3440 },
    { symbol: "BNB/USDT", name: "Binance Coin", nameKey: "market.binanceCoin", icon: "fa-solid fa-coins", base: 592 },
    { symbol: "EUR/USD", name: "Euro / Dollar", nameKey: "market.euroDollar", icon: "fa-solid fa-euro-sign", base: 1.084 },
    { symbol: "XAU/USD", name: "Gold Spot", nameKey: "market.goldSpot", icon: "fa-solid fa-gem", base: 2328 }
  ];
  function render() {
    list.innerHTML = symbols.map(item => {
      const drift = (Math.sin(Date.now() / 14000 + item.base) * 0.0075) + ((simpleHash(item.symbol + new Date().getMinutes()) % 50) - 25) / 10000;
      const price = item.base * (1 + drift);
      const change = drift * 100;
      const up = change >= 0;
      return `<div class="market-row">
        <div class="market-asset">
          <span class="market-icon"><i class="${item.icon}"></i></span>
          <span><strong>${item.symbol}</strong><small>${t(item.nameKey, item.name)}</small></span>
        </div>
        <div class="market-price">${price.toLocaleString("en-US", { minimumFractionDigits: item.base < 10 ? 4 : 2, maximumFractionDigits: item.base < 10 ? 4 : 2 })}</div>
        <div class="market-change ${up ? "up" : "down"}"><i class="fa-solid ${up ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i>${up ? "+" : ""}${change.toFixed(2)}%</div>
      </div>`;
    }).join("");
  }
  render();
  window.addEventListener("copytrader:languagechange", render);
  setInterval(render, 3500);
}


function initCopyDesk() {
  const chart = $$("[data-candle-chart]")[0];
  const tabs = $$("[data-copy-symbol]");
  if (!chart || tabs.length === 0) return;

  const chartSymbol = $("[data-chart-symbol]");
  const chartIcon = $("[data-chart-icon]");
  const chartPrice = $("[data-chart-price]");
  const chartChange = $("[data-chart-change]");
  const signalSymbol = $("[data-signal-symbol]");
  const signalEntry = $("[data-signal-entry]");
  const signalTp = $("[data-signal-tp]");
  const signalSl = $("[data-signal-sl]");
  const watchRows = $$("[data-copy-watch]");
  let activeButton = tabs.find(button => button.classList.contains("active")) || tabs[0];

  function getDecimals(base) {
    return base < 10 ? 4 : 2;
  }

  function formatPrice(value, base) {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: getDecimals(base),
      maximumFractionDigits: getDecimals(base)
    });
  }

  function getSignalStep(symbol) {
    if (symbol === "USDT/BEP20" || symbol === "USDT/TRC20") return 0.003;
    if (symbol === "BTC/USDT") return 250;
    if (symbol === "ETH/USDT") return 18;
    return 3;
  }

  function makeCandles(symbol, base) {
    const candles = [];
    let previous = base * (1 + Math.sin(Date.now() / 22000 + simpleHash(symbol) % 9) * 0.0035);
    for (let i = 0; i < 30; i++) {
      const wave = Math.sin(Date.now() / 9000 + i * 0.72 + simpleHash(symbol) % 11);
      const noise = ((simpleHash(`${symbol}:${i}:${Math.floor(Date.now() / 3500)}`) % 100) - 50) / 10000;
      const open = previous;
      const close = base * (1 + wave * 0.004 + noise);
      const spread = base * (0.0016 + Math.abs(wave) * 0.0012);
      const high = Math.max(open, close) + spread;
      const low = Math.min(open, close) - spread;
      candles.push({ open, close, high, low });
      previous = close;
    }
    return candles;
  }

  function render() {
    const symbol = activeButton.dataset.copySymbol;
    const icon = activeButton.dataset.icon;
    const base = Number(activeButton.dataset.base || 1);
    const candles = makeCandles(symbol, base);
    const max = Math.max(...candles.map(item => item.high));
    const min = Math.min(...candles.map(item => item.low));
    const range = Math.max(max - min, base * 0.001);
    const first = candles[0].open;
    const last = candles[candles.length - 1].close;
    const change = ((last - first) / first) * 100;
    const up = change >= 0;

    chart.innerHTML = candles.map(item => {
      const wickTop = ((max - item.high) / range) * 100;
      const wickBottom = ((max - item.low) / range) * 100;
      const bodyTop = ((max - Math.max(item.open, item.close)) / range) * 100;
      const bodyBottom = ((max - Math.min(item.open, item.close)) / range) * 100;
      const bodyHeight = Math.max(2.5, bodyBottom - bodyTop);
      return `<span class="candle ${item.close >= item.open ? "up" : "down"}" style="--wick-top:${wickTop}%;--wick-height:${Math.max(8, wickBottom - wickTop)}%;--body-top:${bodyTop}%;--body-height:${bodyHeight}%"><span class="candle-body"></span></span>`;
    }).join("");

    if (chartSymbol) chartSymbol.textContent = symbol;
    if (chartIcon) chartIcon.className = icon;
    if (chartPrice) chartPrice.textContent = formatPrice(last, base);
    if (chartChange) {
      chartChange.className = `market-change ${up ? "up" : "down"}`;
      chartChange.innerHTML = `<i class="fa-solid ${up ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i>${up ? "+" : ""}${change.toFixed(2)}%`;
    }

    const signalStep = getSignalStep(symbol);
    if (signalSymbol) signalSymbol.textContent = symbol;
    if (signalEntry) signalEntry.textContent = formatPrice(last, base);
    if (signalTp) signalTp.textContent = formatPrice(last + signalStep, base);
    if (signalSl) signalSl.textContent = formatPrice(last - signalStep, base);

    watchRows.forEach(row => {
      const rowSymbol = row.dataset.copyWatch;
      const rowButton = tabs.find(button => button.dataset.copySymbol === rowSymbol);
      const rowBase = Number(rowButton?.dataset.base || base);
      const rowDrift = Math.sin(Date.now() / 15000 + simpleHash(rowSymbol)) * 0.004;
      const rowPrice = rowBase * (1 + rowDrift);
      const priceNode = row.querySelector("b");
      if (priceNode) priceNode.textContent = formatPrice(rowPrice, rowBase);
      row.classList.toggle("active", rowSymbol === symbol);
    });
  }

  tabs.forEach(button => {
    button.addEventListener("click", () => {
      tabs.forEach(tab => tab.classList.toggle("active", tab === button));
      activeButton = button;
      render();
    });
  });

  watchRows.forEach(row => {
    row.addEventListener("click", () => {
      const target = tabs.find(button => button.dataset.copySymbol === row.dataset.copyWatch);
      if (target) target.click();
    });
  });

  render();
  setInterval(render, 3500);
}

function initDepositQr() {
  const qr = $("#depositQr");
  const walletInput = $("#walletAddress");
  if (!qr || !walletInput) return;
  const account = ensureDemoAccount();
  const networkButtons = $$('[data-deposit-network]');
  const networkSelect = $("#depositNetworkSelect");
  const qrNote = $("#depositQrNote");
  const networks = {
    bep20: {
      label: "USDT BEP20",
      hint: "BNB Smart Chain address starts with 0x.",
      noteKey: "deposit.qrNoteBep20",
      note: "Scan the QR code or copy the BEP20 wallet address below to complete your fast deposit.",
      address: account.wallet
    },
    trc20: {
      label: "USDT TRC20",
      hint: "TRON Network address starts with T.",
      noteKey: "deposit.qrNoteTrc20",
      note: "Scan the QR code or copy the TRC20 wallet address below to complete your fast deposit.",
      address: account.trcWallet
    }
  };

  function renderDepositNetwork(network = "bep20") {
    const selected = networks[network] || networks.bep20;
    walletInput.value = selected.address;
    if (qrNote) qrNote.textContent = t(selected.noteKey, selected.note);
    networkButtons.forEach(button => button.classList.toggle("active", button.dataset.depositNetwork === network));
    if (networkSelect) networkSelect.value = network;
    qr.innerHTML = "";
    if (window.QRCode) {
      new QRCode(qr, { text: selected.address, width: 148, height: 148, correctLevel: QRCode.CorrectLevel.M });
    } else {
      qr.textContent = selected.address;
      qr.style.color = "#061020";
    }
  }

  networkButtons.forEach(button => {
    button.addEventListener("click", () => renderDepositNetwork(button.dataset.depositNetwork));
  });

  if (networkSelect) {
    networkSelect.addEventListener("change", () => renderDepositNetwork(networkSelect.value));
  }

  renderDepositNetwork(networkSelect?.value || networkButtons.find(button => button.classList.contains("active"))?.dataset.depositNetwork || "bep20");
  window.addEventListener("copytrader:languagechange", () => renderDepositNetwork(networkSelect?.value || "bep20"));
}


function getWithdrawHistoryKey(account) {
  return `${WITHDRAW_HISTORY_KEY}_${account.id}`;
}

function getWithdrawHistory(account) {
  const raw = localStorage.getItem(getWithdrawHistoryKey(account));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function saveWithdrawHistoryRecord(account, record) {
  const list = getWithdrawHistory(account);
  list.unshift(record);
  localStorage.setItem(getWithdrawHistoryKey(account), JSON.stringify(list.slice(0, 50)));
}

function initWithdrawalHistoryPage() {
  const list = $("#withdrawHistoryList");
  if (!list) return;
  const account = ensureDemoAccount();
  const history = getWithdrawHistory(account);
  const t = window.CopyTraderI18n?.translate || ((key, fallback) => fallback || key);
  const head = list.querySelector(".transfer-history-row.head")?.outerHTML || "";
  if (!history.length) {
    list.innerHTML = `${head}<div class="transfer-empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p data-i18n="withdrawHistory.empty">${t("withdrawHistory.empty", "No withdrawal requests yet.")}</p></div>`;
    window.CopyTraderI18n?.applyTranslations?.(list);
    return;
  }
  list.innerHTML = head + history.map(item => {
    const date = item.date ? new Date(item.date).toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "--";
    const statusKey = String(item.status || "Pending").toLowerCase() === "completed" ? "withdrawHistory.status.completed" : "withdrawHistory.status.pending";
    return `
      <div class="transfer-history-row">
        <span data-label="${t("withdrawHistory.table.date", "Date")}">${date}</span>
        <strong data-label="${t("withdrawHistory.table.amount", "Amount")}">${formatUsdt(Number(item.amount || 0))}</strong>
        <span data-label="${t("withdrawHistory.table.fee", "Fee")}">${formatUsdt(Number(item.fee || 0))}</span>
        <strong data-label="${t("withdrawHistory.table.netReceive", "Net Receive")}">${formatUsdt(Number(item.net || 0))}</strong>
        <span data-label="${t("withdrawHistory.table.status", "Status")}" class="transfer-status-pill">${t(statusKey, item.status || "Pending")}</span>
      </div>`;
  }).join("");
  window.CopyTraderI18n?.applyTranslations?.(list);
}
window.addEventListener("copytrader:languagechange", initWithdrawalHistoryPage);
window.addEventListener("copytrader:languagechange", hydrateTeamPage);

function initWithdrawForm() {
  const form = $("#withdrawForm");
  const modal = $("#walletModal");
  const openWalletButton = $("#openWalletModal");
  const walletInput = $("#walletAddressInput");
  const saveWalletButton = $("#saveWalletAddress");
  const validation = $("#walletValidation");
  const amountInput = $("#withdrawAmount");
  const status = $("#withdrawStatus");
  if (!form && !modal) return;

  function getAccountForWithdraw() {
    const account = ensureDemoAccount();
    if (typeof account.withdrawWallet !== "string") account.withdrawWallet = "";
    return account;
  }

  function saveWithdrawAccount(account) {
    saveAccount(account);
    hydrateCommon();
  }

  function setValidation(message, success = false) {
    if (!validation) return;
    validation.classList.toggle("success", success);
    validation.classList.toggle("danger", Boolean(message) && !success);
    validation.innerHTML = `<i class="fa-solid ${success ? "fa-circle-check" : "fa-circle-info"}"></i><span>${message}</span>`;
  }

  function updateWalletView() {
    const account = getAccountForWithdraw();
    const address = account.withdrawWallet || "";
    const isValid = isValidBep20Address(address);
    const walletText = $("#withdrawWalletText");
    const walletStatus = $("#withdrawWalletStatus");
    const walletPanel = $("#walletPanel");
    const walletDisplay = $("#withdrawAddressDisplay");
    if (walletText) walletText.textContent = maskWallet(address);
    if (walletDisplay) walletDisplay.value = address ? maskWallet(address) : "";
    if (walletStatus) walletStatus.textContent = isValid ? t("withdraw.walletStatusVerified", "Verified USDT BEP20 wallet address saved.") : t("withdraw.walletStatusMissing", "Add a BEP20 USDT wallet before submitting a withdrawal.");
    if (walletPanel) walletPanel.classList.toggle("verified", isValid);
    if (walletInput) walletInput.value = address;
  }

  function getAmount() {
    return Number(amountInput?.value || 0);
  }

  function updatePreview() {
    const account = getAccountForWithdraw();
    const state = getWithdrawalState(account);
    const amount = Math.max(0, getAmount());
    const fee = amount * state.feeRate;
    const net = Math.max(0, amount - fee);
    $$('[data-preview-request]').forEach(node => node.textContent = formatUsdt(amount));
    $$('[data-preview-fee]').forEach(node => node.textContent = state.feeRate === 0 ? "0.00 USDT" : formatUsdt(fee));
    $$('[data-preview-net]').forEach(node => node.textContent = formatUsdt(net));
    $$('[data-preview-available]').forEach(node => node.textContent = formatUsdt(state.withdrawable));
    $$('[data-preview-fee-rate]').forEach(node => node.textContent = state.feeRate === 0 ? "0%" : "10%");
    const note = $("#withdrawFeeNote");
    if (note) {
      note.innerHTML = state.freeProfitEligible
        ? t("withdraw.feeNoteFree", '<i class="fa-solid fa-circle-check"></i> The free profit withdrawal condition is active. This request will be previewed with 0% fee.')
        : t("withdraw.feeNoteStandard", '<i class="fa-solid fa-circle-info"></i> A 10% fee applies to standard withdrawals. Eligible one-time profit withdrawal after volume completion is processed without a fee.');
    }
  }

  function openModal() {
    updateWalletView();
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => walletInput?.focus(), 80);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function saveWalletFromModal() {
    const address = (walletInput?.value || "").trim();
    if (!isValidBep20Address(address)) {
      setValidation(t("withdraw.validation.invalid", "Invalid BEP20 address. Use a 42-character address that starts with 0x."));
      return;
    }
    const account = getAccountForWithdraw();
    account.withdrawWallet = address;
    saveWithdrawAccount(account);
    setValidation(t("withdraw.validation.saved", "Wallet address verified and saved."), true);
    updateWalletView();
    updatePreview();
    showToast(t("withdraw.toast.walletSaved", "BEP20 wallet saved"));
    setTimeout(closeModal, 420);
  }

  openWalletButton?.addEventListener("click", openModal);
  $$('[data-wallet-modal-close]').forEach(button => button.addEventListener("click", closeModal));
  modal?.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal?.classList.contains("open")) closeModal();
  });
  walletInput?.addEventListener("input", () => {
    const value = walletInput.value.trim();
    if (!value) return setValidation(t("withdraw.validation.enter", "Enter the wallet address to verify the BEP20 format."));
    if (isValidBep20Address(value)) return setValidation(t("withdraw.validation.valid", "Valid BEP20 wallet format."), true);
    setValidation(t("withdraw.validation.invalid", "Invalid BEP20 address. Use a 42-character address that starts with 0x."));
  });
  saveWalletButton?.addEventListener("click", saveWalletFromModal);
  $("#withdrawMaxButton")?.addEventListener("click", () => {
    const account = getAccountForWithdraw();
    const state = getWithdrawalState(account);
    if (amountInput) amountInput.value = state.withdrawable.toFixed(2);
    updatePreview();
    status?.classList.remove("success");
    if (status) status.textContent = "";
  });
  amountInput?.addEventListener("input", () => {
    updatePreview();
    status?.classList.remove("success");
    if (status) status.textContent = "";
  });

  form?.addEventListener("submit", event => {
    event.preventDefault();
    const account = getAccountForWithdraw();
    const state = getWithdrawalState(account);
    const amount = getAmount();
    const address = account.withdrawWallet || "";
    const day = getLebanonTradingDay();
    const last = localStorage.getItem(`${WITHDRAW_KEY}_${account.id}`);
    status?.classList.remove("success");

    if (!isValidBep20Address(address)) {
      setStatus(status, t("withdraw.status.addWallet", "Add and save a valid USDT BEP20 wallet address first."));
      openModal();
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) return setStatus(status, t("withdraw.status.minimum", "Minimum withdrawal amount is 1 USDT."));
    if (amount > state.withdrawable) return setStatus(status, t("withdraw.status.available", "Available withdrawal balance is {amount}.").replace("{amount}", formatUsdt(state.withdrawable)));
    if (last === day) return setStatus(status, t("withdraw.status.onceDaily", "Only one withdrawal request is allowed per Lebanon trading day."));

    const fee = amount * state.feeRate;
    const net = Math.max(0, amount - fee);
    localStorage.setItem(`${WITHDRAW_KEY}_${account.id}`, day);
    if (state.freeProfitEligible) localStorage.setItem(`${FREE_WITHDRAW_KEY}_${account.id}`, "yes");
    saveWithdrawHistoryRecord(account, {
      date: new Date().toISOString(),
      amount,
      fee,
      net,
      network: "USDT BEP20",
      wallet: address,
      status: "Pending"
    });
    updatePreview();
    setStatus(status, t("withdraw.status.submitted", "Withdrawal request submitted. Network: USDT BEP20. Net amount to receive: {amount}.").replace("{amount}", formatUsdt(net)), true);
  });

  updateWalletView();
  updatePreview();
}



function normalizeEnglishDateInput(value) {
  const digitMap = { "٠":"0", "١":"1", "٢":"2", "٣":"3", "٤":"4", "٥":"5", "٦":"6", "٧":"7", "٨":"8", "٩":"9", "۰":"0", "۱":"1", "۲":"2", "۳":"3", "۴":"4", "۵":"5", "۶":"6", "۷":"7", "۸":"8", "۹":"9" };
  return String(value || "").replace(/[٠-٩۰-۹]/g, d => digitMap[d] || d).replace(/[^0-9-]/g, "").slice(0, 10);
}

function initEnglishDatePicker(input, onSelect) {
  if (!input || input.dataset.datePickerReady === "true") return;
  input.dataset.datePickerReady = "true";
  input.setAttribute("lang", "en-US");
  input.setAttribute("dir", "ltr");
  input.setAttribute("placeholder", "YYYY-MM-DD");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("maxlength", "10");

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  let cursor = input.value && /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(`${input.value}T00:00:00`) : new Date();

  const picker = document.createElement("div");
  picker.className = "english-date-picker";
  picker.setAttribute("dir", "ltr");
  picker.hidden = true;
  document.body.appendChild(picker);

  function pad(num) { return String(num).padStart(2, "0"); }
  function setValue(date) {
    input.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    picker.hidden = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (typeof onSelect === "function") onSelect();
  }
  function position() {
    const rect = input.getBoundingClientRect();
    picker.style.left = `${Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 292)}px`;
    picker.style.top = `${rect.bottom + window.scrollY + 8}px`;
  }
  function render() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const blanks = first.getDay();
    let cells = dayNames.map(day => `<span class="edp-day-name">${day}</span>`).join("");
    for (let i = 0; i < blanks; i += 1) cells += `<span class="edp-empty"></span>`;
    for (let day = 1; day <= lastDay; day += 1) {
      const value = `${year}-${pad(month + 1)}-${pad(day)}`;
      const active = input.value === value ? " active" : "";
      cells += `<button type="button" class="edp-day${active}" data-date="${value}">${day}</button>`;
    }
    picker.innerHTML = `
      <div class="edp-head">
        <button type="button" data-edp-prev aria-label="Previous month">‹</button>
        <strong>${monthNames[month]} ${year}</strong>
        <button type="button" data-edp-next aria-label="Next month">›</button>
      </div>
      <div class="edp-grid">${cells}</div>
      <div class="edp-actions"><button type="button" data-edp-today>Today</button><button type="button" data-edp-close>Close</button></div>`;
  }
  function openPicker() {
    cursor = input.value && /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(`${input.value}T00:00:00`) : new Date();
    render();
    position();
    picker.hidden = false;
  }

  input.addEventListener("focus", openPicker);
  input.addEventListener("click", openPicker);
  input.closest(".input-wrap")?.querySelector("i")?.addEventListener("click", openPicker);
  input.addEventListener("input", () => {
    input.value = normalizeEnglishDateInput(input.value);
  });
  picker.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.matches("[data-edp-prev]")) { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); render(); return; }
    if (target.matches("[data-edp-next]")) { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); render(); return; }
    if (target.matches("[data-edp-today]")) { setValue(new Date()); return; }
    if (target.matches("[data-edp-close]")) { picker.hidden = true; return; }
    const chosen = target.getAttribute("data-date");
    if (chosen) setValue(new Date(`${chosen}T00:00:00`));
  });
  document.addEventListener("click", event => {
    if (event.target === input || picker.contains(event.target)) return;
    if (input.closest(".input-wrap")?.contains(event.target)) return;
    picker.hidden = true;
  });
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
}

function getAccountRecords(account) {
  return [];
}

function initRecordsPage() {
  const list = $("#recordsList");
  if (!list) return;
  const account = ensureDemoAccount();
  const fromInput = $("#recordFromDate");
  const toInput = $("#recordToDate");
  const clearButton = $("#clearRecordFilter");
  const totalNode = $("[data-record-total]");
  const countNode = $("[data-record-count]");
  const chips = $$('[data-record-filter]');
  let activeType = "all";
  initEnglishDatePicker(fromInput, render);
  initEnglishDatePicker(toInput, render);

  function inDateRange(record) {
    const recordDay = String(record.date || "").slice(0, 10);
    if (fromInput?.value && recordDay < fromInput.value) return false;
    if (toInput?.value && recordDay > toInput.value) return false;
    return true;
  }

  function render() {
    const records = getAccountRecords(account).filter(record => {
      const typeOk = activeType === "all" || record.type.toLowerCase() === activeType;
      return typeOk && inDateRange(record);
    });
    const total = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    if (totalNode) totalNode.textContent = formatUsdt(total);
    if (countNode) countNode.textContent = String(records.length);
    if (!records.length) {
      list.innerHTML = `<div class="record-empty"><i class="fa-solid fa-filter-circle-xmark"></i><p>${t("records.empty", "No records match this date filter.")}</p></div>`;
      return;
    }
    list.innerHTML = records.map(record => {
      const date = record.date ? new Date(record.date).toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "--";
      const signClass = record.direction === "-" ? "out" : "in";
      const title = t(record.titleKey, record.title);
      const type = t(record.typeKey, record.type);
      const status = t(record.statusKey, record.status);
      return `<article class="record-item ${signClass}" data-record-type="${record.type}">
        <div class="record-icon"><i class="fa-solid ${record.icon}"></i></div>
        <div class="record-main">
          <strong>${title}</strong>
          <span>${type} • ${date}</span>
        </div>
        <div class="record-amount">
          <b>${record.direction}${formatUsdt(record.amount)}</b>
          <span>${status}</span>
        </div>
      </article>`;
    }).join("");
  }

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      activeType = chip.dataset.recordFilter || "all";
      chips.forEach(item => item.classList.toggle("active", item === chip));
      render();
    });
  });
  fromInput?.addEventListener("change", render);
  toInput?.addEventListener("change", render);
  fromInput?.addEventListener("input", render);
  toInput?.addEventListener("input", render);
  clearButton?.addEventListener("click", () => {
    if (fromInput) fromInput.value = "";
    if (toInput) toInput.value = "";
    activeType = "all";
    chips.forEach(item => item.classList.toggle("active", item.dataset.recordFilter === "all"));
    render();
  });
  render();
  window.addEventListener("copytrader:languagechange", render);
}

function initContactForm() {
  const form = $("#contactForm");
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    setStatus($("#contactStatus"), "Your message was saved locally for this demo interface.", true);
    form.reset();
  });
}

function initLogout() {
  $$('[data-logout]').forEach(node => {
    node.addEventListener("click", event => {
      event.preventDefault();
      localStorage.removeItem(SESSION_KEY);
      window.location.href = "login.html";
    });
  });
}


function getClientPlatform() {
  const ua = (navigator.userAgent || navigator.vendor || window.opera || "").toLowerCase();
  const isIpadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua) || isIpadOs) return "ios";
  return "web";
}

function initSmartAppDownload() {
  const page = document.querySelector('.app-download-page');
  if (!page) return;

  const body = document.body;
  const normalizeLink = value => (value && value.trim()) ? value.trim() : "#";
  const links = {
    android: normalizeLink(body.dataset.androidUrl),
    ios: normalizeLink(body.dataset.iosUrl),
    web: normalizeLink(body.dataset.webUrl) === "#" ? "dashboard.html" : normalizeLink(body.dataset.webUrl)
  };
  const hasAndroidFile = links.android !== "#";
  const hasIosLink = links.ios !== "#";
  const platform = getClientPlatform();
  const config = {
    android: {
      label: t("app.platform.androidLabel", "Android Device"),
      note: hasAndroidFile ? t("app.platform.androidApkNote", "Download the Android APK directly from this browser.") : t("app.platform.androidWebNote", "Use the web app now, or connect the APK link when the Android build is published."),
      icon: '<i class="fa-brands fa-android"></i>',
      button: hasAndroidFile ? t("app.button.downloadAndroid", '<i class="fa-brands fa-android"></i> Download Android APK') : t("app.button.installAndroid", '<i class="fa-solid fa-mobile-screen-button"></i> Install / Open Android App'),
      href: hasAndroidFile ? links.android : links.web
    },
    ios: {
      label: t("app.platform.iosLabel", "iPhone / iPad"),
      note: hasIosLink ? t("app.platform.iosLinkNote", "Open the official iOS option from this browser.") : t("app.platform.iosWebNote", "Use the web app on iPhone or iPad until the official iOS link is published."),
      icon: '<i class="fa-brands fa-apple"></i>',
      button: hasIosLink ? t("app.button.openIos", '<i class="fa-brands fa-apple"></i> Open iOS Option') : t("app.button.openIosWeb", '<i class="fa-brands fa-apple"></i> Open iOS Web App'),
      href: hasIosLink ? links.ios : links.web
    },
    web: {
      label: t("app.platform.webLabel", "Web Browser"),
      note: t("app.platform.webNote", "Open the secure web app from this browser."),
      icon: '<i class="fa-solid fa-desktop"></i>',
      button: t("app.button.openWeb", '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open Web App'),
      href: links.web
    }
  };

  const selected = config[platform] || config.web;
  const label = $('[data-detected-device]');
  const note = $('[data-device-note]');
  const icon = $('[data-device-icon]');
  const primary = $('[data-primary-app-action]');

  if (label) {
    label.removeAttribute('data-i18n');
    label.textContent = selected.label;
  }
  if (note) {
    note.removeAttribute('data-i18n');
    note.textContent = selected.note;
  }
  if (icon) icon.innerHTML = selected.icon;
  if (primary) {
    primary.removeAttribute('data-i18n-html');
    primary.href = selected.href;
    primary.innerHTML = selected.button;
    primary.dataset.platform = platform;
  }

  $$('[data-android-download]').forEach(link => link.href = links.android);
  $$('[data-ios-download]').forEach(link => link.href = links.ios);
  $$('[data-web-download]').forEach(link => link.href = links.web);
  $$('[data-option-card]').forEach(card => {
    card.classList.toggle('is-recommended', card.dataset.optionCard === platform);
  });

  $$('[data-primary-app-action]').forEach(link => {
    link.addEventListener('click', async event => {
      if (platform === 'android' && !hasAndroidFile && deferredPwaInstallPrompt) {
        event.preventDefault();
        deferredPwaInstallPrompt.prompt();
        await deferredPwaInstallPrompt.userChoice.catch(() => null);
        deferredPwaInstallPrompt = null;
        return;
      }
    });
  });

  $$('[data-android-download], [data-ios-download]').forEach(link => {
    link.addEventListener('click', event => {
      const href = link.getAttribute('href') || "";
      if (!href || href === "#") {
        event.preventDefault();
        showToast(t("app.toast.nativeMissing", "Native app link is not published yet. Use the Web App option."));
      }
    });
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  }
}

function initApp() {
  setActiveNav();
  initPhoneInputs();
  initTabs();
  initPreferredLoginMethod();
  initRememberedLogin();
  handleRegister();
  handleLogin();
  initForgotVerificationCodes();
  handleForgotPassword();
  hydrateCommon();
  hydrateTeamPage();
  initBalancePrivacyToggle();
  initCopyButtons();
  initCopyTrading();
  initMarketSnapshot();
  initCopyDesk();
  initDepositQr();
  initWithdrawForm();
  initWithdrawalHistoryPage();
  initRecordsPage();
  initContactForm();
  initLogout();
  initSmartAppDownload();
  initMinePanel();
  applyI18n(document);
}

document.addEventListener("DOMContentLoaded", initApp);

function createMinePanel() {
  if (document.querySelector('.mine-panel')) return;
  const account = ensureDemoAccount();
  const overlay = document.createElement('div');
  overlay.className = 'mine-overlay';
  overlay.setAttribute('data-mine-close', '');
  const panel = document.createElement('aside');
  panel.className = 'mine-panel';
  panel.id = 'mine-menu';
  panel.setAttribute('aria-label', 'Member menu');
  panel.innerHTML = `
    <div class="mine-head">
      <div>
        <h2 class="small-title" data-i18n="mine.title">Mine</h2>
        <button class="mine-id-box mine-id-copy" type="button" data-copy-account-id="${account.id}" title="Copy ID" aria-label="Copy account ID" data-i18n-title="mine.copyIdTitle" data-i18n-aria-label="mine.copyIdTitle"><i class="fa-solid fa-id-card"></i> <span data-i18n="mine.copyIdLabel">ID</span> <span data-account-id>${account.id}</span><i class="fa-regular fa-copy copy-id-icon"></i></button>
      </div>
      <button class="mine-close" type="button" data-mine-close aria-label="Close menu" data-i18n-aria-label="mine.closeMenu"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <nav class="drawer-links" aria-label="Account actions" data-i18n-aria-label="mine.accountActions">
      <a class="drawer-link" href="deposit.html"><i class="fa-solid fa-wallet"></i> <span data-i18n="mine.deposit">Deposit</span></a>
      <a class="drawer-link" href="transfer.html"><i class="fa-solid fa-money-bill-transfer"></i> <span data-i18n="mine.withdraw">Withdraw</span></a>
      <a class="drawer-link" href="records.html"><i class="fa-solid fa-clock-rotate-left"></i> <span data-i18n="mine.history">History</span></a>
      <a class="drawer-link" href="language.html"><i class="fa-solid fa-language"></i> <span data-i18n="mine.language">Language</span></a>
      <a class="drawer-link" href="partners.html"><i class="fa-solid fa-handshake"></i> <span data-i18n="mine.partners">Our Partners</span></a>
      <a class="drawer-link" href="how-we-work.html"><i class="fa-solid fa-diagram-project"></i> <span data-i18n="mine.howWeWork">How We Work</span></a>
      <a class="drawer-link" href="app.html"><i class="fa-solid fa-download"></i> <span data-i18n="mine.downloadApp">Download App</span></a>
      <a class="drawer-link" href="https://web.telegram.org/a/#777000"><i class="fa-solid fa-headset"></i> <span data-i18n="mine.contactUs">Contact Us</span></a>
      <a class="drawer-link danger" href="login.html" data-logout><i class="fa-solid fa-right-from-bracket"></i> <span data-i18n="mine.logout">Logout</span></a>
    </nav>`;
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  applyI18n(panel);
}

function openMinePanel() {
  createMinePanel();
  document.querySelector('.mine-overlay')?.classList.add('open');
  document.querySelector('.mine-panel')?.classList.add('open');
}

function closeMinePanel() {
  document.querySelector('.mine-overlay')?.classList.remove('open');
  document.querySelector('.mine-panel')?.classList.remove('open');
}

function initMinePanel() {
  document.querySelectorAll('[data-nav="mine"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openMinePanel();
    });
  });
  document.addEventListener('click', async event => {
    const idCopy = event.target.closest('[data-copy-account-id]');
    if (idCopy) {
      event.preventDefault();
      const accountId = idCopy.getAttribute('data-copy-account-id') || idCopy.querySelector('[data-account-id]')?.textContent?.trim() || '';
      try {
        await navigator.clipboard.writeText(accountId);
        showToast(t("toast.idCopied", "ID copied to clipboard"));
      } catch (error) {
        showToast(t("toast.copyUnavailable", "Copy is not available in this browser"));
      }
      return;
    }
    if (event.target.closest('[data-mine-close]')) closeMinePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMinePanel();
  });
}

