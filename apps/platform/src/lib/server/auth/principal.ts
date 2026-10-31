export type Principal = Readonly<{
  kind: "user";
  userId: string;
  sessionId: string | null;
  deviceId: string | null;
  user?: Readonly<{
    id: string;
    name: string;
    email: string;
    image: string | null;
  }>;
}>;

export function testPrincipal(userId: string): Principal {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Los principales inyectados solo están permitidos en tests");
  }

  return Object.freeze({
    kind: "user",
    userId,
    sessionId: null,
    deviceId: null,
    user: Object.freeze({
      id: userId,
      name: "Test User",
      email: "test@example.com",
      image: null
    })
  });
}
