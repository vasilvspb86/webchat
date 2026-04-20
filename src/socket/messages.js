export async function sendMessage(io, socket, prisma, { roomId, content, replyToId, attachmentIds }) {
  if (!roomId || (!content?.trim() && !attachmentIds?.length)) return
  const { userId } = socket
  try {
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } })
    if (!member) return socket.emit('error', { message: 'Not a member of this room' })
    if (content && Buffer.byteLength(content, 'utf8') > 3072) {
      return socket.emit('error', { message: 'Message exceeds 3 KB limit' })
    }
    const message = await prisma.message.create({
      data: {
        roomId, authorId: userId, content: content || null, replyToId: replyToId || null,
        ...(attachmentIds?.length && { attachments: { connect: attachmentIds.map(id => ({ id })) } }),
      },
      include: {
        author: { select: { id: true, username: true } },
        attachments: true,
        replyTo: { select: { id: true, content: true, deleted: true, author: { select: { id: true, username: true } } } },
      },
    })
    io.to(roomId).emit('new_message', message)

    const members = await prisma.roomMember.findMany({ where: { roomId, NOT: { userId } }, select: { userId: true, lastReadMessageId: true } })
    for (const m of members) {
      const anchor = m.lastReadMessageId ? await prisma.message.findUnique({ where: { id: m.lastReadMessageId } }) : null
      const count = await prisma.message.count({
        where: { roomId, deleted: false, ...(anchor && { createdAt: { gt: anchor.createdAt } }) },
      })
      io.to(`user:${m.userId}`).emit('unread_count', { roomId, count: Math.min(count, 99) })
    }
  } catch (err) {
    console.error('sendMessage error', err)
    socket.emit('error', { message: 'Failed to send message' })
  }
}

export async function editMessage(io, socket, prisma, { messageId, content }) {
  if (!content?.trim() || !messageId) return
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } })
    if (!message || message.deleted || message.authorId !== socket.userId) return
    await prisma.message.update({ where: { id: messageId }, data: { content, edited: true } })
    io.to(message.roomId).emit('message_edited', { messageId, content })
  } catch (err) { console.error('editMessage error', err) }
}

export async function deleteMessage(io, socket, prisma, { messageId }) {
  if (!messageId) return
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } })
    if (!message || message.deleted) return
    const membership = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: socket.userId, roomId: message.roomId } } })
    if (message.authorId !== socket.userId && !membership?.isAdmin) return
    await prisma.message.update({ where: { id: messageId }, data: { deleted: true, content: null } })
    io.to(message.roomId).emit('message_deleted', { messageId })
  } catch (err) { console.error('deleteMessage error', err) }
}

export async function markRead(socket, prisma, { roomId, messageId }) {
  try {
    await prisma.roomMember.updateMany({ where: { userId: socket.userId, roomId }, data: { lastReadMessageId: messageId } })
  } catch (err) { console.error('markRead error', err) }
}
