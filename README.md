# Residence and TIE renewal, Madrid: prototype
nLive demo: https://juanfe1206.github.io/tie-renewal-prototype/

Group project for **Connected Industries (IE University)**: *AI-Ready Public Services*.
We redesign the renewal of a non-EU residence permit and TIE card in Madrid (Oficina de Extranjería + Policía Nacional).

> Student prototype. Not an official government service. All people and data are synthetic.

| Half | Owner | Folder |
|---|---|---|
| Citizen side (demand) | Manuela | `index.html`, `js/citizen.js` |
| Administration side (service) | Juan Felipe | `officer/` |
| Shared | both | `design-system/`, `js/data.js`, `js/i18n.js` |

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 (citizen app) and http://localhost:8765/design-system/ (design system).

## Structure

```
index.html                 citizen app shell
js/data.js                 shared case model + demo engine (window.RRS)
js/i18n.js                 interface strings: en, es, fr, ar (RTL)
js/citizen.js              citizen screens and routing (#home, #case, ...)
design-system/tokens.css   colour, type, spacing, shape tokens
design-system/components.css   every .c-* component
design-system/index.html   live documentation of tokens and components
officer/                   administration side (to build)
```

## Citizen journey (what the demo shows)

Pick an applicant in the dark **Demo** bar at the bottom. Use **+1 day / +7 days** to move time.

| Applicant | Path | Shows |
|---|---|---|
| **Amina** (employee) | nothing changed → automatic approval in 2 days → appointment assigned → card ready | happy path, pre-filled data, live tracker |
| **Robert** (retiree) | paid the old fee → *fix needed*, clock paused → pays €2.10 in one click → approved | fix-it loop, paused clock |
| **Lucía** (family reunification) | Social Security mismatch → officer asks her → she answers → officer grants **or** refuses → appeal | red-flag review, right to respond, appeal |

Also: assisted mode (bigger text, help first), 4 languages incl. Arabic RTL, "this is wrong" corrections, duplicate-application guard, rescheduling once, help and rights page, ~50 synthetic background cases.

The demo bar has **Officer** buttons for Lucía so the citizen demo works on its own. When the officer app exists, those actions happen there instead.

## Screens

| Hash | Screen |
|---|---|
| `#home` | service page + reminder SMS |
| `#signin` / `#helpin` | sign in (Cl@ve, certificate) or get help from a person |
| `#check` | eligibility (3 questions) |
| `#apply` | pre-filled details from other offices, "has anything changed?" |
| `#pay` → `#review` → `#done` | fee, check answers + declaration, confirmation |
| `#case` | status, 90-day clock, tasks, progress, messages |
| `#fix` | fix-it notice with one-click fix |
| `#respond` | officer's question (flag card) + answer |
| `#appointment` | auto-assigned fingerprint appointment, change once |
| `#card` | card ready |
| `#decision` | grant / refusal reasons + appeal (reposición) |
| `#messages`, `#help` | inbox, help and rights |

## For the officer side (Juan Felipe)

1. Create `officer/index.html` that loads the same files:
   ```html
   <link rel="stylesheet" href="../design-system/tokens.css">
   <link rel="stylesheet" href="../design-system/components.css">
   <script src="../js/i18n.js"></script>
   <script src="../js/data.js"></script>
   <script src="officer.js"></script>
   ```
2. Read cases from `RRS.state.cases`, re-render on `RRS.subscribe(render)`.
3. Use the officer actions in `js/data.js`; they already update the citizen side (same `localStorage` key, synced across tabs):

| Action | Effect on the citizen side |
|---|---|
| `RRS.confirmFlag(caseId, flagId, reason, officer)` | status *Your response needed*, flag card + deadline |
| `RRS.dismissFlag(caseId, flagId, reason, officer)` | flag cleared |
| `RRS.decide(caseId, "granted" \| "refused", reason, officer)` | grant assigns the appointment; refusal only allowed after the citizen answered or the deadline passed (`RRS.canRefuse(c)`) |
| `RRS.sendFixNotice(caseId, what, why, officer)` | *Fix needed*, clock paused |
| `RRS.signWithdrawal(caseId, reason, officer)` | only after the fix deadline |
| `RRS.drawSample(5)`, `RRS.markSample(caseId, "ok" \| "problem", note)` | post-grant sampling; a problem sends the citizen a flag, never a silent revocation |

Useful reads: `RRS.dayCount(c)`, `RRS.isPaused(c)`, `RRS.RULES` (targets and deadlines), `RRS.STATUS` (label + tag colour), `RRS.state.audit` (audit log).

Open the citizen app and the officer app in two tabs: actions in one appear in the other.

## Service contract (v1.1) in the code

| Contract item | Where |
|---|---|
| Reminder 90 days before expiry, filing window 2 months | `RULES.reminderBeforeExpiry`, `RULES.fileWindowBeforeExpiry`, `#home`, `#check` |
| Pre-filled data from PID, right to object (Ley 39/2015 art. 28) | `#apply`, declaration in `#review`, `#help` |
| Automatic grant of clear-cut cases, targets 5 working days / 30 days | `tick()` in `data.js`, clock on `#case` |
| Fix-it loop, 10 days, clock paused, no automatic withdrawal | `submit()` / `payFix()`, `#fix` |
| Red flags: person decides, 10–15 days to respond, no refusal before | `confirmFlag`, `canRefuse`, `#respond` |
| Silence = granted at day 90 (legal backstop) | `tick()` |
| Appointment issued with the decision, change once | `assignAppointment()`, `#appointment` |
| Appeal: reposición 1 month, courts 2 months | `#decision` |
| Accessibility: languages, assisted channel, in-person fallback | `i18n.js`, assisted mode, `#helpin` |
