# Token Streaming Implementation Plan - Elixer AI Chat App

This implementation plan is organized into phases with checkboxes to help track progress through each step.

## Phase 1: Backend Preparation

### 1.1 Update ChatAI Module
- [ ] 1.1.1 Modify `getAIResponse` action to support token streaming
  ```typescript
  // In convex/chatAI.ts
  export const getAIResponse = action({
    // ...existing args
    handler: async (ctx, args) => {
      // Create empty streaming message first
      const messageId = await ctx.runMutation(api.chat.createMessage, {
        userId: args.userId,
        role: "assistant",
        content: "",
        isStreaming: true,
        paneId: args.paneId,
      });
      
      try {
        // Initialize model with streaming capability
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({
          model: args.selectedModel || "gemini-1.5-pro",
        });
        
        // Process each token in the stream
        const result = await model.generateContentStream({
          // your configuration
        });
        
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            await ctx.runMutation(api.chat.appendMessageContent, {
              messageId,
              content: chunkText,
            });
          }
        }
        
        // Mark streaming as complete
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        
        return messageId;
      } catch (error) {
        // Error handling
      }
    }
  });
  ```

- [ ] 1.1.2 Add proper error handling for streaming errors
- [ ] 1.1.3 Add processing phase updates during streaming

### 1.2 Update Chat Module
- [ ] 1.2.1 Modify `appendMessageContent` to handle token-by-token appending
  ```typescript
  // In convex/chat.ts
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
      
      // Append the new tokens instead of replacing content
      await ctx.db.patch(args.messageId, {
        content: message.content + args.content,
      });
      
      return message.content + args.content;
    },
  });
  ```

- [ ] 1.2.2 Add real-time subscription for streaming messages
  ```typescript
  // In convex/chat.ts
  export const subscribeToMessage = query({
    args: { messageId: v.id("messages") },
    handler: async (ctx, args) => {
      return await ctx.db.get(args.messageId);
    },
  });
  ```

## Phase 2: Frontend Preparation

### 2.1 Create Streaming Hooks
- [ ] 2.1.1 Create a new hook for streaming messages
  ```typescript
  // src/hooks/useStreamingMessages.ts
  export const useStreamingMessages = (userId, paneId) => {
    const messages = useQuery(api.chat.getMessages, 
      userId ? { userId, paneId } : null
    );
    
    const streamingMessage = messages?.find(msg => msg.isStreaming);
    
    const liveMessage = useQuery(
      api.chat.subscribeToMessage,
      streamingMessage ? { messageId: streamingMessage._id } : null
    );
    
    return {
      messages: messages?.map(msg => 
        (msg._id === liveMessage?._id) ? liveMessage : msg
      ) || [],
      isStreaming: Boolean(streamingMessage)
    };
  };
  ```

- [ ] 2.1.2 Add debounced scroll functionality
  ```typescript
  const useDebounceScroll = () => {
    const timeoutRef = useRef(null);
    const messagesEndRef = useRef(null);
    
    const scrollToBottom = useCallback(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, []);
    
    return { messagesEndRef, scrollToBottom };
  };
  ```

### 2.2 Update ChatPane Component
- [ ] 2.2.1 Integrate streaming hooks into ChatPane
- [ ] 2.2.2 Update message rendering to handle streaming tokens
- [ ] 2.2.3 Add streaming cursor UI component
- [ ] 2.2.4 Optimize rendering with React.memo for message components

## Phase 3: Testing & Optimization

### 3.1 Backend Testing
- [ ] 3.1.1 Test appendMessageContent with various token sizes
- [ ] 3.1.2 Test streaming with long responses
- [ ] 3.1.3 Test error handling during streaming
- [ ] 3.1.4 Test with tool/function calls (if applicable)

### 3.2 Frontend Testing
- [ ] 3.2.1 Test UI rendering during streaming
- [ ] 3.2.2 Test scrolling behavior during streaming
- [ ] 3.2.3 Test multiple concurrent chats
- [ ] 3.2.4 Test with network throttling

### 3.3 Performance Optimization
- [ ] 3.3.1 Implement token batching for very fast models
  ```typescript
  // In getAIResponse
  let batchedChunks = "";
  const BATCH_INTERVAL_MS = 50;
  let lastBatchTime = Date.now();
  
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      batchedChunks += chunkText;
      
      const now = Date.now();
      if (now - lastBatchTime > BATCH_INTERVAL_MS || batchedChunks.length > 100) {
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: batchedChunks,
        });
        batchedChunks = "";
        lastBatchTime = now;
      }
    }
  }
  ```

- [ ] 3.3.2 Add retry logic for network errors
- [ ] 3.3.3 Optimize React rendering with useMemo/useCallback


## Implementation Tracking

You can use this section to track overall progress:

- [ ] Phase 1: Backend Preparation (0/5 tasks complete)
- [ ] Phase 2: Frontend Preparation (0/6 tasks complete)
- [ ] Phase 3: Testing & Optimization (0/11 tasks complete)

Total progress: 0/22 tasks complete
