# SmileSync field-test checklist

For the person running a pilot with community health workers (CHWs) and a dentist.
Use **volunteers and synthetic patient names** until the data-protection steps
below are signed off. Each check names the requirement it tests.

## 1. Before the test

- [ ] A **release build** of the app is installed on every test phone (not the development build with the grey gear).
- [ ] The server runs on an encrypted disk, with a real domain and HTTPS (NFR 1).
- [ ] `scripts/backup.sh` has run and `scripts/verify-backup.sh` passed (NFR 7).
- [ ] An administrator has created one account per CHW and dentist (FR 8.1). PINs and passwords were handed over in person.
- [ ] Each CHW has logged in once **with internet** on their own phone (FR 1.1).
- [ ] Phones: Android 9 or newer, camera working, at least 1 GB free, date and time correct (NFR 5).
- [ ] The decision on screenshot blocking is made (security review, risk 4).
- [ ] A dentist is available during the test to triage cases.

## 2. Tasks for each CHW (observe, do not help)

Time each case from tapping **New patient** to **Save case**. Target: under 5 minutes (NFR 3).

| # | Task | Pass when | Req. |
|---|---|---|---|
| 1 | Log in with no signal (airplane mode) | The home screen opens | FR 1.1 |
| 2 | Start a new patient, read the consent script aloud, record Yes | The details screen opens | FR 2.3 |
| 3 | Enter name, age, county and sex | The anonymised ID (SS-XXXX-XXXX) appears later on the case | FR 2.1, 2.2 |
| 4 | Take the front, upper and lower photos following the on-screen guidance | All three show ✓ Taken | FR 3.1, 3.2 |
| 5 | Retake one photo | The new photo replaces the old one | FR 3.2 |
| 6 | Answer pain and duration, Save case | Home shows "Waiting to send" | FR 4.1, 4.2 |
| 7 | Repeat for 3 more patients, still offline | 4 cases waiting | FR 4.2 |
| 8 | Turn the signal back on, touch nothing | Cases move to "With dentist" by themselves | FR 5.1, 5.3 |
| 9 | Leave the app for 6 minutes, come back | It asks for the PIN | Security |
| 10 | After the dentist replies, bring the app to the front | "Dentist replied" with priority and notes | FR 7.3 |
| 11 | Start a case, then delete it as "consent withdrawn" | It disappears from the phone | NFR 6 |
| 12 | A patient refuses consent | Nothing is saved | FR 2.3 |

Record for each CHW: time per case, tasks needing help, words they did not understand.

## 3. Weak signal and interruptions (FR 5.2)

- [ ] Send cases with one bar of signal, or while walking out of coverage. Each case reaches the dentist **exactly once**, with all photos.
- [ ] Turn airplane mode on in the middle of sending. After reconnecting, the case completes without duplicates.
- [ ] Force-close the app while a case is waiting to send. It still sends after reopening.
- [ ] Note the mobile data used per case (expected about 0.4 MB).

## 4. Dentist tasks (FR 6, FR 7)

- [ ] Log in on the dashboard; the waiting cases are listed highest pain first, within 3 seconds (NFR 2).
- [ ] Filter by county and by date (FR 6.3).
- [ ] Open a case, zoom each photo (FR 6.2).
- [ ] **Rate each photo**: good enough to triage / borderline / not usable. Record the reason (blurred, dark, wrong view, too far). This is the main open question for the photos.
- [ ] Set a priority and add notes and referral advice; the CHW receives them (FR 7.1-7.3).
- [ ] Confirm that no patient name appears anywhere on the dashboard (NFR 6).

## 5. Administrator tasks (FR 8)

- [ ] Deactivate a test account: that person is logged out on the dashboard and cannot log in.
- [ ] Reset a CHW's PIN; the old PIN stops working online.
- [ ] In the audit log, find who opened each test case and when (FR 8.2).

## 6. Accessibility, by hand

Automated checks pass (axe on every dashboard page, contrast tests on the phone). Also check:
- [ ] Phone, outdoors in bright sun: every screen readable.
- [ ] Phone with the largest system font size: no text cut off, buttons still reachable.
- [ ] Phone with TalkBack: every button is announced with a sensible name.
- [ ] Dashboard with keyboard only: log in, open a case, zoom (+ / − / arrows / Esc), set a priority, save.

## 7. Success criteria

- Median time per case under 5 minutes, and every CHW finishes at least one case without help.
- Every case sent offline arrives exactly once, with all its photos.
- The dentist rates at least 80% of photo sets as good enough to triage.
- No patient name visible to the dentist; audit log complete for every case.

## 8. After the test

- [ ] Delete the test phones' data or uninstall the app.
- [ ] Deactivate test accounts.
- [ ] Write up issues with the screen numbers from the UI review page (P1-P10, W1-W6).
