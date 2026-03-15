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
