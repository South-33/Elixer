import lawDatabase from "../Database/Law.json";
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
    selectedModel: v.optional(v.string()),
    paneId: v.string(), // Add paneId here
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Store user message
    await ctx.db.insert("messages", {
      role: "user",
      content: args.content,
      userId,
      paneId: args.paneId, // Store paneId
    });

    // Get AI response via action
    await ctx.scheduler.runAfter(0, api.chatAI.getAIResponse, {
      userMessage: args.content,
      userId,
      lawPrompt: args.lawPrompt || "",
      tonePrompt: args.tonePrompt || "",
      policyPrompt: args.policyPrompt || "",
      selectedModel: args.selectedModel,
      paneId: args.paneId, // Pass paneId to the action
    });
  },
});

export const getMessages = query({
  args: { userId: v.id("users"), paneId: v.string() }, // Add paneId argument
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", args.userId).eq("paneId", args.paneId)) // Filter by userId and paneId
      .order("desc")
      .collect();

    return messages.reverse();
  },
});

export const storeAIResponse = mutation({
  args: {
    content: v.string(),
    userId: v.id("users"),
    paneId: v.string(), // Add paneId here
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      role: "assistant",
      content: args.content,
      userId: args.userId,
      paneId: args.paneId, // Store paneId
    });
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
    paneId: v.string(), // Add paneId here
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      isStreaming: args.isStreaming,
      paneId: args.paneId, // Store paneId
    });
  },
});

export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete all messages for the authenticated user
    const messagesToDelete = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    await Promise.all(messagesToDelete.map(msg => ctx.db.delete(msg._id)));
  },
});

export const clearPaneMessages = mutation({
  args: { paneId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete all messages for the authenticated user and specific paneId
    const BATCH_SIZE = 100; // Define a batch size for deletion

    let messagesDeleted = 0;
    while (true) {
      const messagesToDelete = await ctx.db
        .query("messages")
        .withIndex("by_user", q => q.eq("userId", userId).eq("paneId", args.paneId))
        .take(BATCH_SIZE); // Take only a batch of messages

      if (messagesToDelete.length === 0) {
        break; // No more messages to delete
      }

      await Promise.all(messagesToDelete.map(msg => ctx.db.delete(msg._id)));
      messagesDeleted += messagesToDelete.length;
    }
    console.log(`Deleted ${messagesDeleted} messages for pane ${args.paneId}`);
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

export const getMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const getLawDatabaseContent = query({
  args: {},
  handler: async () => {
    return JSON.stringify(lawDatabase);
  },
});
