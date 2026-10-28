# SmileSync: Community Teledentistry Triage System

**Software Requirements Specification (SRS), Version 1.1**
Prepared by Alvin Njenga Njoroge, African Leadership University

| Name | Date | Reason for changes | Version |
|---|---|---|---|
| Alvin Njoroge | 26/09/2026 | Initial draft for SRS document | 1.0 |
| Alvin Njoroge | 26/10/2026 | Addition of Appendix B (UML diagrams) | 1.1 |

---

## Mission and problem (context)

**Mission.** Develop a store-and-forward teledentistry mobile application, SmileSync, that enables community health workers (CHWs) in underserved areas of Kenya to capture and securely transmit dental images and symptom data to remote dentists for remote triage.

**Problem.** Kenya has too few dentists, concentrated in cities. The dentist-to-population ratio was about 1:42,000 against the WHO-recommended 1:7,000 (Okumu et al., 2022). Only 13% of health facilities provide oral health services (2023 Kenya Health Facility Census); the Ministry of Health puts the current ratio at 0.27 dentists per 10,000 people. Nairobi held 43% of the workforce (1:9,018), while Marsabit was about 1:290,000 and Narok about 1:850,000 (2013 data). In Kenya's 2015 National Oral Health Survey, 34% of adults had untreated caries and 98% had gum disease. Without early screening, minor problems become painful emergencies.

**Hypothesis.** If CHWs are equipped with an offline-capable mobile teledentistry triage app to accurately capture oral health images and symptoms, then remote dentists can accurately prioritise cases, resulting in a measurable decrease in untreated severe dental emergencies in the target communities.

**Development model.** Agile (Scrum), 2-week sprints. Sprint 1: encrypted image capture and offline storage. Sprint 2: symptom forms and sync. Sprint 3: dentist dashboard and triage tags. Then a 6-month pilot.

---

## 1. Introduction

### 1.1 Purpose
This SRS specifies the requirements for the initial release (Version 1.0) of the SmileSync teledentistry system. It covers the mobile application used by CHWs for data collection and the web-based dashboard used by dentists for patient triage. It gives testers, developers and stakeholders a testable definition of what will be built for the pilot. The system's goals are to capture oral health data offline, transmit it securely, and let dentists prioritise cases remotely.

### 1.2 Document Conventions
IEEE formatting conventions. Requirements are prioritised evenly unless stated. "Shall" dictates a mandatory requirement; "should" denotes an optional but recommended feature.

### 1.3 Intended Audience
Software developers, QA testers, project managers, and partnering dental health professionals.

### 1.4 Product Scope
SmileSync is a mobile and web software suite that collects structured oral health data and intraoral images offline, syncing them to a secure cloud server when connectivity is established. It lets remote dentists assess patient priority without a live video connection.

- **In scope:** patient registration, image capture, symptom forms, offline storage and sync, dentist dashboard, triage tagging and notes, user management and audit logs.
- **Out of scope (v1.0):** video consultations, payments, electronic prescribing, AI-based diagnosis, integration with national health records (KHIS/DHIS2).

## 2. Overall Description

### 2.1 System Overview
**System flow:**
1. A CHW registers a patient, captures images and completes the symptom form on the mobile app, which stores everything encrypted on the device.
2. When connectivity is available, the app compresses and syncs the data to the cloud server through a REST API.
3. The cloud database stores the case and adds it to the dentist's queue.
4. A dentist reviews the images and symptoms on the web dashboard, assigns a priority (Routine, Urgent or Emergency), and records notes.
5. The result syncs back so the CHW can act on it.

**Main components:** mobile app (Android and iOS), web dashboard, REST API, PostgreSQL cloud database, and an administration module.

### 2.2 Product Perspective
A new, self-contained product for the African health technology landscape. It links existing CHW networks with licensed dentists in urban centres.

### 2.3 Product Functions
- Capture and securely store intraoral images via a mobile device.
- Administer structured digital symptom questionnaires.
- Synchronise offline data to a centralised cloud database.
- Display patient cases in a prioritised queue on a web dashboard.
- Allow dentists to append clinical notes and assign triage severity.

### 2.4 User Classes and Characteristics
- **Community Health Workers (CHWs):** primary mobile app users. Varying technical expertise; need a highly intuitive, step-by-step UI with large touch targets.
- **Dentists/Specialists:** primary web dashboard users. High clinical expertise, moderate technical expertise; need high-resolution image viewing and efficient data entry.
- **System Administrators:** account provisioning, security audits, system maintenance.

### 2.5 Operating Environment
Mobile app: Android 9.0+ and iOS 14+. Web dashboard: Chrome, Edge, Safari on Windows and macOS.

### 2.6 Design and Implementation Constraints
Rural bandwidth is limited, so every submission (images and text) must be compressed to under 2 MB. AES-256 encryption at rest is required, in line with the Kenya Data Protection Act, 2019.

### 2.7 User Documentation
An onboarding tutorial embedded in the mobile app, and a downloadable PDF manual on dashboard navigation and triage tagging for dentists.

### 2.8 Assumptions and Dependencies
CHWs have smartphones with a working rear camera of at least 8 megapixels. The project depends on third-party cloud hosting (AWS or Google Cloud) offering secure, encrypted database infrastructure, with data residency handled in line with the Kenya Data Protection Act, 2019.

## 3. External Interface Requirements

### 3.1 User Interfaces
Mobile: card-based layout with high-contrast buttons (e.g. "New Patient", "Sync Data"). Error messages give actionable recovery steps (e.g. "Connection lost. Data saved locally. Please try syncing again later"). Web dashboard: split-screen layout with a list of pending cases on the left and the detailed patient view / image expansion on the right.

### 3.2 Hardware Interfaces
The software interfaces with the device's native camera and local storage to capture and temporarily store patient data.

### 3.3 Software Interfaces
Mobile and web clients communicate with the backend through a RESTful API. SQLite is the mobile local database; PostgreSQL is the cloud database.

### 3.4 Communications Interfaces
HTTPS (TLS 1.3) for all client-server traffic. Standard HTTP methods (POST, GET, PUT) for synchronisation.

## 4. Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| FR 1 | Authentication and Access | |
| FR 1.1 | User Login | The system shall require users to log in with a unique username and password (PIN on mobile). |
| FR 1.2 | Role-Based Access | The system shall restrict features by role: CHW, Dentist, Administrator. |
| FR 2 | Patient Registration | |
| FR 2.1 | Capture Registration | The system shall allow the CHW to enter patient name, age and location. |
| FR 2.2 | Generate Unique ID | The system shall automatically generate an anonymised patient ID. |
| FR 2.3 | Record Consent | The system shall require the CHW to record patient consent before any data is captured. |
| FR 3 | Image Capture | |
| FR 3.1 | Launch Camera | The system shall let the CHW launch the native camera from within the app. |
| FR 3.2 | Capture Guidance | The system shall show on-screen guidance for capturing at least 3 standard oral views. |
| FR 3.3 | Compress Image | The system shall automatically compress each submission to under 2 MB. |
| FR 4 | Symptom Assessment | |
| FR 4.1 | Questionnaire Input | The system shall provide a structured form to record pain level (1-10) and symptom duration. |
| FR 4.2 | Offline Save | The system shall save completed forms and images locally when there is no internet. |
| FR 5 | Synchronisation | |
| FR 5.1 | Automatic Sync | The system shall automatically upload queued cases when connectivity is detected. |
| FR 5.2 | Retry on Failure | The system shall retry failed uploads without duplicating or losing any records. |
| FR 5.3 | Sync Status | The system shall show each case as Pending, Synced, or Reviewed. |
| FR 6 | Clinical Dashboard | |
| FR 6.1 | Display Case Queue | The system shall display submitted cases to dentists in a queue. |
| FR 6.2 | View Images | The system shall let the dentist expand and zoom into intraoral images. |
| FR 6.3 | Filter and Sort | The system shall let the dentist filter and sort cases by priority, date and location. |
| FR 7 | Triage and Notes | |
| FR 7.1 | Assign Priority | The system shall let the dentist tag a case as Routine, Urgent, or Emergency. |
| FR 7.2 | Submit Clinical Notes | The system shall let the dentist save notes and referral recommendations. |
| FR 7.3 | Notify CHW | The system shall send the triage priority and dentist notes to the submitting CHW's app. |
| FR 8 | Administration | |
| FR 8.1 | Manage Users | The system shall let the administrator create, deactivate and reset user accounts. |
| FR 8.2 | Audit Log | The system shall record every access to patient data with user, time and action. |

## 5. Non-functional Requirements

| Type | ID | Description |
|---|---|---|
| Security | NFR 1 | All health data shall be encrypted with AES-256 at rest and TLS 1.3 in transit. |
| Performance | NFR 2 | The web dashboard shall load the initial case queue in under 3 seconds on a standard broadband connection. |
| Usability | NFR 3 | A health worker shall be able to complete a new submission in under 5 minutes. |
| Auditability | NFR 4 | The audit log shall be retained for at least 12 months and not be editable by users. |
| Compatibility | NFR 5 | The system shall be accessible on Android 9.0+ and iOS 14+, and the dashboard on Windows and macOS (Chrome, Edge, Safari). |
| Privacy and Compliance | NFR 6 | The system shall comply with the Kenya Data Protection Act, 2019, including patient consent and data minimisation. |
| Availability | NFR 7 | The cloud services shall achieve 99.5% monthly uptime. |

## 6. Appendix

### Appendix A: Glossary
- **CHW:** Community Health Worker.
- **Store-and-Forward:** telehealth where clinical data is captured and sent to a professional for review later, not in real time.
- **Triage:** determining the priority of patients' treatment by severity.
- **MVP:** Minimum Viable Product.

### Appendix B: Analysis Models
Four UML diagrams model v1.0. Images are in `docs/diagrams/`:

| Fig. | Diagram | File |
|---|---|---|
| B.1 | Use Case | `diagrams/1_use_case.png` |
| B.2 | Class | `diagrams/2_class.png` |
| B.3 | Sequence | `diagrams/3_sequence.png` |
| B.4 | Activity | `diagrams/4_activity.png` |

#### B.1 Use Case Diagram
Actors: **CHW** (mobile app), **Dentist** (web dashboard), **System Administrator** (web dashboard). All actors authenticate through UC1.

| ID | Use case | Actor | Input | Output | SRS link |
|---|---|---|---|---|---|
| UC1 | Log In | All | Username and password / PIN | Authenticated, role-limited session | FR 1.1, 1.2 |
| UC2 | Register Patient | CHW | Name, age, location | Patient record with anonymised ID | FR 2.1, 2.2 |
| UC3 | Record Patient Consent | CHW (included by UC2) | Consent decision | Consent flag and date stored; capture unlocked | FR 2.3 |
| UC4 | Capture Oral Images | CHW | Photos (at least 3 standard views) | Images attached to the case | FR 3.1, 3.2 |
| UC5 | Compress Image (< 2 MB) | CHW (included by UC4) | Captured images | Submission under 2 MB | FR 3.3 |
| UC6 | Complete Symptom Questionnaire | CHW | Pain 1-10, duration | Assessment saved locally, status Pending | FR 4.1, 4.2 |
| UC7 | Synchronise Cases | CHW | Queued cases, connectivity | Cases in the cloud; status Synced | FR 5.1, 5.3 |
| UC8 | Retry Failed Upload | CHW (extends UC7) | Failed upload | Repeated with no duplicates or losses | FR 5.2 |
| UC9 | View Triage Result | CHW | Sync request | Priority and notes shown; status Reviewed | FR 7.3, 5.3 |
| UC10 | Review Case Queue | Dentist | Filter/sort choice | Ordered case list | FR 6.1, 6.3 |
| UC11 | View and Zoom Images | Dentist (included by UC10) | Selected case | Zoomable intraoral images | FR 6.2 |
| UC12 | Assign Triage Priority | Dentist | Routine / Urgent / Emergency | Priority stored on case | FR 7.1 |
| UC13 | Add Clinical Notes | Dentist | Notes and referral advice | Notes saved to the case | FR 7.2 |
| UC14 | Manage User Accounts | Administrator | User details and role | Account created / deactivated / reset | FR 8.1 |
| UC15 | View Audit Log | Administrator | Search criteria | Who accessed what and when | FR 8.2, NFR 4 |

#### B.2 Class Diagram
| Class | Key attributes | Key operations | Responsibility |
|---|---|---|---|
| User «abstract» | userId, username, passwordHash, role, isActive | login(), logout(), resetPassword() | Common identity and authentication |
| CommunityHealthWorker | chwCode, assignedSite | registerPatient(), captureImage(), submitAssessment(), viewTriageResult() | Creates cases |
| Dentist | licenseNumber, specialty | reviewCase(), assignPriority(), addClinicalNote() | Triages cases |
| Administrator | adminLevel | createUser(), deactivateUser(), resetUserPassword(), viewAuditLog() | Accounts and audit |
| Patient | patientId (anonymised), name, age, location, consentGiven, consentDate | recordConsent(), generateAnonId() | Person being screened |
| Case | caseId, status, priority, createdAt, syncedAt | addImage(), setPriority(), updateStatus() | Central record |
| OralImage | imageId, filePath, sizeKB, viewType, capturedAt | compress(), encrypt() | Intraoral photo under 2 MB |
| SymptomAssessment | assessmentId, painLevel {1..10}, duration | validate() | Questionnaire answers |
| ClinicalNote | noteId, noteText, referralAdvice, createdAt | save() | Dentist's notes |
| SyncQueue | queueId, pendingCount, lastAttempt | enqueue(), uploadPending(), retryFailed() | Cases waiting for connectivity |
| AuditLog | logId, userId, action, resourceId, timestamp | record() | Immutable access record |
| Priority «enum» | ROUTINE, URGENT, EMERGENCY | | Triage levels |
| CaseStatus «enum» | PENDING, SYNCED, REVIEWED | | Case states |

Relationships:
- CommunityHealthWorker, Dentist, Administrator generalise User.
- CHW registers Patient (1 to 0..*); CHW submits Case (1 to 0..*); Dentist reviews Case (1 to 0..*); Dentist authors ClinicalNote (1 to 0..*); User generates AuditLog (1 to 0..*); CHW owns SyncQueue (1 to 1).
- Composition: Patient has Case (1 to 0..*); Case has OralImage (1 to 1..*); Case has SymptomAssessment (1 to 1); Case has ClinicalNote (1 to 0..*).
- Aggregation: SyncQueue holds Case (1 to 0..*).
- Dependency: Case uses Priority and CaseStatus.

#### B.3 Sequence Diagram (main scenario)
1. CHW logs in; app shows the home screen (FR 1.1).
2. CHW registers a patient; app requests consent; CHW confirms; patient saved locally with an anonymised ID (FR 2).
3. CHW captures images; app compresses the submission to under 2 MB (FR 3).
4. CHW completes the questionnaire; app saves an encrypted case with status Pending (FR 4).
5. **Network available:** app POSTs the case to the API over TLS 1.3; the API inserts the case and an audit entry; replies 201 Created; app marks the case Synced (FR 5.1, 8.2).
6. **Network unavailable:** app tells the CHW the data is saved locally and retries the upload until it succeeds (FR 5.2).
7. Dentist logs in and opens the queue (API: `GET /cases?sort=priority`) (FR 6.1, 6.3).
8. Dentist opens a case, zooms images, assigns priority and notes (API: `PUT /cases/{id}/triage`); the API saves them with an audit entry (FR 6.2, 7.1, 7.2).
9. On its next sync the app fetches the triage (`GET /cases/{id}/triage`), marks the case Reviewed and notifies the CHW (FR 7.3, 5.3).

Note: the dentist queue holds cases in the **Synced** state awaiting review; Pending exists only on the device.

#### B.4 Activity Diagram (swimlanes)
- **CHW (mobile):** log in; register patient and generate an anonymised ID; check consent (if not recorded, stop); capture at least 3 images; compress to under 2 MB; complete the questionnaire; save locally as Pending; check connectivity (if offline, wait and retry); upload over HTTPS; later receive the triage result, set status Reviewed; if priority is Emergency, refer the patient urgently, otherwise advise routine or urgent follow-up.
- **Cloud server:** validate and store the case (AES-256 at rest, status Synced); add it to the dentist queue; then in parallel save priority and notes and write an audit log entry.
- **Dentist (web):** review the queue; view and zoom images and symptoms; assign priority; add clinical notes and referral advice.

## References
- Ministry of Health, Kenya. (2025). *Kenya reaffirms commitment to oral health during World Oral Health Day 2025 celebrations in Makueni.* https://www.health.go.ke/kenya-reaffirms-commitment-oral-health-during-world-oral-health-day-2025-celebrations-makueni
- Okumu, B. A., Tennant, M., Kruger, E., Kemoli, A. M., Roberts, F. A., & Seminario, A. L. (2022). Geospatial analysis of dental access and workforce distribution in Kenya. *Annals of Global Health, 88*(1), Article 104. https://doi.org/10.5334/aogh.3903
- World Health Organization. (2022). *Global oral health status report: Towards universal health coverage for oral health by 2030.* World Health Organization.
