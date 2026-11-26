/* =========================================================================
   Document checker (window.DocCheck)
   Runs in the browser before a file is sent. It never decides anything:
   it only tells the person whether the file will be usable.

   Real checks:      file type, size, PDF validity, password protection,
                     image resolution (too blurry to read).
   Simulated check:  "does this look like the document we asked for",
                     based on the file name. A live service would use a
                     document-reading model here.
   The officer side can reuse it: DocCheck.check(file, expect) -> Promise.
   ========================================================================= */
(function () {
  "use strict";
  var MAX = 10 * 1024 * 1024, MIN = 15 * 1024, MIN_SIDE = 900;
  var KINDS = {
    contract: { label: "an employment contract or employer letter", words: ["contract", "contrato", "employment", "empleo", "employer", "empresa", "nomina", "nómina", "payslip", "alta", "vida laboral"] },
    passport: { label: "a passport photo page", words: ["passport", "pasaporte", "id", "photo", "foto"] },
    any:      { label: "a supporting document", words: [] }
  };
  var TYPES = { "application/pdf": "pdf", "image/jpeg": "image", "image/png": "image", "image/heic": "image", "image/heif": "image" };

  function kindOf(file) {
    if (TYPES[file.type]) return TYPES[file.type];
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "heic", "heif"].indexOf(ext) >= 0) return "image";
    return null;
  }
  function readHead(file, n) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || "")); };
      r.onerror = function () { res(""); };
      r.readAsText(file.slice(0, n), "latin1");
    });
  }
  function imageSize(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = function () { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  function check(file, expect) {
    var want = KINDS[expect] || KINDS.any;
    var items = [], status = "ok";
    function add(level, text) { items.push({ level: level, text: text }); if (level === "error") status = "error"; else if (level === "warn" && status !== "error") status = "warn"; }
    var kind = kindOf(file);
    if (!kind) { add("error", "This file type can't be used. Send a PDF, JPG or PNG."); return Promise.resolve({ status: status, items: items, name: file.name }); }
    add("ok", "File type accepted (" + (kind === "pdf" ? "PDF" : "image") + ")");
    if (file.size > MAX) add("error", "The file is larger than 10 MB. Send a smaller scan or photo.");
    else if (file.size < MIN) add("warn", "The file is very small. It may be hard to read.");
    else add("ok", "File size is fine (" + Math.round(file.size / 1024) + " KB)");

    var p = kind === "pdf"
      ? readHead(file, 1024 * 1024).then(function (head) {
          if (head.slice(0, 5) !== "%PDF-") add("error", "This doesn't open as a PDF. Export it again or send a photo.");
          else if (head.indexOf("/Encrypt") >= 0) add("error", "The PDF is password-protected. Remove the password and send it again.");
          else add("ok", "The PDF opens and is not password-protected");
        })
      : imageSize(file).then(function (s) {
          if (!s) add("warn", "We couldn't open this image here. An officer will check it.");
          else if (Math.min(s.w, s.h) < MIN_SIDE) add("warn", "The photo is low resolution (" + s.w + "×" + s.h + "). Text may be blurry. Take it closer if you can.");
          else add("ok", "The photo is sharp enough to read (" + s.w + "×" + s.h + ")");
        });

    return p.then(function () {
      if (status !== "error" && want.words.length) {
        var n = file.name.toLowerCase();
        var hit = want.words.some(function (w) { return n.indexOf(w) >= 0; });
        if (hit) add("ok", "Looks like " + want.label + " (simulated reading)");
        else add("warn", "We couldn't confirm this is " + want.label + ". You can still send it: an officer will look at it (simulated reading).");
      }
      return { status: status, items: items, name: file.name };
    });
  }

  function render(result) {
    if (!result) return "";
    var head = result.status === "error" ? ["error", "This file can't be sent yet"] : result.status === "warn" ? ["warning", "You can send it, but check this"] : ["success", "Ready to send"];
    return '<div class="c-banner c-banner--' + head[0] + '" style="margin:var(--space-3) 0 var(--space-4)"><p class="c-banner__title">Document check</p><div class="c-banner__body"><p class="c-banner__heading">' + head[1] + '</p><ul class="c-list" style="margin:0">' +
      result.items.map(function (it) { return '<li><strong>' + (it.level === "ok" ? "OK" : it.level === "warn" ? "Check" : "Problem") + ":</strong> " + it.text.replace(/</g, "&lt;") + "</li>"; }).join("") +
      '</ul><p class="t-small t-secondary" style="margin:var(--space-2) 0 0">This check only helps you avoid problems. It doesn\'t decide your application.</p></div></div>';
  }

  window.DocCheck = { check: check, render: render, KINDS: KINDS };
})();
