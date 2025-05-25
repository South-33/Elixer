import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  messages: defineTable({
    role: v.string(), // "user" or "assistant"
    content: v.string(),
    userId: v.id("users"),
    systemPrompt: v.optional(v.string()),
    isStreaming: v.optional(v.boolean()), // Add isStreaming field
    paneId: v.optional(v.string()), // Temporarily make paneId optional to resolve schema validation
  }).index("by_user", ["userId", "paneId"]),
  userSettings: defineTable({
    userId: v.id("users"),
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  knowledgeBase: defineTable({
    title: v.string(),
    content: v.string(),
    category: v.string(),
  })
    .searchIndex("search", {
      searchField: "content",
      filterFields: ["category"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["category"],
    }),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
