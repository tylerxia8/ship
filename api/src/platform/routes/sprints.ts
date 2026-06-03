import { createPublicDocumentResourceRouter } from './documents.js';

export default createPublicDocumentResourceRouter({
  fixedDocumentType: 'sprint',
  listScope: 'sprints:read',
  writeScope: 'sprints:write',
  defaultDocumentType: 'sprint',
});
