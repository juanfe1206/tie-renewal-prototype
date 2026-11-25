/* Interface translations. Keys missing in a language fall back to English.
   Scope for the prototype: navigation, headings, buttons and statuses.
   Long help texts stay in English (noted on the Help page). */
(function () {
  var T = {
    en: {
      service: "Renew your residence and TIE", serviceShort: "Residence renewal", city: "Madrid",
      navHome: "Service home", navCase: "Your renewal", navMessages: "Messages", navHelp: "Help and rights", getHelp: "Get help",
      signedInAs: "Signed in as", signOut: "Sign out",
      start: "Start now", continue: "Continue", back: "Back", submit: "Submit application", saveSend: "Send response",
      step1: "Eligibility", step2: "Your details", step3: "Fee", step4: "Submit",
      h_home: "Renew your residence permit and TIE card",
      h_signin: "How do you want to sign in?", h_check: "Check you can use this service", h_apply: "Check the details we already have",
      h_pay: "Pay the fee", h_review: "Check your answers before submitting", h_done: "Application submitted",
      h_case: "Your renewal", h_fix: "One thing to fix", h_respond: "We need your answer about one thing",
      h_appt: "Your fingerprint appointment", h_card: "Your TIE card is ready", h_decision: "Decision on your renewal",
      h_messages: "Messages", h_help: "Help and your rights",
      st_reminder: "Reminder sent", st_filed: "Filed", st_review: "Under review", st_fix: "Fix needed", st_response: "Your response needed",
      st_granted: "Granted", st_silence: "Granted by silence", st_refused: "Refused", st_withdrawn: "Withdrawn", st_appt: "Fingerprint appointment", st_card: "Card ready",
      day: "Day", of: "of", paused: "Clock paused", footer: "Student prototype. Proposed service design, not an official government service. All data is synthetic."
    },
    es: {
      service: "Renueva tu residencia y TIE", serviceShort: "Renovación de residencia", city: "Madrid",
      navHome: "Inicio del servicio", navCase: "Tu renovación", navMessages: "Mensajes", navHelp: "Ayuda y derechos", getHelp: "Pedir ayuda",
      signedInAs: "Has entrado como", signOut: "Salir",
      start: "Empezar", continue: "Continuar", back: "Volver", submit: "Enviar solicitud", saveSend: "Enviar respuesta",
      step1: "Requisitos", step2: "Tus datos", step3: "Tasa", step4: "Enviar",
      h_home: "Renueva tu autorización de residencia y tu TIE",
      h_signin: "¿Cómo quieres identificarte?", h_check: "Comprueba que puedes usar este servicio", h_apply: "Revisa los datos que ya tenemos",
      h_pay: "Paga la tasa", h_review: "Revisa tus respuestas antes de enviar", h_done: "Solicitud enviada",
      h_case: "Tu renovación", h_fix: "Hay una cosa que corregir", h_respond: "Necesitamos tu respuesta sobre un punto",
      h_appt: "Tu cita de huellas", h_card: "Tu TIE está lista", h_decision: "Resolución de tu renovación",
      h_messages: "Mensajes", h_help: "Ayuda y tus derechos",
      st_reminder: "Aviso enviado", st_filed: "Presentada", st_review: "En revisión", st_fix: "Falta algo", st_response: "Necesitamos tu respuesta",
      st_granted: "Concedida", st_silence: "Concedida por silencio", st_refused: "Denegada", st_withdrawn: "Desistida", st_appt: "Cita de huellas", st_card: "Tarjeta lista",
      day: "Día", of: "de", paused: "Plazo en pausa", footer: "Prototipo de estudiantes. Propuesta de servicio, no es un servicio oficial. Todos los datos son ficticios."
    },
    fr: {
      service: "Renouveler votre résidence et TIE", serviceShort: "Renouvellement de résidence",
      navHome: "Accueil du service", navCase: "Votre renouvellement", navMessages: "Messages", navHelp: "Aide et droits", getHelp: "Obtenir de l'aide",
      signedInAs: "Connecté en tant que", signOut: "Se déconnecter",
      start: "Commencer", continue: "Continuer", back: "Retour", submit: "Envoyer la demande", saveSend: "Envoyer la réponse",
      step1: "Conditions", step2: "Vos données", step3: "Frais", step4: "Envoi",
      h_home: "Renouvelez votre titre de séjour et votre TIE", h_case: "Votre renouvellement", h_help: "Aide et vos droits", h_messages: "Messages",
      st_reminder: "Rappel envoyé", st_filed: "Déposée", st_review: "En cours d'examen", st_fix: "À corriger", st_response: "Votre réponse est nécessaire",
      st_granted: "Accordée", st_silence: "Accordée par silence", st_refused: "Refusée", st_withdrawn: "Retirée", st_appt: "Rendez-vous empreintes", st_card: "Carte prête",
      day: "Jour", of: "sur", paused: "Délai suspendu", footer: "Prototype étudiant. Proposition de service, pas un service officiel. Données fictives."
    },
    ar: {
      service: "جدّد إقامتك وبطاقة TIE", serviceShort: "تجديد الإقامة",
      navHome: "الصفحة الرئيسية", navCase: "طلب التجديد", navMessages: "الرسائل", navHelp: "المساعدة والحقوق", getHelp: "اطلب المساعدة",
      signedInAs: "تم الدخول باسم", signOut: "خروج",
      start: "ابدأ الآن", continue: "متابعة", back: "رجوع", submit: "أرسل الطلب", saveSend: "أرسل الرد",
      step1: "الأهلية", step2: "بياناتك", step3: "الرسوم", step4: "الإرسال",
      h_home: "جدّد تصريح إقامتك وبطاقة TIE", h_case: "طلب التجديد", h_help: "المساعدة وحقوقك", h_messages: "الرسائل",
      st_reminder: "تم إرسال تذكير", st_filed: "تم التقديم", st_review: "قيد المراجعة", st_fix: "يلزم تصحيح", st_response: "نحتاج ردك",
      st_granted: "تمت الموافقة", st_silence: "موافقة بالصمت الإداري", st_refused: "مرفوض", st_withdrawn: "مسحوب", st_appt: "موعد البصمات", st_card: "البطاقة جاهزة",
      day: "اليوم", of: "من", paused: "المهلة متوقفة", footer: "نموذج طلابي. ليس خدمة حكومية رسمية. جميع البيانات وهمية."
    }
  };
  window.I18N = {
    langs: [["en", "English"], ["es", "Español"], ["fr", "Français"], ["ar", "العربية"]],
    t: function (lang, key) { return (T[lang] && T[lang][key]) || T.en[key] || key; },
    dir: function (lang) { return lang === "ar" ? "rtl" : "ltr"; }
  };
})();
