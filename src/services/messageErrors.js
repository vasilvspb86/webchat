export class MessageError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

export const MESSAGE_ERROR_CODES = Object.freeze({
  INVALID_CONTENT:    400,
  INVALID_INPUT:      400,
  NOT_FOUND:          404,
  FORBIDDEN:          403,
  REPLY_NOT_FOUND:    404,
  REPLY_IN_OTHER_ROOM:400,
})
