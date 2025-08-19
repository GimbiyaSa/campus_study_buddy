const { ServiceBusClient } = require('@azure/service-bus')
const { EmailClient } = require('@azure/communication-email')

module.exports = async function (context, myTimer) {
  const serviceBusClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
  const emailClient = new EmailClient(process.env.COMMUNICATION_CONNECTION_STRING)
  
  const receiver = serviceBusClient.createReceiver('notifications')
  
  try {
    const messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 5000 })
    
    for (const message of messages) {
      const { type, data } = message.body
      
      switch (type) {
        case 'session_reminder':
          await sendSessionReminder(emailClient, data)
          break
        case 'group_invitation':
          await sendGroupInvitation(emailClient, data)
          break
        case 'partner_match':
          await sendPartnerMatch(emailClient, data)
          break
      }
      
      await receiver.completeMessage(message)
    }
  } catch (error) {
    context.log.error('Error processing notifications:', error)
  } finally {
    await receiver.close()
  }
}

async function sendSessionReminder(emailClient, data) {
  const emailMessage = {
    senderAddress: "noreply@students.wits.ac.za",
    content: {
      subject: `Study Session Reminder: ${data.sessionTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0078d4;">Study Session Reminder</h2>
          <p>Hi ${data.userName},</p>
          <p>Don't forget about your upcoming study session:</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${data.sessionTitle}</h3>
            <p><strong>Time:</strong> ${new Date(data.startTime).toLocaleString()}</p>
            <p><strong>Location:</strong> ${data.location}</p>
            <p><strong>Group:</strong> ${data.groupName}</p>
            ${data.topics ? `<p><strong>Topics:</strong> ${data.topics.join(', ')}</p>` : ''}
          </div>
          <p>Best of luck with your studies!</p>
          <p>The Study Buddy Team</p>
        </div>
      `
    },
    recipients: {
      to: [{ address: data.userEmail }]
    }
  }

  await emailClient.beginSend(emailMessage)
}

async function sendGroupInvitation(emailClient, data) {
  const emailMessage = {
    senderAddress: "noreply@students.wits.ac.za",
    content: {
      subject: `Study Group Invitation: ${data.groupName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0078d4;">Study Group Invitation</h2>
          <p>Hi there,</p>
          <p>${data.invitedByName} has invited you to join the study group "${data.groupName}".</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${data.groupName}</h3>
            <p><strong>Course:</strong> ${data.course}</p>
            <p><strong>Subjects:</strong> ${data.subjects.join(', ')}</p>
            <p><strong>Description:</strong> ${data.description}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/groups/${data.groupId}" 
               style="background-color: #0078d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Group
            </a>
          </div>
          <p>Happy studying!</p>
          <p>The Study Buddy Team</p>
        </div>
      `
    },
    recipients: {
      to: [{ address: data.userEmail }]
    }
  }

  await emailClient.beginSend(emailMessage)
}