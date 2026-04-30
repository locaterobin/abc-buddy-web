# ABC Buddy TODO

## Core Features
- [x] Basic photo capture (camera + upload)
- [x] AI dog description generation
- [x] Dog ID generation (area prefix + suffix)
- [x] GPS location capture and reverse geocoding
- [x] Record save to DB with image upload to S3
- [x] Image annotation with dog ID, date, time, location strip
- [x] Lookup tab with visual similarity search
- [x] Settings page with team ID and webhook config
- [x] DOCX form generation per record
- [x] Export records as JSON

## Timezone Fix
- [x] Fix DOCX date: use explicit timeZone "Asia/Kolkata" in formatDate (was showing UTC-4 server local time)
- [x] Fix image annotation date/time strip: use explicit timeZone "Asia/Kolkata" for dateStr and timeStr

## Released Button
- [x] Add "Released" button above Delete in record detail modal
- [x] On press: get device GPS, reverse-geocode to place name, fire POST to {webhookUrl}/release with dogId, current IST date, lat/lng, place name
- [x] Show loading state while getting GPS + geocoding
- [x] Show success/error toast after webhook fires

## Navigation Restructure
- [x] Rename Settings tab label to Records, change icon to ClipboardList
- [x] Create new Settings tab (4th tab) with Settings icon - contains team ID and webhook config
- [x] Move team ID and webhook config out of SettingsPage into new SettingsTab
- [x] SettingsPage (now Records) shows only records list with filters

## Release Distance Check
- [x] Calculate Haversine distance between record's original GPS and current release GPS
- [x] Show distance in confirmation dialog before firing release webhook
- [x] Also include distance in the webhook payload sent to /release
- [x] Handle case where record has no GPS (skip distance, note in dialog)

## Release - Full DB Save + 200m Warning + Distance in Webhook
- [x] Add release columns to dogRecords: releasedAt, releaseLatitude, releaseLongitude, releaseAreaName, releaseDistanceMetres
- [x] Create dogs.saveRelease tRPC procedure to persist release data
- [x] Show 200m warning dialog when distance > 200m, user can still choose to proceed or cancel
- [x] Save release data to DB before firing webhook
- [x] Include distanceFromCapture (metres) in webhook payload
- [x] Display release info (date, location, distance) in RecordDetailModal for already-released records

## Records List - Badge + Filter
- [x] Show green "Released" badge on each released record row in Records tab
- [x] Add Released / Not Released / All filter toggle on Records tab

## Delete Webhook
- [x] Fire POST to {webhookUrl}/delete with dogId when a record is deleted

## Back Button
- [x] Phone back button closes RecordDetailModal

## Release Dialog UX
- [x] Replace window.confirm with custom styled Dialog
- [x] Show distance in large bold uppercase (e.g. 100 METERS AWAY / 1 KM AWAY)
- [x] Green tick if < 200m, yellow warning + ARE YOU SURE? if 200-500m, red STOP + DO NOT RELEASE if > 500m
- [x] Phone back button cancels the dialog (not confirms)

## Server-side Pagination
- [x] Add paginated getRecordsPaginated procedure (page, pageSize=50, filters: teamId, search, dateFrom, dateTo, status)
- [x] Update db.ts with getRecordsPaginated helper returning { records, total, hasMore }
- [x] Update SettingsPage to use paginated query with Load More button
- [x] Ensure search and status filters still work server-side with pagination

## Date Filter Timezone Fix
- [x] Fix date filter in Records to use IST (GMT+5:30) boundaries, not UTC or device-local time

## Upload Flow Bug Fix
- [x] Description field should always be editable after image upload, even if AI returns empty description

## Lookup Date Dropdown
- [x] Replace 3-day/7-day/30-day toggle buttons with a dropdown
- [x] Dropdown options: "Last 7 days", "Last 30 days", then individual dates that have records in past 30 days
- [x] Add getRecordDates tRPC procedure to fetch distinct capture dates from past 30 days

## Auto-save to Gallery
- [x] When camera is used, immediately save the original photo to device gallery (not on upload)

## Full-screen Photo Zoom
- [x] Add pinch-to-zoom and double-tap zoom to full-screen photo viewer in record detail modal

## IndexedDB Record Cache
- [x] Create useRecordCache hook with IndexedDB to store last 100 records per team
- [x] SettingsPage shows cached records instantly on load, then refreshes in background
- [x] Cache is updated whenever fresh records are fetched from server

## PWA (Offline Support)
- [x] Add web app manifest (manifest.json) with name, icons, theme color
- [x] Generate PWA icons (192x192 and 512x512)
- [x] Add service worker to cache app shell (HTML, JS, CSS) for offline load
- [x] Register service worker in index.html
- [x] Add offline fallback page shown when network is unavailable

## Lookup Date Cache (Offline)
- [x] Cache record dates in IndexedDB so Lookup dropdown works offline

## Release Plan Feature
- [x] Add releasePlans table (id, teamIdentifier, planDate YYMMDD, createdAt)
- [x] Add releasePlanDogs table (planId, dogId, addedAt)
- [x] tRPC: createReleasePlan, getReleasePlans, getReleasePlanDogs, addDogToPlan, removeDogFromPlan
- [x] "Add to Release Plan" button on each record in RecordDetailModal
- [x] New "Release Plan" tab (5th tab) in bottom nav
- [x] Release Plan list view: plans sorted by date YYMMDD
- [x] Release Plan detail view: list of dogs in plan + Google Maps link with all capture lat/lngs

## Release Plan - 48h Filter in Record Picker
- [x] "Add to Release Plan" picker in RecordDetailModal only shows plans created in the past 48 hours

## Release Plan - Order Suffix + 48h Filter
- [x] Add orderIndex column to release_plans table (auto-increments per planDate per team)
- [x] Plan display name becomes YYMMDD-N (e.g. 260312-1, 260312-2)
- [x] createReleasePlan counts existing plans for same date+team, assigns next index
- [x] Update ReleasePlanPage list and detail header to show YYMMDD-N format
- [x] "Add to Release Plan" picker in RecordDetailModal only shows plans created in the past 48 hours

## Nav Restructure - Hamburger Menu
- [ ] Remove Settings tab from bottom nav (4 tabs: Add, Lookup, Records, Plans)
- [ ] Add hamburger icon to top-right of header
- [ ] Slide-out drawer from right with Settings link (and any future items)
- [ ] Replace team name in header with @peepalfarm in same style

## Nav Restructure - Hamburger Menu + Renames
- [x] Remove Settings tab from bottom nav (4 tabs: Add, Lookup, Records, Releases)
- [x] Rename Plans tab to "Releases"
- [x] Add hamburger icon to top-right of header
- [x] Slide-out drawer from right with Settings link
- [x] Replace team name in header with @peepalfarm in same style

## Release Plan - Button Order + Second Photo
- [x] Move "Add to Release Plan" button above "Released" button in RecordDetailModal
- [x] After selecting a plan in the picker, prompt user to optionally take/upload a second photo
- [x] Add photo2Url column to release_plan_dogs table
- [x] Upload second photo to S3 and store URL in release_plan_dogs
- [x] Show photo2 as a second thumbnail next to the original in the plan detail dog list

## Release - Third Photo (Photo 3)
- [x] Add releasePhotoUrl column to dog_records table
- [x] Update saveRelease tRPC to accept optional photo3Base64, upload to S3, store URL
- [x] Add photo3 camera/gallery option in the release confirmation modal
- [x] Show all 3 photos side by side in RecordDetailModal for released records
- [x] Show all 3 photos side by side in Releases plan detail dog list

## UX - Map Button
- [x] Replace "Open all locations in Google Maps" text link with a styled button with map icon in ReleasePlanPage

## UX - Consistent Photo Buttons
- [x] Photo2 (plan) and photo3 (release) camera/gallery buttons match the style of the main Camera/Upload buttons on Add and Lookup screens

## Bug Fixes - Image Upload
- [x] Remove save-to-gallery code from camera click handlers
- [x] Unify all image uploads (photo1, photo2, photo3) to use resizeImage compression function
- [x] Swipeable photo carousel in dog record detail modal (swipe left/right to see photos 1, 2, 3)

## Records List - Release Plan Status
- [x] Disable "Add to Release Plan" button in RecordDetailModal when dog is already released
- [x] Show yellow "Checked" badge on record list cards for dogs that are in any release plan

## Release Plan - Clickable Dog List
- [x] getReleasePlanDogs joins dog_records and excludes deleted records (where deletedAt IS NULL)
- [x] ReleasePlanPage dog list uses same card style as Records list
- [x] Tapping a dog in the release plan opens RecordDetailModal

## Release Plan - Disable Button if Already in Plan
- [x] "Add to Release Plan" button disabled when dog is already in any release plan

## Bug - Photo 3 Missing in Carousel
- [x] Photo carousel in RecordDetailModal shows only 2 photos even when releasePhotoUrl (photo 3) exists

## Bug - Photo 2 Missing in Records Tab Carousel
- [x] photo2Url (plan photo) not included in getRecords query so carousel only shows photo1 and photo3 when opened from Records tab

## UX - Remove from Release Plan Button
- [ ] Replace disabled "Already in Release Plan" with red "Remove from Release Plan" button in RecordDetailModal

## Bug - Match Reason Truncated in Lookup
- [x] Match reason text in Lookup results is being trimmed/truncated — remove truncate class

## Bug - RecordDetailModal uses stale partial data
- [x] RecordDetailModal should always fetch full record data (incl. photo2Url) from a single getRecordById query on open

## UX Batch - 5 Improvements
- [x] Lookup: show all records by default filtered by dropdown; photo upload narrows results
- [x] Move Records tab to hamburger menu (above Settings)
- [x] Records: persist last selected date filter via localStorage
- [x] Add to Release Plan: auto-close picker after confirming
- [x] Release plan: drag-to-reorder dogs (sortOrder column in release_plan_dogs)

## UX - Tab Rename
- [x] Rename "Add" tab to "Catching" in bottom nav

## Bug - Multiple Plans Per Day Blocked
- [x] Remove "plan already exists for today" guard from createReleasePlan — sortOrder suffix already handles same-day disambiguation

## Lookup - Exclude Released Dogs
- [x] Lookup should only show dogs that are not yet released (filter out released records)

## Release Plan - Archiving & Status
- [x] Add firstReleasedAt, lastReleasedAt, archivedAt columns to release_plans table
- [x] saveRelease updates firstReleasedAt (first time) and lastReleasedAt (every time) on the plan
- [x] When all dogs in a plan are released, set archivedAt on the plan
- [x] getReleasePlans excludes archived plans from the active list
- [x] Plans with at least one released dog (but not all) show "In Progress" badge

## Release Plan - Manual Archive Button
- [x] Remove auto-archive logic from saveRelease in routers.ts
- [x] Add archivePlan tRPC mutation in routers.ts
- [x] Add Archive button to each plan card in ReleasePlanPage

## Settings - Custom DOCX Template Upload
- [x] Add team_settings table (or reuse existing) with docxTemplateUrl column
- [x] Add getTeamSettings / saveDocxTemplate tRPC procedures
- [x] Update pdf.ts to fetch custom template from S3 URL when set, else use bundled abc.docx
- [x] Add DOCX template upload UI in Settings page

## Offline Queue for Camera Submissions
- [x] Create useOfflineQueue hook (IndexedDB) to store pending submissions with full payload
- [x] Update AddRecord to save to offline queue first, show persistent pending indicator if server fails
- [x] Show pending queue records in Lookup with Retry and Sync All buttons

## Offline Queue Improvements
- [x] Auto-retry Sync All when device comes back online (navigator.onLine / online event)
- [x] Raise offline cache to 100 records (pageSize 100 in cache write)
- [x] Add discard button on each pending queue row in Lookup

## Bug Fixes
- [x] Fix isSaving hardcoded false in AddRecord — button never disables, causes duplicate submissions
- [x] Fix Lookup cached records not showing instantly on first render

## Settings Page
- [x] Move DOCX template upload from Records tab to Settings page

## Instant Save (No AI Wait)
- [x] Remove client-side annotation wait from AddRecord — save immediately without waiting for AI
- [x] Trigger server-side annotation async after record is saved to DB

## Unblock Save Button
- [x] Remove analysisLoading from Save button disabled — AI description runs in background, does not block save
- [x] Remove any annotation blocking — save requires only photo + GPS lat/long

## Release Plans Offline Cache
- [x] Add IndexedDB cache helpers for release plans and their dogs
- [x] Update ReleasePlanPage to read from cache when offline

## Release Plan Dogs Offline Cache
- [x] Add IndexedDB cache helpers for plan dogs (per plan ID)
- [x] Update ReleasePlanPage to read/write plan dogs from IndexedDB

## Plan Photo Offline Queue
- [x] Add IndexedDB queue helpers for plan photo mutations (addDogToPlan, saveRelease)
- [x] Update RecordDetailModal to queue plan photo mutations offline and retry on reconnect
- [x] Show pending plan photo queue items with retry/discard UI

## Queue UX Improvements
- [ ] Pending badge on Lookup nav tab icon showing count of unsynced items
- [ ] Server-side duplicate guard (unique constraint on dogId + teamId in dog_records)
- [ ] Queue age indicator in pending banners (e.g. "queued 2h ago")

## Airtable Integration
- [ ] Store AIRTABLE_API_TOKEN as secret

## Settings Cleanup
- [x] Remove webhook URL field from Settings page

## Airtable Login
- [ ] Add tRPC login procedure — check email/password against Airtable staff table, return user + team details
- [ ] Build login screen UI (email + password fields)
- [ ] Store session in localStorage (name, staffId, role, teamId, teamDetails) — no expiry until logout
- [ ] Gate entire app behind login; redirect to login if no session
- [ ] Add logout option in Settings/hamburger menu

## Login / Session
- [x] Show org/team name from session in header top-right (replace hardcoded @peepalfarm)
- [x] Add Logout button to drawer in Home.tsx
- [x] Wire onLogout prop from App.tsx into Home.tsx to clear session and return to login

## Header Badge
- [x] Show "staffName @ orgName" in top-right header badge from session

## Airtable Org Field Removal
- [x] Remove Org field from login procedure (routers.ts) and StaffSession type
- [x] Update header badge to show staffName @ teamId

## Header Org Name from Teams Table
- [x] Fetch Organization field from abc-teams table during login using staff's teamId
- [x] Store orgName in StaffSession and display as staffName @ orgName in header

## Catch Plan Feature
- [x] Add Catch Plan dropdown (Alpha/Beta/Charlie/Delta/Echo) to Add Record screen
- [x] Persist selected plan to localStorage
- [x] Dog IDs use format YYYYMMDD[A-E]-NNN (e.g. 20260324A-001)
- [x] Each plan has its own independent serial counter per day
- [x] Update getNextDogIdSuffix in db.ts to scope by planLetter
- [x] Update getNextSuffix tRPC procedure to accept planLetter

## Reliability & Observability
- [x] saveRecord server: S3 upload + DB insert now synchronous (client waits for confirmed DB write before clearing queue)
- [x] Client-side activity log stored in IndexedDB (appLog utility, capped at 500 entries)
- [x] AddRecord instrumented with logEvent calls (queued, save attempt, save confirmed, save failed)
- [x] Activity Log viewer in hamburger menu (IST timestamps, colour-coded by level, copy + clear buttons)

## Activity Log & Pending Sync Badge
- [x] Enrich "Save pressed" log entry with full record data (dogId, team, staff, area, lat/lng, notes, source, recordedAt)
- [x] Add amber "X records pending sync" badge at top of Catching screen (polls IndexedDB every 3 s)

## Bug Fixes - Reconnect Save Failure
- [ ] Fix "failed to fetch" on reconnect: add 1.5s delay after `online` event before retrying, so the network stack is fully ready before the save attempt fires
- [ ] Fix failed records not appearing in Lookup queue: Lookup only loads queue on mount; failed records from AddRecord are invisible until user navigates away and back. Add a storage event / BroadcastChannel so Lookup refreshes the queue whenever AddRecord writes a failure.

## Queue Display in Catching Tab
- [ ] Move full pending queue UI (per-item Retry/Discard + Sync All) from Lookup to Catching tab
- [ ] Keep BroadcastChannel listener in Catching tab so queue refreshes live after each save attempt
- [ ] Auto-retry on reconnect (with 2s delay) also runs from Catching tab

## Queue in Both Catching and Tag Tabs
- [x] Show full pending queue card (Retry/Discard per item + Sync All) in Catching tab
- [x] Show full pending queue card in Lookup (Tag) tab
- [x] Both tabs use BroadcastChannel so queue updates live in both places simultaneously
- [x] refreshQueue called after every save success/failure so card updates immediately

## Activity Log Layout
- [x] Row 1: timestamp | level badge | dogId — all on one line
- [x] Row 2: message spanning full width

## AddRecord Bugs
- [x] Queue card not showing — only a spinner appears, full list invisible
- [x] Save button blocked while background save in progress — user cannot save next record

## Queue Tray Redesign
- [x] Move queue out of page scroll into a fixed bottom slide-up tray
- [x] Tray shows a collapsed pill/banner when items exist, expands on tap
- [x] Remove inline queue card from AddRecord and Lookup scroll area
- [x] Tray visible in both Catching and Tag tabs

## Google Geocoding API
- [x] Store GOOGLE_MAPS_API_KEY as environment secret
- [x] Replace Nominatim with Google Geocoding API in geocodeLatLng procedure
- [x] Replace Nominatim with Google Geocoding API in saveRecord backfill

## Geocoding Enhancements
- [x] Area name format: Locality first, then Route (e.g. "Sungal, Mandi - Pathankot Road")
- [x] Add district column to dog_records (District/Tehsil, hidden from UI)
- [x] Add admin_area column to dog_records (State + Country, hidden from UI)
- [x] Pass district and admin_area in webhook payload on save
- [x] Geocode procedure returns district and adminArea alongside areaName

## Client-Side Share Flow
- [x] Install piexifjs for EXIF injection
- [x] Build annotateAndShare utility (Canvas annotation + EXIF + navigator.share)
- [x] Wire into AddRecord on Save — parallel, no impact on existing flow

## Share Flow Guard
- [x] annotateAndShare only fires for camera captures in Catch flow (not uploads, not release/other photos)

## Label Change
- [x] Rename "Catch Plan" to "Catching Team" in Catch tab

## IP Login Rate Limiting
- [x] Add login_attempts table to DB schema
- [x] Add blocked_ips table to DB schema
- [x] Rate-limit logic in airtable.login (block after 10 failures in 15 min window)
- [x] Public checkIpBlock tRPC endpoint
- [x] IP Blocked screen shown instead of login form for blocked IPs

## notifyOwner on IP Block
- [x] Call notifyOwner() when an IP is auto-blocked in recordLoginAttempt
- [x] Update ip-login-ratelimit skill with notifyOwner pattern

## Release Flow - Photo Required + Offline Queue
- [x] Release button disabled until photo is added (camera or upload)
- [x] Remove "(optional)" text from release dialog
- [x] Queue release entry to IndexedDB on confirm (background sync)
- [x] Background retry for release queue items (same pattern as catch queue)
- [x] Release queue items shown in PendingQueueBar

## Server Save Integrity + Release Queue in Releases Tab
- [x] Audit saveRecord: confirm server only returns success after DB write is fully committed
- [x] Add PendingReleaseBar to Releases tab showing pending release queue items

## Release Activity Log
- [ ] Add release_queued log entry in RecordDetailModal (dogId, team, staff, GPS, distance, photo3 present)
- [ ] Add release_attempt, release_confirmed, release_failed log entries in background retry

## Release Flow Activity Logging
- [x] Extend logEvent to accept optional payload object (4th arg, serialized as JSON)
- [x] Add release_queued log entry when release is saved to IndexedDB
- [x] Add release_attempt log entry when background sync starts
- [x] Add release_confirmed log entry on successful server save
- [x] Add release_failed log entry on background sync error

## Queue Bar & Badge Fixes
- [x] Hide catch queue bar (PendingQueueBar) from Tag/Lookup tab — only show in Catching tab
- [x] Fix pending badge: show on Catch tab when catch queue has items, Releases tab when release queue has items (not always Tag)

## Queue Bar Placement Fix
- [x] Remove PendingQueueBar from Lookup/Tag tab (catch queue bar belongs only in Catch tab)
- [x] Fix nav badge: show on Catch tab for catch queue items, Release tab for release queue items

## Checked Plan Photo Queue in Tag Tab
- [x] Create PendingCheckedBar component (same style as PendingQueueBar/PendingReleaseBar) for type:checked items
- [x] Add PendingCheckedBar to Lookup/Tag tab
- [x] Show red badge on Tag nav tab only when checked plan photo items are queued

## Queue Age Warning & Reconnect Retry
- [x] Add amber/red age warning to PendingQueueBar items older than 30 min
- [x] Add amber/red age warning to PendingReleaseBar items older than 30 min
- [x] Add amber/red age warning to PendingCheckedBar items older than 30 min
- [x] Extend online reconnect handler in Lookup to also retry checked plan-add items (already handled — retryPlanPhoto covers all types)

## PWA Offline Fix
- [x] Remove/bypass "need connection to load" offline guard so app shell loads from cache
- [x] Ensure Catch tab works fully offline (no blocking network calls)
- [x] Verify service worker caches app shell assets correctly

## Remove AI Description from Catch Tab
- [x] Hide description field in AddRecord (Catch tab)
- [x] Remove analyzeImage AI call on image capture/upload in Catch tab
- [x] Keep geocode (lat/long → place name) call intact

## GPS Not Available Display
- [x] Show "GPS not available" where lat/long would appear under the place field when no coordinates are present

## Camera Flow: Read-only Datetime
- [x] Make date/time field read-only (non-editable) when imageSource === "camera" in Catch tab

## Server saveRecord Phase 2 Refactor
- [x] Annotate all images (camera and upload), not just camera
- [x] Remove geocode backfill from server
- [x] AI description always if empty — colour + distinct physical features only, no age/breed
- [x] Remove image-ready and image-annotated webhooks
- [x] Fire single update webhook at end with description, imageUrl, annotatedImageUrl

## Offline UI
- [x] Add non-intrusive offline banner at top of app ("You are offline — Catch still works")
- [x] Add offline note on login page ("No internet connection — sign in when you're back online")

## Release Plan Offline Cache
- [x] Cache release plans and dog records (with lat/longs) in IndexedDB on Release tab load
- [x] Hydrate Release tab from IndexedDB cache when offline
- [x] Show "last synced" timestamp in Release tab when using cached data
- [x] Auto-refresh cache when connectivity returns

## Offline UI
- [x] Add non-intrusive offline banner at top of app ("You are offline — Catch still works")
- [x] Add offline note on login page ("No internet connection — sign in when you're back online")

## Photo Pre-cache & Annotation Notes
- [x] Add notes field to client-side annotation overlay (canvas stamp on share image)
- [x] Pre-cache dog thumbnail photos (photo2Url) via service worker runtime cache for offline release tab

## Pre-cache All Plan Dogs on Release Tab Open
- [x] When Release tab loads online and plans are fetched, background-fetch dogs for all plans and cache their photos

## Fix Photo Pre-fetch URL
- [x] Fix dog photo pre-fetch in ReleasePlanPage to use annotatedImageUrl (fallback imageUrl) instead of photo2Url/photoUrl

## Edit Record Field Restrictions
- [x] Make lat, long, date/time, dog ID read-only in edit record form
- [x] Remove lat, long, date/time, dog ID from updateRecord server mutation input and DB update
- [x] Remove lat, long, date/time, dog ID from /update webhook payload
- [x] Add gender to /update webhook payload

## Add adminArea to /add Webhook
- [x] Add adminArea to the /add webhook payload in AddRecord.tsx

## Remove "(from image)" Label in Upload Flow
- [x] Remove "(from image)" prefix from Date & Time and Area/Location labels in AddRecord upload flow

## Include District in adminArea
- [ ] Update adminArea in geocodeLatLng to include district + state + country

## Area Name Required Validation
- [x] Block saving catch record when area name is empty (upload and camera flows)

## District in adminArea & Save Button
- [x] Update adminArea in geocodeLatLng to include district + state + country
- [x] Disable Save Record button visually when area name is empty

## Server Geocode Backfill
- [x] In saveRecord Phase 2: if lat/long present and areaName or adminArea is empty, call Google geocode and fill only the empty fields
- [x] Run backfill BEFORE the /update webhook call
- [x] Include final areaName and adminArea in the /update webhook

## Non-blocking GPS in Release Flow
- [x] Release GPS request should time out gracefully (not block) when GPS is on but data is off

## Non-blocking Geocode in Release Flow
- [x] Restore enableHighAccuracy GPS; fire geocode in background so dialog opens immediately after GPS fix

## Filter Release Plan Dogs by Team
- [x] Add teamIdentifier param to getPlanDogs tRPC procedure
- [x] Update getReleasePlanDogs in db.ts to filter by teamIdentifier (inner join with dog_records.teamIdentifier)
- [x] Pass teamIdentifier from ReleasePlanPage client to getPlanDogs query
- [x] Update background pre-fetch in ReleasePlanPage to also pass teamIdentifier

## Release Flow Bug Fixes
- [ ] Fix distance "unavailable": use rec.latitude/rec.longitude (freshRecord) not record.latitude (stale prop)
- [ ] Fix slow GPS: increase maximumAge to 60s so a recent cached fix is reused immediately

## Bug - Deleted Dogs in Release Plan
- [x] Add deleted=false filter to getReleasePlanDogs query so deleted records don't appear in release plans

## Offline Bug Fixes
- [x] Fix app not loading offline: replaced manual SW with workbox-precaching via VitePWA — all hashed JS/CSS bundles now precached on install
- [x] Fix offline dog ID: also trigger localStorage fallback when suffixQuery.fetchStatus === "paused" (React Query's offline signal)
- [x] Fix GPS with data off: increased maximumAge to 120s in both catch and release flows; GPS coords set immediately before geocode attempt

## GPS Timeout & Countdown
- [x] Increase GPS timeout to 60s in catch and release flows
- [x] Show live countdown (60→0) on "Mark as Released" button while GPS is acquiring

## Bug - Offline Plan Membership Missing
- [x] Diagnose why isInAnyPlan is false offline: getDogPlans/getDogPlanDetails were never prefetched, so React Query cache was empty offline
- [x] Fix: prefetch getDogPlans + getDogPlanDetails for every dog in every plan during background prefetch in ReleasePlanPage

## Offline Strip UI
- [x] Remove orange header strip "you are offline, catch still works"
- [x] Add yellow offline strip inside Catch tab matching Release tab style

## Bug - App Doesn't Load Catch Tab When Started Offline
- [x] Root cause: SW navigation used NetworkFirst with no timeout — browser waited ~30s before falling back to cached index.html
- [x] Fix: added networkTimeoutSeconds: 3 to navigation handler so cached shell loads in ≤3s when offline

## Bug - SW Falls Back to offline.html Instead of index.html
- [x] Deleted offline.html from client/public so it is no longer in the precache manifest; index.html is now the only navigation fallback

## Offline Page - Replace "Try Again" with "Go to App"
- [ ] Find remaining offline page with "Try again" button and replace with "Go to App" button linking to /

## Bug - getDogPlans Shows Plans From Other Teams
- [x] Added teamIdentifier join/filter to getDogReleasePlans and getDogPlanDetails in db.ts
- [x] Added teamIdentifier param to getDogPlans and getDogPlanDetails procedures in routers.ts
- [x] Passed teamIdentifier from RecordDetailModal queries and invalidate calls
- [x] Passed teamIdentifier from ReleasePlanPage prefetch calls

## Security - Add teamIdentifier Guards to All Dog Update Paths
- [x] Added teamIdentifier guard to updateDogRecordAnnotation (optional param, passed from saveRecord)
- [x] saveReleaseData already had WHERE id = ? AND teamIdentifier = ? guard
- [x] addDogToReleasePlan photo2Url updates now look up plan's teamIdentifier and scope the WHERE clause

## Security - Team Scoping Audit
- [x] Fixed inReleasePlan query: now innerJoins release_plans and filters by teamIdentifier + archivedAt IS NULL
- [x] Audit complete — see findings below

### Audit Findings
- updatePlanAfterRelease: no team guard (planId only) — LOW risk, called internally after release
- reorderPlanDogs: no team guard (planId only) — LOW risk, planId scoped to team via UI
- removeDogFromReleasePlan: no team guard (planId+dogId) — LOW risk, same reason
- moveDogToPlan: no team guard — LOW risk, called internally
- getDogIdByRecordId: no team guard (read-only, returns dogId only) — LOW risk
- All write paths for dog_records now have teamIdentifier guards

## Security - moveDog and removeDogFromPlan Team Guards
- [x] moveDog: added teamIdentifier, verifies dog + target plan both belong to team before moving
- [x] removeDogFromPlan: added teamIdentifier, verifies dog + plan both belong to team before removing

## Security & Correctness - reorderPlanDogs and Auto-Remove on Delete
- [x] Added team guard to reorderDogs: verifies plan belongs to team before reordering
- [x] Auto-remove dog from all team release plans on soft-delete (in deleteRecordById)

## Show Catch Time on Record Cards
- [x] Show HH:MM IST catch time on dog record cards in Records tab, in front of the date

## Bug - Release Plan Cards Show HH:MM:SS Instead of HH:MM
- [x] Replaced toLocaleString() with explicit HH:MM + date format on both release plan card layouts

## Release Tab - Green Release Timestamp on Released Dogs
- [x] Added green HH:MM DD MON YYYY release timestamp as bottommost line on both released dog card layouts in Release tab

## Bug - Release Plan Card Image/Text Misalignment
- [x] Changed items-stretch to items-start on list card flex row so image and text align to top

## Release Plan Card - Area Name & Alignment
- [x] Added releaseAreaName to green timestamp row on released dog cards
- [x] Aligned Dog ID, drag handle, and remove button to top of thumbnail using pt-2 + items-start

## Fix Geocode Area Name - Use sublocality_level_1 + locality
- [x] Updated geocodeLatLng procedure: removed result_type filter, now uses sublocality_level_1 + locality (e.g. PANTEHAR, Dargil)
- [x] Updated geocode backfill in saveRecord: same logic

## Release Plan - Call Animal's Person Modal
- [x] When tapping a dog in the release plan, if notes contain a 10+ digit number, show a modal with the notes and bold "Call animal's person!" before opening RecordDetailModal

## /api/stops REST Endpoint
- [x] Add getStops DB helper: catch stops (addedByStaffId IN staffIds, date match) + release stops (releasedByStaffId IN staffIds, releasedAt date match)
- [x] Add GET /api/stops?staffId=S7,S6&date=20260407 Express route with comma-split staffId support

## Batch Changes (Apr 23)
- [x] Remove clear/delete button from activity log header in Home.tsx
- [x] Add save-to-camera-roll (annotateAndShare) for camera-taken release photos in RecordDetailModal.tsx
- [x] Hide archive button for in-progress release plans in ReleasePlanPage.tsx
- [x] Add releasedFar boolean column to dog_records schema
- [x] Add releaseFarThreshold integer column to team_settings schema
- [x] Compute releasedFar on release in saveRelease procedure (compare releaseDistanceMetres vs threshold)
- [x] Add getReleaseFarThreshold/saveReleaseFarThreshold DB helpers and tRPC procedures
- [x] Add ReleaseFarThreshold setting to ConfigPage UI
- [x] Released section in RecordDetailModal: red background + AlertTriangle icon + lat/long when releasedFar
- [x] Released capsule in Lookup.tsx: red when releasedFar
- [x] Released capsule in ReleasePlanPage.tsx (list + thumb): red when releasedFar
- [x] Plan status capsule (In Progress/Completed) in ReleasePlanPage: red when anyReleasedFar
- [x] Add anyReleasedFar field to getReleasePlans enrichment in db.ts
- [x] Block deletion of release plans that have any dogs in them (client + server guard)

## GPS Accuracy Feature
- [x] Add gpsAccuracy (catch) and releaseGpsAccuracy columns to dog_records schema
- [x] Push DB migration
- [x] Update saveRecord DB helper to accept and store gpsAccuracy
- [x] Update saveReleaseData DB helper to accept and store releaseGpsAccuracy
- [x] Update AddRecord to capture accuracy from Geolocation API and pass to server
- [x] Update RecordDetailModal release flow to capture release GPS accuracy and pass to server
- [x] Include gpsAccuracy in catch webhook payload (/add and /update)
- [x] Include releaseGpsAccuracy in release webhook payload (/release)
- [x] Add GPS accuracy indicator to app header (±Xm, colour-coded green/amber/red)
