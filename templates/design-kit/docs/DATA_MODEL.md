# Data model

`reviews` stores one row per persona and catalog entry: entry id, review status, note and update time. The database uses IndexedDB through Dexie. Review data belongs to the current local prototype and is not shared with other users or devices.
