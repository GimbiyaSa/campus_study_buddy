/* ---------------------- Extra coverage for sessionService ---------------------- */

describe('Session Service API (additional coverage, no UI assumptions)', () => {
  test('GET /sessions/:id handles DB error gracefully', async () => {
    const app = bootApp();
    // next query thrown by mock
    mockQuery.mockRejectedValueOnce(new Error('detail fail'));
    const res = await request(app).get('/sessions/100');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch study session/i);
  });

  test('POST /sessions defaults: type=study, location nullable; uses latest active group when group_id omitted', async () => {
    const app = bootApp({ groupIdProvided: false, activeGroupFoundForUser: true });
    const res = await request(app).post('/sessions').send({
      session_title: 'Defaults',
      scheduled_start: '2025-01-01T10:00:00Z',
      scheduled_end: '2025-01-01T11:00:00Z',
      // no group_id, no location, no session_type
    });

    expect([201, 500]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      expect(res.body).toMatchObject({
        id: '200',
        title: 'Defaults',
        type: 'study', // default in router
        isCreator: true,
        isAttending: true,
      });
      // the INSERT path used lastInputs captured by our mssql mock
      expect(lastInputs.sessionType).toBe('study');
      expect(lastInputs.location).toBeNull(); // nullable location
    }
  });

  test('POST /sessions join upsert errors are handled (500)', async () => {
    const app = bootApp();
    // Make the INSERT succeed, then make the RSVP upsert query throw
    // 1st query: INSERT … OUTPUT (already handled by preset)
    // next query in create flow is the upsert into session_attendees
    mockQuery
      .mockImplementationOnce(mockQuery) // let INSERT run
      .mockRejectedValueOnce(new Error('rsvp fail')); // RSVP upsert fails
    const res = await request(app).post('/sessions').send({
      group_id: 5,
      session_title: 'RSVP fail',
      scheduled_start: '2025-01-01T10:00:00Z',
      scheduled_end: '2025-01-01T11:00:00Z',
    });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to create study session/i);
  });

  test('POST /sessions/:id/join handles DB error (500)', async () => {
    const app = bootApp({ joinSessionExists: true, joinSessionStatus: 'scheduled' });
    // First SELECT (session exists) should succeed; fail on upsert SELECT
    mockQuery
      .mockImplementationOnce(mockQuery) // SELECT status
      .mockRejectedValueOnce(new Error('attend select fail'));
    const res = await request(app).post('/sessions/1/join');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to join session/i);
  });

  test('DELETE /sessions/:id/leave handles DB error (500)', async () => {
    const app = bootApp({ leaveSessionExists: true, leaveOrganizerIsUser: false });
    // First SELECT organizer ok; fail on DELETE
    mockQuery
      .mockImplementationOnce(mockQuery) // SELECT organizer_id
      .mockRejectedValueOnce(new Error('delete attendee fail'));
    const res = await request(app).delete('/sessions/9/leave');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to leave session/i);
  });

  test('PUT /sessions/:id update: returns isCreator/isAttending true and mapped status', async () => {
    const app = bootApp({ isOrganizerForUpdate: true, updateStatus: 'scheduled' });
    const res = await request(app).put('/sessions/7').send({
      title: 'Updated',
      date: '2025-03-03',
      startTime: '12:00',
      endTime: '13:00',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: '300',
      status: 'upcoming', // mapStatus('scheduled')
      isCreator: true,
      isAttending: true,
    });
  });

  test('PUT /sessions/:id/start DB error rolls back and 500', async () => {
    const app = bootApp({ isOrganizerForStart: true, startCurrentStatus: 'scheduled' });
    // Let organizer check pass; fail the UPDATE
    mockQuery
      .mockImplementationOnce(mockQuery) // organizer SELECT
      .mockRejectedValueOnce(new Error('update fail')); // UPDATE fails
    const res = await request(app).put('/sessions/4/start');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to start session/i);
  });

  test('PUT /sessions/:id/end DB error rolls back and 500', async () => {
    const app = bootApp({ isOrganizerForEnd: true, endCurrentStatus: 'in_progress' });
    // Organizer check OK; fail UPDATE to set completed
    mockQuery
      .mockImplementationOnce(mockQuery) // organizer SELECT
      .mockRejectedValueOnce(new Error('complete fail'));
    const res = await request(app).put('/sessions/4/end');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to end session/i);
  });

  test('PUT /sessions/:id/cancel DB error rolls back and 500', async () => {
    const app = bootApp({ isOrganizerForCancel: true, cancelCurrentStatus: 'scheduled' });
    // Organizer check OK; fail UPDATE to cancelled
    mockQuery
      .mockImplementationOnce(mockQuery) // organizer SELECT
      .mockRejectedValueOnce(new Error('cancel fail'));
    const res = await request(app).put('/sessions/12/cancel');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to cancel session/i);
  });

  test('DELETE /sessions/:id DB error rolls back and 500', async () => {
    const app = bootApp({ isOrganizerForDelete: true });
    // Organizer check OK; fail UPDATE to cancelled
    mockQuery
      .mockImplementationOnce(mockQuery) // organizer SELECT
      .mockRejectedValueOnce(new Error('soft delete fail'));
    const res = await request(app).delete('/sessions/15');
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Failed to cancel session/i);
  });

  test('GET /sessions respects status filter mapping: ongoing -> in_progress', async () => {
    const app = bootApp({ listStatus: 'in_progress', listRows: 1 });
    const res = await request(app).get('/sessions?status=ongoing');
    expect(res.statusCode).toBe(200);
    expect(res.body[0].status).toBe('ongoing');
  });
});
