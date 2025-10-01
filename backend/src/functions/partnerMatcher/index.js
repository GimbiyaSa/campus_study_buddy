const sql = require('mssql');
const { ServiceBusClient } = require('@azure/service-bus');

module.exports = async function (context, myTimer) {
  let pool;

  try {
    // Connect to Azure SQL Database
    const dbConfig = {
      server: process.env.DB_SERVER,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        requestTimeout: 30000,
        connectionTimeout: 30000,
      },
    };

    pool = await sql.connect(dbConfig);

    const serviceBusClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING);
    const sender = serviceBusClient.createSender('notifications');

    // Find sessions starting in the next hour
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1);
    const now = new Date();

    const request = pool.request();
    request.input('now', sql.DateTime, now);
    request.input('nextHour', sql.DateTime, nextHour);

    const sessionsResult = await request.query(`
      SELECT 
        ss.session_id,
        ss.group_id,
        ss.session_title,
        ss.scheduled_start,
        ss.location,
        ss.description,
        sg.group_name
      FROM study_sessions ss
      INNER JOIN study_groups sg ON ss.group_id = sg.group_id
      WHERE ss.scheduled_start >= @now 
      AND ss.scheduled_start <= @nextHour 
      AND ss.reminder_sent != 1
    `);

    const upcomingSessions = sessionsResult.recordset;

    for (const session of upcomingSessions) {
      // Get group members with user details
      const membersRequest = pool.request();
      membersRequest.input('groupId', sql.Int, session.group_id);

      const membersResult = await membersRequest.query(`
        SELECT 
          u.user_id,
          u.email,
          u.first_name + ' ' + u.last_name as name
        FROM group_members gm
        INNER JOIN users u ON gm.user_id = u.user_id
        WHERE gm.group_id = @groupId 
        AND gm.status = 'active'
      `);

      const members = membersResult.recordset;

      for (const member of members) {
        // Send reminder notification
        await sender.sendMessages({
          body: {
            type: 'session_reminder',
            data: {
              userEmail: member.email,
              userName: member.name,
              sessionTitle: session.session_title,
              startTime: session.scheduled_start,
              location: session.location,
              groupName: session.group_name,
              description: session.description,
            },
          },
        });
      }

      // Mark reminder as sent
      const updateRequest = pool.request();
      updateRequest.input('sessionId', sql.Int, session.session_id);
      await updateRequest.query(`
        UPDATE study_sessions 
        SET reminder_sent = 1 
        WHERE session_id = @sessionId
      `);
    }

    context.log(`Processed ${upcomingSessions.length} session reminders`);
  } catch (error) {
    context.log.error('Error processing session reminders:', error);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
};
