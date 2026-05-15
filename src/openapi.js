module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Notes App API',
    version: '1.0.0',
    description:
      'Multi-user notes service with REST endpoints for auth, CRUD on notes, ' +
      'sharing, and AI-powered summary + auto-tags (custom feature).',
  },
  servers: [{ url: '/', description: 'Current server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: { access_token: { type: 'string' } },
      },
      Note: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          content: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          tags: { type: 'array', items: { type: 'string' } },
          is_owner: { type: 'boolean' },
        },
      },
      NoteInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          content: { type: 'string', maxLength: 50000 },
        },
      },
      ShareInput: {
        type: 'object',
        required: ['share_with_email'],
        properties: { share_with_email: { type: 'string', format: 'email' } },
      },
      Message: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
      SummaryResponse: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          cached: { type: 'boolean' },
          generated_at: { type: 'string', format: 'date-time' },
        },
      },
      About: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          'my features': { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/register': {
      post: {
        summary: 'Register a new user',
        tags: ['auth'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } },
          400: { description: 'Validation error' },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/login': {
      post: {
        summary: 'Authenticate and receive a JWT',
        tags: ['auth'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/notes': {
      get: {
        summary: 'List all notes accessible to the user',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Note' } } } },
          },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create a new note (auto-tagged via AI on creation)',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } } },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/notes/{id}': {
      get: {
        summary: 'Get a specific note',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } },
          404: { description: 'Not found' },
        },
      },
      put: {
        summary: 'Update a note (owner only)',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } },
          404: { description: 'Not found' },
        },
      },
      delete: {
        summary: 'Delete a note (owner only)',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'No Content' },
          404: { description: 'Not found' },
        },
      },
    },
    '/notes/{id}/share': {
      post: {
        summary: 'Share a note with another user by email (owner only)',
        tags: ['notes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ShareInput' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } },
          400: { description: 'Validation error' },
          403: { description: 'Not the owner' },
          404: { description: 'Note or target user not found' },
        },
      },
    },
    '/notes/{id}/summarize': {
      post: {
        summary: 'CUSTOM FEATURE: AI-generated summary of a note (cached by content hash)',
        tags: ['ai'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'refresh', in: 'query', schema: { type: 'boolean' }, description: 'Force regeneration even if cached' },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/SummaryResponse' } } } },
          404: { description: 'Not found' },
          503: { description: 'AI not configured' },
        },
      },
    },
    '/notes/{id}/tags': {
      get: {
        summary: 'CUSTOM FEATURE: list tags on a note',
        tags: ['ai'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
      },
    },
    '/about': {
      get: {
        summary: 'About this service',
        tags: ['meta'],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/About' } } } },
        },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'OpenAPI 3.0 specification for this API',
        tags: ['meta'],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
};
