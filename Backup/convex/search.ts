import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const searchKnowledge = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("knowledgeBase")
      .withSearchIndex("search", (q) => {
        let query = q.search("content", args.query);
        if (args.category) {
          query = query.eq("category", args.category);
        }
        return query;
      })
      .collect();

    return results;
  },
});

export const addKnowledgeItem = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("knowledgeBase", {
      title: args.title,
      content: args.content,
      category: args.category,
    });
  },
});
