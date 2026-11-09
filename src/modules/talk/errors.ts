/**
 * Talk's own error codes, for its routes to answer with and its pages to show.
 * Each needs a message in `talk.errors.<code>`.
 */
export const ERRORS = [
  'conversationNotFound',
  'notInConversation',
  'cannotTalkToYourself',
  'messageNotFound',
  'notYourMessage',
  'callNotFound',
  'groupNotFound',
  'notGroupOwner',
  'groupNameRequired',
  'groupNameTooLong',
  'groupNeedsPeople',
  'groupFull',
  'useLeaveGroup',
  'notInGroup',
  'alreadyLeftGroup',
  'leaveGroupFirst',
  'emptyAttachment',
  'attachmentNotFound',
  'previewSizeMissing',
  'previewNotPicture',
  'pushServiceNotAllowed',
  'pushKeysInvalid',
  'pushNotOn',
  'pushDeviceGone',
  'pushRefused',
] as const;
