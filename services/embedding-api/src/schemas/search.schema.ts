export const searchSchema = {
  body: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { 
        type: 'string', 
        minLength: 1, 
        maxLength: 1000 
      },
      limit: { 
        type: 'integer', 
        minimum: 1, 
        maximum: 100, 
        default: 10 
      },
      filters: {
        type: 'object',
        properties: {
          start_date: { 
            type: 'string', 
            format: 'date',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          end_date: { 
            type: 'string', 
            format: 'date',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$'
          },
          chat_id: { 
            type: 'string', 
            format: 'uuid',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          },
          is_group: { 
            type: 'boolean' 
          }
        }
      }
    }
  }
} as const;
