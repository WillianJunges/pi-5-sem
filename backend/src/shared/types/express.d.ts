import type { Role } from '../../modules/users/user.types';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware `authenticate`. */
      user?: {
        id: string;
        role: Role;
      };
    }
  }
}

export {};
