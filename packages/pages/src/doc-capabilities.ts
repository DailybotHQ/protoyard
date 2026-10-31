/**
 * Capabilities the doc tools check (simulated policy, not security). `edit`
 * is the kind runtime's `blocks:interact`: presenters and audience members
 * may edit a doc in their tab; viewers only read and download.
 */
export const DOC_CAPABILITIES = Object.freeze({ edit: 'blocks:interact' });
