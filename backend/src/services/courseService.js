const express = require('express');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);

const containerPromise = (async () => {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: 'StudyBuddyDB',
    throughput: 400,
  });
  const { container } = await database.containers.createIfNotExists({
    id: 'Courses',
    partitionKey: { paths: ['/ownerId'] },
  });
  return container;
})();

// GET /courses - list user courses
router.get(
  '/',
  /*authenticateToken,*/ async (req, res) => {
    req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science',
    };
    try {
      const container = await containerPromise;
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.ownerId = @ownerId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@ownerId', value: req.user.id }],
      };
      // Passing partitionKey narrows the query to the right partition
      const { resources } = await container.items
        .query(querySpec, { partitionKey: req.user.id })
        .fetchAll();
      res.json(resources);
    } catch (err) {
      console.error('GET /courses error', err);
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  }
);

// POST /courses - add new course
router.post(
  '/',
  /*authenticateToken,*/ async (req, res) => {
    req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science',
    };

    try {
      const { type, code, title, term, description } = req.body;
      if (!type || !['institution', 'casual'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type (institution|casual)' });
      }
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }

      const id = require('crypto').randomUUID();
      const now = new Date().toISOString();

      const item = {
        id,
        ownerId: req.user.id, // partition key
        type,
        code: type === 'institution' ? code || '' : undefined,
        title: title.trim(),
        term: type === 'institution' ? term || '' : undefined,
        description: type === 'casual' ? description || '' : undefined,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };

      const container = await containerPromise;
      const { resource } = await container.items.create(item, {
        disableAutomaticIdGeneration: true,
      });
      res.status(201).json(resource);
    } catch (err) {
      console.error('POST /courses error', err);
      res.status(500).json({ error: 'Failed to create course' });
    }
  }
);

// PUT /courses/:id - update a course
router.put(
  '/:id',
  /*authenticateToken,*/ async (req, res) => {
    try {
      const container = await containerPromise;
      const id = req.params.id;

      const { resource: existing } = await container.item(id, req.user.id).read();
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const updated = {
        ...existing,
        ...req.body,
        id,
        ownerId: req.user.id,
        updatedAt: new Date().toISOString(),
      };

      const { resource } = await container.item(id, req.user.id).replace(updated);
      res.json(resource);
    } catch (err) {
      console.error('PUT /courses/:id error', err);
      res.status(500).json({ error: 'Failed to update course' });
    }
  }
);

// DELETE /courses/:id - remove a course
router.delete(
  '/:id',
  /*authenticateToken,*/ async (req, res) => {
    req.user = {
      id: 'user123',
      university: 'UniXYZ',
      email: 'test@example.com',
      name: 'Test User',
      course: 'Computer Science',
    };
    try {
      const container = await containerPromise;
      const id = req.params.id;

      await container.item(id, req.user.id).delete();
      res.status(204).end();
    } catch (err) {
      console.error('DELETE /courses/:id error', err);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  }
);

module.exports = router;
