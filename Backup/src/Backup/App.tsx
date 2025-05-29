import React, { useState, useRef, useEffect } from "react";
import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api"; // Ensure this path is correct
import { Id } from "../convex/_generated/dataModel"; // Ensure this path is correct
import { SignInForm } from "./SignInForm"; // Ensure this path is correct
import { SignOutButton } from "./SignOutButton"; // Ensure this path is correct
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar"; // Import the new Sidebar component (adjust path if needed)

// Type for Convex message document
type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  role: string;
  content: string;
  userId: Id<"users">;
  systemPrompt?: string;
  isStreaming?: boolean;
};

function renderMessageContent(content: string) {
  const parts = content.split(/(\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic font-medium">{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

const MemoizedChatMessage = React.memo(({ message, displayContent }: { message: MessageDoc, displayContent: string }) => {
  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] p-3 rounded-lg ${
          message.role === "user"
            ? "bg-blue-500 text-white"
            : "bg-gray-100"
        }`}
      >
        {message.role === "assistant" && message.isStreaming && displayContent === "" ? (
          <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
        ) : (
          <p className="whitespace-pre-wrap">{renderMessageContent(displayContent)}</p>
        )}
      </div>
    </div>
  );
});

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm p-4 flex justify-between items-center border-b">
        <h2 className="text-xl font-semibold accent-text">ELIXIR AI Assistant</h2>
        <SignOutButton />
      </header>
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8"> {/* Adjusted padding for smaller screens */}
        <div className="w-full mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const messages = useQuery(api.chat.getMessages) || [] as MessageDoc[];
  const savedPrompts = useQuery(api.chat.getSystemPrompts) || { lawPrompt: "", tonePrompt: "", policyPrompt: "" };
  
  const sendMessage = useMutation(api.chat.sendMessage)
    .withOptimisticUpdate(
      (optimisticStore, args: { content: string; lawPrompt?: string; tonePrompt?: string; policyPrompt?: string; }) => {
        const currentMessages = optimisticStore.getQuery(api.chat.getMessages, {}) || [] as MessageDoc[];
        const timestamp = Date.now();
        const optimisticUserMessage: MessageDoc = {
          _id: `optimistic-user-${timestamp}` as Id<"messages">,
          _creationTime: timestamp,
          role: "user",
          content: args.content,
          userId: "optimistic-user-id-placeholder" as Id<"users">, // Placeholder, actual ID set by server
        };
        optimisticStore.setQuery(api.chat.getMessages, {}, [...currentMessages, optimisticUserMessage]);
      }
    );
  const saveSystemPrompt = useMutation(api.chat.saveSystemPrompt);
  const clearChat = useMutation(api.chat.clearChat);
  
  const [newMessage, setNewMessage] = useState("");
  const [lawPrompt, setLawPrompt] = useState(savedPrompts.lawPrompt);
  const [tonePrompt, setTonePrompt] = useState(savedPrompts.tonePrompt);
  const [policyPrompt, setPolicyPrompt] = useState(savedPrompts.policyPrompt);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Manages sidebar open/close state
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const savePromptTimeoutRef = useRef<number | null>(null);

  const [liveStreamingContent, setLiveStreamingContent] = useState("");
  const [streamingIntervalId, setStreamingIntervalId] = useState<number | null>(null);
  const contentBuffer = useRef("");
  const [showLocalPendingIndicator, setShowLocalPendingIndicator] = useState(false);

  useEffect(() => {
    // Initialize local prompt states from savedPrompts once they are loaded
    if (savedPrompts && (
        lawPrompt !== savedPrompts.lawPrompt ||
        tonePrompt !== savedPrompts.tonePrompt ||
        policyPrompt !== savedPrompts.policyPrompt
    )) {
        // Only update if they are different, and savedPrompts is not the initial empty object
        if(savedPrompts.lawPrompt !== undefined || savedPrompts.tonePrompt !== undefined || savedPrompts.policyPrompt !== undefined){
            setLawPrompt(savedPrompts.lawPrompt);
            setTonePrompt(savedPrompts.tonePrompt);
            setPolicyPrompt(savedPrompts.policyPrompt);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrompts]); // Only run when savedPrompts changes from Convex


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const streamingDbMessage = messages.find(msg => msg.role === "assistant" && msg.isStreaming);

    if (streamingDbMessage) {
      setShowLocalPendingIndicator(false); // Correct: Hide local indicator when DB stream starts
      const fullDbContent = streamingDbMessage.content || "";
      const currentlyDisplayedOrBufferedLength = liveStreamingContent.length + contentBuffer.current.length;

      if (fullDbContent.length > currentlyDisplayedOrBufferedLength) {
        contentBuffer.current += fullDbContent.substring(currentlyDisplayedOrBufferedLength);
      }

      if (streamingIntervalId === null) {
        const id = window.setInterval(() => {
          if (contentBuffer.current.length > 0) {
            const chunkSize = 1;
            const nextChunk = contentBuffer.current.substring(0, chunkSize);
            contentBuffer.current = contentBuffer.current.substring(chunkSize);
            setLiveStreamingContent(prev => prev + nextChunk);
          } else {
            const latestDbMessageInstance = messages.find(m => m._id === streamingDbMessage._id);
            if (!latestDbMessageInstance || !latestDbMessageInstance.isStreaming) {
              clearInterval(id);
              setStreamingIntervalId(null);
              if (latestDbMessageInstance) {
                setLiveStreamingContent(latestDbMessageInstance.content || "");
              }
            }
          }
        }, 30);
        setStreamingIntervalId(id);
      }
    } else {
      // This block executes if no message from DB is currently an assistant AND isStreaming
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      // REMOVE/COMMENT OUT THE PROBLEMATIC LINES:
      // if (!messages.some(m => m.role === 'assistant' && m.isStreaming)) {
      //   setShowLocalPendingIndicator(false); 
      // }
      // The showLocalPendingIndicator should remain true if it was set by handleSend,
      // until a new stream actually starts (handled above) or an error/clear occurs.

      const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
      if (liveStreamingContent && lastAssistantMessage && !lastAssistantMessage.isStreaming) {
         // A stream just finished, ensure live content matches final DB content
         if (liveStreamingContent !== lastAssistantMessage.content) {
            setLiveStreamingContent(lastAssistantMessage.content || "");
         }
      } else if (!messages.some(m => m.role === 'assistant' && m.isStreaming) && liveStreamingContent) {
         // No assistant message is streaming, but liveStreamingContent has data.
         // This can happen if a stream finished, was removed, or chat cleared.
         if (lastAssistantMessage) { // If there's a last assistant message (non-streaming)
            if (liveStreamingContent !== lastAssistantMessage.content) {
                setLiveStreamingContent(lastAssistantMessage.content || ""); // Sync to it
            }
         } else { // No assistant messages at all
            setLiveStreamingContent(""); // Clear it
         }
      }
      contentBuffer.current = "";
    }

    return () => {
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
      }
    };
  }, [messages, streamingIntervalId, liveStreamingContent]); // Removed setShowLocalPendingIndicator from deps if it was there implicitly

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveStreamingContent]);

  // Effect for debouncing and saving system prompts
  useEffect(() => {
    // Check if prompts have actually changed from what's saved or initially loaded.
    // This prevents saving on initial load or if savedPrompts updates local state without user interaction.
    const promptsChangedByUser = lawPrompt !== savedPrompts.lawPrompt ||
                               tonePrompt !== savedPrompts.tonePrompt ||
                               policyPrompt !== savedPrompts.policyPrompt;

    // Only proceed if prompts were loaded (not initial empty state) and changed by user.
    if ((savedPrompts.lawPrompt !== undefined || savedPrompts.tonePrompt !== undefined || savedPrompts.policyPrompt !== undefined) && promptsChangedByUser) {
        if (savePromptTimeoutRef.current !== null) {
            window.clearTimeout(savePromptTimeoutRef.current);
        }
        savePromptTimeoutRef.current = window.setTimeout(() => {
            saveSystemPrompt({ lawPrompt, tonePrompt, policyPrompt });
        }, 1000); // 1-second debounce
    }

    return () => {
      if (savePromptTimeoutRef.current !== null) {
        window.clearTimeout(savePromptTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawPrompt, tonePrompt, policyPrompt, saveSystemPrompt]); // savedPrompts is intentionally omitted here to rely on direct state changes


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMessageContent = newMessage.trim();
    if (!userMessageContent) return;

    setNewMessage("");
    setLiveStreamingContent("");
    contentBuffer.current = "";
    if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
    }
    setShowLocalPendingIndicator(true);

    try {
      await sendMessage({
        content: userMessageContent,
        lawPrompt,
        tonePrompt,
        policyPrompt,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setShowLocalPendingIndicator(false);
    }
  };

  const handleClearChat = async () => {
    if (window.confirm("Are you sure you want to clear all messages?")) {
      await clearChat();
      setLiveStreamingContent("");
      contentBuffer.current = "";
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      setShowLocalPendingIndicator(false);
    }
  };

  const hasActivePrompts = !!(lawPrompt || tonePrompt || policyPrompt);

  return (
    <div className="flex flex-col gap-4 sm:gap-8"> {/* Adjusted gap for smaller screens */}
      <div className="text-center">
        <Unauthenticated>
          <p className="text-xl text-slate-600">Sign in to get started</p>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        {/* Main chat interface container */}
        <div className="flex flex-row h-[calc(100vh-12rem)] sm:h-[calc(100vh-10rem)] md:h-[650px] bg-white rounded-lg shadow relative overflow-hidden">
          <Sidebar
            isOpen={isDrawerOpen}
            onToggle={() => setIsDrawerOpen(!isDrawerOpen)}
            lawPrompt={lawPrompt}
            onLawPromptChange={setLawPrompt} // Pass setter directly
            tonePrompt={tonePrompt}
            onTonePromptChange={setTonePrompt} // Pass setter directly
            policyPrompt={policyPrompt}
            onPolicyPromptChange={setPolicyPrompt} // Pass setter directly
            onClearChat={handleClearChat}
            hasActivePrompts={hasActivePrompts}
          />

          {/* Backdrop for mobile/tablet when drawer is an overlay */}
          {isDrawerOpen && (
            <div
              className="fixed inset-0 bg-black opacity-50 z-20 md:hidden" // z-20 below sidebar (z-30)
              onClick={() => setIsDrawerOpen(false)}
            ></div>
          )}

          {/* Right Panel (Chat Area) */}
          <div className="flex-1 flex flex-col overflow-hidden"> {/* Ensures chat area takes remaining space and handles its own overflow */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <MemoizedChatMessage
                  key={message._id}
                  message={message}
                  displayContent={message.isStreaming ? liveStreamingContent : message.content}
                />
              ))}
              {showLocalPendingIndicator &&
                !messages.some(msg => msg.role === 'assistant' && msg.isStreaming) && (
                <div className="flex justify-start" key="local-pending-jsx-indicator">
                  <div className="max-w-[80%] p-3 rounded-lg bg-gray-100">
                    <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 p-2 border rounded"
                  disabled={messages.some(msg => msg.isStreaming) || showLocalPendingIndicator}
                />
                <button
                  type="submit"
                  disabled={messages.some(msg => msg.isStreaming) || showLocalPendingIndicator || !newMessage.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {messages.some(msg => msg.isStreaming) || showLocalPendingIndicator ? "Streaming..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Authenticated>
    </div>
  );
}