import { z } from 'zod';
import { PROJECT_STATUSES } from '../database/schema.ts';

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
