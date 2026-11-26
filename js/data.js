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

  /* ---- ~50 synthetic background cases for the officer queue ----------- */
  function synthetic() {
    var r = rng(20261125);
    var first = ["Wei","Fatima","Juan Carlos","Olena","Mohammed","Ana Lucía","Rahul","Mariam","Diego","Ngozi","Sofía","Bilal","Irina","Kofi","Valentina","Hao","Yasmin","Andrés","Priya","Omar","Camila","Tariq","Elena","Samuel","Aisha"];
    var last = ["Zhang","Benali","Rojas","Kovalenko","Haddad","Mendoza","Sharma","Diallo","Herrera","Okafor","Castillo","Rahman","Popescu","Mensah","Gutiérrez","Liu","Saleh","Morales","Patel","Farouk","Ruiz","Nwosu","Vargas","Ibrahim","Torres"];
    var permits = [["work","Residence and work (employee)"],["work","Residence and work (employee)"],["self","Residence and work (self-employed)"],["family","Family reunification"],["nonlucrative","Non-lucrative residence"]];
    var out = [];
    for (var i = 0; i < 50; i++) {
      var p = permits[Math.floor(r() * permits.length)];
      var x = r();
      var route = x < 0.6 ? "auto" : x < 0.85 ? "human" : "fix";
      var filed = -Math.floor(r() * 84) - 1;
      var c = {
        id: "s" + i, ref: "MAD-2026-" + (100100 + i * 13), persona: false, synthetic: true,
        name: first[Math.floor(r() * first.length)] + " " + last[Math.floor(r() * last.length)],
        nie: (r() < .5 ? "X" : "Y") + String(1000000 + Math.floor(r() * 8999999)) + "ABCDEFGHJKLMNPQRSTVWXYZ"[Math.floor(r() * 23)],
        permit: p[0], permitLabel: p[1], expiry: filed + 30 + Math.floor(r() * 30),
        route: route, filed: filed, status: "review", pausedTotal: 0, pauseStart: null,
        checks: [["Identity","PID","green"],["Permit history","PID","green"],["Social Security","PID", route === "human" ? "mismatch" : "green"],["Address","PID","green"],["Criminal record","PID","green"]],
        fix: null, flags: [], appt: null, decision: null, appeal: null, history: [[filed, "Application filed online"]], messages: [], data: [], read: {}
      };
      var age = -filed;
      if (route === "auto") {
        var d = 1 + Math.floor(r() * 4);
        c.decideAfter = d;
        if (age > d) {
          c.decision = { type: "granted", by: "Rules engine", day: filed + d, reason: "All checks passed" };
          c.status = "granted"; c.history.push([filed + d, "Granted automatically"]);
          var ad = filed + d + RULES.apptWithinDays;
          c.appt = { office: OFFICES[i % 3].id, day: ad, time: "09:" + (10 + (i % 5) * 10), resched: false };
          c.status = age > (d + RULES.apptWithinDays + RULES.cardAfterApptDays) ? "card" : "appt";
        }
      } else if (route === "fix") {
        c.fix = { what: "Unreadable passport scan", why: "We need to see the photo page clearly.", amount: 0, deadline: filed + 2 + RULES.fixDeadlineDays, done: age > 6 };
        if (c.fix.done) { c.decision = { type: "granted", by: "Rules engine", day: filed + 7, reason: "All checks passed after fix" }; c.status = "appt"; c.appt = { office: OFFICES[i % 3].id, day: filed + 14, time: "11:30", resched: false }; if (age > 28) c.status = "card"; }
        else { c.status = "fix"; c.pauseStart = filed + 2; }
      } else {
        var grounds = [["Address doesn't match the municipal register","Registered address differs from the one on the application."],["Social Security record doesn't match","Gap in contributions in the last 6 months."],["Employer details don't match","Employer on the application is not the one in Social Security."]];
        var g = grounds[Math.floor(r() * grounds.length)];
        c.flags = [{ id: "f1", ground: g[0], found: g[1], rule: "Renewal requirements, RD 1155/2024", evidence: "Source record", officer: null, officerReason: "", sent: null, deadline: null, response: null, responseFile: null }];
        if (age > 40 && r() < .7) {
          var dd = 12 + Math.floor(r() * 25);
          c.flags[0].officer = "dismissed"; c.flags[0].officerReason = "Explained by the applicant";
          c.decision = { type: r() < .9 ? "granted" : "refused", by: "Officer " + ["M. García","L. Pérez","S. Navarro"][i % 3], day: filed + dd, reason: "Reviewed" };
          c.status = c.decision.type === "granted" ? "appt" : "refused";
          if (c.status === "appt") c.appt = { office: OFFICES[i % 3].id, day: filed + dd + 7, time: "12:00", resched: false };
        }
      }
      out.push(c);
    }
    return out;
  }

  /* ---- State ---------------------------------------------------------- */
  function fresh() {
    var list = personas().concat(synthetic());
    var p = personas();
    return { v: 1, day: 0, cases: list, audit: [], sample: [], lang: "en", assisted: false, persona: "amina" };
  }

  var listeners = [];
  var api = { state: null, RULES: RULES, STATUS: STATUS, OFFICES: OFFICES };

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(api.state)); } catch (e) {} }
  function emit() { save(); listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  api.load = function () {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    api.state = s && s.v === 1 ? s : fresh();
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
    if (answers.preDoc) { c.preDocs = [answers.preDoc]; log(c, "Document added before submitting: " + answers.preDoc); (c.flags || []).forEach(function (f) { f.evidence += " + applicant's document: " + answers.preDoc; }); }
    if (answers.feeFixed) { log(c, "Fee difference paid during the pre-check"); if (c.route === "fix") c.route = "auto"; c.checks = c.checks.map(function (k) { return k[0] === "Fee payment" ? [k[0], k[1], "green"] : k; }); }
    if (c.id === "robert" && !answers.feeFixed) {
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
    c.status = "review";
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
    if (c.status === "response") c.status = "review";
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
    var picked = [];
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
      log(c, "A spot check found something to confirm. Nothing is revoked before you respond.");
      msg(c, "Please confirm something about your renewal", "A random spot check found: " + (note || "something to confirm") + ". Your renewal stays valid while you respond.");
    }
    emit();
  };

  api.load();
  window.RRS = api;
})();
