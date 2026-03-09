# ABC Buddy - Project TODO

## Database & Backend
- [x] Dog records table schema
- [x] DB helpers for CRUD operations on dog_records
- [x] tRPC router: dogs.generateTeamId
- [x] tRPC router: dogs.analyzeImage (OpenAI Vision)
- [x] tRPC router: dogs.geocodeLatLng (Nominatim)
- [x] tRPC router: dogs.lookupDog (visual similarity)
- [x] tRPC router: dogs.saveRecord (S3 upload + DB insert + webhook)
- [x] tRPC router: dogs.getRecords
- [x] tRPC router: dogs.deleteRecord
- [x] tRPC router: dogs.checkDogId
- [x] tRPC router: dogs.annotateRecord (canvas image annotation)
- [x] tRPC router: dogs.getNextSuffix
- [x] Install canvas npm package for server-side image annotation

## Frontend
- [x] Mobile-first clean field-ready UI theme
- [x] Bottom tab navigation (Add Record, Lookup, Settings)
- [x] Responsive design for phones and tablets

## Add Record Tab
- [x] Image upload with drag-and-drop and camera capture
- [x] Image preview after selection
- [x] Auto-generate Dog ID (YYYYMMDD-NNN format)
- [x] Dog ID uniqueness check (real-time)
- [x] Date/time picker pre-filled with current time
- [x] Area name field with auto-geocoding from GPS
- [x] Notes textarea
- [x] "Analyse with AI" button (OpenAI Vision description)
- [x] "Annotate Image" button (server-side text burn-in)
- [x] "Save Record" button (S3 upload + DB save + webhook)
- [x] Auto-increment Dog ID after save
- [x] Browser geolocation auto-detect on upload

## Lookup Tab
- [x] Time range selector (7 days, 30 days, All time)
- [x] Image upload for visual search
- [x] Search results with confidence badges (High/Possible/Low match)
- [x] Result detail modal on tap

## Settings Tab
- [x] Team ID display and management (change, generate new)
- [x] Webhook URL configuration
- [x] Records list (newest first, thumbnail, Dog ID, date, area)
- [x] Record detail modal (full image, metadata, GPS link, delete)
- [x] Export JSON button
- [x] Delete record functionality

## Integrations
- [x] Webhook POST on record save
- [x] GPS handling (browser geolocation + EXIF fallback)
- [x] Reverse geocoding via Nominatim
- [x] Vitest tests for backend procedures

## Deploy Fix
- [x] Replace canvas (native C++ - breaks deployment) with pure-JS image annotation using sharp + SVG overlay

## Upload vs Camera Flow
- [x] Skip annotation for Upload source — save original image as-is; only annotate Camera captures

## Bug Fixes
- [x] Fix annotation font rendering (SVG text shows as dots/rectangles - no system fonts in sharp/libvips)
- [x] Make save instant - confirm UI immediately, run S3+DB+webhook in background

## Bug Fixes Round 2
- [x] Fix annotation text rendering - write dynamic fonts.conf at startup + FONTCONFIG_PATH so sharp's bundled fontconfig finds Liberation Sans
- [x] Fix portrait photos showing as landscape - apply EXIF auto-rotate before annotation

## Lookup Tab Improvements
- [x] Add Camera + Upload picker to Lookup tab matching Add Record photo picker UI

## Env Defaults
- [x] Set VITE_DEFAULT_TEAM_ID=calm-otter and VITE_DEFAULT_WEBHOOK_URL as env vars, wire into TeamContext defaults

## Add Record UX
- [x] Make AI description field editable (textarea) on Add Record page

## UX Improvements (User Request)
- [x] Auto-trigger AI analysis on image upload (remove manual Analyse button)
- [x] AI Vision extracts burnt-in GPS lat/lng, date/time, and place name from uploaded images
- [x] Camera button opens actual device camera (capture=environment), not file picker
- [x] Device GPS + date/time used when capturing from camera; place name from reverse geocoding
- [x] Auto-annotate image on Save Record (remove manual Annotate button)
- [x] Remove manual Analyse with AI and Annotate Image buttons from UI

## Lookup Time Range Update
- [x] Change Lookup time range options from 7days/30days/all to 3days/7days/30days (default: 7days)
- [x] Change default time range to 3 days

## API Ingest Endpoint
- [x] POST /api/ingest: accepts image (base64) + teamId + gpsLat + gpsLng + areaName + recordedAt
- [x] API key auth via X-API-Key header (INGEST_API_KEY env var)
- [x] Skip burnt-in metadata extraction (source=api); run AI description only
- [x] Full pipeline: AI description → Dog ID → S3 upload → DB save → webhook
- [x] Return saved record JSON (dogId, imageUrl, aiDescription, gpsLat, gpsLng, areaName, recordedAt)
- [x] Vitest for the ingest endpoint (4 tests: auth, validation, bad date)

## Header
- [x] Show app version number under app name in header

## Performance
- [x] Client-side image resize before AI analysis and save (max 1280px, 80% JPEG quality)

## Camera Save UX
- [x] Camera save: reset form instantly, run annotation + S3 + DB + webhook in background (no waiting on "Annotating...")

## PDF Form Generation
- [ ] Install puppeteer/html-pdf library for server-side PDF rendering
- [ ] Build GET /api/record/:dogId/pdf endpoint — fill {dog Id}, {date}, {notes}, {location}, {description}
- [ ] Recreate Google Doc form layout in HTML (tables, surgery fields left blank)
- [ ] Add "Print Form" button on each record in Settings

## PDF Form Generation
- [x] GET /api/record/:dogId/pdf?team=<teamId> endpoint
- [x] PDFKit pure-JS PDF generation (no system dependencies)
- [x] Fill Dog ID, date, location, description, notes from DB record
- [x] Recreate Google Doc template layout (surgery, premedication, induction, maintenance sections)
- [x] Print Form button (FileText icon) on each record row in Settings

## PDF via docxtemplater (DOCX template)
- [x] Inspect abc.docx template tags ({dog id}, {date}, {location}, {description}, {notes})
- [x] Install docxtemplater + pizzip, copy template to server/templates/
- [x] Serve filled DOCX directly (no LibreOffice needed, works in deployment)
- [x] Replace PDFKit route with docxtemplater /api/record/:dogId/docx route
- [x] Test DOCX output fills tags correctly
- [x] Update Settings button to download DOCX (tooltip: Download Form)

## Settings Records Filters & Timezone Fix
- [x] Add record ID search filter to Settings records list
- [x] Add date filter (date picker) to Settings records list
- [x] Fix timezone display to IST (GMT+5:30) in DOCX date field

## Timezone Fix (Deployment Server is UTC-4)
- [x] Fix DOCX date: use explicit timeZone "Asia/Kolkata" in formatDate (was showing UTC-4 server local time)
- [x] Fix image annotation date/time strip: use explicit timeZone "Asia/Kolkata" for dateStr and timeStr

## Released Button
- [x] Add "Released" button above Delete in record detail modal
- [x] On press: get device GPS, reverse-geocode to place name, fire POST to {webhookUrl}/release with dogId, current IST date, lat/lng, place name
- [x] Show loading state while getting GPS + geocoding
- [x] Show success/error toast after webhook fires

## Rename Settings → Records
- [x] Rename "Settings" tab label and icon aria-label to "Records" in bottom nav and page header

## Navigation Restructure
- [x] Rename Settings tab label to Records, change icon to ClipboardList (or similar)
- [x] Create new Settings tab (4th tab) with Settings icon - contains team ID and webhook config
- [x] Move team ID and webhook config out of SettingsPage into new SettingsTab
- [x] SettingsPage (now Records) shows only records list with filters

## Release Distance Check
- [x] Calculate Haversine distance between record's original GPS and current release GPS
- [x] Show distance in confirmation dialog before firing release webhook
- [x] Also include distance in the webhook payload sent to /release
- [x] Handle case where record has no GPS (skip distance, note in dialog)
