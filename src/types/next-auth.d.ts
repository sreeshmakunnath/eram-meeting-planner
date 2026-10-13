import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: number; name: string; email: string; role: "ADMIN" | "USER" };
  }
  interface User {
    id: string;
    role: "ADMIN" | "USER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    role?: "ADMIN" | "USER";
    inactive?: boolean;
  }
}
