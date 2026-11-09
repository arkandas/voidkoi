/**
 * Wiki's own error codes, for its routes to answer with and its pages to show.
 * Each needs a message in `wiki.errors.<code>`.
 */
export const ERRORS = ['invalidTitle', 'invalidSlug', 'slugTaken', 'reservedSlug', 'nothingToPublish', 'notPublished', 'publishFailed'] as const;
