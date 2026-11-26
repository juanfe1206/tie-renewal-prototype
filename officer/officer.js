/* =========================================================================
   Officer console (administration half)
   -------------------------------------------------------------------------
   Reads the shared cases from window.RRS (../js/data.js) and changes them
   ONLY through RRS actions, so the citizen app updates live in another tab.
   Officer-only extras (channel, consent log, abuse signals, rule list) come
   from officer-data.js. Officer-only working notes (override audits, signal
   decisions, view log) live in a separate localStorage key the citizen side
   never reads.
   ========================================================================= */
(function () {
  "use strict";
  var R = window.RRS, OD = window.OFFICER_DATA, app = document.getElementById("app");
  var OKEY = "rrs-officer-v1";

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function S() { return R.state; }
  function today() { return R.today(); }
  function fmt(d) { return R.fmt(d, { day: "numeric", month: "short", year: "numeric" }, "en"); }
  function fmtS(d) { return R.fmt(d, { day: "numeric", month: "short" }, "en"); }
  function M(c) { return OD.meta(c); }

  /* ---------------- officer-only working state ---------------- */
  var O;
  function oFresh() { return { officer: OD.OFFICERS[0], log: [], signals: {}, overrides: [], objections: {}, lastDay: 0, lastAudit: 0 }; }
  function oLoad() {
    try { O = JSON.parse(localStorage.getItem(OKEY)) || oFresh(); } catch (e) { O = oFresh(); }
    // The shared demo was reset (here or in the citizen tab): clear officer notes too
    if (today() < O.lastDay || S().audit.length < O.lastAudit) { var who = O.officer; O = oFresh(); O.officer = who; }
    O.lastDay = today(); O.lastAudit = S().audit.length;
  }
  function oSave() { O.lastDay = today(); O.lastAudit = S().audit.length; try { localStorage.setItem(OKEY, JSON.stringify(O)); } catch (e) {} }
  function oLog(c, action) { O.log.unshift({ day: today(), ref: c.ref, actor: O.officer, action: action }); oSave(); }
  function me() { return O.officer; }

  /* ---------------- derived case facts ---------------- */
  function isFiled(c) { return c.filed != null; }
  function isOpen(c) { return isFiled(c) && !c.decision; }
  function day(c) { return R.dayCount(c); }
  function flagState(f) {
    if (!f.officer) return "pending";
    if (f.officer === "dismissed") return "dismissed";
    if (f.response || today() > f.deadline) return "answered";
    return "awaiting";
  }
  var FLAG_LABEL = { pending: ["Needs officer decision", "error"], awaiting: ["Sent to applicant", "warning"], answered: ["Response in or window closed", "info"], dismissed: ["Dismissed", "success"] };
  function sla(c) {
    if (!isOpen(c)) return { cls: "grey", bar: "", text: c.decision ? "Decided day " + day(c) : "Not filed" };
    if (R.isPaused(c)) return { cls: "grey", bar: "paused", text: "Clock paused" };
    var d = day(c);
    if (d > R.RULES.escalationDay) return { cls: "error", bar: "error", text: "Past day 60" };
    if (d > R.RULES.humanTargetDays) return { cls: "warning", bar: "warning", text: "Past day 30" };
    return { cls: "success", bar: "", text: "On track" };
  }
  function statusTag(c) { var s = R.STATUS[c.status] || { label: c.status, tag: "" }; return '<span class="c-tag ' + (s.tag ? "c-tag--" + s.tag : "") + '">' + esc(s.label) + "</span>"; }
  var ROUTE = { auto: "auto-grant", human: "human review", fix: "fix-it" };
  function routeTag(c) { var r = c.route; return '<span class="c-tag ' + (r === "auto" ? "c-tag--success" : r === "fix" ? "c-tag--warning" : "c-tag--error") + '">' + esc(ROUTE[r] || r) + "</span>"; }
  function chips(c) { var m = M(c); return '<span class="o-chip">' + esc(m.channel === "assisted" ? "assisted digital" : m.channel) + '</span><span class="o-chip">' + esc(m.language) + "</span>"; }
  function meter(c) { var s = sla(c), w = Math.min(100, day(c) / 90 * 100); return '<span class="o-meter"><span class="o-bar ' + (s.bar ? "o-bar--" + s.bar : "") + '" aria-hidden="true"><i style="width:' + w + '%"></i></span><span><b>' + day(c) + "</b>/90</span></span>"; }
  function nextDate(c) {
    if (!isFiled(c)) return "Reminder sent";
    if (c.decision) return c.appt ? "Fingerprints " + fmtS(c.appt.day) : "";
    if (R.isPaused(c) && c.fix) return (today() > c.fix.deadline ? "Fix overdue since " : "Fix due ") + fmtS(c.fix.deadline);
    var aw = c.flags.filter(function (f) { return flagState(f) === "awaiting"; })[0];
    if (aw) return "Reply due " + fmtS(aw.deadline);
    return "Day 90 on " + fmtS(today() + 90 - day(c));
  }
  function risk(c) {
    if (!isFiled(c)) return 30000;
    if (c.decision) return 20000 + (today() - c.decision.day);
    if (R.isPaused(c)) return 1000 + (c.fix ? c.fix.deadline - today() : 0);
    return 90 - day(c);
  }
  function checks(c) {
    var out = c.checks.map(function (k) {
      var src = k[1] === "Payment gateway" ? "CSV/e-seal" : k[1], res = k[2];
      var where = OD.PID_SOURCE[k[0]] || (src === "CSV/e-seal" ? "Payment receipt, e-sealed" : "Source record");
      var detail = res === "green" ? "Confirmed by " + where + "." : res === "mismatch" ? "Differs from what the application says (" + where + "). See the flag card." : res === "red" ? "Adverse result from " + where + ". A person reviews it." : res;
      if (k[0] === "Fee payment") detail = res === "green" ? "Fee 790-012 paid in full; receipt verified by e-seal." : "Fee 790-012 short of the current amount (€" + R.RULES.fee.toFixed(2) + ").";
      return { name: k[0], source: src, result: res, detail: detail };
    });
    M(c).extraChecks.forEach(function (k) { out.push({ name: k[0], source: k[1], result: k[2], detail: k[3] }); });
    return out;
  }
  var RUNG = { "PID": [1, "PID query"], "CSV/e-seal": [2, "E-document (CSV / e-seal)"], "NFC": [3, "Passport chip (NFC)"], "Upload": [4, "Upload"] };
  function rulesFired(c) {
    var m = M(c), out = [], ks = checks(c);
    var late = isFiled(c) && m.expiry < c.filed;
    out.push({ id: "R1", ok: !late, note: late ? "Filed " + (c.filed - m.expiry) + " days after expiry" : "Filed in window" });
    ["R2", "R3", "R4", "R5", "R6", "R7"].forEach(function (r) {
      var mine = ks.filter(function (k) { return OD.ruleOf(k.name, k.source) === r; });
      if (!mine.length) { if (r === "R6" || r === "R7") return; out.push({ id: r, ok: true, note: "Pass" }); return; }
      var bad = mine.filter(function (k) { return k.result !== "green"; });
      out.push({ id: r, ok: !bad.length, note: bad.length ? bad.map(function (k) { return k.name + ": " + k.result; }).join("; ") : "Pass (" + mine.map(function (k) { return k.source; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ") + ")" });
    });
    return out;
  }
  function ruleName(id) { return OD.RULES.filter(function (r) { return r.id === id; })[0].name; }
  function why(c) {
    var m = M(c), fails = rulesFired(c).filter(function (r) { return !r.ok; });
    var flags = c.flags, open = flags.some(function (f) { return flagState(f) !== "dismissed"; });
    if (!isFiled(c)) return { lead: "Not filed yet.", items: ["The reminder went out about 90 days before expiry. The applicant files from the citizen app or at a desk."] };
    if (c.decision && c.decision.by === "Rules engine") return { lead: "Granted automatically.", items: ["Every requirement was confirmed from government sources (PID), a verified e-document, or an upload that passed the tamper check and matched source data.", "Nothing needed judgement, so the rules engine could grant. It cannot refuse.", "Any automatic grant can be drawn in the post-grant sample audit."] };
    if (c.decision && c.decision.type === "silence") return { lead: "No decision within 90 days: the legal backstop applied.", items: ["Positive silence is a backstop only. Each case like this counts against the goal of zero files at day 90."] };
    if (c.status === "fix" && c.fix && !c.fix.done) return { lead: "Fix-it loop: one objective defect, no judgement involved.", items: [c.fix.what + ". Due " + fmt(c.fix.deadline) + ".", "The clock is paused while the applicant fixes it (Ley 39/2015 art. 22.1.a).", "Once fixed, the file goes back to the rules engine. If the deadline passes nothing happens by itself: only an officer can sign a withdrawal."] };
    var items = fails.map(function (r) { return ruleName(r.id) + ": did not pass (" + r.note + ")."; });
    if (m.representative && m.signal && !O.signals[sigKey(c)]) items.push("Filed by " + m.representative + " in a bulk pattern. An officer decides whether each applicant must confirm their identity.");
    if (c.answers && c.answers.changed) items.push("The applicant said something changed since the last permit.");
    if (flags.length) items.push("Flags: " + flags.filter(function (f) { return flagState(f) === "dismissed"; }).length + " dismissed, " + flags.filter(function (f) { return flagState(f) !== "dismissed"; }).length + " still open.");
    if (c.decision) return { lead: "Decided by " + c.decision.by + ", a named officer.", items: items };
    if (c.route === "auto" && !open) return { lead: "Clear-cut: queued for an automatic grant.", items: ["Every check is green. The rules engine grants at its next run and issues the fingerprint appointment with the decision.", "No officer action is needed. You can still send a fix notice if you spot an objective defect."] };
    if (!R.isPaused(c) && day(c) > R.RULES.escalationDay) items.unshift("Past day " + R.RULES.escalationDay + ": escalated to the supervisor. Decide or ask the applicant now; at day 90 the renewal is granted by silence.");
    if (m.signal && !m.signal.resolved) items.push("Abuse and fraud watch: " + m.signal.type.toLowerCase() + (O.signals[sigKey(c)] ? " (decided: " + O.signals[sigKey(c)].choice.toLowerCase() + ")." : " (waiting for an officer)."));
    items.push("The system makes no suggestion about the outcome and shows no risk score. An officer decides each flag.");
    return { lead: open ? "A person must look at this file." : "Every flag is decided. The file is ready for an officer's decision.", items: items };
  }
  function caseAudit(c) {
    return S().audit.filter(function (a) { return a.ref === c.ref; }).concat(O.log.filter(function (a) { return a.ref === c.ref; }))
      .sort(function (a, b) { return b.day - a.day; });
  }
  function sigKey(c) { var s = M(c).signal; return s ? (s.group || c.id) : null; }

  /* ---------------- dialog ---------------- */
  function ask(o) {
    return new Promise(function (resolve) {
      var dlg = document.getElementById("dlg");
      document.getElementById("dlg-title").textContent = o.title;
      document.getElementById("dlg-body").innerHTML = o.body || "";
      document.getElementById("dlg-err").textContent = "";
      var fields = o.fields || [{ id: "reason", label: o.reasonLabel || "Reason (required, kept in the audit log)", type: "textarea", value: o.value || "" }];
      document.getElementById("dlg-fields").innerHTML = fields.map(function (f) {
        var ctl = f.type === "select" ? '<select class="c-select" id="f-' + f.id + '">' + f.options.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select>"
          : f.type === "textarea" ? '<textarea class="c-textarea" id="f-' + f.id + '">' + esc(f.value || "") + "</textarea>"
          : '<input class="c-input" id="f-' + f.id + '" value="' + esc(f.value || "") + '">';
        return '<div class="c-field"><label class="c-label" for="f-' + f.id + '">' + esc(f.label) + "</label>" + (f.hint ? '<span class="c-hint">' + esc(f.hint) + "</span>" : "") + ctl + "</div>";
      }).join("");
      var ok = document.getElementById("dlg-ok");
      ok.textContent = o.ok || "Confirm";
      ok.className = "c-button" + (o.danger ? " c-button--warning" : "");
      var form = document.getElementById("dlg-form");
      function done(v) { form.onsubmit = null; document.getElementById("dlg-cancel").onclick = null; dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); }
      form.onsubmit = function (e) {
        e.preventDefault();
        var out = {};
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i], el = document.getElementById("f-" + f.id), v = el.value.trim();
          if (f.type !== "select" && v.length < 5) { document.getElementById("dlg-err").textContent = "Write a reason of at least a few words. It goes into the audit log and, where relevant, to the applicant."; el.focus(); return; }
          out[f.id] = v;
        }
        done(out);
      };
      document.getElementById("dlg-cancel").onclick = function () { done(null); };
      dlg.onclose = function () { resolve(null); };
      dlg.showModal();
      var first = dlg.querySelector("#dlg-fields textarea, #dlg-fields input, #dlg-fields select");
      if (first) first.focus(); else ok.focus();
    });
  }
  var toastMsg = "", toastT;
  function toast(m) { toastMsg = m; clearTimeout(toastT); toastT = setTimeout(function () { toastMsg = ""; var el = document.querySelector(".c-toast"); if (el) el.remove(); }, 2600); }

  /* ---------------- shell ---------------- */
  var NAV = [["queue", "Case queue"], ["flags", "Flag review"], ["rules", "Rules and auto-grants"], ["abuse", "Abuse and fraud watch"], ["audit", "Sample audit"], ["dashboard", "Dashboard"], ["ai", "How AI is used here"]];
  function counts() {
    var flags = 0, sig = {};
    S().cases.forEach(function (c) {
      if (isOpen(c)) c.flags.forEach(function (f) { var s = flagState(f); if (s === "pending" || s === "answered") flags++; });
      var k = sigKey(c), m = M(c); if (k && !m.signal.resolved && !O.signals[k]) sig[k] = 1;
    });
    return { queue: S().cases.filter(isOpen).length, flags: flags, abuse: Object.keys(sig).length };
  }
  function header(route) {
    var n = counts();
    return '<a class="u-visually-hidden" href="#main">Skip to main content</a>' +
      '<div class="c-proto"><div class="l-width o-wide"><strong>Prototype</strong>Student project. Proposed service design, not an official government service. All people and data are fictional.</div></div>' +
      '<header class="c-header"><div class="l-width o-wide c-header__inner">' +
      '<a class="c-header__brand" href="#queue"><svg class="c-header__mark" viewBox="0 0 36 36" aria-hidden="true"><rect x="3" y="7" width="30" height="22" rx="3" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="18" r="4" fill="#fff"/><path d="M19 15h9M19 20h7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg><span>Officer console<small>Extranjería and Policía Nacional · Madrid</small></span></a>' +
      '<nav class="c-header__nav o-nav" aria-label="Officer screens">' + NAV.map(function (x) {
        var cnt = n[x[0]] ? '<span class="o-count" aria-label="' + n[x[0]] + ' waiting">' + n[x[0]] + "</span>" : "";
        return '<a href="#' + x[0] + '"' + ((route === x[0] || (route === "case" && x[0] === "queue")) ? ' aria-current="page"' : "") + ">" + esc(x[1]) + cnt + "</a>";
      }).join("") + "</nav></div></header>" +
      '<div class="c-servicebar"><div class="l-width o-wide c-servicebar__inner"><span class="c-servicebar__name">Residence and TIE renewal: staff workspace <span class="c-tag c-tag--grey o-synth">Synthetic data</span></span>' +
      '<span class="c-servicebar__user"><label for="officer">Signed in as</label> <select class="c-select" id="officer" style="width:auto;font-size:var(--text-sm);padding:2px 6px">' + OD.OFFICERS.map(function (o) { return "<option" + (o === me() ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select> · role-based access, every view logged · <a href=\"../index.html\" target=\"_blank\" rel=\"noopener\">Open citizen app</a></span></div></div>";
  }
  function demobar(route, id) {
    var picks = [["amina", "Amina (P1)"], ["robert", "Robert (P2)"], ["lucia", "Lucía (P3)"]].concat(Object.keys(OD.STRESS).filter(function (k) { return OD.STRESS[k].label; }).map(function (k) { return [k, OD.STRESS[k].label]; }));
    return '<div class="c-demobar" role="region" aria-label="Prototype controls"><div class="c-demobar__inner" style="max-width:1280px">' +
      '<span class="c-demobar__label">Demo</span>' +
      '<span class="c-demobar__group"><label for="demo-case">Case</label><select id="demo-case"><option value="">Jump to a persona or stress case…</option>' + picks.map(function (p) { var c = R.getCase(p[0]); return '<option value="' + p[0] + '"' + (id === p[0] ? " selected" : "") + ">" + esc(p[1]) + " · " + esc(R.STATUS[c.status].label) + "</option>"; }).join("") + "</select></span>" +
      '<span class="c-demobar__group"><span class="c-demobar__day">' + R.fmt(today(), { weekday: "short", day: "numeric", month: "short" }, "en") + '</span><button type="button" data-act="d1">+1 day</button><button type="button" data-act="d7">+7 days</button></span>' +
      '<button type="button" data-act="reset">Reset demo</button>' +
      '<a href="../index.html" target="_blank" rel="noopener" style="color:#fff;margin-left:auto">Citizen app in a new tab</a>' +
      "</div></div>";
  }

  /* ---------------- screens ---------------- */
  var UI = { q: { status: "", route: "", sla: "", channel: "", search: "", open: true }, ftab: "pending" };

  function scrQueue() {
    var q = UI.q, list = S().cases.filter(isFiled);
    if (q.open) list = list.filter(isOpen);
    if (q.status) list = list.filter(function (c) { return c.status === q.status; });
    if (q.route) list = list.filter(function (c) { return c.route === q.route; });
    if (q.channel) list = list.filter(function (c) { return M(c).channel === q.channel; });
    if (q.sla) list = list.filter(function (c) { return sla(c).text.indexOf(q.sla) === 0; });
    if (q.search) { var s = q.search.toLowerCase(); list = list.filter(function (c) { return (c.name + " " + c.ref).toLowerCase().indexOf(s) >= 0; }); }
    list.sort(function (a, b) { return risk(a) - risk(b); });
    var open = S().cases.filter(isOpen), cnt = function (t) { return open.filter(function (c) { return sla(c).text === t; }).length; };
    var notFiled = S().cases.filter(function (c) { return !isFiled(c); }).length;
    function opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label || v || "All") + "</option>"; }
    return '<div class="o-head"><div><h1>Case queue</h1><p>Open renewals, riskiest first: the fewer days left before day 90, the higher the file. Paused clocks sit below running ones. Nationality is never shown or used.</p></div></div>' +
      '<ul class="o-stats"><li><b>' + open.length + '</b>Open files</li><li><b>' + cnt("On track") + '</b><span class="c-tag c-tag--success">On track</span></li><li><b>' + cnt("Past day 30") + '</b><span class="c-tag c-tag--warning">Past day 30</span></li><li><b>' + cnt("Past day 60") + '</b><span class="c-tag c-tag--error">Past day 60</span></li><li><b>' + cnt("Clock paused") + '</b><span class="c-tag c-tag--grey">Clock paused</span></li><li><b>' + notFiled + '</b>Reminded, not filed yet</li></ul>' +
      '<div class="o-filters" role="search">' +
      '<div class="c-field"><label class="c-label" for="q-search">Name or reference</label><input class="c-input" type="search" id="q-search" value="' + esc(q.search) + '"></div>' +
      '<div class="c-field"><label class="c-label" for="q-status">Status</label><select class="c-select" id="q-status">' + opt("", q.status) + Object.keys(R.STATUS).filter(function (k) { return k !== "reminder"; }).map(function (k) { return opt(k, q.status, R.STATUS[k].label); }).join("") + "</select></div>" +
      '<div class="c-field"><label class="c-label" for="q-route">Route</label><select class="c-select" id="q-route">' + opt("", q.route) + opt("auto", q.route, "auto-grant") + opt("human", q.route, "human review") + opt("fix", q.route, "fix-it") + "</select></div>" +
      '<div class="c-field"><label class="c-label" for="q-sla">Deadline</label><select class="c-select" id="q-sla">' + opt("", q.sla) + ["On track", "Past day 30", "Past day 60", "Clock paused", "Decided"].map(function (x) { return opt(x, q.sla); }).join("") + "</select></div>" +
      '<div class="c-field"><label class="c-label" for="q-channel">Channel</label><select class="c-select" id="q-channel">' + opt("", q.channel) + ["online", "assisted", "in person"].map(function (x) { return opt(x, q.channel); }).join("") + "</select></div>" +
      '<div class="c-field"><label class="c-choice" for="q-open"><input type="checkbox" id="q-open"' + (q.open ? " checked" : "") + '><span class="c-choice__label">Open files only</span></label></div>' +
      '<button type="button" class="c-button c-button--secondary" data-act="qclear">Clear filters</button></div>' +
      '<div class="c-table-wrap"><table class="c-table o-table"><caption class="u-visually-hidden">Case queue, ' + list.length + ' files</caption><thead><tr><th scope="col">Applicant</th><th scope="col">Day of 90</th><th scope="col">Deadline</th><th scope="col">Route</th><th scope="col">Status</th><th scope="col">Channel, language</th><th scope="col">Next date</th></tr></thead><tbody>' +
      (list.length ? list.map(function (c) { var m = M(c), s = sla(c); return "<tr><td><a href=\"#case/" + c.id + '"><strong>' + esc(c.name) + "</strong></a><small>" + esc(c.ref) + " · " + esc(c.permitLabel) + (c.persona ? " · <strong>persona</strong>" : m.label ? " · <strong>" + esc(m.label) + "</strong>" : "") + "</small></td><td>" + meter(c) + '</td><td><span class="c-tag c-tag--' + s.cls + '">' + esc(s.text) + "</span></td><td>" + routeTag(c) + "</td><td>" + statusTag(c) + "</td><td>" + chips(c) + '</td><td class="o-nowrap">' + esc(nextDate(c)) + "</td></tr>"; }).join("")
        : '<tr><td colspan="7">No files match these filters. Clear a filter to see more.</td></tr>') + "</tbody></table></div>";
  }

  function flagCard(c, f) {
    var st = flagState(f), L = FLAG_LABEL[st], btns = "";
    if (isOpen(c) && st === "pending") btns = '<button class="c-button" data-act="fconfirm" data-id="' + c.id + '" data-f="' + f.id + '">Confirm and ask the applicant</button><button class="c-button c-button--secondary" data-act="fdismiss" data-id="' + c.id + '" data-f="' + f.id + '">Dismiss</button>';
    else if (isOpen(c) && st === "answered") btns = '<button class="c-button c-button--secondary" data-act="fdismiss" data-id="' + c.id + '" data-f="' + f.id + '">Dismiss after response</button><span class="o-why-off">Or keep it and refuse the file (named decision, below).</span>';
    else if (isOpen(c) && st === "awaiting") btns = '<p class="o-why-off">Waiting for the applicant until ' + fmt(f.deadline) + " (Ley 39/2015 art. 82). You can decide once they answer or the window closes.</p>";
    return '<article class="c-flag" aria-label="Flag: ' + esc(f.ground) + '"><div class="c-flag__head"><h3 class="c-flag__title">' + esc(f.ground) + '</h3><span class="c-tag c-tag--' + L[1] + '">' + L[0] + "</span></div>" +
      "<dl><dt>What we found</dt><dd>" + esc(f.found) + "</dd><dt>Rule</dt><dd>" + esc(f.rule) + "</dd><dt>Evidence</dt><dd>" + esc(f.evidence) + ' · <a href="#case/' + c.id + '" data-scroll="ladder">see checks</a></dd>' +
      (f.deadline != null && f.officer === "confirmed" ? "<dt>Applicant deadline</dt><dd>" + fmt(f.deadline) + (st === "awaiting" ? " (" + (f.deadline - today()) + " days left)" : "") + "</dd>" : "") +
      "<dt>Applicant's answer</dt><dd>" + (f.response ? "“" + esc(f.response) + "”" + (f.responseFile ? " + " + esc(f.responseFile) : "") : f.officer ? (st === "answered" ? "No answer; window closed." : st === "dismissed" ? "Not needed." : "None yet.") : "Not asked yet. Only confirmed flags go to the applicant.") + "</dd>" +
      (f.officerReason ? "<dt>Officer's reason</dt><dd>" + esc(f.officerReason) + "</dd>" : "") + "</dl>" +
      (btns ? '<div class="c-button-group">' + btns + "</div>" : "") + "</article>";
  }

  /* AI document check on files the applicant attached to a flag answer.
     The AI reads and checks; the officer decides. Values come from OD.meta (docRead). */
  function aiDocPanel(c) {
    var dr = M(c).docRead, f = c.flags.filter(function (x) { return x.responseFile; })[0];
    if (!dr || !f) return "";
    var ok = window.DocCheck ? window.DocCheck.looksLike(f.responseFile, dr.expect) : true;
    function row(step, src, body, good, tag) { return '<li><span class="o-rung">' + esc(step) + "<small>" + esc(src) + "</small></span><div>" + body + '</div><span class="c-tag c-tag--' + (good ? "success" : "warning") + '">' + esc(tag) + "</span></li>"; }
    return '<section class="c-card o-aidoc" id="aidoc" aria-labelledby="aid-h"><h2 id="aid-h">AI document check</h2>' +
      '<p class="t-small t-secondary">Attached to the answer on ' + fmt(f.responseDay) + ': <strong class="t-mono">' + esc(f.responseFile) + "</strong> (rung 4, upload).</p><ul class=\"o-ladder\">" +
      row("Document type", "AI document reading", "<strong>" + esc(ok ? dr.type : "Not recognised") + "</strong><p>" + (ok ? "Matches what was asked for." : "The AI isn't sure this is the document asked for. Open the file.") + "</p>", ok, ok ? "recognised" : "check") +
      row("Fields extracted", "AI document reading, page 1", ok ? '<dl class="o-aidoc__fields">' + dr.fields.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" : "<p>Not extracted.</p>", ok, ok ? "extracted" : "check") +
      row("Tamper check", "File structure (rule R7)", "<p>" + esc(dr.tamper) + "</p>", true, "passed") +
      row("Source match", "Social Security (PID query)", "<p>" + esc(ok ? dr.match : "Not matched: fields not read.") + "</p>", ok, ok ? "matches" : "check") +
      '</ul><div class="c-inset" style="margin-top:var(--space-3)"><p><strong>The AI never decides.</strong> It reads and checks the file, and it never takes instructions from a document. You decide the flag.</p></div></section>';
  }

  function actions(c) {
    if (!isOpen(c)) return "";
    var st = c.flags.map(flagState);
    var unresolved = st.some(function (s) { return s !== "dismissed"; });
    var fixOpen = c.fix && !c.fix.done;
    var canGrant = !fixOpen && !unresolved;
    var canRefuse = R.canRefuse(c) && st.indexOf("pending") < 0 && st.indexOf("awaiting") < 0;
    var canFix = !fixOpen;
    var canWithdraw = fixOpen && today() > c.fix.deadline;
    function b(act, label, ok, cls) { return '<button class="c-button ' + (cls || "") + '" data-act="' + act + '" data-id="' + c.id + '"' + (ok ? "" : " disabled") + ">" + label + "</button>"; }
    var why = [];
    if (!canGrant) why.push("Grant: needs no open fix and every flag dismissed.");
    if (!canRefuse && c.flags.length) why.push("Refuse: only after a flag was confirmed and the applicant answered or the 10-day window closed (art. 82). Always a named officer.");
    if (fixOpen && !canWithdraw) why.push("Withdrawal: only after the fix deadline (" + fmt(c.fix.deadline) + "), signed by an officer. Never automatic.");
    return '<div class="o-actions" role="group" aria-label="Officer decisions"><div class="c-button-group">' +
      b("grant", "Grant", canGrant) + b("fix", "Send fix notice", canFix, "c-button--secondary") +
      (fixOpen ? b("withdraw", "Sign withdrawal", canWithdraw, "c-button--warning") : "") +
      (c.flags.length ? b("refuse", "Refuse (named decision)", canRefuse, "c-button--warning") : "") +
      "</div>" + (why.length ? '<p class="o-why-off">' + why.map(esc).join("<br>") + "</p>" : "") + "</div>";
  }

  function scrCase(id) {
    var c = R.getCase(id);
    if (!c) return '<p>Case not found. <a href="#queue">Back to the queue</a>.</p>';
    var m = M(c), w = Math.min(100, day(c) / 90 * 100), s = sla(c), y = why(c);
    var vk = today() + "|" + me();
    if (!O["v_" + c.id] || O["v_" + c.id] !== vk) { O["v_" + c.id] = vk; oLog(c, "Viewed case"); }
    var ks = checks(c).sort(function (a, b) { return RUNG[a.source][0] - RUNG[b.source][0]; });
    var objected = O.objections[c.id] || [];
    var pid = c.checks.filter(function (k) { return k[1] === "PID"; });
    var data = (c.data && c.data.length ? c.data : c.checks.map(function (k) { return [k[0], k[2] === "green" ? "Confirmed" : "Differs: see flag", OD.PID_SOURCE[k[0]] || k[1]]; }));
    var awaiting = c.flags.filter(function (f) { return flagState(f) === "awaiting"; });
    var appOff = c.appt ? (R.OFFICES.filter(function (o) { return o.id === c.appt.office; })[0] || R.OFFICES[0]) : null;
    return '<a class="c-back" href="#queue">Case queue</a>' +
      '<div class="o-casehead"><div><span class="t-caption">' + esc(c.ref) + " · " + esc(c.permitLabel) + "</span><h1>" + esc(c.name) + "</h1>" +
      "<p>" + statusTag(c) + " " + routeTag(c) + ' <span class="o-chip">' + esc(m.channel === "assisted" ? "assisted digital" : m.channel) + '</span><span class="o-chip">' + esc(m.language) + '</span><span class="o-chip">Identity: ' + esc(m.identity) + "</span>" + (m.representative ? '<span class="o-chip">Filed by: ' + esc(m.representative) + "</span>" : "") + "</p>" +
      '<p class="t-small t-secondary">Permit expires ' + fmt(m.expiry) + (isFiled(c) ? " · filed " + fmt(c.filed) : " · not filed yet") + (c.decision ? " · decided " + fmt(c.decision.day) + " by <strong>" + esc(c.decision.by) + "</strong>" : "") + "</p>" +
      (m.note ? '<div class="c-inset"><p>' + esc(m.note) + "</p></div>" : "") + "</div>" +
      '<div class="c-clock' + (R.isPaused(c) ? " c-clock--paused" : "") + '" aria-label="Legal clock: day ' + day(c) + ' of 90"><div class="c-clock__row"><span class="c-clock__big">Day ' + day(c) + ' of 90</span><span class="c-tag c-tag--' + s.cls + '">' + esc(s.text) + '</span></div><div class="c-clock__bar"><div class="c-clock__fill" style="width:' + w + '%"></div><div class="c-clock__target" style="left:33.3%"></div><div class="c-clock__target" style="left:66.6%;background:var(--color-error)"></div></div><div class="c-clock__row t-secondary"><span>30: target</span><span>60: escalate</span><span>90: silence</span></div>' +
      (R.isPaused(c) && c.fix ? '<p class="t-small" style="margin:var(--space-2) 0 0"><strong>Clock paused.</strong> Fix due ' + fmt(c.fix.deadline) + ".</p>" : "") + "</div></div>" +
      actions(c) +
      '<div class="o-grid" style="margin-top:var(--space-5)"><div>' +
      '<section class="o-why" aria-labelledby="why-h"><h2 id="why-h">Why this route: ' + esc(ROUTE[c.route] || c.route) + "</h2><p><strong>" + esc(y.lead) + "</strong></p>" + (y.items.length ? "<ul>" + y.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + (c.decision && c.decision.reason ? '<p style="margin:var(--space-3) 0 0"><strong>Decision reason:</strong> ' + esc(c.decision.reason) + "</p>" : "") + "</section>" +
      (isOpen(c) && (awaiting.length || (c.fix && !c.fix.done)) ? '<section class="o-sim" aria-labelledby="sim-h"><h2 id="sim-h">Citizen side, simulated for the demo</h2><p class="t-small">In the live service the applicant does this in the citizen app or at a desk. Open the citizen app in another tab to do it there.</p><div class="c-button-group">' +
        (c.fix && !c.fix.done ? '<button class="c-button c-button--secondary" data-act="simfix" data-id="' + c.id + '">Applicant completes the fix</button>' : "") +
        awaiting.map(function (f) { return '<button class="c-button c-button--secondary" data-act="simreply" data-id="' + c.id + '" data-f="' + f.id + '">Applicant answers the flag</button>'; }).join("") + "</div></section>" : "") +
      (c.flags.length ? '<section class="c-card" aria-labelledby="fl-h"><h2 id="fl-h">Flag cards</h2><p class="t-small t-secondary">One card per possible problem. You decide each one with a reason. No risk score, no suggested outcome.</p>' + c.flags.map(function (f) { return flagCard(c, f); }).join("") + "</section>" : "") +
      aiDocPanel(c) +
      '<section class="c-card" id="ladder" aria-labelledby="lad-h"><h2 id="lad-h">Evidence ladder</h2><p class="t-small t-secondary">Source first, upload last: 1 PID query, 2 Spanish e-document checked by CSV or e-seal, 3 passport chip (optional fast lane), 4 upload.</p><ul class="o-ladder">' +
      ks.map(function (k) { return '<li><span class="o-rung">Rung ' + RUNG[k.source][0] + "<small>" + esc(RUNG[k.source][1]) + "</small></span><div><strong>" + esc(k.name) + "</strong><p>" + esc(k.detail) + '</p></div><span class="c-tag c-tag--' + (k.result === "green" ? "success" : k.result === "tamper-suspected" || k.result === "red" ? "error" : "warning") + '">' + esc(k.result) + "</span></li>"; }).join("") + "</ul></section>" +
      '<section class="c-card" aria-labelledby="rf-h"><h2 id="rf-h">Rules fired</h2><table class="c-table"><caption class="u-visually-hidden">Rules fired</caption><tbody>' + rulesFired(c).map(function (r) { return '<tr><td><span class="c-tag c-tag--' + (r.ok ? "success" : "warning") + '">' + (r.ok ? "pass" : "stop") + '</span></td><td class="t-mono">' + r.id + "</td><td>" + esc(ruleName(r.id)) + '<br><small class="t-secondary">' + esc(r.note) + "</small></td></tr>"; }).join("") + '</tbody></table><p class="t-small t-secondary">Rules engine v1.3 under Ley 40/2015 art. 41. <a href="#rules">Read every rule and its legal basis</a>.</p></section>' +
      (m.aiSummary ? '<section class="c-card" aria-labelledby="ai-h"><h2 id="ai-h">AI summary of the 40-page submission</h2><div class="c-banner c-banner--warning"><p class="c-banner__title">Reading aid only</p><div class="c-banner__body"><p>Every line links to its source. Decide from the checks and flag cards, never from this summary.</p></div></div><ul class="o-list">' + m.aiSummary.map(function (x) { return "<li>" + esc(x[0]) + ' <a href="#case/' + c.id + '" data-scroll="ladder">Source: ' + esc(x[1]) + "</a></li>"; }).join("") + "</ul></section>" : "") +
      "</div><div>" +
      '<section class="c-card" aria-labelledby="d-h"><h2 id="d-h">Data we retrieved</h2><p class="t-small t-secondary">Fetched once so the applicant didn\'t have to provide it (Ley 39/2015 art. 28.2).</p><dl class="c-summary">' + data.map(function (r) { var v = r[1]; if (/expires $/.test(v)) v += fmt(m.expiry); return '<div class="c-summary__row" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr)"><dt class="c-summary__key t-small">' + esc(r[0]) + '</dt><dd class="c-summary__value t-small">' + esc(v) + "<small>" + esc(r[2]) + "</small></dd></div>"; }).join("") + "</dl></section>" +
      '<section class="c-card" aria-labelledby="cl-h"><h2 id="cl-h">Consent log</h2><p class="t-small t-secondary">Each PID query is logged. The applicant can object (art. 28.2); that item then moves to the upload path.</p><ul class="o-list">' +
      (isFiled(c) ? pid.map(function (k) { var ob = objected.indexOf(k[0]) >= 0; return '<li><span class="o-date">' + fmtS(c.filed) + "</span><strong>" + esc(k[0]) + "</strong> from " + esc(OD.PID_SOURCE[k[0]] || "PID") + '<br><span class="t-secondary">' + (ob ? "Objection recorded. Applicant uploads it instead." : "Legal basis: Ley 39/2015 art. 28.2. No objection.") + "</span>" + (!ob && isOpen(c) ? ' <button class="c-link" data-act="object" data-id="' + c.id + '" data-q="' + esc(k[0]) + '">Record objection</button>' : "") + "</li>"; }).join("") : "<li>No queries yet: the case is not filed.</li>") + "</ul></section>" +
      (c.appt ? '<section class="c-card" aria-labelledby="ap-h"><h2 id="ap-h">Fingerprint appointment</h2><p class="t-small">Issued with the decision (contract §14).</p><dl class="c-summary"><div class="c-summary__row" style="grid-template-columns:1fr 1.6fr"><dt class="c-summary__key t-small">Office</dt><dd class="c-summary__value t-small">' + esc(appOff.name) + "<small>" + esc(appOff.addr) + '</small></dd></div><div class="c-summary__row" style="grid-template-columns:1fr 1.6fr"><dt class="c-summary__key t-small">When</dt><dd class="c-summary__value t-small">' + fmt(c.appt.day) + ", " + esc(c.appt.time) + '</dd></div><div class="c-summary__row" style="grid-template-columns:1fr 1.6fr"><dt class="c-summary__key t-small">Changes</dt><dd class="c-summary__value t-small">' + (c.appt.resched ? "Changed once (limit reached)" : "Can be changed once, only by the applicant. Not transferable.") + "</dd></div></dl></section>" : "") +
      '<section class="c-card" aria-labelledby="h-h"><h2 id="h-h">History</h2><p class="t-small t-secondary">Each change reaches the applicant by DEHú, SMS and email, in ' + esc(m.language) + '.</p><ul class="o-list">' + c.history.slice().reverse().map(function (h) { return '<li><span class="o-date">' + fmtS(h[0]) + "</span>" + esc(h[1]) + "</li>"; }).join("") + "</ul></section>" +
      '<section class="c-card" aria-labelledby="au-h"><details class="c-details" style="margin:0"><summary id="au-h">Audit log (' + caseAudit(c).length + ' entries)</summary><div class="c-details__body"><ul class="o-list">' + caseAudit(c).map(function (a) { return '<li><span class="o-date">' + fmtS(a.day) + "</span><strong>" + esc(a.actor) + "</strong>: " + esc(a.action) + "</li>"; }).join("") + "</ul></div></details></section>" +
      "</div></div>";
  }

  function scrFlags() {
    var groups = [], cnt = {};
    S().cases.forEach(function (c) {
      if (!isFiled(c)) return;
      c.flags.forEach(function (f) { var s = flagState(f); cnt[s] = (cnt[s] || 0) + 1; });
      var mine = c.flags.filter(function (f) { return UI.ftab === "all" || flagState(f) === UI.ftab; });
      if (mine.length) groups.push([c, mine]);
    });
    groups.sort(function (a, b) { return risk(a[0]) - risk(b[0]); });
    function tab(k, l) { return '<button type="button" class="c-button c-button--secondary" data-act="ftab" data-k="' + k + '" aria-pressed="' + (UI.ftab === k) + '"' + (UI.ftab === k ? ' style="background:var(--color-brand);color:#fff"' : "") + ">" + l + (k !== "all" ? " (" + (cnt[k] || 0) + ")" : "") + "</button>"; }
    return '<div class="o-head"><div><h1>Flag review</h1><p>One card per possible problem: what we found, the rule and the evidence. Confirm or dismiss each one with a reason. Confirmed flags go to the applicant, who gets 10 days to answer (Ley 39/2015 art. 82) before anyone can refuse.</p></div></div>' +
      '<div class="c-banner"><p class="c-banner__title">How flags work here</p><div class="c-banner__body"><p>No risk score. No refusal suggestion. No bulk actions. Nationality is never an input. Dismissals are overrides and are re-checked at random in the sample audit.</p></div></div>' +
      '<div class="c-button-group" role="group" aria-label="Filter flags">' + tab("pending", "Needs decision") + tab("awaiting", "Sent to applicant") + tab("answered", "Response in") + tab("dismissed", "Dismissed") + tab("all", "All") + "</div>" +
      (groups.length ? groups.map(function (g) { var c = g[0]; return '<section class="c-card" aria-label="' + esc(c.name) + '"><div class="c-flag__head"><div><h2 style="margin:0"><a href="#case/' + c.id + '">' + esc(c.name) + '</a></h2><span class="t-small t-secondary">' + esc(c.ref) + " · " + esc(c.permitLabel) + "</span></div><span>" + meter(c) + " " + statusTag(c) + '</span></div><div style="margin-top:var(--space-4)">' + g[1].map(function (f) { return flagCard(c, f); }).join("") + "</div>" + actions(c) + "</section>"; }).join("") : '<p class="c-inset">No flags in this view.</p>');
  }

  function scrRules() {
    var autos = S().cases.filter(function (c) { return c.decision && c.decision.by === "Rules engine"; }).sort(function (a, b) { return b.decision.day - a.decision.day; });
    var RR = R.RULES;
    return '<div class="o-head"><div><h1>Rules and auto-grant log</h1><p>The rules engine is an automated administrative action under Ley 40/2015 art. 41, authorised by a published resolution (RD 203/2021 art. 13). Its rules are written so anyone can read and audit them.</p></div></div>' +
      '<div class="o-grid"><section class="c-card" aria-labelledby="r-h"><h2 id="r-h">Rules in force · engine v1.3</h2><p class="t-small t-secondary">Authorising resolution: Delegación del Gobierno en Madrid, automated action for clear-cut renewals (synthetic reference RES-AUT-2026-014). Code open to audit.</p>' +
      OD.RULES.map(function (r) { return '<div class="o-rule"><span class="o-rid">' + r.id + '</span><div><h3>' + esc(r.name) + ' <span class="t-secondary t-small">v' + r.version + "</span></h3><p>" + esc(r.text) + "</p><p><strong>If not met:</strong> " + esc(r.out) + '</p><p class="t-secondary">Legal basis: ' + esc(r.basis) + "</p></div></div>"; }).join("") +
      '<h3>Deadlines the engine enforces</h3><table class="c-table"><tbody><tr><td>Clear-cut target</td><td>' + RR.autoTargetDays + ' calendar days (5 working days), 80% within 48 h</td></tr><tr><td>Human review target</td><td>' + RR.humanTargetDays + " days, escalation at day " + RR.escalationDay + "</td></tr><tr><td>Legal limit</td><td>" + RR.legalLimitDays + " days, then positive silence (backstop only)</td></tr><tr><td>Fix-it window</td><td>" + RR.fixDeadlineDays + " days, clock paused (art. 68)</td></tr><tr><td>Answer to a flag</td><td>" + RR.flagResponseDays + " days (art. 82: 10 to 15)</td></tr><tr><td>Fingerprint appointment</td><td>within " + RR.apptWithinDays + " days of the decision</td></tr></tbody></table></section>" +
      '<section class="c-card" aria-labelledby="ag-h"><h2 id="ag-h">Auto-grant log</h2><p class="t-small t-secondary">' + autos.length + ' files granted by the engine. Target: 5 working days, 80% within 48 hours.</p><div class="c-table-wrap"><table class="c-table o-table"><caption class="u-visually-hidden">Auto-grant log</caption><thead><tr><th scope="col">File</th><th scope="col">Rules used</th><th scope="col">Checks passed</th><th scope="col">Time to decision</th></tr></thead><tbody>' +
      autos.map(function (c) { var d = day(c), ks = checks(c); return '<tr><td><a href="#case/' + c.id + '">' + esc(c.name) + "</a><small>" + esc(c.ref) + " · " + fmtS(c.decision.day) + '</small></td><td class="t-mono">R0–R' + (c.fix ? "6" : "5") + "<small>v1.3</small></td><td>" + ks.filter(function (k) { return k.result === "green"; }).length + "/" + ks.length + "<small>" + ks.map(function (k) { return k.source; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ") + '</small></td><td class="o-nowrap"><strong>' + d + (d === 1 ? " day" : " days") + "</strong> " + (d <= 2 ? '<span class="c-tag c-tag--success">≤ 48 h</span>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div></section></div>";
  }

  function scrAbuse() {
    var seen = {}, rows = [];
    S().cases.forEach(function (c) { var m = M(c); if (!m.signal) return; var k = sigKey(c); if (seen[k]) { seen[k].cases.push(c); return; } seen[k] = { key: k, s: m.signal, cases: [c] }; rows.push(seen[k]); });
    rows.sort(function (a, b) { return (O.signals[a.key] || a.s.resolved ? 1 : 0) - (O.signals[b.key] || b.s.resolved ? 1 : 0); });
    return '<div class="o-head"><div><h1>Abuse and fraud watch</h1><p>Legitimate, difficult and potentially abusive uses all reach this office. The system spots patterns and contains them. A named person decides what happens next. A signal is never a refusal.</p></div></div>' +
      '<div class="c-banner c-banner--warning"><p class="c-banner__title">What the system may and may not do alone</p><div class="c-banner__body"><p><strong>May:</strong> slow down (rate limits), keep a file out of the automatic lane, quarantine text, block a slot transfer.<br><strong>May not:</strong> refuse, revoke, or report anyone to the police without an officer.</p></div></div>' +
      rows.map(function (r) {
        var s = r.s, d = O.signals[r.key], open = !d && !s.resolved;
        return '<section class="c-card o-signal" aria-label="' + esc(s.type) + '"><div class="o-signal__head"><h2 class="t-h3">' + esc(s.type) + '</h2><span class="c-tag c-tag--' + (open ? "error" : "success") + '">' + (open ? "Waiting for a person" : s.resolved ? "Resolved" : "Decided") + "</span></div>" +
          '<div><p class="o-lab">What we saw</p><p>' + esc(s.detail) + '</p><p class="o-lab">Files</p><p>' + r.cases.map(function (c) { return '<a href="#case/' + c.id + '">' + esc(c.name) + "</a> (" + esc(R.STATUS[c.status].label.toLowerCase()) + ")"; }).join(", ") + "</p></div>" +
          '<div><p class="o-lab">What the system does</p><p>' + esc(s.system) + '</p><p class="o-lab">Who decides</p><p>' + (s.resolved ? esc(s.resolved) : d ? "<strong>" + esc(d.choice) + "</strong>, " + esc(d.by) + ", " + fmt(d.day) + ": " + esc(d.reason) : "An officer, with a written reason. Nothing further happens until then.") + "</p>" +
          (open ? '<div class="c-button-group">' + s.actions.map(function (a, i) { return '<button class="c-button' + (i ? " c-button--secondary" : "") + '" data-act="signal" data-id="' + r.cases[0].id + '" data-k="' + i + '">' + esc(a) + "</button>"; }).join("") + "</div>" : "") + "</div></section>";
      }).join("");
  }

  function scrAudit() {
    var pool = S().cases.filter(function (c) { return c.decision && c.decision.by === "Rules engine"; });
    var fresh = pool.filter(function (c) { return !c.sampled; });
    var sample = (S().sample || []).map(R.getCase).filter(Boolean);
    var overs = [];
    S().cases.forEach(function (c) { c.flags.forEach(function (f) { if (f.officer === "dismissed") overs.push({ c: c, f: f }); }); });
    function decider(o) { var a = S().audit.filter(function (x) { return x.ref === o.c.ref && /Flag dismissed/.test(x.action); })[0]; return a ? a.actor : (o.c.decision ? o.c.decision.by : "Officer"); }
    return '<div class="o-head"><div><h1>Sample audit</h1><p>Officers re-check a random sample of automatic grants afterwards. If a sample finds a problem, the applicant gets a flag card and a chance to answer. Nothing is revoked silently.</p></div></div>' +
      '<div class="o-cards"><section class="c-card" aria-labelledby="sa-h"><h2 id="sa-h">Post-grant sample</h2><p class="t-small t-secondary">' + pool.length + " automatic grants, " + fresh.length + ' not sampled yet.</p><button class="c-button" data-act="draw"' + (fresh.length ? "" : " disabled") + ">Draw sample of 5</button>" +
      (sample.length ? '<div class="c-table-wrap"><table class="c-table o-table"><caption class="u-visually-hidden">Current sample</caption><thead><tr><th scope="col">File</th><th scope="col">Granted</th><th scope="col">Result</th></tr></thead><tbody>' + sample.map(function (c) { return '<tr><td><a href="#case/' + c.id + '">' + esc(c.name) + "</a><small>" + esc(c.ref) + "</small></td><td>" + fmtS(c.decision.day) + "<small>day " + day(c) + "</small></td><td>" + (c.sampleResult ? '<span class="c-tag c-tag--' + (c.sampleResult === "ok" ? "success" : "error") + '">' + (c.sampleResult === "ok" ? "OK" : "Problem found: flag sent") + "</span>" : '<div class="c-button-group"><button class="c-button c-button--secondary" data-act="sok" data-id="' + c.id + '">Mark OK</button><button class="c-button c-button--warning" data-act="sprob" data-id="' + c.id + '">Problem found</button></div>') + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="c-inset">No sample drawn yet.</p>') + "</section>" +
      '<section class="c-card" aria-labelledby="ov-h"><h2 id="ov-h">Override audit</h2><p class="t-small t-secondary">' + overs.length + ' dismissed flags (officer overrides). A different officer re-checks one at random, to catch rubber-stamping either way.</p><button class="c-button" data-act="drawov"' + (overs.length ? "" : " disabled") + ">Draw an override to re-check</button>" +
      (O.overrides.length ? '<ul class="o-list">' + O.overrides.slice().reverse().map(function (o) {
        var c = R.getCase(o.caseId), f = c && c.flags.filter(function (x) { return x.id === o.flagId; })[0]; if (!f) return "";
        var by = decider({ c: c }), same = by === me(), idx = O.overrides.indexOf(o);
        return '<li><strong><a href="#case/' + c.id + '">' + esc(c.name) + "</a></strong>: “" + esc(f.ground) + "” dismissed by " + esc(by) + '<br><span class="t-secondary">Reason given: ' + esc(f.officerReason) + "</span><br>" +
          (o.result ? '<span class="c-tag c-tag--' + (o.result === "holds" ? "success" : "error") + '">' + (o.result === "holds" ? "Reason holds" : "Questioned") + "</span> " + esc(o.reviewer) + ": " + esc(o.note)
            : same ? '<span class="o-why-off">You made this decision. Switch officer (top right) to review it.</span>' : '<div class="c-button-group" style="margin-top:var(--space-2)"><button class="c-button c-button--secondary" data-act="ovmark" data-i="' + idx + '" data-r="holds">Reason holds</button><button class="c-button c-button--warning" data-act="ovmark" data-i="' + idx + '" data-r="questioned">Question it</button></div>') + "</li>";
      }).join("") + "</ul>" : '<p class="c-inset">No override drawn yet.</p>') + "</section></div>" +
      '<section class="c-card" aria-labelledby="gl-h"><h2 id="gl-h">Service audit log</h2><p class="t-small t-secondary">Every action by the rules engine, officers and applicants, newest first (last 15).</p><ul class="o-list">' + S().audit.slice(0, 15).map(function (a) { return '<li><span class="o-date">' + fmtS(a.day) + '</span><span class="t-mono t-small">' + esc(a.ref) + "</span> <strong>" + esc(a.actor) + "</strong>: " + esc(a.action) + "</li>"; }).join("") + (S().audit.length ? "" : "<li>No actions yet today.</li>") + "</ul></section>";
  }

  function metrics() {
    var decided = S().cases.filter(function (c) { return c.decision && c.decision.type !== "withdrawn"; });
    var days = decided.map(day), avg = days.length ? days.reduce(function (a, b) { return a + b; }, 0) / days.length : 0;
    var inT = decided.filter(function (c) { var d = day(c); if (c.decision.by === "Rules engine") return d <= R.RULES.autoTargetDays; if (c.decision.type === "silence") return false; return d <= R.RULES.humanTargetDays; }).length;
    // clear-cut = granted by the engine with no fix-it loop on the way
    var autos = decided.filter(function (c) { return c.decision.by === "Rules engine" && !c.fix; });
    return {
      decided: decided, autos: autos, human: decided.filter(function (c) { return c.decision.by !== "Rules engine"; }), fixed: decided.filter(function (c) { return c.decision.by === "Rules engine" && c.fix; }), avg: avg,
      pctT: decided.length ? inT / decided.length * 100 : 0,
      pct48: autos.length ? autos.filter(function (c) { return day(c) <= 2; }).length / autos.length * 100 : 0,
      pct90: decided.length ? decided.filter(function (c) { return day(c) < 90; }).length / decided.length * 100 : 0,
      past60: S().cases.filter(function (c) { return isOpen(c) && !R.isPaused(c) && day(c) > 60; }).length,
      at90: S().cases.filter(function (c) { return (c.decision && c.decision.type === "silence") || (isOpen(c) && day(c) >= 90); }).length
    };
  }
  function bars(rows, max, unit, target) {
    return rows.map(function (r) { return '<div class="o-hb" title="' + esc(r.label) + ": " + r.value.toFixed(1) + " " + unit + (r.n != null ? " (n=" + r.n + ")" : "") + '"><span class="o-hb__lab">' + esc(r.label) + '</span><span class="o-hb__track">' + (target != null ? '<span class="o-hb__tgt" style="left:' + (target / max * 100) + '%" aria-hidden="true"></span>' : "") + '<span class="o-hb__fill' + (r.then ? " o-hb__fill--then" : "") + '" style="width:' + Math.max(1, r.value / max * 100) + '%"></span></span><span class="o-hb__val">' + (r.txt || r.value.toFixed(1)) + (r.n != null ? " <small>n=" + r.n + "</small>" : "") + "</span></div>"; }).join("");
  }
  function groupAvg(list, key, order) {
    return order.map(function (k) { var g = list.filter(function (c) { return M(c)[key] === k; }); return { label: k === "assisted" ? "assisted digital" : k, value: g.length ? g.reduce(function (a, c) { return a + day(c); }, 0) / g.length : 0, n: g.length }; }).filter(function (r) { return r.n; });
  }
  function scrDashboard() {
    var m = metrics(), CH = ["online", "assisted", "in person"];
    var langs = S().cases.map(function (c) { return M(c).language; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    var cC = groupAvg(m.autos, "channel", CH), cH = groupAvg(m.human, "channel", CH), lC = groupAvg(m.autos, "language", langs);
    var mx = function (rows, min) { return Math.max.apply(null, [min].concat(rows.map(function (r) { return r.value; }))) * 1.15; };
    var open = S().cases.filter(isOpen);
    return '<div class="o-head"><div><h1>Dashboard</h1><p>Published every month per province as “% decided within target”. Figures move as you advance the demo clock. Today: ' + fmt(today()) + ".</p></div></div>" +
      '<div class="o-kpis"><div class="o-kpi"><b>' + m.pctT.toFixed(0) + '%</b><span>Decided within target</span><small>clear-cut ≤ 5 working days, reviewed ≤ 30 days</small></div>' +
      '<div class="o-kpi"><b>' + m.avg.toFixed(1) + '</b><span>Average days to decision</span><small>' + m.decided.length + " decided files</small></div>" +
      '<div class="o-kpi"><b>' + m.pct48.toFixed(0) + '%</b><span>Clear-cut grants within 48 h</span><small>target 80% · ' + m.autos.length + ' files, ' + m.fixed.length + ' more after a fix</small></div>' +
      '<div class="o-kpi"><b>' + m.past60 + '</b><span>Open files past day 60</span><small>escalated to the supervisor</small></div>' +
      '<div class="o-kpi o-kpi--goal"><b>' + m.at90 + '</b><span>Files that reached day 90</span><small>goal 0: silence is a backstop only</small></div></div>' +
      '<div class="o-cards"><section class="c-card" aria-labelledby="tv-h"><h2 id="tv-h">Madrid today vs this service</h2>' +
      '<h3 class="t-small" style="margin-top:0">Average days to decision</h3>' + bars([{ label: "Madrid, Jan 2025", value: 88, then: true, txt: "88" }, { label: "This service", value: m.avg }], 100, "days") +
      '<h3 class="t-small">Decided within 90 days</h3>' + bars([{ label: "Madrid, Jan 2025", value: 65, then: true, txt: "65%" }, { label: "This service", value: m.pct90, txt: m.pct90.toFixed(0) + "%" }], 100, "%") +
      '<p class="t-small t-secondary">Madrid, January 2025: 1,390 renewals, 88 days on average, 65% decided within 90 days (Ministry CORA data, via ARC Legal). This service: synthetic demo files.</p></section>' +
      '<section class="c-card" aria-labelledby="fa-h"><h2 id="fa-h">Fairness: is anyone slower?</h2><p class="t-small t-secondary">Average days to decision by channel, like for like. People who apply with help or in person should not wait longer. Dashed line: target.</p>' +
      '<h3 class="t-small" style="margin-top:0">Clear-cut files</h3>' + bars(cC, mx(cC, 3), "days", 2) +
      '<h3 class="t-small">Officer-reviewed files</h3>' + bars(cH, mx(cH, 30), "days", 30) + "</section>" +
      '<section class="c-card" aria-labelledby="fl-h"><h2 id="fl-h">Fairness by language (clear-cut files)</h2><p class="t-small t-secondary">Every message goes out in the applicant\'s language. Dashed line: 48-hour target. Small groups move a lot; read with n.</p>' + bars(lC, mx(lC, 3), "days", 2) + "</section>" +
      '<section class="c-card" aria-labelledby="wl-h"><h2 id="wl-h">Where the open files are</h2>' + bars(["On track", "Past day 30", "Past day 60", "Clock paused"].map(function (t) { var n = open.filter(function (c) { return sla(c).text === t; }).length; return { label: t, value: n, txt: String(n) }; }), Math.max(5, open.length), "files") + '<p class="t-small t-secondary">Open files by deadline badge.</p></section></div>';
  }

  function scrAI() {
    var P = [
      ["Lawful", ["Every rule shows its legal basis and version (<a href=\"#rules\">Rules</a>).", "Automatic grants are authorised under Ley 40/2015 art. 41 and RD 203/2021 art. 13.", "The engine can only grant (GDPR art. 22). Every refusal is a named officer's decision after the applicant has answered (art. 82).", "PID queries rest on Ley 39/2015 art. 28.2, and objections are honoured (consent log in each case)."]],
      ["Inclusive", ["Online, assisted digital and in-person channels run the same steps (Supreme Court ruling 868/2026).", "The passport chip (NFC) is a fast lane, never required. Desk staff can check identity.", "Messages in the applicant's language; channel and language chips in the queue.", "The fairness panel on the <a href=\"#dashboard\">Dashboard</a> checks that no channel or language waits longer."]],
      ["Explainable", ["A plain “Why this route” panel in every case.", "Flag cards show what was found, the rule and the evidence. No scores.", "A rules-fired list per case and a readable rule list.", "Refusal notices carry the reasons and both appeal routes."]],
      ["Secure", ["Staff access is role-based. Every view and action goes in the case audit log.", "Data is limited to what the renewal needs. Nationality is never stored or used.", "Uploads face a tamper check. Hidden text in documents is quarantined (<a href=\"#abuse\">Abuse watch</a>).", "Fingerprint slots are tied to identity and can't be transferred."]],
      ["Accountable", ["An audit log per case, with actor and date.", "Random <a href=\"#audit\">sample audit</a> of automatic grants and of officer overrides.", "Escalation at day 60 and the goal of zero files at day 90.", "“% decided within target” published monthly per province."]]
    ];
    return '<div class="o-head"><div><h1>How AI is used here</h1><p>Three kinds of work happen in this console. Keeping them apart is the point.</p></div></div>' +
      '<div class="o-split"><section class="c-card c-card--alt"><h2>What AI does</h2><ul class="c-list"><li>Reads documents and pulls out the fields</li><li>Runs the tamper check on uploads</li><li>Matches uploads to source data (passport vs police record, payslip vs Social Security base)</li><li>Summarises long submissions, with a source link for every line</li></ul><p class="t-small t-secondary">It never takes instructions from a document and never decides.</p></section>' +
      '<section class="c-card c-card--brand"><h2>What the rules engine does</h2><ul class="c-list"><li>Grants clear-cut files where every rule passes</li><li>Sends fix notices for objective defects (art. 68) and pauses the clock</li><li>Issues the fingerprint appointment with the grant</li><li>Escalates at day 60</li></ul><p class="t-small t-secondary">Fixed, published rules. No learning, no scoring.</p></section>' +
      '<section class="c-card" style="border-top:6px solid var(--color-error)"><h2>What only people do</h2><ul class="c-list"><li>Confirm or dismiss every flag, with a reason</li><li>Every refusal, after the applicant has answered</li><li>Every withdrawal, signed after the fix deadline</li><li>Every fraud referral to the police</li><li>Sample and override audits</li></ul></section></div>' +
      '<section class="c-card" style="margin-top:var(--space-5)" aria-labelledby="pr-h"><h2 id="pr-h">Five principles, and where to see them in this console</h2>' + P.map(function (p) { return '<div class="o-principle"><h3>' + p[0] + '</h3><ul class="c-list">' + p[1].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</section>";
  }

  /* ---------------- render ---------------- */
  var SCREENS = { queue: scrQueue, flags: scrFlags, rules: scrRules, abuse: scrAbuse, audit: scrAudit, dashboard: scrDashboard, ai: scrAI };
  var last = "";
  function route() { var h = (location.hash || "#queue").slice(1).split("/"); return { v: h[0] === "case" || SCREENS[h[0]] ? h[0] : "queue", id: h[1] || null }; }
  function render() {
    oLoad();
    var r = route(), key = r.v + (r.id || ""), y = window.scrollY, focused = document.activeElement && document.activeElement.id;
    var body = r.v === "case" ? scrCase(r.id) : SCREENS[r.v]();
    app.innerHTML = header(r.v) + '<main id="main" class="l-width o-wide l-main" tabindex="-1">' + body + "</main>" + demobar(r.v, r.id) + (toastMsg ? '<div class="c-toast" role="status">' + esc(toastMsg) + "</div>" : "");
    var bar = app.querySelector(".c-demobar"); if (bar) document.body.style.paddingBottom = (bar.offsetHeight + 8) + "px";
    var h1 = app.querySelector("h1"); document.title = (h1 ? h1.textContent + " · " : "") + "Officer console";
    if (key === last) { window.scrollTo(0, y); if (focused && document.getElementById(focused)) document.getElementById(focused).focus(); }
    else { window.scrollTo(0, 0); if (last) document.getElementById("main").focus({ preventScroll: true }); }
    last = key; oSave();
  }

  /* ---------------- events ---------------- */
  var FIX_TYPES = {
    "Missing document": "We need this document to check a requirement.",
    "Unreadable scan": "We need to read it to match it with source data.",
    "Wrong or missing fee": "The renewal fee must be paid in full before we decide.",
    "Expired passport": "The TIE needs a valid passport number."
  };
  app.addEventListener("click", function (e) {
    var a = e.target.closest("[data-scroll]");
    if (a) { e.preventDefault(); var tgt = a.getAttribute("href"); if (location.hash !== tgt) location.hash = tgt; setTimeout(function () { var el = document.getElementById(a.getAttribute("data-scroll")); if (el) el.scrollIntoView(); }, 30); return; }
    var b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    handle(b.getAttribute("data-act"), b).catch(function (err) { console.error(err); toast("Something went wrong: " + err.message); render(); });
  });
  async function handle(act, b) {
    var id = b.getAttribute("data-id"), c = id ? R.getCase(id) : null, fid = b.getAttribute("data-f"), r;
    if (act === "d1") { R.advance(1); toast("1 day later"); return; }
    if (act === "d7") { R.advance(7); toast("7 days later"); return; }
    if (act === "reset") {
      r = await ask({ title: "Reset the demo?", body: "<p>Every case goes back to 25 Nov 2026, in this tab and in the citizen app.</p>", fields: [], ok: "Reset demo", danger: true });
      if (!r) return; var who = me(); localStorage.removeItem(OKEY); toast("Demo reset"); R.reset(); O = oFresh(); O.officer = who; oSave(); location.hash = "queue"; render(); return;
    }
    if (act === "qclear") { UI.q = { status: "", route: "", sla: "", channel: "", search: "", open: true }; return render(); }
    if (act === "ftab") { UI.ftab = b.getAttribute("data-k"); return render(); }
    if (act === "fconfirm") {
      var f = c.flags.filter(function (x) { return x.id === fid; })[0];
      r = await ask({ title: "Confirm flag and ask the applicant", body: "<p><strong>" + esc(f.ground) + "</strong></p><p>The applicant sees what was found, the rule and the evidence in plain language, in their language, and has " + R.RULES.flagResponseDays + " days to answer (art. 82). Confirming is not a refusal.</p>", reasonLabel: "Your note to the applicant (required, shown to them)", ok: "Confirm flag" });
      if (!r) return; toast("Flag sent to the applicant"); R.confirmFlag(c.id, fid, r.reason, me()); return;
    }
    if (act === "fdismiss") {
      var f2 = c.flags.filter(function (x) { return x.id === fid; })[0];
      r = await ask({ title: "Dismiss flag", body: "<p><strong>" + esc(f2.ground) + "</strong></p><p>Dismissing overrides the system's flag. It is logged and may be drawn in the override audit.</p>", ok: "Dismiss flag" });
      if (!r) return; toast("Flag dismissed"); R.dismissFlag(c.id, fid, r.reason, me()); return;
    }
    if (act === "grant") {
      r = await ask({ title: "Grant renewal: " + c.name, body: "<p>Your decision as a named officer. The fingerprint appointment is issued with it and the applicant is told by DEHú, SMS and email.</p>", value: c.flags.length ? "Every flag dismissed with a reason; remaining checks confirmed." : "All requirements confirmed.", ok: "Grant" });
      if (!r) return; toast("Granted. Appointment issued."); R.decide(c.id, "granted", r.reason, me()); return;
    }
    if (act === "refuse") {
      var conf = c.flags.filter(function (x) { return x.officer === "confirmed"; });
      r = await ask({ title: "Refuse: named officer decision", danger: true, ok: "Refuse and sign",
        body: "<p>The notice lists these grounds and their evidence:</p><ul class=\"c-list\">" + conf.map(function (x) { return "<li>" + esc(x.ground) + (x.response ? " (applicant answered)" : " (no answer in time)") + "</li>"; }).join("") + "</ul><p>It also gives both appeal routes: <strong>reposición</strong> within 1 month, decided by a different official and filed online in Mercurio, or the courts within 2 months.</p>",
        reasonLabel: "Reasons for refusal (required, shown to the applicant)" });
      if (!r) return; var res = R.decide(c.id, "refused", r.reason, me()); toast(res && res.error ? "Refusal not allowed yet" : "Refusal signed by " + me()); return;
    }
    if (act === "fix") {
      r = await ask({ title: "Send fix notice", body: "<p>Only for objective defects (Ley 39/2015 art. 68). The applicant gets " + R.RULES.fixDeadlineDays + " days, a plain explanation and a button to fix it. The clock pauses. Anything that needs judgement is a flag, not a fix notice.</p>",
        fields: [{ id: "type", label: "Defect", type: "select", options: Object.keys(FIX_TYPES) }, { id: "what", label: "What exactly to fix (shown to the applicant)", type: "textarea", value: "" }], ok: "Send fix notice" });
      if (!r) return; toast("Fix notice sent. Clock paused."); R.sendFixNotice(c.id, r.what.replace(/[.\s]+$/, ""), FIX_TYPES[r.type], me()); return;
    }
    if (act === "withdraw") {
      r = await ask({ title: "Sign withdrawal (desistimiento)", danger: true, ok: "Sign withdrawal", body: "<p>The fix deadline has passed. A withdrawal is never automatic: you sign it. A late fix that arrives before this is notified still counts (art. 73.3).</p>", reasonLabel: "Signed reason (required)" });
      if (!r) return; var w = R.signWithdrawal(c.id, r.reason, me()); toast(w && w.error ? "Too early to withdraw" : "Withdrawal signed"); return;
    }
    if (act === "simfix") { toast("Applicant completed the fix"); R.payFix(c.id); return; }
    if (act === "simreply") {
      r = await ask({ title: "Simulate the applicant's answer", fields: [{ id: "reason", label: "Applicant's answer", type: "textarea", value: c.id === "lucia" ? "My employer changed in June. The new company registered me in September; here is the contract." : "Here is my explanation and a supporting document." }], ok: "Send answer" });
      if (!r) return; toast("Answer received"); R.respondFlag(c.id, fid, r.reason, c.id === "lucia" ? "Lucia-employment-contract.pdf" : "supporting-document.pdf"); return;
    }
    if (act === "object") {
      var q = b.getAttribute("data-q");
      r = await ask({ title: "Record objection: " + q, body: "<p>Under Ley 39/2015 art. 28.2 the applicant can object to us fetching this. We set the data aside and ask them to upload it. That request is a fix notice, so the clock pauses (art. 22.1.a).</p>", reasonLabel: "How the objection arrived (required)", value: "Applicant objected by phone; identity checked.", ok: "Record objection" });
      if (!r) return; (O.objections[c.id] = O.objections[c.id] || []).push(q); oLog(c, "Recorded objection to PID query: " + q + ". " + r.reason);
      toast("Objection recorded; upload requested"); R.sendFixNotice(c.id, "Upload your own proof of: " + q.toLowerCase(), "You asked us not to fetch it from the other office, so we need your copy (Ley 39/2015 art. 28.2).", me()); return;
    }
    if (act === "signal") {
      var m = M(c), s = m.signal, choice = s.actions[+b.getAttribute("data-k")], key = sigKey(c);
      var group = S().cases.filter(function (x) { return sigKey(x) === key; });
      var openOnes = group.filter(isOpen);
      var willFix = /identity check per|original|clean copy/i.test(choice) && openOnes.length;
      r = await ask({ title: choice, body: "<p><strong>" + esc(s.type) + "</strong> · " + group.length + " file" + (group.length > 1 ? "s" : "") + ". Your decision and reason are logged on each file." + (willFix ? " Open files get a fix notice and their clock pauses." : "") + "</p>", ok: choice });
      if (!r) return;
      O.signals[key] = { choice: choice, by: me(), reason: r.reason, day: today() };
      group.forEach(function (g) { oLog(g, "Abuse signal '" + s.type + "': " + choice + ". " + r.reason); });
      oSave(); toast("Decision logged: " + choice);
      if (willFix) openOnes.forEach(function (g) { var fx = (M(g).signal.fix) || ["Please confirm one thing", "We need to check one document."]; if (!(g.fix && !g.fix.done)) R.sendFixNotice(g.id, fx[0], fx[1], me()); });
      render(); return;
    }
    if (act === "draw") { var p = R.drawSample(5); p.forEach(function (x) { oLog(x, "Drawn in post-grant sample"); }); toast("Sample of " + p.length + " drawn"); render(); return; }
    if (act === "sok") {
      r = await ask({ title: "Mark OK: " + c.name, body: "<p>You re-checked the evidence behind this automatic grant.</p>", value: "Evidence re-checked; grant correct.", ok: "Mark OK" });
      if (!r) return; oLog(c, "Sample audit OK: " + r.reason); R.markSample(c.id, "ok", r.reason, me()); toast("Marked OK"); return;
    }
    if (act === "sprob") {
      r = await ask({ title: "Problem found: " + c.name, body: "<p>The applicant gets a flag card with what you found and " + R.RULES.flagResponseDays + " days to answer. The permit stays valid; nothing is revoked silently.</p>", reasonLabel: "What needs confirming (shown to the applicant)", value: "", ok: "Send flag to applicant", danger: true });
      if (!r) return; toast("Flag sent to the applicant"); R.markSample(c.id, "problem", r.reason.replace(/[.\s]+$/, ""), me()); return;
    }
    if (act === "drawov") {
      var cand = [];
      S().cases.forEach(function (x) { x.flags.forEach(function (f) { if (f.officer === "dismissed" && !O.overrides.some(function (o) { return o.caseId === x.id && o.flagId === f.id; })) cand.push({ caseId: x.id, flagId: f.id }); }); });
      if (!cand.length) { toast("Every override has been drawn"); return render(); }
      var pick = cand[Math.floor(Math.random() * cand.length)]; pick.result = null; O.overrides.push(pick); oSave(); toast("Override drawn"); return render();
    }
    if (act === "ovmark") {
      var o = O.overrides[+b.getAttribute("data-i")], res2 = b.getAttribute("data-r");
      r = await ask({ title: res2 === "holds" ? "Reason holds" : "Question this override", body: "<p>Your note goes to the deciding officer and the supervisor.</p>", ok: "Save" });
      if (!r) return; o.result = res2; o.note = r.reason; o.reviewer = me(); oLog(R.getCase(o.caseId), "Override audit: " + (res2 === "holds" ? "reason holds" : "questioned") + ". " + r.reason); toast("Override audit saved"); return render();
    }
  }

  app.addEventListener("input", function (e) { if (e.target.id === "q-search") { UI.q.search = e.target.value; var pos = e.target.selectionStart; render(); var el = document.getElementById("q-search"); el.focus(); el.setSelectionRange(pos, pos); } });
  app.addEventListener("change", function (e) {
    var id = e.target.id, v = e.target.value;
    if (id === "officer") { O.officer = v; oSave(); toast("Now acting as " + v); return render(); }
    if (id === "demo-case") { if (v) { if (["amina", "robert", "lucia"].indexOf(v) >= 0 && S().persona !== v) R.setPref("persona", v); location.hash = "case/" + v; } return; }
    var map = { "q-status": "status", "q-route": "route", "q-sla": "sla", "q-channel": "channel" };
    if (map[id]) UI.q[map[id]] = v; else if (id === "q-open") UI.q.open = e.target.checked; else return;
    render();
  });
  window.addEventListener("hashchange", render);
  R.subscribe(render);
  render();
})();
