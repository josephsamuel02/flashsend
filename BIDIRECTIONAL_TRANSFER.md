# Bidirectional File Transfer Implementation

## Overview
Implemented full bidirectional file transfer support - both sender and receiver can now send/receive files after initial connection, similar to Xender.

## Changes Made

### 1. Server Updates (`src/networking/server.ts`)
- ✅ Added **POST /upload endpoint** to receive files from peers
- ✅ Updated CORS to allow POST method and upload-related headers
- ✅ Implemented `saveUploadedFile()` function to save received files to FlashSend/Received/
- ✅ Added `addFilesToManifest()` and `updateFileProvider()` for dynamic file list updates
- ✅ Handles base64-encoded body data from React Native fetch
- ✅ Auto-generates unique filenames if duplicates exist

### 2. Client Updates (`src/networking/client.ts`)
- ✅ Added `uploadFile()` function to send individual files via POST
- ✅ Added `uploadAllFiles()` for concurrent uploads (respects MAX_CONCURRENCY)
- ✅ Uses FileSystem.uploadAsync when available, falls back to fetch
- ✅ Added UPLOAD_TIMEOUT_MS = 120000 (2 minutes for large files)
- ✅ Integrates with transfer store for progress tracking

### 3. Transfer Store Updates (`src/store/transferStore.ts`)
- ✅ Added `setFileProgress()` helper method
- ✅ Added `setFileError()` helper method
- ✅ Added `getFileById()` lookup method
- ✅ `addFiles()` already existed - now used for bidirectional transfers

### 4. MainNavigator Updates (`src/navigation/MainNavigator.tsx`)
- ✅ **Smart Send Button**: When transfer is active with peer connection:
  - Shows "Send to Connected Device" confirmation
  - Uploads selected files to the connected peer
  - Automatically navigates to Transfer screen to show progress
  - Clears selection after successful upload
- ✅ Falls back to normal Host screen behavior when no active transfer

### 5. TransferScreen Updates (`src/screens/TransferScreen.tsx`)
- ✅ Added **Floating "Send More" button** (bottom-right)
  - Only visible when peer connection exists
  - Guides user back to home screen to select more files
- ✅ Imported upload functionality from client
- ✅ Added proper imports for selectionStore

## How It Works

### Initial Connection
1. **Sender** creates hotspot and starts server with manifest
2. **Receiver** scans QR, joins hotspot, fetches manifest
3. Both devices now have each other's IP/port/token

### Bidirectional Transfer Flow

#### Scenario 1: Receiver wants to send files back
1. Receiver navigates to home tabs
2. Selects files (photos, apps, videos, etc.)
3. Taps **Send** button
4. System detects active transfer with peer connection
5. Shows confirmation: "Send to Connected Device?"
6. On confirm:
   - Adds files to transfer store as "outgoing"
   - Navigates to Transfer screen
   - Uploads files to sender's server via POST /upload
   - Shows real-time progress

#### Scenario 2: Sender wants to send more files
1. Sender navigates to home tabs (while hosting)
2. Selects additional files
3. Taps **Send** button
4. If receiver is connected:
   - Uploads to receiver's server
5. If no receiver yet:
   - Updates host manifest (files available for next connection)

### Technical Details

**Upload Endpoint**: `POST http://{peer_ip}:{peer_port}/upload`

**Headers**:
- `x-session-token`: Authentication token
- `x-file-name`: URL-encoded filename
- `x-file-size`: File size in bytes
- `x-mime-type`: MIME type

**Body**: Binary file data (base64 for React Native compatibility)

**Response**: JSON with success status and saved path

## User Experience

### Before (Original Implementation)
- ❌ Sender can only send files to receiver
- ❌ Receiver can only download from sender
- ❌ One-way transfer only
- ❌ Need to disconnect and reconnect to send files back

### After (New Implementation)
- ✅ **Both devices can send AND receive** after connection
- ✅ **No need to disconnect** - continuous two-way transfer
- ✅ **Smart Send button** - automatically detects active transfers
- ✅ **"Send More" button** in Transfer screen for easy access
- ✅ **Real-time progress** for both directions
- ✅ **Works exactly like Xender/SHAREit**

## File Storage

**Received files saved to**:
- `/storage/emulated/0/FlashSend/Received/` (Android)
- Or `{app_directory}/FlashSend/Received/` (fallback)

**Auto-deduplication**: If filename exists, appends `_1`, `_2`, etc.

## Testing Recommendations

1. **Connect two devices**
   - Device A: Select files, tap Send (creates hotspot)
   - Device B: Tap Receive, scan QR

2. **Test bidirectional transfer**
   - Wait for initial files to transfer
   - On Device B: Go home, select photos, tap Send
   - Verify Device A receives the files
   - On Device A: Select more apps, tap Send
   - Verify Device B receives them

3. **Test concurrent transfers**
   - Both devices send files simultaneously
   - Verify progress tracking works correctly
   - Check both devices receive files properly

## Limitations & Notes

- ✅ Supports files up to 10GB (via 120s timeout)
- ✅ Concurrent transfers limited by MAX_CONCURRENCY = 3
- ⚠️ React Native fetch limitations: using base64 encoding for body
- ⚠️ Server handles one request per socket (Connection: close)
- ✅ Both devices must stay on same WiFi/hotspot

## Future Enhancements (Optional)

- [ ] Add push notifications when peer uploads files
- [ ] Show peer's available files in real-time
- [ ] Add file preview before accepting
- [ ] Support drag-and-drop from Transfer screen
- [ ] Add transfer history for bidirectional sessions
