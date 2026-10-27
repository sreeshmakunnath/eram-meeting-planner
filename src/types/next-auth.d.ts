import "next-auth";
import "next-auth/jwt";

type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

declare module "next-auth" {
  interface Session {
    user: { id: number; name: string; email: string; role: Role; buIds: number[] };
  }
  interface User {
    id: string;
    role: Role;
    buIds: number[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    role?: Role;
    buIds?: number[];
    inactive?: boolean;
  }
}
