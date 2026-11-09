import 'next-auth';
import type { UserRole } from '@/generated/prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      /** The account's session version when this session began. */
      sv?: number;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    sessionVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    sv?: number;
  }
}
