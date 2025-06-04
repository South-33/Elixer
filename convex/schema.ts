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
    metadata: v.optional(v.any()), // Add metadata field for storing search suggestions HTML and other data
    processingPhase: v.optional(v.string()), // Add processingPhase field to track current AI operation
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
  // Add a new table for storing law databases
  Databases: defineTable({
    name: v.string(),                // Database name (used for lookups)
    displayName: v.string(),         // Human-readable name
    fileId: v.string(),              // File storage ID (required)
    isEnhanced: v.boolean(),         // Whether this is an enhanced version
    lastUpdated: v.number(),         // Timestamp of last update
    cachedContent: v.optional(v.any()), // Optional cache for performance
  }).index("by_name", ["name"]), // Renamed from Databases
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
