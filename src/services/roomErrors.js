export class RoomError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

// Exported for route layer to import and map.
export const ROOM_ERROR_CODES = Object.freeze({
  INVALID_NAME:       400,
  INVALID_DESCRIPTION:400,
  INVALID_VISIBILITY: 400,
  INVALID_INPUT:      400,
  NOT_FOUND:          404,
  NAME_TAKEN:         409,
  ALREADY_MEMBER:     409,
  NOT_MEMBER:         404,
  OWNER_CANNOT_LEAVE: 409,
  CANNOT_INVITE_SELF: 409,
  ALREADY_BANNED:     409,
  ALREADY_ADMIN:      409,
  PENDING_INVITE:     409,
  WRONG_VISIBILITY:   400,
  INVITE_EXPIRED:     410,
  FORBIDDEN:          403,
})
