/* =========================================================================
   Citizen app
   Screens are plain functions that return HTML strings. Routing uses the
   URL hash (#case, #fix ...), so every screen can be linked in the video.
   ========================================================================= */
(function () {
  "use strict";
  var R = window.RRS, I = window.I18N;
  var app = document.getElementById("app");

  /* ---- Page session (not persisted) ---------------------------------- */
  var session = { signedIn: {}, draft: {}, toast: "", explain: {}, wrongField: null, errors: {}, docs: {} };

  function S() { return R.state; }
  function c() { return R.getCase(S().persona); }
  function t(k) { return I.t(S().lang, k); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function fmt(day, o) { return R.fmt(day, o); }
  function longDate(day) { return fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  function money(n) { return "€" + n.toFixed(2); }
  function office(id) { return R.OFFICES.find(function (o) { return o.id === id; }) || R.OFFICES[0]; }
  function draft() { var d = session.draft[S().persona]; if (!d) d = session.draft[S().persona] = { elig: {}, changed: null, changeText: "", notes: {}, channel: "online", sms: true, email: true }; return d; }
  function isOpen(k) { return k.filed != null && k.status !== "refused" && k.status !== "withdrawn"; }
  function signedIn() { var k = c(); return session.signedIn[k.id] || k.filed != null; }

  function tag(status) {
    var m = R.STATUS[status];
    return '<span class="c-tag' + (m.tag ? " c-tag--" + m.tag : "") + '">' + esc(t("st_" + status)) + "</span>";
  }
  function banner(kind, title, heading, body) {
    return '<div class="c-banner' + (kind ? " c-banner--" + kind : "") + '" role="region" aria-label="' + esc(title) + '"><p class="c-banner__title">' + esc(title) + '</p><div class="c-banner__body">' + (heading ? '<p class="c-banner__heading">' + heading + "</p>" : "") + (body || "") + "</div></div>";
  }
  /* File input that runs the document check as soon as a file is chosen. */
  function docSlot(id, label, hint, expect) {
    var r = session.docs[id];
    return '<div class="c-field"><label class="c-label" for="' + id + '">' + esc(label) + '</label>' + (hint ? '<span class="c-hint">' + esc(hint) + "</span>" : "") +
      '<input class="c-file js-doccheck" type="file" id="' + id + '" data-expect="' + (expect || "any") + '" accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*">' +
      '<div id="' + id + '-result" aria-live="polite">' + (r && r.result ? (r.stale ? '<p class="t-small t-secondary" style="margin-top:8px">Checked: ' + esc(r.result.name) + "</p>" : window.DocCheck.render(r.result)) : "") + "</div></div>";
  }
  function docBlocked(id) { var r = session.docs[id]; return r && r.pending ? "pending" : r && r.result && r.result.status === "error" ? "error" : null; }
  function docName(id) { var r = session.docs[id]; return r && r.result && r.result.status !== "error" ? r.result.name : null; }

  function back(href) { return '<a class="c-back" href="' + href + '">' + esc(t("back")) + "</a>"; }
  function steps(n) {
    var names = [t("step1"), t("step2"), t("step3"), t("step4"), t("step5")];
    return '<ol class="c-steps" aria-label="Progress">' + names.map(function (s, i) {
      return "<li" + (i + 1 === n ? ' aria-current="step"' : i + 1 < n ? ' class="is-done"' : "") + ">" + esc(s) + "</li>";
    }).join("") + "</ol>";
  }
  function go(hash) { if (location.hash === "#" + hash) render(); else location.hash = hash; window.scrollTo(0, 0); }
  function toast(msg) { session.toast = msg; }

  /* ================================================================== */
  /* SCREENS                                                             */
  /* ================================================================== */

  /* ---- Service landing ---------------------------------------------- */
  function scrHome() {
    var k = c();
    var opens = k.expiry - R.RULES.fileWindowBeforeExpiry;
    var inProgress = k.filed != null && !(k.decision && (k.status === "card" || k.status === "refused" || k.status === "withdrawn"));
    var main =
      (inProgress ? banner("", "Important", "You have a renewal in progress", '<p>Reference <span class="t-mono">' + esc(k.ref) + '</span>. ' + tag(k.status) + '</p><p><a href="#case">View your renewal</a></p>') : "") +
      '<h1 class="t-h1--xl">' + esc(t("h_home")) + "</h1>" +
      '<p class="t-lead">Use this service if you are not from the EU, you live in Madrid, and your residence permit is about to expire.</p>' +
      '<div class="c-inset"><p>People often call this "renewing the NIE". <strong>Your NIE number never expires.</strong> What you renew is your <strong>residence permit</strong>, and then your <strong>TIE card</strong>.</p></div>' +
      "<p>You can use it to renew:</p>" +
      '<ul class="c-list"><li>a residence and work permit (employee or self-employed)</li><li>a non-lucrative residence permit</li><li>a family reunification permit</li></ul>' +
      "<h2>What's new</h2>" +
      '<ul class="c-list"><li>We send you a <strong>reminder</strong> about 90 days before your permit expires.</li><li>Your form is <strong>pre-filled</strong> with the information other public offices already hold. You only confirm it.</li><li>Most renewals are decided in <strong>5 working days</strong>. You can follow every step online.</li><li>Your fingerprint appointment is <strong>given to you</strong> with the decision. You don\'t need to look for a "cita".</li></ul>' +
      "<h2>Before you start</h2>" +
      "<p>You can apply from <strong>2 months before</strong> your permit expires" + (k.filed == null ? " (for you, from <strong>" + fmt(Math.max(opens, 0), { day: "numeric", month: "long", year: "numeric" }) + "</strong>)" : "") + ". You can still apply up to 3 months after it expires, but you may get a fine.</p>" +
      "<p>You'll need:</p>" +
      '<ul class="c-list"><li>Cl@ve or a digital certificate to sign in. If you don\'t have one, you can <a href="#help">get help in person</a>.</li><li>A bank card to pay the fee of <strong>' + money(R.RULES.fee) + "</strong> (Modelo 790, code 012).</li><li>About 10 minutes.</li></ul>" +
      '<a class="c-button c-button--start" href="' + (signedIn() ? (k.filed != null ? "#case" : "#check") : "#signin") + '" role="button">' + esc(t("start")) + "</a>" +
      "<h2>Other ways to apply</h2>" +
      '<p>If you can\'t use the online service, a person can help you apply. You can ask for help in Spanish, English, French or Arabic.</p><p><a href="#help">Ways to get help</a></p>' +
      '<details class="c-details"><summary>Using an AI assistant to prepare?</summary><div class="c-details__body"><p>You can. You don\'t need to write a long letter: the form only asks short questions, and we already have most of your information. Never share your Cl@ve PIN with an assistant.</p></div></details>';
    var side =
      '<aside class="c-related" aria-label="Your reminder"><h2>Your reminder</h2>' +
      '<div class="c-phone"><div class="c-phone__notch"></div><p class="c-phone__from">SMS · Residence Renewal · ' + fmt(k.expiry - R.RULES.reminderBeforeExpiry, { day: "numeric", month: "short" }) + '</p><div class="c-phone__sms"><p>Hello ' + esc(k.name.split(" ")[0]) + ', your residence permit expires on ' + fmt(k.expiry, { day: "numeric", month: "short", year: "numeric" }) + ".</p><p>You can renew online from " + fmt(Math.max(opens, 0), { day: "numeric", month: "short" }) + ". We have already filled in your details.</p><p>Ref " + esc(k.ref) + "</p></div></div></aside>" +
      '<aside class="c-related" style="margin-top:var(--space-6)"><h2>Related</h2><ul><li><a href="#help">How we use automation</a></li><li><a href="#help">Your right to appeal</a></li><li><a href="#help">Get help in person</a></li></ul></aside>';
    return '<div class="l-grid"><div>' + main + "</div><div>" + side + "</div></div>";
  }

  /* ---- Sign in ------------------------------------------------------- */
  function scrSignin() {
    var k = c(), d = draft(), assisted = S().assisted;
    var opts = [
      ["clave", "Cl@ve PIN or Cl@ve Permanente", "Use the Cl@ve app on your phone."],
      ["cert", "Digital certificate or DNIe / TIE with chip", "Use a certificate installed on this device."],
      ["help", "I can't sign in online", "We'll show you how to get help from a person."]
    ];
    if (assisted) opts = [opts[2], opts[0], opts[1]];
    var err = session.errors.signin;
    return back("#home") +
      (err ? '<div class="c-error-summary" role="alert"><h2>There is a problem</h2><a href="#m-clave">Select how you want to sign in</a></div>' : "") +
      '<form id="f-signin" novalidate><fieldset class="c-fieldset' + (err ? " c-field--error" : "") + '"><legend class="c-legend c-legend--lg"><h1 style="margin:0">' + esc(t("h_signin")) + "</h1></legend>" +
      (err ? '<span class="c-error-msg">Select how you want to sign in</span>' : "") +
      '<div class="c-radios">' + opts.map(function (o, i) {
        return '<label class="c-choice"><input type="radio" name="method" value="' + o[0] + '" id="m-' + o[0] + '"' + (d.method === o[0] ? " checked" : "") + '><span class="c-choice__label">' + esc(o[1]) + "<small>" + esc(o[2]) + "</small></span></label>";
      }).join("") + "</div></fieldset>" +
      '<button class="c-button" type="submit">' + esc(t("continue")) + "</button></form>" +
      '<p class="t-small t-secondary">Signing in is simulated in this prototype. You will sign in as <strong>' + esc(k.name) + "</strong>.</p>";
  }
  function scrHelpIn() {
    return back("#signin") + "<h1>Get help from a person</h1>" +
      '<p class="t-lead">A person can fill in the application with you. It\'s the same application, the same rules and the same speed.</p>' +
      '<h2>By phone</h2><p>Citizen help line: <strong class="t-mono">900 000 000</strong> (demo number)<br>Monday to Friday, 9:00 to 18:00. Spanish, English, French and Arabic.</p>' +
      '<h2>In person</h2><p>Book an assisted appointment at an immigration office. Bring your passport and your current TIE.</p>' +
      '<div class="c-card c-card--alt"><p class="c-card__title">Madrid immigration office (demo)</p><p>C/ García de Paredes 65, 28010 Madrid<br>Monday to Friday, 9:00 to 14:00</p></div>' +
      '<button class="c-button" type="button" data-act="assisted-request">Ask for an assisted appointment</button>' +
      '<p class="t-small t-secondary">In the demo, you can also continue online as if a helper were filling it in with you.</p>' +
      '<button class="c-button c-button--secondary" type="button" data-act="assisted-continue">Continue with a helper</button>';
  }

  /* ---- Eligibility --------------------------------------------------- */
  function scrCheck() {
    var k = c(), d = draft();
    if (!signedIn()) return redirect("signin");
    if (isOpen(k)) return dupNotice();
    var opens = k.expiry - R.RULES.fileWindowBeforeExpiry;
    if (R.today() < opens) {
      return back("#home") + "<h1>You can't apply yet</h1>" + banner("", "Important", "You can apply from " + longDate(opens), "<p>That's 2 months before your permit expires on " + longDate(k.expiry) + ". We'll send you an SMS that day.</p>") + '<a class="c-button c-button--secondary" href="#home">Back to the service page</a>';
    }
    var q = [
      ["employer", k.permit === "work" ? "Do you still work for the same employer?" : k.permit === "family" ? "Does your family member still sponsor you?" : "Do you still have the same income and health insurance?"],
      ["madrid", "Do you still live in the Madrid region?"],
      ["record", "Have you been convicted of a crime since your last permit?"]
    ];
    var err = session.errors.check;
    return back("#home") + steps(1) +
      (err ? '<div class="c-error-summary" role="alert"><h2>There is a problem</h2><a href="#q-employer-yes">Answer all three questions</a></div>' : "") +
      "<h1>" + esc(t("h_check")) + "</h1>" +
      '<form id="f-check" novalidate>' + q.map(function (x) {
        var v = d.elig[x[0]];
        return '<fieldset class="c-fieldset' + (err && v == null ? " c-field--error" : "") + '"><legend class="c-legend">' + esc(x[1]) + "</legend>" + (err && v == null ? '<span class="c-error-msg">Select yes or no</span>' : "") +
          '<div class="c-radios c-radios--inline"><label class="c-choice"><input type="radio" id="q-' + x[0] + '-yes" name="' + x[0] + '" value="yes"' + (v === true ? " checked" : "") + '><span class="c-choice__label">Yes</span></label><label class="c-choice"><input type="radio" name="' + x[0] + '" value="no"' + (v === false ? " checked" : "") + '><span class="c-choice__label">No</span></label></div></fieldset>';
      }).join("") +
      '<details class="c-details"><summary>What if my situation changed?</summary><div class="c-details__body"><p>You can still apply. An officer will look at what changed, instead of the automatic check. It can take up to 30 days instead of 5 working days.</p></div></details>' +
      '<button class="c-button" type="submit">' + esc(t("continue")) + "</button></form>";
  }

  function dupNotice() {
    return back("#home") + "<h1>You already have a renewal in progress</h1>" +
      banner("", "Important", "Reference <span class=\"t-mono\">" + esc(c().ref) + "</span>", "<p>You can only have one renewal open at a time. This stops duplicate applications.</p>") +
      '<a class="c-button" href="#case">View your renewal</a>';
  }

  /* ---- Pre-filled details ------------------------------------------- */
  function scrApply() {
    var k = c(), d = draft();
    if (!signedIn()) return redirect("signin");
    if (isOpen(k)) return dupNotice();
    var rows = k.data.map(function (r, i) {
      var val = r[1] + (r[0] === "Current permit" ? fmt(k.expiry, { day: "numeric", month: "long", year: "numeric" }) : "");
      var note = d.notes[i];
      return '<div class="c-summary__row"><p class="c-summary__key">' + esc(r[0]) + '</p><p class="c-summary__value">' + esc(val) + "<small>From: " + esc(r[2]) + "</small>" +
        (note ? '<small style="color:var(--color-warning)"><strong>You said this is wrong:</strong> ' + esc(note) + "</small>" : "") +
        (session.wrongField === i ? '<span style="display:block;margin-top:8px"><label class="c-label t-small" for="wrong-' + i + '">What is wrong?</label><input class="c-input" id="wrong-' + i + '" value="' + esc(note || "") + '"><button class="c-button c-button--secondary" type="button" data-act="save-wrong" data-i="' + i + '" style="margin-top:8px">Save</button></span>' : "") +
        '</p><p class="c-summary__action"><button class="c-link" type="button" data-act="wrong" data-i="' + i + '">This is wrong<span class="u-visually-hidden"> (' + esc(r[0]) + ")</span></button></p></div>";
    }).join("");
    var err = session.errors.apply;
    return back("#check") + steps(2) +
      (err ? '<div class="c-error-summary" role="alert"><h2>There is a problem</h2><a href="#ch-no">Tell us if anything has changed</a></div>' : "") +
      "<h1>" + esc(t("h_apply")) + "</h1>" +
      "<p>We got this information from other public offices, so you don't need to upload documents. Check it's right.</p>" +
      '<div class="c-summary">' + rows + "</div>" +
      '<form id="f-apply" novalidate><fieldset class="c-fieldset' + (err ? " c-field--error" : "") + '"><legend class="c-legend c-legend--lg">Has anything changed since your last permit?</legend><span class="c-hint">For example your employer, your address or your family situation.</span>' + (err ? '<span class="c-error-msg">Select yes or no</span>' : "") +
      '<div class="c-radios"><label class="c-choice"><input type="radio" id="ch-no" name="changed" value="no"' + (d.changed === false ? " checked" : "") + '><span class="c-choice__label">No, nothing has changed</span></label>' +
      '<label class="c-choice"><input type="radio" name="changed" value="yes"' + (d.changed === true ? " checked" : "") + '><span class="c-choice__label">Yes, something has changed<small>An officer will look at your application. This can take up to 30 days.</small></span></label></div>' +
      '<div class="c-field" style="margin-top:var(--space-4)"><label class="c-label" for="change-text">If yes, what changed?</label><span class="c-hint">A few words are enough. You can write in any language.</span><textarea class="c-textarea" id="change-text" rows="3">' + esc(d.changeText) + "</textarea></div></fieldset>" +
      '<fieldset class="c-fieldset"><legend class="c-legend">How should we send you updates?</legend><div class="c-checkboxes"><label class="c-choice"><input type="checkbox" id="u-sms"' + (d.sms ? " checked" : "") + '><span class="c-choice__label">SMS to ' + esc(k.phone) + '</span></label><label class="c-choice"><input type="checkbox" id="u-email"' + (d.email ? " checked" : "") + '><span class="c-choice__label">Email to ' + esc(k.email) + '</span></label></div><span class="c-hint" style="margin-top:8px">You\'ll always see every update in "Your renewal" too.</span></fieldset>' +
      '<button class="c-button" type="submit">' + esc(t("continue")) + "</button></form>";
  }

  /* ---- Fee ----------------------------------------------------------- */
  function scrPay() {
    var k = c(), d = draft();
    if (!signedIn()) return redirect("signin");
    if (isOpen(k)) return dupNotice();
    var robert = k.id === "robert";
    var body = robert
      ? "<p>You already paid this fee at your bank on " + fmt(-5, { day: "numeric", month: "long" }) + ".</p>" +
        '<div class="c-summary"><div class="c-summary__row"><p class="c-summary__key">Form</p><p class="c-summary__value">Modelo 790, code 012</p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Amount paid</p><p class="c-summary__value">' + money(R.RULES.fee - 2.1) + '</p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Receipt number</p><p class="c-summary__value t-mono">790012 4418 2210</p><p></p></div></div>' +
        '<button class="c-button" type="button" data-act="pay" data-mode="existing">Use this payment</button>'
      : '<div class="c-summary"><div class="c-summary__row"><p class="c-summary__key">Form</p><p class="c-summary__value">Modelo 790, code 012<small>Renewal of residence permit and TIE</small></p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Amount</p><p class="c-summary__value"><strong>' + money(R.RULES.fee) + "</strong></p><p></p></div></div>" +
        '<div class="c-card c-card--alt"><p class="c-card__title">Pay by card</p><p class="t-small t-secondary">The payment is simulated in this prototype. No card details are asked for.</p><button class="c-button" type="button" data-act="pay" data-mode="card">Pay ' + money(R.RULES.fee) + " (demo)</button></div>" +
        '<details class="c-details"><summary>Other ways to pay</summary><div class="c-details__body"><p>You can also pay at a bank with the printed form. The application waits for the payment to arrive.</p></div></details>';
    return back("#apply") + steps(3) + "<h1>" + esc(t("h_pay")) + "</h1>" + body;
  }

  /* ---- Pre-submit check ---------------------------------------------- */
  // Each item: { status: "ok" | "fix" | "warn" | "info", title, detail, action (html) }
  function precheckItems() {
    var k = c(), d = draft(), out = [];
    out.push({ status: "ok", title: "Identity and current permit", detail: "Match the police foreigners' register." });
    out.push({ status: "ok", title: "Filing date", detail: "You are inside the renewal window (from " + fmt(k.expiry - R.RULES.fileWindowBeforeExpiry) + ")." });
    if (d.paidMode === "existing" && !d.feeTopUp) {
      out.push({ status: "fix", title: "Your fee payment is " + money(2.1) + " short", detail: "The fee changed on 1 November. You paid " + money(R.RULES.fee - 2.1) + " and it is now " + money(R.RULES.fee) + ".",
        action: '<button class="c-button" type="button" data-act="pc-topup" style="margin:8px 0 0">Pay the ' + money(2.1) + " difference (demo)</button>" });
    } else out.push({ status: "ok", title: "Fee paid in full", detail: money(R.RULES.fee) + ", Modelo 790, code 012." });
    var gap = k.data.filter(function (r) { return /gap/i.test(r[1]); })[0];
    if (gap) {
      var up = docName("pc-doc");
      out.push(up ? { status: "info", title: "Document attached: " + up, detail: "Social Security shows a gap in your contributions. An officer will review it with your document." }
                  : { status: "warn", title: "Social Security shows a gap in your contributions", detail: gap[1] + ". An officer will ask you about it. If you add a document now, you may avoid that question.",
                      action: docSlot("pc-doc", "Add a document (optional)", "For example your new work contract or a letter from your employer.", "contract") });
    } else out.push({ status: "ok", title: "Social Security and tax", detail: "No gaps or debts found." });
    if (d.changed && (!d.changeText || d.changeText.trim().length < 5)) {
      out.push({ status: "fix", title: "Tell us what changed", detail: "You said something changed, but didn't say what. A few words are enough.",
        action: '<label class="c-label t-small" for="pc-change" style="margin-top:8px">What changed?</label><textarea class="c-textarea" id="pc-change" rows="2"></textarea><button class="c-button c-button--secondary" type="button" data-act="pc-savechange" style="margin-top:8px">Save</button>' });
    } else if (d.changed) out.push({ status: "info", title: "Change declared", detail: '"' + d.changeText + '". An officer will review it. Target: 30 days.' });
    Object.keys(d.notes).forEach(function (i) { out.push({ status: "info", title: "Correction: " + k.data[i][0], detail: '"' + d.notes[i] + '". An officer will check it with the source office.' }); });
    if (d.elig.record || d.elig.madrid === false || d.elig.employer === false) out.push({ status: "info", title: "Your answers need a person to look", detail: "An officer reviews your application instead of the automatic check. Target: 30 days." });
    if (!d.sms && !d.email) out.push({ status: "warn", title: "No SMS or email updates", detail: "You'll only see updates if you sign in. You can turn them on in the previous step." });
    return out;
  }
  function pcSummary() {
    var items = precheckItems(), fix = items.filter(function (i) { return i.status === "fix"; }).length, rev = items.filter(function (i) { return i.status === "info" || i.status === "warn"; }).length;
    return fix ? fix + " to fix (submitting anyway)" : rev ? "Ready. " + rev + " item" + (rev > 1 ? "s" : "") + " for an officer" : "All clear";
  }
  function scrPrecheck() {
    var k = c(), d = draft();
    if (!signedIn()) return redirect("signin");
    if (isOpen(k)) return dupNotice();
    if (!d.paid) return redirect("pay");
    if (!session.pc) {
      session.pc = "running";
      setTimeout(function () { session.pc = "done"; if (location.hash === "#precheck") render(); }, 1400);
    }
    var head = back("#pay") + steps(4) + "<h1>Check your application before you submit</h1>" +
      '<p class="t-lead">We check your application now, so you can fix problems before you send it, not after.</p>';
    if (session.pc === "running") {
      return head + '<div class="c-card c-card--alt" role="status"><p class="c-card__title">Checking your application…</p><ul class="c-list"><li>Comparing your details with the police foreigners\' register</li><li>Checking your fee payment</li><li>Checking Social Security and tax records</li><li>Reading your answers and corrections</li></ul></div>';
    }
    var items = precheckItems();
    var fix = items.filter(function (i) { return i.status === "fix"; }).length;
    var forOfficer = items.filter(function (i) { return i.status === "info" || i.status === "warn"; }).length;
    var TAG = { ok: ["success", "OK"], fix: ["warning", "Fix before submitting"], warn: ["warning", "Check"], info: ["info", "An officer will review"] };
    var summary = fix ? banner("warning", "Action needed", fix + " thing" + (fix > 1 ? "s" : "") + " to fix before you submit", "<p>Fix it here and your application can go straight through. If you submit without fixing it, we will ask you later and your decision will take longer.</p>")
      : forOfficer ? banner("", "Ready to submit", "Your application is complete", "<p>" + forOfficer + " item" + (forOfficer > 1 ? "s" : "") + " will be looked at by an officer. That's normal and nothing is refused without asking you first.</p>")
      : banner("success", "Ready to submit", "Everything looks right", "<p>If nothing changes, your renewal should be approved within 5 working days.</p>");
    return head + summary +
      '<ol class="c-tasks" style="list-style:none">' + items.map(function (i) {
        return '<li style="display:block"><div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap;align-items:baseline"><strong>' + esc(i.title) + '</strong><span class="c-tag c-tag--' + TAG[i.status][0] + '">' + TAG[i.status][1] + '</span></div><p class="t-small t-secondary" style="margin:4px 0 0">' + esc(i.detail) + "</p>" + (i.action || "") + "</li>";
      }).join("") + "</ol>" +
      '<div class="c-button-group">' + (fix ? '<button class="c-button c-button--secondary" type="button" data-act="pc-continue">Submit without fixing</button>' : '<button class="c-button" type="button" data-act="pc-continue">' + esc(t("continue")) + "</button>") + '<button class="c-link" type="button" data-act="pc-rerun">Run the check again</button></div>' +
      '<details class="c-details"><summary>How this check works</summary><div class="c-details__body"><p>It compares your application with the records other public offices already hold, and reads any document you add. It is automated and uses AI to read documents.</p><p>It only helps you avoid mistakes. It doesn\'t decide your application, and it can\'t refuse you. Nothing is sent until you press Submit.</p></div></details>';
  }

  /* ---- Review and submit -------------------------------------------- */
  function scrReview() {
    var k = c(), d = draft();
    if (!signedIn()) return redirect("signin");
    if (isOpen(k)) return dupNotice();
    if (!d.paid) return redirect("pay");
    if (!d.checked) return redirect("precheck");
    var row = function (key, val, href) { return '<div class="c-summary__row"><p class="c-summary__key">' + key + '</p><p class="c-summary__value">' + val + '</p><p class="c-summary__action"><a href="' + href + '">Change<span class="u-visually-hidden"> ' + key + "</span></a></p></div>"; };
    var err = session.errors.review;
    return back("#precheck") + steps(5) +
      (err ? '<div class="c-error-summary" role="alert"><h2>There is a problem</h2><a href="#declare">Confirm the declaration to submit</a></div>' : "") +
      "<h1>" + esc(t("h_review")) + "</h1>" +
      '<div class="c-summary">' +
      row("Applicant", esc(k.name) + '<small class="t-mono">NIE ' + esc(k.nie) + "</small>", "#signin") +
      row("Permit", esc(k.permitLabel), "#check") +
      row("Anything changed?", d.changed ? "Yes: " + esc(d.changeText || "(no details)") : "No", "#apply") +
      row("Corrections", Object.keys(d.notes).length ? Object.keys(d.notes).map(function (i) { return esc(k.data[i][0]) + ": " + esc(d.notes[i]); }).join("<br>") : "None", "#apply") +
      row("Updates by", [d.sms ? "SMS" : "", d.email ? "Email" : "", "Online"].filter(Boolean).join(", "), "#apply") +
      row("Fee", d.paidMode === "existing" ? money(R.RULES.fee - 2.1) + " paid at your bank" + (d.feeTopUp ? " + " + money(2.1) + " difference paid online" : "") : money(R.RULES.fee) + " paid by card", "#pay") +
      row("Pre-check", pcSummary(), "#precheck") +
      "</div>" +
      "<h2>Declaration</h2>" +
      '<form id="f-review" novalidate><div class="c-field' + (err ? " c-field--error" : "") + '">' + (err ? '<span class="c-error-msg">Confirm the declaration to submit</span>' : "") + '<label class="c-choice"><input type="checkbox" id="declare"><span class="c-choice__label">The information is true. I agree that the immigration office can check it with other public offices (Ley 39/2015, art. 28).<small>You can object to this and upload documents yourself instead. <a href="#help">How to object</a></small></span></label></div>' +
      '<button class="c-button" type="submit">' + esc(t("submit")) + "</button></form>";
  }

  function scrDone() {
    var k = c();
    var human = k.route === "human";
    return '<div class="c-panel"><h1>' + esc(t("h_done")) + "</h1><p>Your reference number</p><span class=\"c-panel__ref\">" + esc(k.ref) + "</span></div>" +
      "<p>We've sent a confirmation by SMS and email.</p>" +
      "<h2>What happens next</h2>" +
      (k.status === "fix" ? banner("warning", "Action needed", "One thing to fix", "<p>Our automatic check found a problem with your fee. Your clock is paused until you fix it.</p><p><a href=\"#fix\">Fix it now</a></p>") : "") +
      '<ol class="c-list"><li>We check your information with other public offices.</li><li>' + (human ? "An officer looks at your application. We aim to decide within <strong>30 days</strong>." : "If everything matches, your renewal is approved within <strong>5 working days</strong>.") + "</li><li>You get your fingerprint appointment with the decision. You don't need to book it.</li><li>Your TIE card is ready about 2 weeks after your fingerprints.</li></ol>" +
      '<div class="c-inset"><p>While you wait, your current permit stays valid, even if it expires before we decide.</p></div>' +
      '<a class="c-button" href="#case">Follow your renewal</a>';
  }

  /* ---- Case dashboard ------------------------------------------------ */
  function clock(k) {
    var n = R.dayCount(k), lim = R.RULES.legalLimitDays;
    var target = k.route === "human" ? R.RULES.humanTargetDays : R.RULES.autoTargetDays;
    var paused = R.isPaused(k);
    var decided = !!k.decision;
    return '<div class="c-clock' + (paused ? " c-clock--paused" : "") + '"><div class="c-clock__row"><span><span class="c-clock__big">' + esc(t("day")) + " " + n + "</span> " + esc(t("of")) + " " + lim + "</span><span>" +
      (decided ? "Decided on day " + n : paused ? "<strong>" + esc(t("paused")) + "</strong> while you fix something" : k.route === "human" ? "We aim to decide by day 30" : "We aim to decide within 5 working days") + "</span></div>" +
      '<div class="c-clock__bar" role="img" aria-label="Day ' + n + ' of the 90-day legal limit"><span class="c-clock__fill" style="width:' + Math.min(100, n / lim * 100) + '%"></span><span class="c-clock__target" style="left:' + (target / lim * 100) + '%"></span></div>' +
      '<div class="c-clock__row t-secondary"><span>Green line: our target</span><span>Day 90: legal limit. After that, your renewal counts as granted.</span></div></div>';
  }

  function stages(k) {
    var s = k.status, dec = k.decision;
    var list = [
      ["Application filed", k.filed != null ? fmt(k.filed) : ""],
      ["Checking your information", s === "fix" ? "Paused: one thing to fix" : s === "response" ? "Waiting for your answer" : ""],
      ["Decision", dec ? (dec.type === "refused" ? "Refused " : dec.type === "withdrawn" ? "Withdrawn " : "Granted ") + fmt(dec.day) : ""],
      ["Fingerprint appointment", k.appt ? fmt(k.appt.day) + ", " + k.appt.time : ""],
      ["TIE card ready", s === "card" ? "Ready to collect" : k.appt ? "About " + fmt(k.appt.day + R.RULES.cardAfterApptDays) : ""]
    ];
    var cur = k.filed == null ? 0 : !dec ? 1 : dec.type !== "granted" && dec.type !== "silence" ? 2 : s === "card" ? 5 : R.today() > k.appt.day ? 4 : 3;
    return '<ol class="c-timeline">' + list.map(function (x, i) {
      var cls = i < cur ? "is-done" : i === cur ? (i === 1 && (s === "fix" || s === "response") ? "is-paused" : i === 2 && dec && (dec.type === "refused" || dec.type === "withdrawn") ? "is-error" : "is-current") : "";
      if (cur === 5) cls = "is-done";
      return '<li class="c-timeline__item ' + cls + '"><span class="c-timeline__dot" aria-hidden="true"></span><p class="c-timeline__title">' + esc(x[0]) + '</p><p class="c-timeline__meta">' + esc(x[1]) + "</p></li>";
    }).join("") + "</ol>";
  }

  function caseBanner(k) {
    var s = k.status;
    if (s === "fix") return banner("warning", "Action needed", "One thing to fix by " + fmt(k.fix.deadline, { day: "numeric", month: "long" }), "<p>" + esc(k.fix.what) + ". Your clock is paused until you fix it.</p><p><a href=\"#fix\">Fix it now</a></p>");
    if (s === "response") { var f = k.flags.find(function (x) { return x.officer === "confirmed" && !x.response; }); return banner("warning", "Action needed", "An officer needs your answer by " + fmt(f.deadline, { day: "numeric", month: "long" }), "<p>" + esc(f.ground) + ". Nothing is refused before you answer.</p><p><a href=\"#respond\">Answer now</a></p>"); }
    if (s === "granted" || s === "silence" || s === "appt") {
      if (k.decision && k.decision.type === "silence" && s !== "appt") return banner("success", "Decision", "Your renewal is granted by administrative silence", "<p>We didn't decide within 90 days, so the law treats it as granted.</p>");
      if (s === "appt") return banner("success", "Decision", "Your renewal is granted", "<p>Your fingerprint appointment is on <strong>" + longDate(k.appt.day) + ", " + esc(k.appt.time) + "</strong> at " + esc(office(k.appt.office).name) + ".</p><p><a href=\"#appointment\">See your appointment</a></p>");
    }
    if (s === "card") return banner("success", "Ready", "Your TIE card is ready to collect", "<p><a href=\"#card\">Where and when to collect it</a></p>");
    if (s === "refused") return banner("error", "Decision", "Your renewal was refused", "<p>You can appeal. <a href=\"#decision\">Read the reasons and how to appeal</a></p>");
    if (s === "withdrawn") return banner("error", "Closed", "Your application was closed", "<p>The missing item wasn't fixed in time. You can apply again.</p>");
    if (s === "review" && k.flags.some(function (f) { return f.response && f.officer === "confirmed"; })) return banner("", "Important", "We received your answer", "<p>An officer will read it and decide. Nothing is refused before an officer reads your answer.</p>");
    return "";
  }

  function scrCase() {
    var k = c();
    if (k.filed == null) {
      return "<h1>" + esc(t("h_case")) + "</h1>" + banner("", "Important", "You haven't applied yet", "<p>Your permit expires on " + longDate(k.expiry) + ".</p>") + '<a class="c-button" href="' + (signedIn() ? "#check" : "#signin") + '">Apply now</a>';
    }
    var unread = k.messages.filter(function (m) { return !k.read[m.id]; }).length;
    var tasks = [];
    if (k.status === "fix") tasks.push(['<a href="#fix">Fix: ' + esc(k.fix.what) + "</a>", '<span class="c-tag c-tag--warning">To do</span>']);
    if (k.status === "response") tasks.push(['<a href="#respond">Answer the officer\'s question</a>', '<span class="c-tag c-tag--warning">To do</span>']);
    if (k.status === "appt") tasks.push(['<a href="#appointment">Go to your fingerprint appointment</a>', '<span class="c-tag c-tag--info">' + fmt(k.appt.day, { day: "numeric", month: "short" }) + "</span>"]);
    if (k.status === "card") tasks.push(['<a href="#card">Collect your TIE card</a>', '<span class="c-tag c-tag--success">Ready</span>']);
    if (k.status === "refused" && !k.appeal) tasks.push(['<a href="#decision">Read the decision and appeal</a>', '<span class="c-tag c-tag--grey">Optional</span>']);
    var main =
      caseBanner(k) +
      '<span class="t-caption">Reference <span class="t-mono">' + esc(k.ref) + "</span></span>" +
      "<h1>" + esc(t("h_case")) + "</h1>" +
      '<p>Status: ' + tag(k.status) + "</p>" +
      (k.status !== "card" && k.status !== "refused" && k.status !== "withdrawn" ? clock(k) : "") +
      (tasks.length ? '<h2 class="t-h3">What you need to do</h2><ul class="c-tasks">' + tasks.map(function (x) { return "<li><span>" + x[0] + "</span>" + x[1] + "</li>"; }).join("") + "</ul>" : "") +
      '<h2 class="t-h3">Progress</h2>' + stages(k) +
      '<h2 class="t-h3">Latest messages' + (unread ? ' <span class="c-tag c-tag--info">' + unread + " new</span>" : "") + "</h2>" +
      k.messages.slice(0, 3).map(msgRow).join("") +
      '<p style="margin-top:var(--space-4)"><a href="#messages">All messages (' + k.messages.length + ")</a></p>" +
      '<div class="c-inset"><p>Your current permit stays valid while we decide, even after ' + fmt(k.expiry) + ".</p></div>";
    var side = '<aside class="c-related"><h2>Your application</h2><ul><li><strong>' + esc(k.name) + '</strong></li><li class="t-mono">NIE ' + esc(k.nie) + "</li><li>" + esc(k.permitLabel) + "</li><li>Filed " + fmt(k.filed) + "</li><li>" + (k.route === "human" ? "Checked by an officer" : "Checked automatically") + '</li></ul><h2>Need help?</h2><ul><li><a href="#helpin">Talk to a person</a></li><li><a href="#help">How decisions are made</a></li><li><a href="#help">Complain about a delay</a></li></ul></aside>';
    return '<div class="l-grid"><div>' + main + "</div><div>" + side + "</div></div>";
  }

  function msgRow(m) {
    var k = c();
    return '<div class="c-message' + (k.read[m.id] ? "" : " is-unread") + '"><span class="c-message__date">' + fmt(m.day, { day: "numeric", month: "short" }) + '</span><div><p class="c-message__title">' + esc(m.title) + '</p><p class="c-message__body">' + esc(m.body) + "</p></div></div>";
  }

  /* ---- Fix-it -------------------------------------------------------- */
  function scrFix() {
    var k = c();
    if (!k.fix) return redirect("case");
    if (k.fix.done) {
      return back("#case") + "<h1>Fixed</h1>" + banner("success", "Success", "Thank you. Nothing is missing now.", "<p>Your clock restarted on " + fmt(k.fix.doneDay) + ". We'll send you the decision.</p>") + '<a class="c-button" href="#case">Back to your renewal</a>';
    }
    var left = k.fix.deadline - R.today();
    return back("#case") + '<span class="t-caption">Reference <span class="t-mono">' + esc(k.ref) + "</span></span><h1>" + esc(t("h_fix")) + "</h1>" +
      '<div class="c-flag"><div class="c-flag__head"><p class="c-flag__title">' + esc(k.fix.what) + '</p><span class="c-tag c-tag--warning">' + left + " days left</span></div>" +
      "<dl><dt>Why it matters</dt><dd>" + esc(k.fix.why) + "</dd><dt>Fix by</dt><dd>" + longDate(k.fix.deadline) + "</dd><dt>Your clock</dt><dd>Paused. The days you take to fix this don't count against us.</dd></dl>" +
      '<button class="c-link" type="button" data-act="explain" data-k="fix">' + (session.explain.fix ? "Hide plain explanation" : "Explain this in plain words") + "</button>" +
      (session.explain.fix ? '<div class="c-inset" style="margin-top:var(--space-3)"><p>' + (k.id === "robert" ? "The price changed on 1 November. You paid the old price, so €2.10 is missing. Pay the €2.10 and you're done. You don't need to send anything else." : "We need one thing from you before we can continue. Do it before the date above.") + "</p></div>" : "") +
      "</div>" +
      (k.fix.amount ? '<h2 class="t-h3">Pay the difference</h2><p>The form is already filled in for you: Modelo 790, code 012, complementary payment.</p><button class="c-button" type="button" data-act="pay-fix">Pay ' + money(k.fix.amount) + " now (demo)</button>"
                    : '<h2 class="t-h3">Upload the document</h2>' + docSlot("fix-file", "Upload a clear scan or photo", "", "passport") + '<button class="c-button" type="button" data-act="pay-fix">Send</button>') +
      '<details class="c-details"><summary>What happens if I don\'t fix it in time?</summary><div class="c-details__body"><p>An officer reviews your file. Your application is only closed if an officer signs it. It is never closed automatically.</p></div></details>';
  }

  /* ---- Respond to a flag -------------------------------------------- */
  function scrRespond() {
    var k = c();
    var open = k.flags.filter(function (f) { return f.officer === "confirmed"; });
    if (!open.length) return redirect("case");
    var err = session.errors.respond;
    return back("#case") + '<span class="t-caption">Reference <span class="t-mono">' + esc(k.ref) + "</span></span><h1>" + esc(t("h_respond")) + "</h1>" +
      '<div class="c-warning"><span class="c-warning__icon" aria-hidden="true">!</span><span>A person will decide, not a computer. Nothing is refused before you answer.</span></div>' +
      open.map(function (f) {
        if (f.response) {
          return '<div class="c-flag"><div class="c-flag__head"><p class="c-flag__title">' + esc(f.ground) + '</p><span class="c-tag c-tag--success">Answered ' + fmt(f.responseDay, { day: "numeric", month: "short" }) + '</span></div><dl><dt>Your answer</dt><dd>' + esc(f.response) + "</dd>" + (f.responseFile ? "<dt>Attached</dt><dd>" + esc(f.responseFile) + "</dd>" : "") + "</dl></div>";
        }
        return '<div class="c-flag"><div class="c-flag__head"><p class="c-flag__title">' + esc(f.ground) + '</p><span class="c-tag c-tag--warning">Answer by ' + fmt(f.deadline, { day: "numeric", month: "short" }) + "</span></div>" +
          "<dl><dt>What we found</dt><dd>" + esc(f.found) + "</dd><dt>Rule</dt><dd>" + esc(f.rule) + "</dd><dt>Evidence</dt><dd>" + esc(f.evidence) + "</dd><dt>Officer's note</dt><dd>" + esc(f.officerReason) + "</dd></dl>" +
          '<button class="c-link" type="button" data-act="explain" data-k="' + f.id + '">' + (session.explain[f.id] ? "Hide plain explanation" : "Explain this in plain words") + "</button>" +
          (session.explain[f.id] ? '<div class="c-inset" style="margin-top:var(--space-3)"><p>Social Security shows no work for you between June and August. Tell us why, for example if you changed jobs, were on leave, or worked abroad. If you have a document, add it.</p></div>' : "") +
          '<form class="f-respond" data-f="' + f.id + '" novalidate style="margin-top:var(--space-5)"><div class="c-field' + (err ? " c-field--error" : "") + '"><label class="c-label" for="resp-' + f.id + '">Your answer</label><span class="c-hint">Explain in your own words. You can write in any language. Short is fine.</span>' + (err ? '<span class="c-error-msg">Write your answer</span>' : "") + '<textarea class="c-textarea" id="resp-' + f.id + '"></textarea></div>' +
          docSlot("file-" + f.id, "Add a document (optional)", "For example a work contract or a letter from your employer.", "contract") +
          '<button class="c-button" type="submit">' + esc(t("saveSend")) + "</button></form></div>";
      }).join("") +
      '<details class="c-details"><summary>What if I don\'t answer?</summary><div class="c-details__body"><p>After the deadline, an officer decides with the information they have. You can still appeal any decision.</p></div></details>';
  }

  /* ---- Appointment --------------------------------------------------- */
  function scrAppt() {
    var k = c();
    if (!k.appt) return redirect("case");
    var o = office(k.appt.office);
    var slots = [[k.appt.day + 2, "09:40", R.OFFICES[1].id], [k.appt.day + 3, "12:10", R.OFFICES[2].id], [k.appt.day + 6, "10:00", k.appt.office]];
    var past = R.today() > k.appt.day;
    return back("#case") + "<h1>" + esc(t("h_appt")) + "</h1>" +
      (past ? banner("success", "Done", "Fingerprints taken", "<p>Your card will be ready around " + longDate(k.appt.day + R.RULES.cardAfterApptDays) + ".</p>") : "") +
      '<p class="t-lead">We booked it for you with your decision. You don\'t need to look for a "cita".</p>' +
      '<div class="c-summary"><div class="c-summary__row"><p class="c-summary__key">Date</p><p class="c-summary__value"><strong>' + longDate(k.appt.day) + '</strong></p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Time</p><p class="c-summary__value"><strong>' + esc(k.appt.time) + '</strong></p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Place</p><p class="c-summary__value">' + esc(o.name) + "<small>" + esc(o.addr) + '</small></p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Reference</p><p class="c-summary__value t-mono">' + esc(k.ref) + "</p><p></p></div></div>" +
      "<h2>What to bring</h2><ul class=\"c-list\"><li>Your passport</li><li>Your current TIE card (we keep it)</li><li>One recent passport photo</li></ul>" +
      '<div class="c-inset"><p>You already paid the fee. You don\'t need to bring the receipt or any printed forms.</p></div>' +
      (past ? "" : k.appt.resched ? '<p class="t-secondary">You already changed this appointment once. To change it again, <a href="#helpin">talk to a person</a>.</p>' :
        "<h2>Can't go?</h2><p>You can change it once online.</p>" +
        '<form id="f-resched" novalidate><fieldset class="c-fieldset"><legend class="c-legend">Choose another time</legend><div class="c-radios">' + slots.map(function (s, i) {
          return '<label class="c-choice"><input type="radio" name="slot" value="' + i + '"' + (i === 0 ? " checked" : "") + '><span class="c-choice__label">' + longDate(s[0]) + ", " + s[1] + "<small>" + esc(office(s[2]).name) + "</small></span></label>";
        }).join("") + '</div></fieldset><button class="c-button c-button--secondary" type="submit">Change appointment</button></form>');
  }

  /* ---- Card ready ---------------------------------------------------- */
  function scrCard() {
    var k = c();
    if (k.status !== "card") return redirect("case");
    var o = office(k.appt.office);
    return back("#case") + "<h1>" + esc(t("h_card")) + "</h1>" +
      banner("success", "Ready", "Collect it at " + esc(o.name), "<p>" + esc(o.addr) + "<br>Monday to Friday, 9:00 to 14:00. No appointment needed.</p>") +
      "<h2>What to bring</h2><ul class=\"c-list\"><li>Your passport</li><li>Your appointment reference <span class=\"t-mono\">" + esc(k.ref) + "</span></li></ul>" +
      "<p>Your new TIE card is valid for <strong>4 years</strong>.</p>" +
      '<div class="c-card c-card--alt"><p class="c-card__title">Coming soon (proposed)</p><p>We\'ve proposed delivering the card by registered post or to a secure locker, so you don\'t need to go back. This needs a change to the regulation (RD 1155/2024, art. 209).</p></div>';
  }

  /* ---- Decision / appeal -------------------------------------------- */
  function scrDecision() {
    var k = c();
    if (!k.decision) return redirect("case");
    if (k.decision.type !== "refused") {
      return back("#case") + "<h1>" + esc(t("h_decision")) + "</h1>" + banner("success", "Decision", k.decision.type === "silence" ? "Granted by administrative silence" : "Your renewal is granted", "<p>Decided on " + longDate(k.decision.day) + ".</p>") +
        '<div class="c-summary"><div class="c-summary__row"><p class="c-summary__key">Permit</p><p class="c-summary__value">' + esc(k.permitLabel) + '</p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Valid for</p><p class="c-summary__value">4 years</p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Decided by</p><p class="c-summary__value">' + (k.decision.by === "Rules engine" ? "Automatic check (all requirements met)<small>A random sample of automatic decisions is checked by officers afterwards.</small>" : esc(k.decision.by)) + "</p><p></p></div></div>" +
        '<a class="c-button" href="#appointment">See your fingerprint appointment</a>';
    }
    var confirmed = k.flags.filter(function (f) { return f.officer === "confirmed"; });
    if (k.appeal) {
      return back("#case") + "<h1>Your appeal</h1>" + banner("", "Important", "Appeal received on " + longDate(k.appeal.day), "<p>A different official will review your case and answer within 1 month.</p>") +
        '<div class="c-summary"><div class="c-summary__row"><p class="c-summary__key">Type</p><p class="c-summary__value">Recurso de reposición</p><p></p></div><div class="c-summary__row"><p class="c-summary__key">Your reasons</p><p class="c-summary__value">' + esc(k.appeal.text) + "</p><p></p></div></div>";
    }
    var err = session.errors.appeal;
    return back("#case") + "<h1>" + esc(t("h_decision")) + "</h1>" +
      banner("error", "Decision", "Your renewal was refused", "<p>Decided by " + esc(k.decision.by) + " on " + longDate(k.decision.day) + ".</p>") +
      "<h2>Why</h2>" + confirmed.map(function (f) { return '<div class="c-flag"><p class="c-flag__title">' + esc(f.ground) + "</p><dl><dt>What we found</dt><dd>" + esc(f.found) + "</dd><dt>Rule</dt><dd>" + esc(f.rule) + "</dd><dt>Your answer</dt><dd>" + esc(f.response || "No answer received") + "</dd></dl></div>"; }).join("") +
      '<div class="c-inset"><p><strong>Officer\'s reason:</strong> ' + esc(k.decision.reason) + "</p></div>" +
      "<h2>If you disagree</h2><p>You have two options. You don't need a lawyer for option 1.</p>" +
      '<div class="c-card"><p class="c-card__title">Option 1: ask for a review (recurso de reposición)</p><p>A different official reviews the decision. Do it within <strong>1 month</strong>, by ' + longDate(k.decision.day + 30) + ".</p>" +
      '<form id="f-appeal" novalidate><div class="c-field' + (err ? " c-field--error" : "") + '"><label class="c-label" for="appeal-text">Why do you disagree?</label><span class="c-hint">Explain in your own words. You can write in any language.</span>' + (err ? '<span class="c-error-msg">Write why you disagree</span>' : "") + '<textarea class="c-textarea" id="appeal-text"></textarea></div>' + docSlot("appeal-file", "Add documents (optional)", "", "any") + '<button class="c-button" type="submit">Send appeal</button></form></div>' +
      '<div class="c-card"><p class="c-card__title">Option 2: go to court</p><p>Go to the administrative courts (contencioso-administrativo) within <strong>2 months</strong>. You will usually need a lawyer. If you can\'t afford one, you can ask for free legal aid.</p></div>';
  }

  /* ---- Messages ------------------------------------------------------ */
  function scrMessages() {
    var k = c();
    var html = back("#case") + "<h1>" + esc(t("h_messages")) + "</h1>" + (k.messages.length ? k.messages.map(msgRow).join("") : "<p>No messages yet.</p>");
    setTimeout(function () { R.markRead(k.id); }, 50);
    return html;
  }

  /* ---- Help and rights ---------------------------------------------- */
  function scrHelp() {
    return "<h1>" + esc(t("h_help")) + "</h1>" +
      (S().lang !== "en" ? '<div class="c-inset"><p>This page is in English in the prototype. The live service would translate it fully.</p></div>' : "") +
      '<h2>How we use automation</h2><div class="c-warning"><span class="c-warning__icon" aria-hidden="true">!</span><span>Automation can approve your renewal. Only a person can refuse it.</span></div>' +
      '<ul class="c-list"><li>If every check matches, a computer approves your renewal. These decisions follow fixed rules (Ley 40/2015, art. 41).</li><li>If something doesn\'t match, it goes to an officer. The officer sees each issue separately and decides on each one.</li><li>The system doesn\'t give you a risk score. It never uses your nationality.</li><li>Officers check a random sample of automatic approvals afterwards. If they find something, we tell you and you can answer. Nothing is cancelled without telling you first.</li></ul>' +
      "<h2>Where your information comes from</h2><p>We ask other public offices for your information so you don't have to upload it: the police foreigners' register, Social Security, the Tax Agency, the municipal register and the criminal records registry.</p>" +
      '<details class="c-details"><summary>How to object to this</summary><div class="c-details__body"><p>You have the right to object (Ley 39/2015, art. 28). If you do, you upload the documents yourself instead. Tell us when you apply, or talk to a person.</p></div></details>' +
      "<h2>Your deadlines and ours</h2>" +
      '<div class="c-table-wrap"><table class="c-table"><thead><tr><th scope="col">What</th><th scope="col">How long</th></tr></thead><tbody>' +
      "<tr><td>Apply</td><td>From 2 months before your permit expires, up to 3 months after (with a possible fine)</td></tr><tr><td>Our decision, automatic check</td><td>Target: 5 working days</td></tr><tr><td>Our decision, officer review</td><td>Target: 30 days</td></tr><tr><td>Legal limit</td><td>90 days. After that your renewal counts as granted</td></tr><tr><td>Fix something missing</td><td>10 days. Your clock pauses</td></tr><tr><td>Answer an officer's question</td><td>10 to 15 days</td></tr><tr><td>Appeal (reposición)</td><td>1 month</td></tr><tr><td>Go to court</td><td>2 months</td></tr></tbody></table></div>" +
      "<h2>Complain about a delay</h2><p>If we pass our target, you can complain online or at any office. We publish every month how many decisions we make on time.</p>" +
      '<h2 id="contact">Talk to a person</h2><p>Phone: <strong class="t-mono">900 000 000</strong> (demo number), Monday to Friday, 9:00 to 18:00.<br>In person: Madrid immigration office, C/ García de Paredes 65 (demo).</p><p>Help in Spanish, English, French and Arabic. You can come with someone you trust.</p>' +
      "<h2>Accessibility</h2><p>Turn on <strong>assisted mode</strong> for bigger text and simpler steps. The service works with screen readers and keyboards.</p>";
  }

  function redirect(to) { setTimeout(function () { go(to); }, 0); return ""; }

  /* ================================================================== */
  /* SHELL                                                              */
  /* ================================================================== */
  var ROUTES = { home: scrHome, signin: scrSignin, helpin: scrHelpIn, check: scrCheck, apply: scrApply, pay: scrPay, precheck: scrPrecheck, review: scrReview, done: scrDone, "case": scrCase, fix: scrFix, respond: scrRespond, appointment: scrAppt, card: scrCard, decision: scrDecision, messages: scrMessages, help: scrHelp };

  function header(route) {
    var k = c(), lang = S().lang;
    var nav = [["home", t("navHome")], ["case", t("navCase")], ["messages", t("navMessages")], ["help", t("navHelp")]];
    var unread = k.messages.filter(function (m) { return !k.read[m.id]; }).length;
    return '<a class="u-visually-hidden" href="#main">Skip to main content</a>' +
      '<div class="c-proto"><div class="l-width"><strong>Prototype</strong>Student project. Not an official government service. All people and data are fictional.</div></div>' +
      '<header class="c-header"><div class="l-width c-header__inner">' +
      '<a class="c-header__brand" href="#home"><svg class="c-header__mark" viewBox="0 0 36 36" aria-hidden="true"><rect x="3" y="7" width="30" height="22" rx="3" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="12" cy="18" r="4" fill="#fff"/><path d="M19 15h9M19 20h7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg><span>' + esc(t("serviceShort")) + "<small>Madrid · Residence and TIE</small></span></a>" +
      '<nav class="c-header__nav" aria-label="Main">' + nav.map(function (n) {
        return '<a href="#' + n[0] + '"' + (route === n[0] ? ' aria-current="page"' : "") + ">" + esc(n[1]) + (n[0] === "messages" && unread ? " (" + unread + ")" : "") + "</a>";
      }).join("") +
      '<label class="u-visually-hidden" for="lang">Language</label><select class="c-header__lang" id="lang">' + I.langs.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === lang ? " selected" : "") + ">" + l[1] + "</option>"; }).join("") + "</select></nav></div></header>" +
      '<div class="c-servicebar"><div class="l-width c-servicebar__inner"><span class="c-servicebar__name">' + esc(t("service")) + "</span>" +
      '<span class="c-servicebar__user">' + (signedIn() ? esc(t("signedInAs")) + " <strong>" + esc(k.name) + "</strong>" : "") + ' &nbsp; <a href="#helpin">' + esc(t("getHelp")) + "</a></span></div></div>";
  }

  function footer() {
    return '<footer class="c-footer"><div class="l-width"><ul class="c-footer__links"><li><a href="#help">' + esc(t("navHelp")) + '</a></li><li><a href="#help">Accessibility</a></li><li><a href="#help">Privacy</a></li><li><a href="design-system/index.html">Design system</a></li></ul><p>' + esc(t("footer")) + "</p></div></footer>";
  }

  function demobar() {
    var k = c(), st = S();
    var officer = "";
    if (k.id === "lucia" && k.filed != null && !k.decision) {
      var f = k.flags[0];
      if (!f.officer) officer = '<button type="button" data-demo="off-ask">Officer: ask Lucía</button>';
      else if (f.officer === "confirmed" && f.response) officer = '<button type="button" data-demo="off-grant">Officer: clear and grant</button><button type="button" data-demo="off-refuse">Officer: refuse</button>';
    }
    if (k.route === "human" && k.id !== "lucia" && k.filed != null && !k.decision && k.status === "review") officer = '<button type="button" data-demo="off-grant">Officer: grant</button>';
    return '<div class="c-demobar" role="region" aria-label="Prototype controls"><div class="c-demobar__inner">' +
      '<span class="c-demobar__label">Demo</span>' +
      '<span class="c-demobar__group"><label for="demo-persona">Applicant</label><select id="demo-persona">' + ["amina", "robert", "lucia"].map(function (id) { var p = R.getCase(id); return '<option value="' + id + '"' + (st.persona === id ? " selected" : "") + ">" + esc(p.name.split(" ")[0]) + " · " + esc(R.STATUS[p.status].label) + "</option>"; }).join("") + "</select></span>" +
      '<span class="c-demobar__group"><span class="c-demobar__day">' + R.fmt(st.day, { weekday: "short", day: "numeric", month: "short" }, "en") + '</span><button type="button" data-demo="d1">+1 day</button><button type="button" data-demo="d7">+7 days</button></span>' +
      officer +
      '<button type="button" data-demo="assisted" aria-pressed="' + (st.assisted ? "true" : "false") + '">Assisted mode</button>' +
      '<button type="button" data-demo="reset">Reset demo</button>' +
      "</div></div>";
  }

  function render() {
    var route = (location.hash || "#home").slice(1) || "home";
    if (!ROUTES[route]) route = "home";
    var lang = S().lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = I.dir(lang);
    document.documentElement.classList.toggle("is-assisted", !!S().assisted);
    var body = ROUTES[route]();
    app.innerHTML = header(route) + '<main id="main" class="l-width l-main" tabindex="-1">' + body + "</main>" + footer() + demobar() +
      (session.toast ? '<div class="c-toast" role="status">' + esc(session.toast) + "</div>" : "");
    var bar = app.querySelector(".c-demobar");
    if (bar) document.body.style.paddingBottom = (bar.offsetHeight + 8) + "px";
    document.title = (ROUTES[route] === scrHome ? "" : (app.querySelector("h1") ? app.querySelector("h1").textContent + " · " : "")) + "Residence Renewal";
    if (session.toast) { var tt = session.toast; setTimeout(function () { if (session.toast === tt) { session.toast = ""; var el = app.querySelector(".c-toast"); if (el) el.remove(); } }, 2600); }
    session.errors = {};
  }

  /* ================================================================== */
  /* EVENTS                                                             */
  /* ================================================================== */
  app.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, k = c(), d = draft();
    if (f.id === "f-signin") {
      var m = f.querySelector("input[name=method]:checked");
      if (!m) { session.errors.signin = true; return render(); }
      d.method = m.value;
      if (m.value === "help") return go("helpin");
      session.signedIn[k.id] = true; toast("Signed in as " + k.name);
      return go(k.filed != null && !k.decision ? "case" : "check");
    }
    if (f.id === "f-check") {
      ["employer", "madrid", "record"].forEach(function (q) { var v = f.querySelector("input[name=" + q + "]:checked"); d.elig[q] = v ? v.value === "yes" : null; });
      if (d.elig.employer == null || d.elig.madrid == null || d.elig.record == null) { session.errors.check = true; return render(); }
      return go("apply");
    }
    if (f.id === "f-apply") {
      var ch = f.querySelector("input[name=changed]:checked");
      d.changeText = f.querySelector("#change-text").value; d.sms = f.querySelector("#u-sms").checked; d.email = f.querySelector("#u-email").checked;
      if (!ch) { session.errors.apply = true; return render(); }
      d.changed = ch.value === "yes";
      return go("pay");
    }
    if (f.id === "f-review") {
      if (!f.querySelector("#declare").checked) { session.errors.review = true; return render(); }
      var res = R.submit(k.id, { changed: d.changed || Object.keys(d.notes).length > 0, changeText: d.changeText, eligibility: { employer: d.elig.employer, madrid: d.elig.madrid, record: d.elig.record }, channel: d.channel, feeFixed: !!d.feeTopUp, preDoc: docName("pc-doc") });
      if (res.error) return go("case");
      return go("done");
    }
    if (f.classList.contains("f-respond")) {
      var fid = f.getAttribute("data-f"), txt = f.querySelector("textarea").value.trim(), file = f.querySelector("input[type=file]");
      if (!txt) { session.errors.respond = true; return render(); }
      var blk = docBlocked("file-" + fid);
      if (blk) { toast(blk === "pending" ? "Wait for the document check to finish" : "Replace the document first: it can't be sent"); return render(); }
      R.respondFlag(k.id, fid, txt, docName("file-" + fid));
      toast("Answer sent"); return go("case");
    }
    if (f.id === "f-resched") {
      var i = +f.querySelector("input[name=slot]:checked").value;
      var slots = [[k.appt.day + 2, "09:40", R.OFFICES[1].id], [k.appt.day + 3, "12:10", R.OFFICES[2].id], [k.appt.day + 6, "10:00", k.appt.office]];
      R.reschedule(k.id, slots[i][0], slots[i][1], slots[i][2]); toast("Appointment changed"); return render();
    }
    if (f.id === "f-appeal") {
      var at = f.querySelector("#appeal-text").value.trim();
      if (!at) { session.errors.appeal = true; return render(); }
      if (docBlocked("appeal-file")) { toast("Replace the document first: it can't be sent"); return render(); }
      R.appeal(k.id, at); toast("Appeal sent"); return render();
    }
  });

  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act],[data-demo]");
    if (!b) return;
    var k = c(), d = draft(), act = b.getAttribute("data-act"), demo = b.getAttribute("data-demo");
    if (act === "pc-topup") { d.feeTopUp = true; toast("Difference paid. Fee complete."); return render(); }
    if (act === "pc-savechange") { var v2 = app.querySelector("#pc-change").value.trim(); if (v2) { d.changeText = v2; toast("Saved"); } return render(); }
    if (act === "pc-rerun") { session.pc = null; return render(); }
    if (act === "pc-continue") { d.checked = true; return go("review"); }
    if (act === "wrong") { session.wrongField = +b.getAttribute("data-i"); return render(); }
    if (act === "save-wrong") { var i = +b.getAttribute("data-i"), v = app.querySelector("#wrong-" + i).value.trim(); if (v) d.notes[i] = v; else delete d.notes[i]; session.wrongField = null; toast(v ? "Thanks. An officer will check this." : "Removed"); return render(); }
    if (act === "pay") { d.paid = true; d.paidMode = b.getAttribute("data-mode"); toast("Payment recorded"); session.pc = null; return go("precheck"); }
    if (act === "pay-fix" && !k.fix.amount && (docBlocked("fix-file") || !docName("fix-file"))) { toast(docBlocked("fix-file") === "pending" ? "Wait for the document check to finish" : "Add a file that passes the check first"); return; }
    if (act === "pay-fix") { R.payFix(k.id); toast("Done. Your clock has restarted."); return go("fix"); }
    if (act === "explain") { var key = b.getAttribute("data-k"); session.explain[key] = !session.explain[key]; return render(); }
    if (act === "assisted-request") { toast("Request sent. We'll call you within 2 working days."); return render(); }
    if (act === "assisted-continue") { d.channel = "assisted"; session.signedIn[k.id] = true; if (!S().assisted) R.setPref("assisted", true); return go("check"); }
    if (demo === "d1") { R.advance(1); toast("1 day later"); return; }
    if (demo === "d7") { R.advance(7); toast("7 days later"); return; }
    if (demo === "assisted") { R.setPref("assisted", !S().assisted); return; }
    if (demo === "reset") { session = { signedIn: {}, draft: {}, toast: "Demo reset", explain: {}, wrongField: null, errors: {}, docs: {} }; R.reset(); location.hash = "home"; return; }
    if (demo === "off-ask") { R.confirmFlag(k.id, "f1", "Please explain the gap in contributions.", "Officer M. García"); toast("The officer asked Lucía a question"); return; }
    if (demo === "off-grant") { if (k.flags[0] && k.flags[0].officer === "confirmed") R.dismissFlag(k.id, "f1", "Explained: job change, new contract provided", "Officer M. García"); R.decide(k.id, "granted", "Reviewed by officer", "Officer M. García"); toast("The officer granted the renewal"); return; }
    if (demo === "off-refuse") { var r = R.decide(k.id, "refused", "Not enough income to meet the family reunification requirement during the period.", "Officer M. García"); toast(r.error ? "Refusal not allowed yet" : "The officer refused the renewal"); return; }
  });

  app.addEventListener("change", function (e) {
    if (e.target.classList && e.target.classList.contains("js-doccheck")) {
      var inp = e.target, id = inp.id, out = document.getElementById(id + "-result"), file = inp.files && inp.files[0];
      if (!file) { delete session.docs[id]; if (out) out.innerHTML = ""; return; }
      session.docs[id] = { pending: true };
      if (out) out.innerHTML = '<p class="t-small t-secondary" role="status" style="margin-top:8px">Checking ' + esc(file.name) + "…</p>";
      window.DocCheck.check(file, inp.getAttribute("data-expect")).then(function (res) {
        session.docs[id] = { result: res };
        var o = document.getElementById(id + "-result"); if (o) o.innerHTML = window.DocCheck.render(res);
        if (id === "pc-doc" && res.status !== "error") setTimeout(render, 1600);
      });
      return;
    }
    if (e.target.id === "lang") { R.setPref("lang", e.target.value); }
    if (e.target.id === "demo-persona") { R.setPref("persona", e.target.value); session.wrongField = null; go("home"); }
  });

  document.body.classList.add("has-demobar");
  R.subscribe(render);
  window.addEventListener("hashchange", function () { session.wrongField = null; render(); var m = document.getElementById("main"); if (m) m.focus({ preventScroll: true }); });
  render();
})();
