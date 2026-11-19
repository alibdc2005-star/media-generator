import { isAdmin } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Viewer {
  id: string;
  email: string;
  admin: boolean;
}

interface GatewayUser {
  id: string;
  email: string;
  orgRole: string;
}

/** Records the member on first sight (and their current email), and says whether they're an admin. */
export async function viewerFrom(user: GatewayUser): Promise<Viewer> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}
