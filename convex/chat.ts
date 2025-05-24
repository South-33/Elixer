import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const sendMessage = mutation({
  args: { 
    content: v.string(),
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
    selectedModel: v.optional(v.string()), // Add selectedModel here
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Store user message
    await ctx.db.insert("messages", {
      role: "user",
      content: args.content,
      userId,
      // We are no longer storing the system prompt with each message
    });

    // Get AI response via action
    await ctx.scheduler.runAfter(0, api.chatAI.getAIResponse, {
      userMessage: args.content,
      userId,
      lawPrompt: args.lawPrompt || "",
      tonePrompt: args.tonePrompt || "",
      policyPrompt: args.policyPrompt || "",
      selectedModel: args.selectedModel, // Pass selectedModel to the action
    });
  },
});

export const getMessages = query({
  args: { userId: v.id("users") }, // Add userId argument
  handler: async (ctx, args) => { // Add args parameter
    // const userId = await getAuthUserId(ctx); // No longer needed here
    // if (!userId) return []; // No longer needed here

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", args.userId)) // Use the argument userId
      .order("desc")
      .collect();

    return messages.reverse();
  },
});

export const storeAIResponse = mutation({
  args: { 
    content: v.string(),
    userId: v.id("users")
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      role: "assistant",
      content: args.content,
      userId: args.userId
    });
  },
});

export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});

export const saveSystemPrompt = mutation({
  args: {
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Find existing settings
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const updateData: {
      lawPrompt?: string;
      tonePrompt?: string;
      policyPrompt?: string;
    } = {};

    if (args.lawPrompt !== undefined) updateData.lawPrompt = args.lawPrompt;
    if (args.tonePrompt !== undefined) updateData.tonePrompt = args.tonePrompt;
    if (args.policyPrompt !== undefined) updateData.policyPrompt = args.policyPrompt;


    if (existing) {
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...updateData,
      });
    }
  },
});

export const getSystemPrompts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { lawPrompt: "", tonePrompt: "", policyPrompt: "" };

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    return {
      lawPrompt: settings?.lawPrompt || "",
      tonePrompt: settings?.tonePrompt || "",
      policyPrompt: settings?.policyPrompt || "",
    };
  },
});

export const deleteUserSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (settings) {
      await ctx.db.delete(settings._id);
    }
  },
});

export const createMessage = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    content: v.string(),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      isStreaming: args.isStreaming,
    });
  },
});

export const appendMessageContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    await ctx.db.patch(args.messageId, {
      content: message.content + args.content,
    });
  },
});

import lawDatabase from "../Database/Law.json"; // Adjust path as necessary

export const updateMessageStreamingStatus = mutation({
  args: {
    messageId: v.id("messages"),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    await ctx.db.patch(args.messageId, {
      isStreaming: args.isStreaming,
    });
  },
});

export const getLawDatabaseContent = query({
  args: {},
  handler: async () => {
    return JSON.stringify(lawDatabase);
  },
});
