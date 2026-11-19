# SmileSync user guide

SmileSync lets a community health worker (CHW) photograph a patient's teeth and
record their symptoms, even without internet. A dentist reviews the case later and
sends back advice.

- **CHWs** use the SmileSync app on an Android phone.
- **Dentists and administrators** use the dashboard in a web browser.

---

## For community health workers

### Logging in
Enter your username and 6-digit PIN, then tap **Log in**.
The first time on a new phone you need internet. After that you can log in anywhere.
If you enter a wrong PIN 5 times without internet, you will need internet to log in again.
If you leave the app for more than 5 minutes, it asks for your PIN again. This protects
your patients if the phone is lost.

### Registering a patient (about 5 minutes)
Tap **New patient** and follow the four steps. The bar at the top shows where you are.

1. **Consent.** Read the four points to the patient. For a child, ask the parent or guardian.
   Tap **Yes, agrees** only if they agree. If they say no, tap **No**. Nothing is saved.
2. **Patient details.** Name, age, county, and sex if the patient wants to give it.
   The dentist never sees the name; they see a code like SS-7K2M-Q9PD.
3. **Photos.** The camera opens with instructions for each view:
   - Front teeth, biting together
   - Upper teeth, from below
   - Lower teeth, from above

   After each photo, check it is sharp, then tap **Use photo**, or **Retake**.
   You can add up to 3 extra photos of a problem area.
4. **Symptoms.** Ask the patient to choose a pain level from 1 to 10, and how long it
   has lasted. Tap **Save case**. After saving, the case cannot be changed.

**Tips for clear photos:** use daylight or the phone's light, ask the patient to open
wide and hold still, and move closer instead of zooming.

If you are interrupted, tap **Finish later**. The home screen shows **Continue** for that
case. If the patient changes their mind before the case is sent, open the case and tap
**Delete case (consent withdrawn)**.

### Sending cases
You do not need to do anything. Cases are saved on the phone and sent by themselves
when the phone has internet. The home screen shows:

| Count | Meaning |
|---|---|
| Waiting to send | Saved on the phone, will send when there is internet |
| With dentist | Sent, waiting for the dentist |
| Dentist replied | Open the case to read the advice |

**Send now** appears when you are online and cases are waiting.

### Reading the dentist's advice
Open a case marked **Dentist replied**. You will see the priority and the dentist's notes:

| Priority | What to tell the patient |
|---|---|
| Routine | Visit at the next routine clinic |
| Urgent | See a dentist within a few days |
| Emergency | Needs care today |

Follow the referral advice in the notes.

### If something goes wrong
- **"Your login has expired"**: connect to the internet and tap **Log in again**. No cases are lost.
- **"Needs attention"** on a case: it could not be sent. Tell your supervisor.
- **Phone lost**: tell your administrator so they can deactivate your account.

---

## For dentists

1. Open the dashboard address in Chrome, Edge or Safari and log in with your username and password.
2. The **Case queue** lists cases waiting for review, highest pain first. Use the filters for
   priority, county and dates. Tap **Review next case** to start with the top one.
3. On a case, you see age, sex, county, pain, duration and consent date. You never see the
   patient's name. Click a photo to open it full screen:
   - zoom with **+** and **−**, the mouse wheel or a double-click
   - drag to move around a zoomed photo
   - arrow keys for the next photo, **Esc** to close
4. Choose a priority (**Routine**, **Urgent** or **Emergency**), write notes for the CHW, and add
   referral advice if needed. Click **Save triage**. The CHW receives it at their next sync.
5. To change your advice later, open the case again and save a new priority or note.

Your session ends after 8 hours, or when you close the browser tab.

---

## For administrators

### Users
Open **Users**.
- **+ Add user**: choose the role. CHWs get a 6-digit PIN; dentists and administrators get a
  password of at least 10 characters. Give it to the person in person, never by SMS or email.
- **Deactivate**: the person is logged out everywhere and cannot log in. Use this when someone
  leaves or loses their phone. **Reactivate** reverses it.
- **Reset PIN / password**: ends their sessions and clears a lockout.
- **Unlock**: appears when someone is locked out after too many wrong attempts.

### Audit log
Open **Audit log** to see who did what and when: logins, case views, photo views, triage
and user changes, including attempts that were refused. Search by username, action,
outcome, case or user id, and dates. Entries cannot be changed or deleted.

### Backups
Whoever runs the server should back up daily and check the backup:
```
scripts/backup.sh
scripts/verify-backup.sh backups/<the new folder>
```
Keep backups on encrypted storage, and keep the encryption key (`PATIENT_DATA_KEY`) in a
separate safe place. Without it, names and photos cannot be recovered.
