import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    instrument?: string | null;
  }

  interface Session {
    user: {
      id: string;
      instrument?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    instrument?: string | null;
  }
}
