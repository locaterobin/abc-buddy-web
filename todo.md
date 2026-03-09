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
- [ ] Phone back button closes RecordDetailModal
