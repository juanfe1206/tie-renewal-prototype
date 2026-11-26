/* =========================================================================
   Shared case model + demo engine
   -------------------------------------------------------------------------
   Used by the citizen app (index.html) AND the officer app (officer/).
   Both apps read and write the same localStorage key, so an action on one
   side shows up on the other (open them in two tabs: the "storage" event
   keeps them in sync).

   Everything here is SYNTHETIC DATA. No real people, no real systems.

   Public API (window.RRS):
     RRS.state                 current state object (read only, use actions)
     RRS.load() / RRS.reset()
     RRS.subscribe(fn)         fn() is called after every change
     RRS.today()               current demo day (number, 0 = 25 Nov 2026)
     RRS.date(day)             Date object for a demo day
     RRS.fmt(day, opts)        formatted date string
     RRS.getCase(id)
     RRS.dayCount(c)           days on the 90-day legal clock (paused days excluded)
     RRS.advance(n)            move the demo clock forward n days

   Citizen actions:   submit, payFix, respondFlag, reschedule, appeal, markRead
   Officer actions:   confirmFlag, dismissFlag, decide, sendFixNotice,
                      signWithdrawal, drawSample, markSample
   See README.md for the full contract.
   ========================================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "rrs-demo-v1";
  var BASE = new Date(2026, 10, 25); // 25 Nov 2026 = demo day 0

  /* ---- Contract constants (service contract v1.1) ---------------------- */
  var RULES = {
    legalLimitDays: 90,         // RD 1155/2024: decision within 3 months, else silence = granted
    autoTargetDays: 7,          // 5 working days ≈ 7 calendar days
    humanTargetDays: 30,
    escalationDay: 60,
    fixDeadlineDays: 10,        // Ley 39/2015 art. 68
    flagResponseDays: 10,       // 10–15 days (art. 82); demo uses 10
    apptWithinDays: 7,          // 10 working days max; demo assigns at +7
    cardAfterApptDays: 14,      // card ready within 15 days of fingerprints
    reminderBeforeExpiry: 90,
    fileWindowBeforeExpiry: 60, // 2 months
    fee: 16.08                  // Modelo 790-012, synthetic demo amount
  };

  /* ---- Statuses: one source of truth for label + tag colour ----------- */
  var STATUS = {
    reminder:   { label: "Reminder sent",                  tag: "grey" },
    filed:      { label: "Filed",                          tag: "info" },
    review:     { label: "Under review",                   tag: "" },
    fix:        { label: "Fix needed",                     tag: "warning" },
    response:   { label: "Your response needed",           tag: "warning" },
    granted:    { label: "Granted",                        tag: "success" },
    silence:    { label: "Granted by silence",             tag: "success" },
    refused:    { label: "Refused",                        tag: "error" },
    withdrawn:  { label: "Withdrawn",                      tag: "error" },
    appt:       { label: "Fingerprint appointment",        tag: "info" },
    card:       { label: "Card ready",                     tag: "success" }
  };

  var OFFICES = [
    { id: "aluche",   name: "Aluche police station",            addr: "Av. de los Poblados s/n, 28044 Madrid" },
    { id: "centro",   name: "Madrid Centro police station",     addr: "C/ Leganitos 19, 28013 Madrid" },
    { id: "moratalaz",name: "Moratalaz police station",         addr: "C/ Fuente Carrantona 24, 28030 Madrid" }
  ];

  /* ---- Seeded random so synthetic data is the same for everyone ------- */
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

  /* ---- Personas (fictional) ------------------------------------------ */
  function personas() {
    return [
      {
        id: "amina", ref: "MAD-2026-104817", name: "Amina El Idrissi", nie: "Y4821937K", persona: true,
        permit: "work", permitLabel: "Residence and work (employee)",
        expiry: 55, status: "reminder", route: "auto", filed: null,
        employer: "Logística Henares S.L.", address: "C/ Toledo 112, 3ºB, 28005 Madrid",
        story: "Employee. Nothing changed. Approved automatically in 2 days.",
        phone: "+34 6•• ••• 412", email: "a••••@mail.example",
        data: [
          ["Name", "Amina El Idrissi", "Police foreigners' register"],
          ["NIE", "Y4821937K", "Police foreigners' register"],
          ["Current permit", "Residence and work, expires " , "Police foreigners' register"],
          ["Employer", "Logística Henares S.L., since 2022", "Social Security"],
          ["Social Security", "Contributing every month", "Social Security"],
          ["Tax", "Up to date", "Tax Agency"],
          ["Address", "C/ Toledo 112, 3ºB, 28005 Madrid", "Municipal register (padrón)"],
          ["Criminal record", "Checked, nothing found", "Criminal records registry"]
        ],
        checks: [["Identity","PID","green"],["Permit history","PID","green"],["Social Security","PID","green"],["Tax","PID","green"],["Address","PID","green"],["Criminal record","PID","green"]],
        fix: null, flags: [], appt: null, decision: null, appeal: null,
        history: [], messages: [], pausedTotal: 0, pauseStart: null, decideAfter: 2, read: {}
      },
      {
        id: "robert", ref: "MAD-2026-104902", name: "Robert Hughes", nie: "X9031475M", persona: true,
        permit: "nonlucrative", permitLabel: "Non-lucrative residence (retired)",
        expiry: 50, status: "reminder", route: "fix", filed: null,
        address: "C/ Ibiza 41, 1ºA, 28009 Madrid",
        story: "Retired. Paid the wrong fee. Fixes it in one click, then approved.",
        phone: "+34 6•• ••• 088", email: "r••••@mail.example",
        data: [
          ["Name", "Robert Hughes", "Police foreigners' register"],
          ["NIE", "X9031475M", "Police foreigners' register"],
          ["Current permit", "Non-lucrative residence, expires ", "Police foreigners' register"],
          ["Pension", "UK state pension, paid monthly", "Previous application"],
          ["Health insurance", "Private policy, valid to 2027", "Previous application"],
          ["Tax", "Up to date", "Tax Agency"],
          ["Address", "C/ Ibiza 41, 1ºA, 28009 Madrid", "Municipal register (padrón)"],
          ["Criminal record", "Checked, nothing found", "Criminal records registry"]
        ],
        checks: [["Identity","PID","green"],["Permit history","PID","green"],["Tax","PID","green"],["Address","PID","green"],["Criminal record","PID","green"],["Fee payment","Payment gateway","mismatch"]],
        fix: null, flags: [], appt: null, decision: null, appeal: null,
        history: [], messages: [], pausedTotal: 0, pauseStart: null, decideAfter: 1, read: {}
      },
      {
        id: "lucia", ref: "MAD-2026-105033", name: "Lucía Paredes Quispe", nie: "Y2210846R", persona: true,
        permit: "family", permitLabel: "Family reunification",
        expiry: 58, status: "reminder", route: "human", filed: null,
        address: "C/ Oca 27, 4ºD, 28025 Madrid",
        story: "Family reunification. A data mismatch is flagged. She responds, and a person decides.",
        phone: "+34 6•• ••• 731", email: "l••••@mail.example",
        data: [
          ["Name", "Lucía Paredes Quispe", "Police foreigners' register"],
          ["NIE", "Y2210846R", "Police foreigners' register"],
          ["Current permit", "Family reunification, expires ", "Police foreigners' register"],
          ["Sponsor", "Spouse, permanent resident", "Police foreigners' register"],
          ["Social Security", "Gap June to August 2026", "Social Security"],
          ["Tax", "Up to date", "Tax Agency"],
          ["Address", "C/ Oca 27, 4ºD, 28025 Madrid", "Municipal register (padrón)"],
          ["Criminal record", "Checked, nothing found", "Criminal records registry"]
        ],
        checks: [["Identity","PID","green"],["Permit history","PID","green"],["Social Security","PID","mismatch"],["Tax","PID","green"],["Address","PID","green"],["Criminal record","PID","green"]],
        fix: null,
        flags: [{ id: "f1", ground: "Social Security record doesn't match", found: "No Social Security contributions from June to August 2026.", rule: "Renewal requires the family to keep enough income (RD 1155/2024).", evidence: "Social Security contribution record, 2026", officer: null, officerReason: "", sent: null, deadline: null, response: null, responseFile: null }],
        appt: null, decision: null, appeal: null,
        history: [], messages: [], pausedTotal: 0, pauseStart: null, decideAfter: null, read: {}
      }
    ];
  }

  /* ---- Synthetic background cases for the officer queue ---------------
     Hand-tuned so the dashboard looks like a working service on day 0:
     ~48 decided files (history) and ~20 open files across every stage.
     Days are relative to the demo clock (0 = today). Channel and language
     are officer-side facts used by the fairness panel; nationality is
     never stored. Ids s0, s4, s9 ... are the stress cases in
     officer/officer-data.js, so keep them on the same specs. */
  function synthetic() {
    var r = rng(20261125);
    var first = ["Wei","Fatima","Juan Carlos","Olena","Mohammed","Ana Lucía","Rahul","Mariam","Diego","Ngozi","Sofía","Bilal","Irina","Kofi","Valentina","Hao","Yasmin","Andrés","Priya","Omar","Camila","Tariq","Elena","Samuel","Aisha"];
    var last = ["Zhang","Benali","Rojas","Kovalenko","Haddad","Mendoza","Sharma","Diallo","Herrera","Okafor","Castillo","Rahman","Popescu","Mensah","Gutiérrez","Liu","Saleh","Morales","Patel","Farouk","Ruiz","Nwosu","Vargas","Ibrahim","Torres"];
    var PERMITS = { work: "Residence and work (employee)", self: "Residence and work (self-employed)", family: "Family reunification", nonlucrative: "Non-lucrative residence" };
    var PK = ["work", "work", "self", "work", "family", "nonlucrative", "work"];
    var OFF = ["Officer M. García", "Officer L. Pérez", "Officer S. Navarro (supervisor)"];
    var GROUNDS = {
      address:  ["Address doesn't match the municipal register", "Registered address differs from the one on the application.", "Address"],
      ss:       ["Social Security record doesn't match", "Gap in contributions in the last 6 months.", "Social Security"],
      employer: ["Employer details don't match", "Employer on the application is not the one in Social Security.", "Social Security"]
    };
    var specs = [];
    function add(o) { specs.push(o); }

    /* -- Decided: clear-cut, granted by the rules engine (32) ------------
       [language, channel, days to decision]; 28 of 32 within 48 h */
    var A = [
      ["Spanish","online",1],["Spanish","online",2],["Spanish","assisted",1],["Spanish","in person",1],["Spanish","online",3],["Spanish","online",1],
      ["English","online",1],["English","assisted",2],["English","online",1],["English","online",4],
      ["Arabic","assisted",1],["Arabic","online",2],["Arabic","in person",2],["Arabic","online",3],
      ["French","online",1],["French","assisted",2],["French","in person",1,"s4"],
      ["Portuguese","online",2],["Portuguese","online",1],["Portuguese","assisted",1],
      ["Chinese","online",1],["Chinese","assisted",3],["Chinese","online",2],
      ["Romanian","online",2],["Romanian","in person",1],["Romanian","online",1],
      ["Ukrainian","online",1,"s20"],["Ukrainian","assisted",2],["Ukrainian","online",2],
      ["Urdu","online",2],["Urdu","assisted",1],["Urdu","online",1]
    ];
    var autoFiled = [-84,-80,-77,-74,-71,-68,-65,-62,-59,-56,-53,-50,-48,-45,-43,-40,-37,-35,-32,-30,-27,-25,-22,-20,-18,-15,-13,-11,-9,-8,-5,-3];
    A.forEach(function (a, k) {
      var filed = a[3] === "s20" ? -6 : a[3] === "s4" ? -16 : autoFiled[k];
      add({ id: a[3], kind: "auto", language: a[0], channel: a[1], d: a[2], filed: filed });
    });

    /* -- Decided: automatic grant after a fix-it loop (5) --------------- */
    add({ id: "s9", kind: "fixed", language: "Spanish", channel: "online", filed: -47, d: 4, paused: 3, what: "Passport number doesn't match the police record", why: "The scan was unreadable. Scan the passport chip with your phone or bring it to any office." });
    add({ kind: "fixed", language: "English", channel: "online", filed: -60, d: 3, paused: 4, what: "Unreadable passport scan", why: "We need to see the photo page clearly." });
    add({ kind: "fixed", language: "Arabic", channel: "assisted", filed: -33, d: 2, paused: 2, what: "Fee 790-012 paid with the wrong code", why: "The payment used the code for a first application, not a renewal.", amount: 0 });
    add({ kind: "fixed", language: "Portuguese", channel: "in person", filed: -24, d: 3, paused: 5, what: "Unreadable passport scan", why: "We need to see the photo page clearly." });
    add({ kind: "fixed", language: "Spanish", channel: "online", filed: -12, d: 2, paused: 3, what: "Fee 790-012 not received", why: "The bank hasn't confirmed the payment yet. Upload the receipt." });

    /* -- Decided: reviewed by an officer (11; one past target, one refused) */
    add({ kind: "human", language: "Spanish",   channel: "online",    filed: -86, d: 18, g: "address",  officer: 0 });
    add({ kind: "human", language: "English",   channel: "online",    filed: -82, d: 29, g: "ss",       officer: 1 });
    add({ kind: "human", language: "Arabic",    channel: "online",    filed: -75, d: 21, g: "employer", officer: 2 });
    add({ kind: "human", language: "Chinese",   channel: "online",    filed: -66, d: 15, g: "address",  officer: 0 });
    add({ kind: "human", language: "Romanian",  channel: "online",    filed: -58, d: 24, g: "ss",       officer: 2, refused: true });
    add({ kind: "human", language: "Urdu",      channel: "assisted",  filed: -79, d: 19, g: "ss",       officer: 1 });
    add({ kind: "human", language: "Arabic",    channel: "assisted",  filed: -63, d: 17, g: "employer", officer: 0 });
    add({ kind: "human", language: "Portuguese",channel: "assisted",  filed: -52, d: 22, g: "address",  officer: 1 });
    add({ kind: "human", language: "Ukrainian", channel: "assisted",  filed: -44, d: 16, g: "ss",       officer: 0 });
    add({ kind: "human", language: "French",    channel: "in person", filed: -70, d: 20, g: "address",  officer: 2 });
    add({ kind: "human", language: "Spanish",   channel: "in person", filed: -41, d: 14, g: "employer", officer: 1 });

    /* -- Open: the live queue (20) ------------------------------------- */
    // Filed today: gestoría batch (4 in 38 minutes) and one clear-cut file
    add({ id: "s12", kind: "open", stage: "filed", language: "Urdu",       channel: "assisted", filed: 0 });
    add({ id: "s27", kind: "open", stage: "filed", language: "Arabic",     channel: "assisted", filed: 0 });
    add({ id: "s34", kind: "open", stage: "filed", language: "Portuguese", channel: "assisted", filed: 0 });
    add({ id: "s44", kind: "open", stage: "filed", language: "Romanian",   channel: "assisted", filed: 0 });
    add({ kind: "open", stage: "filed", auto: 1, language: "Spanish", channel: "online", filed: 0 });
    // Under review
    add({ kind: "open", stage: "review", auto: 2, language: "English", channel: "assisted", filed: -1 });
    add({ id: "s31", kind: "open", stage: "review", language: "Chinese",   channel: "online", filed: -1 });
    add({ id: "s36", kind: "open", stage: "review", language: "Ukrainian", channel: "online", filed: -1 });
    add({ id: "s0",  kind: "open", stage: "review", language: "Spanish", channel: "online", filed: -5, flag: ["Uploaded payslips may have been altered", "Payslip PDF edited after creation; the salary is 2.3 times the Social Security base.", "Social Security"], ev: "Payslips, Jul–Sep 2026 (upload) vs Social Security base" });
    add({ id: "s48", kind: "open", stage: "review", language: "Chinese", channel: "online", filed: -3, flag: ["Uploaded employer letter failed the tamper check", "Hidden text on page 2 of the employer letter. Quarantined; no model read it.", "Social Security"], ev: "Employer letter (upload), page 2", ssOk: true });
    add({ id: "s13", kind: "open", stage: "review", language: "English", channel: "online", filed: -12, g: "ss" });
    add({ kind: "open", stage: "review", language: "Spanish", channel: "in person", filed: -8, g: "address" });
    add({ id: "s22", kind: "open", stage: "review", late: true, language: "Arabic", channel: "assisted", filed: -24, expiry: -59 });
    add({ kind: "open", stage: "review", language: "Spanish", channel: "online", filed: -16, g: "ss", asked: -9, reply: -3 });
    add({ kind: "open", stage: "review", language: "Chinese", channel: "online", filed: -26, g: "address", asked: -14, reply: -8 });
    // Waiting for the applicant's answer to a flag (the oldest open file, day 33: asked twice)
    add({ kind: "open", stage: "response", language: "English", channel: "assisted", filed: -33, g: "employer", asked: -6 });
    add({ kind: "open", stage: "response", language: "French", channel: "online", filed: -14, g: "employer", asked: -4 });
    add({ kind: "open", stage: "response", language: "Arabic", channel: "assisted", filed: -20, g: "ss", asked: -2 });
    // Fix needed, clock paused
    add({ kind: "open", stage: "fix", language: "English", channel: "online", filed: -4, pause: -3, what: "Unreadable passport scan", why: "We need to see the photo page clearly.", amount: 0 });
    add({ kind: "open", stage: "fix", language: "Romanian", channel: "online", filed: -6, pause: -5, what: "The fee you paid is €2.10 short", why: "The renewal fee went up on 1 November. You paid the old amount.", amount: 2.10 });

    /* -- Build cases ---------------------------------------------------- */
    var used = {}; specs.forEach(function (s) { if (s.id) used[s.id] = 1; });
    var next = 0;
    function freeId() { while (used["s" + next]) next++; used["s" + next] = 1; return "s" + next; }
    function apptFor(c, dd, k) {
      c.appt = { office: OFFICES[k % 3].id, day: dd + RULES.apptWithinDays, time: ["09:10", "09:40", "10:20", "11:30", "12:00", "12:40"][k % 6], resched: false };
      c.status = "appt"; c.history.push([dd, "Fingerprint appointment assigned"]);
      if (c.appt.day < 0) c.history.push([c.appt.day + 1, "Fingerprints taken"]);
      if (c.appt.day + RULES.cardAfterApptDays <= 0) { c.status = "card"; c.history.push([c.appt.day + RULES.cardAfterApptDays, "TIE card ready to collect"]); }
    }
    function flagOf(g, s) {
      var G = s.flag || GROUNDS[g];
      return { id: "f1", ground: G[0], found: G[1], rule: "Renewal requirements, RD 1155/2024", evidence: s.ev || "Source record (PID)", officer: null, officerReason: "", sent: null, deadline: null, response: null, responseFile: null };
    }
    return specs.map(function (s, k) {
      var id = s.id || freeId();
      var n = parseInt(id.slice(1), 10);
      var pk = PK[k % PK.length];
      var mismatch = s.flag ? (s.ssOk ? null : s.flag[2]) : s.g ? GROUNDS[s.g][2] : null;
      var c = {
        id: id, ref: "MAD-2026-" + (100100 + n * 13), persona: false, synthetic: true,
        name: first[Math.floor(r() * first.length)] + " " + last[Math.floor(r() * last.length)],
        nie: (r() < .5 ? "X" : "Y") + String(1000000 + Math.floor(r() * 8999999)) + "ABCDEFGHJKLMNPQRSTVWXYZ"[Math.floor(r() * 23)],
        permit: pk, permitLabel: PERMITS[pk], expiry: s.expiry != null ? s.expiry : s.filed + 25 + (k * 7) % 34,
        channel: s.channel, language: s.language,
        route: s.kind === "auto" || s.auto ? "auto" : s.kind === "fixed" || s.stage === "fix" ? "fix" : "human",
        filed: s.filed, status: s.filed === 0 ? "filed" : "review", pausedTotal: 0, pauseStart: null, decideAfter: s.auto || null,
        checks: [["Identity","PID","green"],["Permit history","PID","green"],["Social Security","PID", mismatch === "Social Security" ? "mismatch" : "green"],["Address","PID", mismatch === "Address" ? "mismatch" : "green"],["Criminal record","PID","green"]],
        fix: null, flags: [], appt: null, decision: null, appeal: null, messages: [], data: [], read: {},
        history: [[s.filed, s.late ? "Application filed with assistance, 35 days after the permit expired (inside the 3-month late window)" : s.channel === "assisted" ? "Application filed with assistance" : s.channel === "in person" ? "Application filed at the Extranjería desk" : "Application filed online"]]
      };
      if (s.filed < 0) c.history.push([s.filed + 1, "Under review"]);
      var who = OFF[s.officer != null ? s.officer : k % 2];
      if (s.kind === "auto") {
        c.decideAfter = s.d;
        c.decision = { type: "granted", by: "Rules engine", day: s.filed + s.d, reason: "All checks passed" };
        c.history.push([s.filed + s.d, "Granted automatically"]);
        apptFor(c, s.filed + s.d, k);
      } else if (s.kind === "fixed") {
        c.fix = { what: s.what, why: s.why, amount: s.amount || 0, deadline: s.filed + 1 + RULES.fixDeadlineDays, done: true, doneDay: s.filed + 1 + s.paused };
        c.pausedTotal = s.paused; c.route = "fix";
        var fd = s.filed + s.d + s.paused;
        c.history.push([s.filed + 1, "Fix needed: " + s.what + ". Clock paused."], [s.filed + 1 + s.paused, "Fix completed. Clock restarted."], [fd, "Granted automatically"]);
        c.decision = { type: "granted", by: "Rules engine", day: fd, reason: "All checks passed after fix" };
        apptFor(c, fd, k);
      } else if (s.kind === "human") {
        var f = flagOf(s.g, s), dd = s.filed + s.d;
        if (s.refused) {
          f.officer = "confirmed"; f.officerReason = "Contributions stopped and no new contract on record"; f.sent = s.filed + 6; f.deadline = f.sent + RULES.flagResponseDays;
          f.response = "I am looking for work and expect a new contract soon."; f.responseDay = s.filed + 12;
          c.flags = [f]; c.status = "refused";
          c.decision = { type: "refused", by: who, day: dd, reason: "Income requirement not met after the applicant's answer (RD 1155/2024)" };
          c.history.push([f.sent, "An officer asked you about: " + f.ground], [f.responseDay, "You responded to: " + f.ground], [dd, "Renewal refused"]);
        } else {
          f.officer = "dismissed"; f.officerReason = ["Explained by the applicant", "Source record updated after the filing", "New contract confirmed in Social Security"][k % 3];
          c.flags = [f];
          c.decision = { type: "granted", by: who, day: dd, reason: "Reviewed by officer" };
          c.history.push([dd, "Officer cleared: " + f.ground], [dd, "Renewal granted"]);
          apptFor(c, dd, k);
        }
      } else {
        if (s.g || s.flag) {
          var fo = flagOf(s.g, s);
          if (s.asked != null) {
            fo.officer = "confirmed"; fo.officerReason = "Needs the applicant's explanation"; fo.sent = s.asked; fo.deadline = s.asked + RULES.flagResponseDays;
            c.history.push([s.asked, "An officer asked you about: " + fo.ground]);
            if (s.reply != null) { fo.response = "I changed jobs; the new contract is attached."; fo.responseFile = "contract.pdf"; fo.responseDay = s.reply; c.history.push([s.reply, "You responded to: " + fo.ground]); }
          } else c.history.push([s.filed + 1, "One check needs an officer to look"]);
          c.flags = [fo];
          if (s.stage === "response") c.status = "response";
        }
        if (s.stage === "fix") {
          c.fix = { what: s.what, why: s.why, amount: s.amount, deadline: s.pause + RULES.fixDeadlineDays, done: false };
          c.status = "fix"; c.pauseStart = s.pause;
          c.history.push([s.pause, "Fix needed: " + s.what + ". Clock paused."]);
        }
      }
      c.history.sort(function (a, b) { return a[0] - b[0]; });
      return c;
    });
  }

  /* ---- State ---------------------------------------------------------- */
  function fresh() {
    var list = personas().concat(synthetic());
    var p = personas();
    return { v: 2, day: 0, cases: list, audit: [], sample: [], lang: "en", assisted: false, persona: "amina" };
  }

  var listeners = [];
  var api = { state: null, RULES: RULES, STATUS: STATUS, OFFICES: OFFICES };

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(api.state)); } catch (e) {} }
  function emit() { save(); listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  api.load = function () {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    api.state = s && s.v === 2 ? s : fresh();
    return api.state;
  };
  api.reset = function () { var keep = api.state ? { lang: api.state.lang } : {}; api.state = fresh(); if (keep.lang) api.state.lang = keep.lang; emit(); };
  api.subscribe = function (fn) { listeners.push(fn); };
  api.setPref = function (k, v) { api.state[k] = v; emit(); };

  window.addEventListener("storage", function (e) { if (e.key === STORAGE_KEY) { api.load(); listeners.forEach(function (fn) { fn(); }); } });

  /* ---- Dates ---------------------------------------------------------- */
  api.today = function () { return api.state.day; };
  api.date = function (day) { var d = new Date(BASE); d.setDate(d.getDate() + day); return d; };
  api.fmt = function (day, opts, lang) {
    var loc = { en: "en-GB", es: "es-ES", fr: "fr-FR", ar: "ar" }[lang || (api.state && api.state.lang) || "en"];
    return api.date(day).toLocaleDateString(loc, opts || { day: "numeric", month: "short", year: "numeric" });
  };

  api.getCase = function (id) { return api.state.cases.find(function (c) { return c.id === id; }); };

  api.dayCount = function (c) {
    if (c.filed == null) return 0;
    var end = c.decision ? c.decision.day : api.state.day;
    var paused = c.pausedTotal + (c.pauseStart != null && !c.decision ? (api.state.day - c.pauseStart) : 0);
    return Math.max(0, end - c.filed - paused);
  };
  api.isPaused = function (c) { return c.pauseStart != null && !c.decision; };
  api.isDecided = function (c) { return !!c.decision; };

  function log(c, text) { c.history.push([api.state.day, text]); }
  function msg(c, title, body) { c.messages.unshift({ day: api.state.day, title: title, body: body, id: "m" + c.messages.length + "-" + api.state.day }); }
  function audit(c, actor, action) { api.state.audit.unshift({ day: api.state.day, ref: c.ref, actor: actor, action: action }); }

  function assignAppointment(c) {
    var off = OFFICES[(c.ref.charCodeAt(c.ref.length - 1)) % OFFICES.length];
    c.appt = { office: off.id, day: api.state.day + RULES.apptWithinDays, time: "10:20", resched: false };
    c.status = "appt";
    log(c, "Fingerprint appointment assigned");
    msg(c, "Your fingerprint appointment", api.fmt(c.appt.day, { weekday: "long", day: "numeric", month: "long" }) + ", " + c.appt.time + ", " + off.name + ". You can change it once.");
  }

  function grant(c, by, reason, silence) {
    c.decision = { type: silence ? "silence" : "granted", by: by, day: api.state.day, reason: reason };
    c.status = silence ? "silence" : "granted";
    if (c.pauseStart != null) { c.pausedTotal += api.state.day - c.pauseStart; c.pauseStart = null; }
    log(c, silence ? "Granted by administrative silence (day 90). Certificate issued." : "Renewal granted");
    msg(c, silence ? "Your renewal is granted (silence certificate)" : "Your renewal is granted", silence ? "We didn't decide within 90 days, so the law treats your renewal as granted. Your certificate is in your documents." : "Your residence permit is renewed for 4 years.");
    audit(c, by, silence ? "Granted by silence" : "Granted (" + reason + ")");
    assignAppointment(c);
  }

  /* ---- Engine: one day passes ---------------------------------------- */
  function tick() {
    api.state.day += 1;
    var day = api.state.day;
    api.state.cases.forEach(function (c) {
      if (c.status === "filed" && day > c.filed) { c.status = "review"; log(c, "Under review"); }
      if (c.status === "review" && !c.decision) {
        var open = (c.flags || []).some(function (f) { return f.officer !== "dismissed"; });
        if (c.route === "auto" && !open && c.decideAfter != null && api.dayCount(c) >= c.decideAfter) {
          grant(c, "Rules engine", "All checks passed");
        } else if (api.dayCount(c) >= RULES.legalLimitDays) {
          grant(c, "Legal backstop", "No decision within 90 days", true);
        }
      }
      if (c.status === "response" && !c.decision && api.dayCount(c) >= RULES.legalLimitDays) grant(c, "Legal backstop", "No decision within 90 days", true);
      // a post-grant flag whose window closed: back to the granted status
      if (c.status === "response" && c.decision && c.flags.every(function (f) { return f.officer !== "confirmed" || f.response || day > f.deadline; })) c.status = c.statusBefore || "appt";
      if (c.status === "appt" && c.appt && day === c.appt.day + 1) { log(c, "Fingerprints taken"); }
      if (c.status === "appt" && c.appt && day >= c.appt.day + RULES.cardAfterApptDays) {
        c.status = "card"; log(c, "TIE card ready to collect");
        if (c.persona) msg(c, "Your TIE card is ready", "Collect it at " + (OFFICES.find(function (o) { return o.id === c.appt.office; }) || OFFICES[0]).name + ". Bring your passport.");
      }
    });
  }
  api.advance = function (n) { for (var i = 0; i < n; i++) tick(); emit(); };

  /* ---- Citizen actions ------------------------------------------------ */
  // answers: { changed: bool, changeText, eligibility: {employer, madrid, record}, channel: "online"|"assisted" }
  api.submit = function (id, answers) {
    var c = api.getCase(id);
    if (c.filed != null && c.status !== "refused" && c.status !== "withdrawn") return { error: "duplicate" };
    c.filed = api.state.day; c.status = "filed"; c.answers = answers;
    log(c, answers.channel === "assisted" ? "Application filed with assistance" : "Application filed online");
    msg(c, "Application received", "Reference " + c.ref + ". We'll send every update here and by SMS.");
    audit(c, "Citizen", "Filed");
    if (answers.changed || (answers.eligibility && (answers.eligibility.record || !answers.eligibility.madrid || !answers.eligibility.employer))) {
      c.route = "human";
      log(c, "Sent to an officer because something changed");
    }
    if (c.id === "robert") {
      // Automatic completeness check at filing: fee mismatch -> fix-it loop
      c.fix = { what: "The fee you paid is €2.10 short", why: "The renewal fee went up on 1 November. You paid the old amount.", amount: 2.10, deadline: api.state.day + RULES.fixDeadlineDays, done: false };
      c.status = "fix"; c.pauseStart = api.state.day;
      log(c, "Fix needed: fee difference. Clock paused.");
      msg(c, "One thing to fix", "The fee you paid is €2.10 short. Pay the difference online within 10 days. Your clock is paused until then.");
      audit(c, "Completeness check", "Fix notice sent (fee mismatch)");
    }
    if (c.route === "human" && c.id === "lucia") {
      log(c, "One check needs an officer to look");
    }
    emit(); return { ok: true };
  };

  api.payFix = function (id) {
    var c = api.getCase(id);
    if (!c.fix || c.fix.done) return;
    c.fix.done = true; c.fix.doneDay = api.state.day;
    if (c.pauseStart != null) { c.pausedTotal += api.state.day - c.pauseStart; c.pauseStart = null; }
    c.status = "review"; c.route = c.route === "fix" ? "auto" : c.route;
    c.checks = c.checks.map(function (k) { return k[0] === "Fee payment" ? [k[0], k[1], "green"] : k; });
    c.decideAfter = api.dayCount(c) + 1;
    log(c, "Fix completed. Clock restarted.");
    msg(c, "Thank you, payment received", "Your clock has restarted. Nothing else is missing.");
    audit(c, "Citizen", "Fix completed");
    emit();
  };

  api.respondFlag = function (id, flagId, text, fileName) {
    var c = api.getCase(id);
    var f = c.flags.find(function (x) { return x.id === flagId; });
    f.response = text; f.responseFile = fileName || null; f.responseDay = api.state.day;
    log(c, "You responded to: " + f.ground);
    msg(c, "Response received", "An officer will read it and decide. Nothing is refused before an officer reads your response.");
    audit(c, "Citizen", "Responded to flag");
    c.status = c.decision ? (c.statusBefore || "appt") : "review";
    if (c.decision) delete c.statusBefore;
    emit();
  };

  api.reschedule = function (id, day, time, office) {
    var c = api.getCase(id);
    if (!c.appt || c.appt.resched) return;
    c.appt = { office: office, day: day, time: time, resched: true };
    log(c, "Appointment changed");
    msg(c, "Appointment changed", api.fmt(day, { weekday: "long", day: "numeric", month: "long" }) + ", " + time + ".");
    emit();
  };

  api.appeal = function (id, text) {
    var c = api.getCase(id);
    c.appeal = { day: api.state.day, text: text, route: "reposicion" };
    log(c, "Appeal filed (recurso de reposición)");
    msg(c, "Appeal received", "A different official will review your case. We'll answer within 1 month.");
    audit(c, "Citizen", "Appeal filed");
    emit();
  };

  api.markRead = function (id) { var c = api.getCase(id); c.messages.forEach(function (m) { c.read[m.id] = true; }); save(); };

  /* ---- Officer actions (for the service side) ------------------------ */
  api.confirmFlag = function (id, flagId, reason, officer) {
    var c = api.getCase(id); var f = c.flags.find(function (x) { return x.id === flagId; });
    f.officer = "confirmed"; f.officerReason = reason; f.sent = api.state.day; f.deadline = api.state.day + RULES.flagResponseDays;
    c.status = "response";
    log(c, "An officer asked you about: " + f.ground);
    msg(c, "Please respond: " + f.ground, "You have until " + api.fmt(f.deadline) + ". Nothing is refused before you respond.");
    audit(c, officer || "Officer", "Flag confirmed: " + reason);
    emit();
  };
  api.dismissFlag = function (id, flagId, reason, officer) {
    var c = api.getCase(id); var f = c.flags.find(function (x) { return x.id === flagId; });
    f.officer = "dismissed"; f.officerReason = reason;
    if (c.status === "response") c.status = c.decision ? (c.statusBefore || "appt") : "review";
    if (c.decision) delete c.statusBefore;
    log(c, "Officer cleared: " + f.ground);
    audit(c, officer || "Officer", "Flag dismissed: " + reason);
    emit();
  };
  // type: "granted" | "refused". A refusal needs every confirmed flag answered or past its deadline.
  api.canRefuse = function (c) {
    var confirmed = c.flags.filter(function (f) { return f.officer === "confirmed"; });
    if (!confirmed.length) return false;
    return confirmed.every(function (f) { return f.response || api.state.day > f.deadline; });
  };
  api.decide = function (id, type, reason, officer) {
    var c = api.getCase(id);
    if (type === "refused") {
      if (!api.canRefuse(c)) return { error: "refusal-not-allowed" };
      c.decision = { type: "refused", by: officer || "Officer", day: api.state.day, reason: reason };
      c.status = "refused";
      log(c, "Renewal refused");
      msg(c, "Decision on your renewal", "Your renewal was refused. Read the reasons and how to appeal.");
      audit(c, officer || "Officer", "Refused: " + reason);
      emit(); return { ok: true };
    }
    grant(c, officer || "Officer", reason);
    emit(); return { ok: true };
  };
  api.sendFixNotice = function (id, what, why, officer) {
    var c = api.getCase(id);
    c.fix = { what: what, why: why, amount: 0, deadline: api.state.day + RULES.fixDeadlineDays, done: false };
    c.status = "fix"; c.pauseStart = api.state.day;
    log(c, "Fix needed: " + what + ". Clock paused.");
    msg(c, "One thing to fix", what + ". You have 10 days. Your clock is paused until then.");
    audit(c, officer || "Officer", "Fix notice sent");
    emit();
  };
  api.signWithdrawal = function (id, reason, officer) {
    var c = api.getCase(id);
    if (!c.fix || c.fix.done || api.state.day <= c.fix.deadline) return { error: "too-early" };
    c.decision = { type: "withdrawn", by: officer || "Officer", day: api.state.day, reason: reason };
    c.status = "withdrawn"; log(c, "Application withdrawn (fix not completed)");
    audit(c, officer || "Officer", "Withdrawal signed: " + reason);
    emit(); return { ok: true };
  };
  api.drawSample = function (n) {
    var pool = api.state.cases.filter(function (c) { return c.decision && c.decision.by === "Rules engine" && !c.sampled; });
    // a persona auto-grant always joins the sample, so the citizen side can show a spot check
    var picked = pool.filter(function (c) { return c.persona; }).slice(0, n || 5);
    while (picked.length < Math.min(n || 5, pool.length)) { var c = pool[Math.floor(Math.random() * pool.length)]; if (picked.indexOf(c) < 0) picked.push(c); }
    picked.forEach(function (c) { c.sampled = true; c.sampleResult = null; });
    api.state.sample = picked.map(function (c) { return c.id; });
    emit(); return picked;
  };
  api.markSample = function (id, result, note, officer) {
    var c = api.getCase(id); c.sampleResult = result;
    audit(c, officer || "Officer", "Sample audit: " + result);
    if (result === "problem") {
      var f = { id: "f" + (c.flags.length + 1), ground: "Post-grant check: " + (note || "information needs confirming"), found: note || "", rule: "Post-grant sampling", evidence: "Audit note", officer: "confirmed", officerReason: note || "", sent: api.state.day, deadline: api.state.day + RULES.flagResponseDays, response: null };
      c.flags.push(f);
      // the citizen gets a respond task (same flag-card flow); the grant stays valid
      if (c.status !== "response") c.statusBefore = c.status;
      c.status = "response";
      log(c, "A spot check found something to confirm. Nothing is revoked before you respond.");
      msg(c, "Please confirm something about your renewal", "A random spot check found: " + (note || "something to confirm") + ". Your renewal stays valid while you respond.");
    }
    emit();
  };

  api.load();
  window.RRS = api;
})();
