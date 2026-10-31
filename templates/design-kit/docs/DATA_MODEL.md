# Data model

`sketches` (schema version 2) stores one Texuli canvas per screen sketch: title, canvas JSON, who changed it last and when. The service validates the canvas as untrusted input (`validateCanvas`) before every write.

`reviews` stores one row per persona and catalog entry: entry id, review status, note and update time. The database uses IndexedDB through Dexie. Review data belongs to the current local prototype and is not shared with other users or devices.
