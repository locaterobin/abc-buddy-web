# ABC Buddy - Project TODO

## Database & Backend
- [x] Dog records table schema (id, teamIdentifier, dogId, imageUrl, originalImageUrl, description, notes, latitude, longitude, areaName, source, recordedAt, createdAt)
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

## Frontend - Layout & Theme
- [x] Mobile-first clean field-ready UI theme
- [x] Bottom tab navigation (Add Record, Lookup, Settings)
- [x] Responsive design for phones and tablets

## Frontend - Add Record Tab
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

## Frontend - Lookup Tab
- [x] Time range selector (7 days, 30 days, All time)
- [x] Image upload for visual search
- [x] Search results with confidence badges (High/Possible/Low match)
- [x] Result detail modal on tap

## Frontend - Settings Tab
- [x] Team ID display and management (change, generate new)
- [x] Webhook URL configuration
- [x] Records list (newest first, thumbnail, Dog ID, date, area)
- [x] Record detail modal (full image, metadata, GPS link, delete)
- [x] Export JSON button
- [x] Delete record functionality

## Integration
- [x] Webhook POST on record save
- [x] GPS handling (browser geolocation + EXIF fallback)
- [x] Reverse geocoding via Nominatim

## Testing
- [x] Vitest tests for backend procedures

## UX Improvements (User Request)
- [x] Auto-trigger AI analysis on image upload (remove manual Analyse button)
- [x] AI Vision extracts burnt-in GPS lat/lng, date/time, and place name from uploaded images
- [x] Camera button opens actual device camera (capture=environment), not file picker
- [x] Device GPS + date/time used when capturing from camera; place name from reverse geocoding
- [x] Auto-annotate image on Save Record (remove manual Annotate button)
- [x] Remove manual Analyse with AI and Annotate Image buttons from UI

## Lookup Time Range Update
- [x] Change Lookup time range options from 7days/30days/all to 3days/7days/30days (default: 7days)

## Deploy Fix
- [x] Replace canvas (native C++ - breaks deployment) with pure-JS image annotation using sharp + SVG overlay

## Upload vs Camera Flow
- [x] Skip annotation for Upload source — save original image as-is; only annotate Camera captures
