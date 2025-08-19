const { CosmosClient } = require('@azure/cosmos')
const { ServiceBusClient } = require('@azure/service-bus')
module.exports = async function (context, myTimer) {
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
const database = cosmosClient.database('StudyBuddyDB')
const sessionsContainer = database.container('Sessions')
const groupsContainer = database.container('Groups')
const usersContainer = database.container('Users')
const serviceBusClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING)
const sender = serviceBusClient.createSender('notifications')
    try {
    // Find sessions starting in the next hour
    const nextHour = new Date()
    nextHour.setHours(nextHour.getHours() + 1)
    const now = new Date()
    const querySpec = {
        query: `
            SELECT * FROM sessions s 
            WHERE s.startTime >= @now 
            AND s.startTime <= @nextHour 
            AND s.reminderSent != true
        `,
        parameters: [
            { name: '@now', value: now.toISOString() },
            { name: '@nextHour', value: nextHour.toISOString() }
        ]
    }

    const { resources: upcomingSessions } = await sessionsContainer.items.query(querySpec).fetchAll()

    for (const session of upcomingSessions) {
        // Get group members
        const { resource: group } = await groupsContainer.item(session.groupId, session.partitionKey.split('T')[0]).read()
        
        for (const member of group.members) {
            // Get user email
            const { resource: user } = await usersContainer.item(member.userId, group.partitionKey).read()
            
            // Send reminder notification
            await sender.sendMessages({
            body: {
                type: 'session_reminder',
                data: {
                userEmail: user.email,
                userName: user.name,
                sessionTitle: session.title,
                startTime: session.startTime,
                location: session.location,
                groupName: group.name,
                topics: session.topics
                }
            }
            })
        }
        
        // Mark reminder as sent
        session.reminderSent = true
        await sessionsContainer.item(session.id, session.partitionKey).replace(session)
    }

    context.log(`Processed ${upcomingSessions.length} session reminders`)
    } catch (error) {
        context.log.error('Error processing session reminders:', error)
    } finally {
        await sender.close()
    }
    await serviceBusClient.close()}