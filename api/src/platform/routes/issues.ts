import { createPublicDocumentResourceRouter } from './documents.js';

export default createPublicDocumentResourceRouter({
  fixedDocumentType: 'issue',
  listScope: 'issues:read',
  writeScope: 'issues:write',
  defaultDocumentType: 'issue',
});
