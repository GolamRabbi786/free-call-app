import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const callKindValidator = v.union(
  v.literal("video"),
  v.literal("audio"),
);

export const callStatusValidator = v.union(
  v.literal("ringing"),
  v.literal("active"),
  v.literal("ended"),
  v.literal("declined"),
  v.literal("missed"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // 1:1 conversations. userA / userB are the two participant ids sorted
    // lexicographically so a pair always maps to a single row.
    conversations: defineTable({
      userA: v.id("users"),
      userB: v.id("users"),
    })
      .index("by_userA", ["userA"])
      .index("by_userB", ["userB"]),

    messages: defineTable({
      conversationId: v.id("conversations"),
      senderId: v.id("users"),
      body: v.string(),
      // "text" (default) or "call" — a call-history entry rendered in the chat.
      kind: v.optional(v.union(v.literal("text"), v.literal("call"))),
      callKind: v.optional(callKindValidator),
      callStatus: v.optional(callStatusValidator),
      callDurationMs: v.optional(v.number()),
      callSessionId: v.optional(v.id("callSessions")),
    })
      .index("by_conversation", ["conversationId"])
      .index("by_callSession", ["callSessionId"]),

    // A single call between two users, with a lifecycle:
    // ringing -> active -> ended | declined | missed
    callSessions: defineTable({
      callerId: v.id("users"),
      calleeId: v.id("users"),
      kind: callKindValidator,
      status: callStatusValidator,
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
    })
      .index("by_caller", ["callerId"])
      .index("by_callee", ["calleeId"]),

    // WebRTC signaling messages (offers, answers, ICE candidates) for a call.
    callSignals: defineTable({
      sessionId: v.id("callSessions"),
      authorId: v.id("users"),
      payload: v.any(),
    }).index("by_session", ["sessionId"]),

    // One presence document per user while they are online (heartbeat kept fresh).
    presence: defineTable({
      userId: v.id("users"),
      data: v.any(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
