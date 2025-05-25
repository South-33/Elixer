import React, { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ReactMarkdown from 'react-markdown';
import { toast } from "sonner";

// Type for Convex message document
type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  role: string;
  content: string;
  userId: Id<"users">;
  systemPrompt?: string;
  isStreaming?: boolean;
  paneId?: string; // Added paneId, now optional
};

interface ChatPaneProps {
  userId?: Id<"users">; // Make userId optional
  paneId: string;
  lawPrompt: string;
  tonePrompt: string;
  policyPrompt: string;
  onSendMessage: (content: string, model: string, paneId: string) => Promise<void>;
  onClearChat: () => void; // Callback for clearing chat
  onStreamingStatusChange: (paneId: string, isStreaming: boolean) => void; // New callback
  registerSendHandler: (paneId: string, handler: (content: string) => Promise<void>) => void; // New prop
  unregisterSendHandler: (paneId: string) => void; // New prop
  registerResetStatesHandler: (paneId: string, handler: () => void) => void; // New prop
  unregisterResetStatesHandler: (paneId: string) => void; // New prop
}

const MemoizedChatMessage = React.memo(({ message, displayContent }: { message: MessageDoc, displayContent: string }) => {
  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[80%] p-3 rounded-xl shadow-sm ${
          message.role === "user"
            ? "bg-blue-500 text-white"
            : "bg-slate-100 text-slate-800 prose"
        }`}
      >
        {message.role === "assistant" && message.isStreaming && displayContent === "" ? (
          <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
        ) : (
          <ReactMarkdown>{displayContent}</ReactMarkdown>
        )}
      </div>
    </div>
  );
});

export function ChatPane({ userId, paneId, lawPrompt, tonePrompt, policyPrompt, onSendMessage, onClearChat, onStreamingStatusChange, registerSendHandler, unregisterSendHandler, registerResetStatesHandler, unregisterResetStatesHandler }: ChatPaneProps) {
  const messages = useQuery(
    api.chat.getMessages,
    userId ? { userId, paneId } : "skip"
  ) || [] as MessageDoc[];

  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash-preview-04-17"); // Default model for this pane

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [liveStreamingContent, setLiveStreamingContent] = useState("");
  const [streamingIntervalId, setStreamingIntervalId] = useState<number | null>(null);
  const contentBuffer = useRef("");
  const [showLocalPendingIndicator, setShowLocalPendingIndicator] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Function to reset local streaming states
  const resetLocalStreamingStates = () => {
    setLiveStreamingContent("");
    contentBuffer.current = "";
    if (streamingIntervalId !== null) {
      clearInterval(streamingIntervalId);
      setStreamingIntervalId(null);
    }
    setShowLocalPendingIndicator(false);
  };

  useEffect(() => {
    const streamingDbMessage = messages.find((msg: MessageDoc) => msg.role === "assistant" && msg.isStreaming);

    if (streamingDbMessage) {
      setShowLocalPendingIndicator(false); // DB stream started, hide local indicator
      const fullDbContent = streamingDbMessage.content || "";
      const currentlyDisplayedOrBufferedLength = liveStreamingContent.length + contentBuffer.current.length;

      if (fullDbContent.length > currentlyDisplayedOrBufferedLength) {
        contentBuffer.current += fullDbContent.substring(currentlyDisplayedOrBufferedLength);
      }

      if (streamingIntervalId === null) {
        const id = window.setInterval(() => {
          if (contentBuffer.current.length > 0) {
            const chunkSize = Math.max(1, Math.floor(contentBuffer.current.length / 10)); // Dynamic chunk size
            const nextChunk = contentBuffer.current.substring(0, chunkSize);
            contentBuffer.current = contentBuffer.current.substring(chunkSize);
            setLiveStreamingContent(prev => prev + nextChunk);
          } else {
            const latestDbMessageInstance = messages.find((m: MessageDoc) => m._id === streamingDbMessage._id);
            if (!latestDbMessageInstance || !latestDbMessageInstance.isStreaming) {
              clearInterval(id);
              setStreamingIntervalId(null);
              if (latestDbMessageInstance) {
                setLiveStreamingContent(latestDbMessageInstance.content || ""); // Ensure final content is set
              }
            }
          }
        }, 50); // Interval for smoother animation
        setStreamingIntervalId(id);
      }
    } else {
      // No message is currently marked as streaming in the database
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
      }
      contentBuffer.current = ""; // Clear buffer if no longer streaming

      if (!showLocalPendingIndicator) {
        const lastAssistantMessage = messages
          .filter((m: MessageDoc) => m.role === 'assistant' && !m.isStreaming)
          .pop();

        if (lastAssistantMessage) {
          if (liveStreamingContent !== (lastAssistantMessage.content || "")) {
            setLiveStreamingContent(lastAssistantMessage.content || "");
          }
        } else if (liveStreamingContent) {
          setLiveStreamingContent("");
        }
      }
    }

    return () => {
      if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
      }
    };
  }, [messages, streamingIntervalId, liveStreamingContent, showLocalPendingIndicator, onStreamingStatusChange, paneId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveStreamingContent]);

  // Call resetLocalStreamingStates when onClearChat is triggered
  useEffect(() => {
    // This effect will run when the onClearChat prop changes,
    // which happens when the parent's handleClearChat is called.
    // We need a way to trigger this reset when the global clear happens.
    // A simple way is to have onClearChat itself trigger the local reset.
    // This useEffect is no longer needed for this purpose.
  }, []); // No dependencies, runs once on mount

  // This is the global "isStreaming" used to disable UI elements
  const isStreaming = messages.some((msg: MessageDoc) => msg.isStreaming) || showLocalPendingIndicator;

  useEffect(() => {
    onStreamingStatusChange(paneId, isStreaming);
  }, [isStreaming, paneId, onStreamingStatusChange]);

  // This handleSend is now internal to ChatPane, called by AuthenticatedContent's global handleSend
  const handleInternalSend = async (content: string) => {
    const userMessageContent = content.trim();
    const isCurrentlyStreaming = messages.some((msg: MessageDoc) => msg.isStreaming) || showLocalPendingIndicator;

    if (!userMessageContent || isCurrentlyStreaming) return;

    setLiveStreamingContent(""); // CRITICAL: Clear for the new incoming response
    contentBuffer.current = "";
    if (streamingIntervalId !== null) {
        clearInterval(streamingIntervalId);
        setStreamingIntervalId(null);
    }
    setShowLocalPendingIndicator(true); // Show local pending state immediately

    try {
      if (!userId) {
        console.error("User not loaded, cannot send message.");
        toast.error("User not loaded. Please wait a moment.");
        setShowLocalPendingIndicator(false);
        return;
      }
      await onSendMessage(userMessageContent, selectedModel, paneId);
    } catch (error: any) { // Explicitly type error as any to access properties
      console.error("Failed to send message:", error);
      setShowLocalPendingIndicator(false); // Hide pending indicator on send error

      if (error.data && error.data.code === "TOO_MANY_REQUESTS") {
        toast.error("You've exceeded your API quota. Please try again later.");
      } else {
        toast.error("Failed to send message. Please try again.");
      }
    }
  };

  // Register and unregister the internal send handler
  useEffect(() => {
    registerSendHandler(paneId, handleInternalSend);
    registerResetStatesHandler(paneId, resetLocalStreamingStates); // Register the reset handler
    return () => {
      unregisterSendHandler(paneId);
      unregisterResetStatesHandler(paneId); // Unregister the reset handler
    };
  }, [paneId, registerSendHandler, unregisterSendHandler, registerResetStatesHandler, unregisterResetStatesHandler]);

  return (
    <div className="flex-1 flex flex-col bg-white border-r border-slate-200 last:border-r-0">
      <div className="p-2 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-md font-semibold text-slate-700">Pane: {paneId}</h3>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="p-1.5 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
          disabled={isStreaming}
        >
          <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash</option>
          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
          {/* Add other models here */}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
        {messages.map((message: MessageDoc) => (
          <MemoizedChatMessage
            key={message._id}
            message={message}
            displayContent={message.role === 'assistant' && message.isStreaming ? liveStreamingContent : message.content}
          />
        ))}
        {showLocalPendingIndicator &&
          !messages.some((msg: MessageDoc) => msg.role === 'assistant' && msg.isStreaming) && (
          <div className="flex justify-start" key="local-pending-jsx-indicator">
            <div className="max-w-[80%] p-3 rounded-lg bg-slate-100 text-slate-800 prose">
              <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
