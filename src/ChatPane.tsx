import React, { useState, useRef, useEffect, Dispatch, SetStateAction } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import ReactMarkdown from 'react-markdown';
import { toast } from "sonner";
import { TrashIcon } from '@heroicons/react/20/solid';

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
  onSendMessage: (content: string, model: string, paneId: string, disableSystemPrompt: boolean, disableToolUse: boolean) => Promise<void>;
  onClearChat: () => void; // Callback for clearing chat
  onStreamingStatusChange: (paneId: string, isStreaming: boolean) => void; // New callback
  registerSendHandler: (paneId: string, handler: (content: string) => Promise<void>) => void; // New prop
  unregisterSendHandler: (paneId: string) => void; // New prop
  registerResetStatesHandler: (paneId: string, handler: () => void) => void; // New prop
  unregisterResetStatesHandler: (paneId: string) => void; // New prop
}

// We're not using the TypewriterText component anymore - simplified approach

// Add CSS styles for the typewriter effect
const typewriterStyles = `
  .typewriter-container {
    display: inline-flex;
    align-items: center;
    white-space: pre-wrap;
  }
  .blinking-cursor {
    display: inline-block;
    margin-left: 2px;
    animation: blink 1s step-end infinite;
    font-weight: 100;
    color: #666;
  }
  @keyframes blink {
    from, to { opacity: 1; }
    50% { opacity: 0; }
  }
`;

// Add the styles to the document (outside of any component)
(function addStylesOnce() {
  if (typeof document !== 'undefined') {
    const styleId = 'typewriter-styles';
    if (!document.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.innerHTML = typewriterStyles;
      document.head.appendChild(styleElement);
    }
  }
})();

// Chat message component with DOM-based streaming for assistant messages
const ChatMessage = ({ message, displayContent }: { message: MessageDoc, displayContent: string }) => {
  // Create a ref to directly manipulate the DOM for streaming text
  const streamingTextRef = useRef<HTMLDivElement>(null);
  
  // Store the previous content length to know what's new
  const prevContentLengthRef = useRef(0);
  
  // Use this ID to identify the streaming container
  const streamingContainerId = `streaming-content-${message._id}`;
  
  // Update the DOM directly when streaming content changes
  useEffect(() => {
    if (message.role === 'assistant' && message.isStreaming) {
      // Get the streaming container element
      const streamingElement = document.getElementById(streamingContainerId);
      
      if (streamingElement && displayContent.length > prevContentLengthRef.current) {
        try {
          // Update the text content directly in the DOM
          streamingElement.textContent = displayContent;
          console.log(`[ChatMessage] DOM updated with ${displayContent.length} chars`);
          prevContentLengthRef.current = displayContent.length;
          
          // Ensure parent elements are visible
          if (streamingTextRef.current) {
            streamingTextRef.current.style.display = 'block';
          }
        } catch (error) {
          console.error(`[ChatMessage] Error updating DOM:`, error);
        }
      }
    }
  }, [message.isStreaming, displayContent, message._id, message.role, streamingContainerId]);
  
  // Check if the message content contains the error message
  const hasStreamingError = message.role === "assistant" && 
                           displayContent.includes("Error: Streaming interrupted");

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
            : hasStreamingError 
              ? "bg-red-50 text-slate-800 prose border border-red-200" 
              : "bg-slate-100 text-slate-800 prose"
        }`}
      >
        {message.role === "assistant" && message.isStreaming && displayContent === "" ? (
          <p className="typing-indicator"><span>.</span><span>.</span><span>.</span></p>
        ) : message.role === "assistant" && message.isStreaming ? (
          <div className="prose streaming-text-container" ref={streamingTextRef}>
            <span id={streamingContainerId}>{displayContent}</span>
            <span className="blinking-cursor">|</span>
          </div>
        ) : hasStreamingError ? (
          <div>
            <p className="text-red-500 font-medium">Error: Message streaming was interrupted</p>
            <p className="text-sm mt-1">Please try sending your message again.</p>
          </div>
        ) : (
          <ReactMarkdown>{displayContent}</ReactMarkdown>
        )}
      </div>
    </div>
  );
};

export function ChatPane({ userId, paneId, lawPrompt, tonePrompt, policyPrompt, onSendMessage, onClearChat, onStreamingStatusChange, registerSendHandler, unregisterSendHandler, registerResetStatesHandler, unregisterResetStatesHandler }: ChatPaneProps) {
  const messages = useQuery(
    api.chat.getMessages,
    userId ? { userId, paneId } : "skip"
  ) || [] as MessageDoc[];

  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash-preview-04-17"); // Default model for this pane
  const [disableSystemPrompt, setDisableSystemPrompt] = useState(false); // New state for disabling system prompt
  const [disableToolUse, setDisableToolUse] = useState(false); // New state for disabling tool use

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
    console.log("[ChatPane] useEffect triggered. Messages updated."); // Log when messages update
    const streamingDbMessage = messages.find((msg: MessageDoc) => msg.role === "assistant" && msg.isStreaming);

    if (streamingDbMessage) {
      console.log("[ChatPane] Streaming DB message found:", streamingDbMessage._id, "Content length:", streamingDbMessage.content.length);
      setShowLocalPendingIndicator(false); // DB stream started, hide local indicator
      const fullDbContent = streamingDbMessage.content || "";
      const currentlyDisplayedOrBufferedLength = liveStreamingContent.length + contentBuffer.current.length;

            console.log(`[ChatPane] Full DB content length: ${fullDbContent.length}, Currently displayed/buffered: ${currentlyDisplayedOrBufferedLength}`);

            if (fullDbContent.length > currentlyDisplayedOrBufferedLength) {
              const newContent = fullDbContent.substring(currentlyDisplayedOrBufferedLength);
              contentBuffer.current += newContent;
              console.log(`[ChatPane] Added new content to buffer. New buffer length: ${contentBuffer.current.length}. New content: "${newContent.substring(0, 50)}..."`);
            }

            if (streamingIntervalId === null) {
              console.log("[ChatPane] Starting new streaming interval.");
              // Direct DOM manipulation interval for streaming text
              const id = window.setInterval(() => {
                if (contentBuffer.current.length > 0) {
                  // Take a smaller chunk for more character-by-character feel
              // Use 1-2 characters at a time for a more granular streaming effect
              const chunkSize = Math.min(
                contentBuffer.current.length,
                contentBuffer.current.length > 20 ? 2 : 1 // Use 1 char normally, 2 when buffer is large
              );
              
              const nextChunk = contentBuffer.current.substring(0, chunkSize);
              contentBuffer.current = contentBuffer.current.substring(chunkSize);
              
              // Check if the content contains an error message
              const hasError = nextChunk.includes("Error: Streaming interrupted");
              
              // Update the state (this will trigger the DOM update in ChatMessage)
              setLiveStreamingContent(prev => {
                const newContent = prev + nextChunk;
                console.log(`[ChatPane] Added chunk of ${chunkSize} chars. New length: ${newContent.length}`);
                
                try {
                  // IMPORTANT: Also try to update the DOM directly as a fallback
                  const streamingMessage = messages.find(m => m.isStreaming);
                  if (streamingMessage) {
                    const streamingElement = document.getElementById(`streaming-content-${streamingMessage._id}`);
                    if (streamingElement) {
                      streamingElement.textContent = newContent;
                      console.log(`[ChatPane] Direct DOM update for ${streamingMessage._id}`);
                    }
                  }
                } catch (error) {
                  console.error(`[ChatPane] Error during direct DOM update:`, error);
                }
                
                // If we detect an error message, stop streaming
                if (hasError) {
                  console.log(`[ChatPane] Detected error message in streaming content, stopping interval`);
                  if (streamingIntervalId !== null) {
                    clearInterval(streamingIntervalId);
                    setStreamingIntervalId(null);
                  }
                }
                
                return newContent;
              });
              
              // Scroll to bottom with each update
              scrollToBottom();
                } else {
                  const latestDbMessageInstance = messages.find((m: MessageDoc) => m._id === streamingDbMessage._id);
                  if (!latestDbMessageInstance || !latestDbMessageInstance.isStreaming) {
                    console.log("[ChatPane] Streaming finished or message no longer streaming. Clearing interval.");
                    clearInterval(id);
                    setStreamingIntervalId(null);
                    if (latestDbMessageInstance) {
                      setLiveStreamingContent(latestDbMessageInstance.content || ""); // Ensure final content is set
                      console.log("[ChatPane] Final content set from DB:", latestDbMessageInstance.content.length);
                      // Final scroll to bottom after streaming completes
                      scrollToBottom();
                    }
                  } else {
                    console.log("[ChatPane] Buffer empty, but DB message still streaming. Waiting for more content.");
                  }
                }
              }, contentBuffer.current.length > 50 ? 5 : 20); // Faster update rate for more responsive streaming
              setStreamingIntervalId(id);
            } else {
              console.log("[ChatPane] Streaming interval already active.");
            }
          } else {
            console.log("[ChatPane] No message currently marked as streaming in the database.");
            // No message is currently marked as streaming in the database
            if (streamingIntervalId !== null) {
              console.log("[ChatPane] Clearing existing streaming interval (no DB stream).");
              clearInterval(streamingIntervalId);
              setStreamingIntervalId(null);
            }
            contentBuffer.current = ""; // Clear buffer if no longer streaming
            console.log("[ChatPane] Content buffer cleared.");

            if (!showLocalPendingIndicator) {
              const lastAssistantMessage = messages
                .filter((m: MessageDoc) => m.role === 'assistant' && !m.isStreaming)
                .pop();

              if (lastAssistantMessage) {
                if (liveStreamingContent !== (lastAssistantMessage.content || "")) {
                  console.log("[ChatPane] Setting live content to last assistant message (not streaming).");
                  setLiveStreamingContent(lastAssistantMessage.content || "");
                }
              } else if (liveStreamingContent) {
                console.log("[ChatPane] Clearing live content (no last assistant message).");
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
  
  // Monitor streaming state and buffer size for debugging
  useEffect(() => {
    if (isStreaming) {
      console.log("[ChatPane] Streaming state active, content length:", liveStreamingContent.length, 
                 "buffer size:", contentBuffer.current.length);
    }
  }, [isStreaming, liveStreamingContent.length]);

  useEffect(() => {
    onStreamingStatusChange(paneId, isStreaming);
  }, [isStreaming, paneId, onStreamingStatusChange]);

  // This handleSend is now internal to ChatPane, called by AuthenticatedContent's global handleSend
  const handleInternalSend = async (content: string) => {
    const userMessageContent = content.trim();
    const isCurrentlyStreaming = messages.some((msg: MessageDoc) => msg.isStreaming) || showLocalPendingIndicator;

    if (!userMessageContent || isCurrentlyStreaming) return;

    // Add detailed logging for each pane when sending a message
    console.log(`[ChatPane ${paneId}] Sending message with settings:`, {
      disableSystemPrompt,
      disableToolUse,
      selectedModel,
      contentPreview: userMessageContent.substring(0, 50) + (userMessageContent.length > 50 ? '...' : ''),
      timestamp: new Date().toISOString()
    });

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
      await onSendMessage(userMessageContent, selectedModel, paneId, disableSystemPrompt, disableToolUse);
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

  // Track streaming updates and force DOM updates
  // This is a safety mechanism to ensure content is always displayed
  // even if the normal update flow fails for some reason
  useEffect(() => {
    if (liveStreamingContent) {
      // Find the streaming message and update its DOM element directly
      const streamingMessage = messages.find(m => m.isStreaming);
      if (streamingMessage) {
        const streamingElement = document.getElementById(`streaming-content-${streamingMessage._id}`);
        if (streamingElement && streamingElement.textContent !== liveStreamingContent) {
          try {
            streamingElement.textContent = liveStreamingContent;
            console.log(`[ChatPane] Force DOM update for streaming message: ${liveStreamingContent.length} chars`);
            
            // Ensure we scroll to bottom when content is updated
            requestAnimationFrame(() => {
              scrollToBottom();
            });
          } catch (error) {
            console.error(`[ChatPane] Error during force DOM update:`, error);
          }
        }
      }
    }
  }, [liveStreamingContent, messages]);
  
  return (
    <div className="flex-1 flex flex-col bg-white border-r border-slate-200 last:border-r-0 h-full">
      <div className="p-2 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-md font-semibold text-slate-700">Pane: {paneId}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDisableSystemPrompt(prev => !prev)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              disableSystemPrompt
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
            disabled={isStreaming}
          >
            {disableSystemPrompt ? "Enable System Prompt" : "Disable System Prompt"}
          </button>
          <button
            onClick={() => setDisableToolUse(prev => !prev)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              disableToolUse
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-purple-100 text-purple-700 hover:bg-purple-200"
            }`}
            disabled={isStreaming}
          >
            {disableToolUse ? "Enable Tool Use" : "Disable Tool Use"}
          </button>
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
          <button
            onClick={onClearChat}
            className="p-2 rounded-md bg-red-500 hover:bg-red-600 transition-colors duration-150 shadow-sm"
            title="Clear Chat History"
            disabled={isStreaming}
          >
            <TrashIcon className="h-5 w-5 text-gray-100" />
            <span className="sr-only">Clear Chat History</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
        {messages.map((message: MessageDoc) => (
          <ChatMessage
            key={`${message._id}-${message.isStreaming ? 'streaming' : 'static'}`}
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
